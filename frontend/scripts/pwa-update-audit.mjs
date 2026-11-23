// PWA update audit: a REAL new version (the built service worker file changes while the page is open) and what the page does about it.
//   1. just opened, nothing playing  -> applied by itself (the page reloads on the new worker)
//   2. open for a while and visible  -> only the Reload bar (never a reload behind the person's back)
//   3. the tab is hidden             -> applied
// Run: npm run test:pwa --prefix frontend      (CHROMIUM_PATH=/path/to/chrome if Playwright's own browser is not installed)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const PORT = 4179;
const API_PORT = 5000; // vite preview proxies /api to this port (see vite.config.js)
const BASE = `http://127.0.0.1:${PORT}`;
const swFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'sw.js');
const results = [];
const check = (name, cond, detail = '') => { results.push({ ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  -> ${detail}`}`); };
const until = async (fn, ms = 9000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

const song = (i) => ({ id: `s${i}`, title: `Song ${i}`, artist: 'Test Artist', album: 'Film', duration: 200, image: '', streamUrl: `http://127.0.0.1:${API_PORT}/api/music/stream?id=s${i}`, source: 'audio', year: '2020' });
const FEED = { trending: Array.from({ length: 10 }, (_, i) => song(i)), latest: [], gana: [], nineties: [], twoThousands: [], melodies: [], love: [], sad: [], folk: [], instrumental: [], popularAlbums: [], popularArtists: [], albums: [], artists: [] };
const api = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (u.pathname === '/api/music/home') return json({ success: true, data: FEED });
  if (u.pathname === '/api/auth/me') return json({ success: true, user: { id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' } });
  if (u.pathname === '/api/home') return json({ success: true, seed: 's', hero: null, hidden: [], sections: [{ id: 'trending', title: 'Trending now', kind: 'songs', items: FEED.trending }] });
  return json({ success: true });
});
const startPreview = () => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let done = false;
  p.stdout.on('data', (d) => { if (!done && /127\.0\.0\.1:4179|Local/.test(String(d))) { done = true; resolve(p); } });
  p.stderr.on('data', (d) => { if (!done) console.error(String(d)); });
  p.on('exit', (c) => { if (!done) reject(new Error(`vite preview exited ${c}`)); });
  setTimeout(() => { if (!done) reject(new Error('vite preview start timeout')); }, 30000);
});

const original = fs.readFileSync(swFile, 'utf8');
const publish = (tag) => fs.writeFileSync(swFile, `${original}\n/* audit ${tag} ${Date.now()} */\n`); // a new version: different bytes
const newContext = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    localStorage.setItem('tamiltunes_token', 'audit_token');
    localStorage.setItem('tamiltunes_user', JSON.stringify({ id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' }));
  });
  return ctx;
};
const openControlled = async (ctx, ageMs = 0) => {
  const page = await ctx.newPage();
  if (ageMs) await page.addInitScript((extra) => { const real = performance.now.bind(performance); performance.now = () => real() + extra; }, ageMs); // pretend the page has been open that long
  await page.goto(`${BASE}/`);
  await page.waitForSelector('main');
  await page.waitForTimeout(300);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!(await until(() => page.evaluate(() => !!navigator.serviceWorker.controller), 5000))) { await page.reload(); await page.waitForSelector('main'); } // first visit: the worker takes control after a reload
  await page.evaluate(() => { window.__marker = 1; });
  return page;
};
const checkForUpdate = (page) => page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
const reloaded = (page, ms = 9000) => until(async () => { try { return (await page.evaluate(() => window.__marker)) === undefined; } catch { return true; } }, ms);

async function run(browser) {
  // 1. a returning person opens the site while a new version is out: applied by itself, right after opening
  const a = await newContext(browser);
  const first = await openControlled(a); // the old version is installed and in control
  await first.close();
  publish('v2');
  const second = await a.newPage();
  await second.addInitScript(() => { sessionStorage.setItem('__loads', String((Number(sessionStorage.getItem('__loads')) || 0) + 1)); }); // counts loads of this tab
  await second.goto(`${BASE}/`);
  check('a new version found right after opening is applied by itself (the page reloads on the new worker)', await until(async () => { try { return Number(await second.evaluate(() => sessionStorage.getItem('__loads'))) >= 2; } catch { return false; } }, 12000));

  // 2 and 3. open for a while and visible: only the bar; then the tab is hidden: applied
  const b = await newContext(browser);
  const old = await openControlled(b, 120000);
  publish('v3');
  await checkForUpdate(old);
  check('on a page that has been open a while the Reload bar appears', await until(async () => (await old.locator('[data-testid=pwa-update]').count()) === 1));
  await old.waitForTimeout(2500);
  check("and the page is NOT reloaded behind the person's back", (await old.evaluate(() => window.__marker)) === 1);
  await old.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  check('when the tab is hidden the new version is applied', await reloaded(old));
}

let preview;
let browser;
try {
  await new Promise((resolve, reject) => { api.once('error', (e) => reject(new Error(e.code === 'EADDRINUSE' ? `port ${API_PORT} is busy (is the backend dev server running?). Stop it and run again.` : e.message))); api.listen(API_PORT, '127.0.0.1', resolve); });
  preview = await startPreview();
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  await run(browser);
} catch (e) {
  console.error('PWA update audit crashed:', String(e.message).split('\n').slice(0, 8).join('\n'));
  results.push({ ok: false });
} finally {
  fs.writeFileSync(swFile, original); // leave the build as it was
  await browser?.close();
  api.close();
  if (preview) { try { process.platform === 'win32' ? preview.kill() : process.kill(-preview.pid); } catch { /* gone */ } }
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pwa update checks passed`);
process.exit(failed.length ? 1 : 0);
