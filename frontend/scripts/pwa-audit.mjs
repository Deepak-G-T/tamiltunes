// PWA audit: the built app in Chromium with a tiny mock API. Checks the manifest and icons, that the service worker installs and
// controls the page, what it caches (public music GETs, images, the shell) and what it NEVER caches (audio streams, Range requests,
// sign-in and personal endpoints), the offline page, the install banner and the "new version" bar.
// Run: npm run test:pwa --prefix frontend      (CHROMIUM_PATH=/path/to/chrome if Playwright's own browser is not installed)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const PORT = 4178;
const API_PORT = 5000; // vite preview proxies /api to this port (see vite.config.js)
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
const check = (name, cond, detail = '') => { results.push({ ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  -> ${detail}`}`); };

// ---- mock backend: counts hits so the audit can see what reached the network
const hits = {};
const song = (i) => ({ id: `s${i}`, title: `Song ${i}`, artist: 'Test Artist', album: 'Film', duration: 200, image: '', streamUrl: `http://127.0.0.1:${API_PORT}/api/music/stream?id=s${i}`, source: 'audio', year: '2020' });
const FEED = { trending: Array.from({ length: 10 }, (_, i) => song(i)), latest: [], gana: [], nineties: [], twoThousands: [], melodies: [], love: [], sad: [], folk: [], instrumental: [], popularAlbums: [], popularArtists: [], albums: [], artists: [] };
const api = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  hits[u.pathname] = (hits[u.pathname] || 0) + 1;
  const json = (body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (u.pathname === '/api/music/home') return json({ success: true, data: FEED });
  if (u.pathname === '/api/music/search') return json({ success: true, data: { songs: FEED.trending, albums: [], artists: [], playlists: [] } });
  if (u.pathname === '/api/music/stream') { res.writeHead(200, { 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes' }); return res.end(Buffer.alloc(2048)); }
  if (u.pathname === '/api/auth/me') return json({ success: true, user: { id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' }, hits: hits[u.pathname] });
  if (u.pathname === '/api/home') return json({ success: true, seed: 's', hero: null, hidden: [], sections: [{ id: 'trending', title: 'Trending now', kind: 'songs', items: FEED.trending }] });
  return json({ success: true });
});

const startPreview = () => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let done = false;
  p.stdout.on('data', (d) => { if (!done && /127\.0\.0\.1:4178|Local/.test(String(d))) { done = true; resolve(p); } });
  p.stderr.on('data', (d) => { if (!done) console.error(String(d)); });
  p.on('exit', (c) => { if (!done) reject(new Error(`vite preview exited ${c}`)); });
  setTimeout(() => { if (!done) reject(new Error('vite preview start timeout')); }, 30000);
});

const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

async function run(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    localStorage.setItem('tamiltunes_token', 'audit_token');
    localStorage.setItem('tamiltunes_user', JSON.stringify({ id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' }));
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // ---- manifest and icons
  const manifest = await (await page.request.get(`${BASE}/manifest.webmanifest`)).json();
  check('the manifest names the app and opens it standalone', manifest.name === 'TamilTunes' && manifest.short_name && manifest.display === 'standalone' && manifest.start_url === '/' && manifest.theme_color === '#09090B' && manifest.background_color === '#09090B', JSON.stringify(manifest).slice(0, 200));
  check('the manifest lists 192, 512 and maskable icons and the music category', ['192x192', '512x512'].every((s) => manifest.icons.some((i) => i.sizes === s && i.purpose === 'any')) && manifest.icons.some((i) => i.purpose === 'maskable') && manifest.categories?.includes('music'), JSON.stringify(manifest.icons));
  let iconsOk = true;
  for (const i of manifest.icons) { const r = await page.request.get(`${BASE}${i.src}`); if (r.status() !== 200 || !String(r.headers()['content-type']).includes('image/png')) iconsOk = false; }
  check('every icon file in the manifest loads as a PNG', iconsOk);
  check('the manifest has a narrow and a wide screenshot', ['narrow', 'wide'].every((f) => manifest.screenshots?.some((x) => x.form_factor === f)));
  if (manifest.screenshots?.length) {
    let shotsOk = true;
    for (const s of manifest.screenshots) { const r = await page.request.get(`${BASE}${s.src}`); if (r.status() !== 200 || !String(r.headers()['content-type']).includes('image/png')) shotsOk = false; }
    check('the manifest screenshots load as PNGs', shotsOk);
  }

  // ---- install the worker, then reload so it controls the page
  await page.goto(`${BASE}/`);
  const registered = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return Boolean(r.active); });
  check('the service worker registers and activates', registered);
  await page.reload();
  check('the service worker controls the page after a reload', await until(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))));
  await page.waitForSelector('main', { timeout: 15000 });
  check('the viewport tag allows zoom (no user-scalable=no)', !/user-scalable\s*=\s*no|maximum-scale/i.test(await page.locator('meta[name=viewport]').getAttribute('content')) && /viewport-fit=cover/.test(await page.locator('meta[name=viewport]').getAttribute('content')));
  check('theme-color meta is #09090B', (await page.locator('meta[name=theme-color]').getAttribute('content')) === '#09090B');

  // ---- what is stored
  await page.evaluate(async () => { await fetch('/api/music/home'); await fetch('/api/music/search?q=a'); await fetch('/api/auth/me', { headers: { Authorization: 'Bearer test' } }); await fetch('/api/me/queue', { headers: { Authorization: 'Bearer test' } }); await fetch('/api/music/stream?id=s1'); await fetch('/api/music/stream?id=s2', { headers: { Range: 'bytes=0-100' } }).catch(() => {}); });
  await page.waitForTimeout(600);
  const cached = await page.evaluate(async () => { const out = []; for (const name of await caches.keys()) { const c = await caches.open(name); for (const r of await c.keys()) out.push({ cache: name, url: new URL(r.url).pathname + new URL(r.url).search }); } return out; });
  const apiCached = cached.filter((c) => c.cache.startsWith('api-public'));
  check('the app shell is precached', cached.some((c) => /^workbox-precache/.test(c.cache) && /index\.html|\/$/.test(c.url)) && cached.some((c) => c.url.endsWith('.js')));
  check('public music GETs are stored (stale-while-revalidate)', apiCached.some((c) => c.url.startsWith('/api/music/home')) && apiCached.some((c) => c.url.startsWith('/api/music/search')), JSON.stringify(apiCached));
  check('audio streams are never stored', !cached.some((c) => /stream|\.mp3|\.mp4|audio/.test(c.url)), JSON.stringify(cached.filter((c) => /stream/.test(c.url))));
  check('sign-in and personal endpoints are never stored', !cached.some((c) => /\/api\/(auth|me|admin|home|favorites|history|playlists|profile)/.test(c.url)), JSON.stringify(cached.filter((c) => /\/api\/(auth|me)/.test(c.url))));

  // ---- offline
  await ctx.setOffline(true);
  const offlineApi = await page.evaluate(async () => {
    const ok = async (u) => { try { const r = await fetch(u); return r.ok; } catch { return false; } };
    return { home: await ok('/api/music/home'), me: await ok('/api/auth/me'), stream: await ok('/api/music/stream?id=s1') };
  });
  check('offline: the saved public home list still answers', offlineApi.home);
  check('offline: sign-in and audio are not served from a cache', !offlineApi.me && !offlineApi.stream, JSON.stringify(offlineApi));
  await page.goto(`${BASE}/search`).catch(() => {});
  check('offline: a page load shows the offline page', await until(async () => /You are offline/.test(await page.content())), (await page.title()));
  check('the offline page has a Try again button of at least 44px', await (async () => { const b = await page.getByRole('button', { name: 'Try again' }).boundingBox().catch(() => null); return b && b.height >= 44; })());
  await ctx.setOffline(false);

  // ---- install banner and update bar
  await page.goto(`${BASE}/`);
  await page.waitForSelector('main');
  await page.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__prompted = true; }; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); });
  check('the install banner appears when the browser offers installing', await until(async () => (await page.locator('[data-testid=pwa-install]').count()) === 1));
  const installBtn = await page.getByRole('button', { name: 'Install', exact: true }).boundingBox();
  check('the Install and Not now buttons are at least 44px', installBtn && installBtn.height >= 44 && (await page.getByRole('button', { name: 'Not now' }).boundingBox()).height >= 44);
  await page.getByRole('button', { name: 'Not now' }).click();
  check('Not now hides the banner', (await page.locator('[data-testid=pwa-install]').count()) === 0);
  await page.reload();
  await page.waitForSelector('main');
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt() {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) })));
  await page.waitForTimeout(400);
  check('and the dismissal is remembered after a reload', (await page.locator('[data-testid=pwa-install]').count()) === 0);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('tamiltunes:pwa-update')));
  check('a new version shows a Reload bar (never a silent reload)', await until(async () => (await page.locator('[data-testid=pwa-update]').count()) === 1));
  // ---- the Install page
  await page.goto(`${BASE}/install`);
  await page.waitForSelector('[data-testid=install-page]');
  const apk = await page.locator('[data-testid=apk-link]').getAttribute('href');
  check('the Install page links the Android APK', /app-release\.apk$/.test(apk || ''), apk);
  check('the Install page explains installing from the browser for Android, iPhone and a computer', JSON.stringify(await page.locator('h3').allTextContents()) === JSON.stringify(['Android (Chrome)', 'iPhone and iPad (Safari)', 'Computer (Chrome or Edge)']));
  check('the download button is at least 44px high', (await page.locator('[data-testid=apk-link]').boundingBox()).height >= 44);
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt() { window.__prompted = true; }, userChoice: Promise.resolve({ outcome: 'accepted' }) })));
  check('"Install TamilTunes now" appears when the browser offers installing', await until(async () => (await page.locator('[data-testid=install-now]').count()) === 1));
  await page.locator('[data-testid=install-now]').click();
  check('and it opens the browser install dialog', await until(() => page.evaluate(() => window.__prompted === true)));
  // ---- the Privacy page (public): mentions YouTube's embed and its cookies
  await page.goto(`${BASE}/privacy`);
  await page.waitForSelector('[data-testid=privacy-page]');
  const privacy = await page.locator('[data-testid=privacy-page]').innerText();
  check('the Privacy page opens for a guest and explains the YouTube embed and its cookies', /youtube-nocookie\.com/.test(privacy) && /cookies/i.test(privacy) && /never downloaded/i.test(privacy), privacy.slice(0, 120));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

let preview;
let browser;
try {
  await new Promise((resolve, reject) => { api.once('error', (e) => reject(new Error(e.code === 'EADDRINUSE' ? `port ${API_PORT} is busy (is the backend dev server running?). Stop it and run again.` : e.message))); api.listen(API_PORT, '127.0.0.1', resolve); });
  preview = await startPreview();
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  await run(browser);
} catch (e) {
  console.error('PWA audit crashed:', String(e.message).split('\n').slice(0, 8).join('\n'));
  results.push({ ok: false });
} finally {
  await browser?.close();
  api.close();
  if (preview) { try { process.platform === 'win32' ? preview.kill() : process.kill(-preview.pid); } catch { /* gone */ } }
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pwa checks passed`);
process.exit(failed.length ? 1 : 0);
