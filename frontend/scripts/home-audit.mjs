// Home page audit: real built app in Chromium with a MOCK backend. Checks that the page asks for ONE feed, leaves Speed Dial
// songs out of every shelf, shows fixed-height placeholders (no layout jump) and handles tabs, empty sections and errors.
// The de-duplication itself is tested on the server (backend/test/home-feed.test.js).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const PORT = 4177;
const BASE = `http://127.0.0.1:${PORT}`;
const song = (id, title) => ({ id, title, artist: `Singer ${id}`, album: `Film ${id}`, duration: 200, image: '', streamUrl: `https://aac.saavncdn.com/${id}_320.mp4`, source: 'audio', year: '2020' });
const H = Array.from({ length: 10 }, (_, i) => song(`h${i + 1}`, `Hit Song ${i + 1}`));      // the provider's trending list: fills Speed Dial for a guest
const T = Array.from({ length: 12 }, (_, i) => song(`t${i + 1}`, `Trend Song ${i + 1}`));
const N = Array.from({ length: 9 }, (_, i) => song(`n${i + 1}`, `New Song ${i + 1}`));
const M = Array.from({ length: 12 }, (_, i) => song(`m${i + 1}`, `Melody Song ${i + 1}`));
const FEED = { trending: H, latest: [], gana: [], nineties: [], twoThousands: [], melodies: [], love: [], sad: [], folk: [], instrumental: [], popularAlbums: [], popularArtists: [], albums: [], artists: [] };

const results = [];
const check = (name, cond, detail = '') => { results.push({ ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  -> ${detail}`}`); };
const startServer = () => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let done = false;
  p.stdout.on('data', (d) => { if (!done && /127\.0\.0\.1:4177|Local/.test(String(d))) { done = true; resolve(p); } });
  p.stderr.on('data', (d) => { if (!done) console.error(String(d)); });
  p.on('exit', (c) => { if (!done) reject(new Error(`vite preview exited ${c}`)); });
  setTimeout(() => { if (!done) reject(new Error('vite preview start timeout')); }, 30000);
});

const calls = [];
// poll a condition (for things that happen outside the page, like requests); a slow machine just waits longer
const waitFor = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };
let failFolk = true;
// Acts like the server for the parts that matter here: leaves out `exclude`d songs, answers after a short delay
const homeHandler = async (route) => {
  const url = new URL(route.request().url());
  const exclude = (url.searchParams.get('exclude') || '').split(',').filter(Boolean);
  const tab = url.searchParams.get('tab');
  calls.push({ exclude, tab, visit: url.searchParams.get('visit'), avoid: (url.searchParams.get('avoid') || '').split(',').filter(Boolean) });
  await new Promise((r) => setTimeout(r, 700));
  const drop = (list) => list.filter((s) => !exclude.includes(s.id));
  if (tab === 'folk' && failFolk) return route.fulfill({ status: 500, json: { success: false } });
  if (tab) return route.fulfill({ json: { success: true, seed: 's', hero: null, sections: [{ id: tab, title: 'Heartfelt melodies & love songs', kind: 'songs', items: M }], hidden: [] } });
  return route.fulfill({ json: { success: true, seed: 's', hero: drop([H[9]])[0] ? H[9] : null, hidden: ['continue'], sections: [
    { id: 'trending', title: 'Trending now', kind: 'songs', items: drop([...H.slice(0, 5), ...T]) },   // contains Speed Dial songs: they must be gone
    { id: 'new', title: 'New releases', subtitle: 'Singer A, Singer B and more', kind: 'songs', items: drop(N) },
  ] } });
};

async function run(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('tamiltunes_token', 'audit_token');
    localStorage.setItem('tamiltunes_user', JSON.stringify({ id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' }));
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.route('**/api/**', (r) => {
    const u = r.request().url();
    if (/\/auth\/me/.test(u)) return r.fulfill({ json: { success: true, user: { id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' } } });
    if (/\/me\/speed-dial/.test(u)) return r.fulfill({ json: { success: true, items: H.slice(0, 9).map((s) => ({ ...s, isPinned: false, isHidden: false })) } });
    if (/\/music\/home/.test(u)) return r.fulfill({ json: { success: true, data: FEED } });
    if (/\/api\/home/.test(u)) return homeHandler(r);
    return r.fulfill({ json: { success: true } });
  });
  await page.route('https://aac.saavncdn.com/**', (r) => r.abort());

  await page.goto(`${BASE}/`);
  await page.waitForSelector('section[aria-label="Speed dial"] button[aria-label^="More actions for"]');
  await page.waitForSelector('.shimmer', { timeout: 3000 });
  const sk = await page.locator('main section .shimmer').count();
  check('placeholder shelves show while the feed loads', sk >= 6, String(sk));
  await page.waitForSelector('section[aria-label="Trending now"]');
  await page.waitForTimeout(400);
  const cls = await page.evaluate(() => window.__cls);
  check('the page does not jump when the shelves arrive (layout shift under 0.1)', cls < 0.1, String(cls));

  check('exactly one request builds the whole feed', calls.length === 1, JSON.stringify(calls));
  const dialTitles = await page.$$eval('section[aria-label="Speed dial"] button[aria-label^="More actions for"]', (els) => els.map((e) => e.getAttribute('aria-label').replace('More actions for ', '')));
  const sent = calls[0]?.exclude || [];
  check('Speed Dial songs are sent so the feed can leave them out', dialTitles.length > 0 && sent.length === dialTitles.length && dialTitles.every((t) => sent.includes(`h${t.split(' ').pop()}`)), `${dialTitles.join('|')} vs ${sent.join(',')}`);

  const sections = await page.$$eval('main section[aria-label]', (els) => els.map((e) => ({ label: e.getAttribute('aria-label'), titles: [...e.querySelectorAll('button[aria-label^="More actions for"]')].map((b) => b.getAttribute('aria-label').replace('More actions for ', '')) })));
  const shelves = sections.filter((s) => s.label !== 'Speed dial' && s.titles.length);
  const all = shelves.flatMap((s) => s.titles);
  check('no song appears twice below Speed Dial', new Set(all).size === all.length, all.join('|'));
  check('no Speed Dial song appears in a shelf', all.every((t) => !dialTitles.includes(t)), all.filter((t) => dialTitles.includes(t)).join('|'));
  check('shelves keep the server order', shelves.map((s) => s.label).join('|') === 'Trending now|New releases', shelves.map((s) => s.label).join('|'));
  check('a section the server left out is not shown', (await page.locator('section[aria-label="Continue listening"]').count()) === 0);
  check('the featured song is shown once and not repeated', (await page.locator('text=Hit Song 10').count()) >= 1 && !all.includes('Hit Song 10'));

  // a category chip asks for its own pool, without Speed Dial
  await page.getByRole('button', { name: '💖 Melodies' }).click();
  await page.waitForSelector('section[aria-label="Heartfelt melodies & love songs"]');
  const tabCall = calls.at(-1);
  check('a category chip asks for that category', tabCall.tab === 'melodies', JSON.stringify(tabCall));
  check('Speed Dial songs are not excluded on a category page (it is not shown there)', tabCall.exclude.length === 0);
  check('Speed Dial is hidden on a category page', (await page.locator('section[aria-label="Speed dial"]').count()) === 0);

  // an error shows a retry, not a blank page
  await page.getByRole('button', { name: '🥁 Folk & Kuthu' }).click();
  await page.waitForSelector('text=Could not load the home page shelves.');
  check('a failed feed shows a message and a retry button', await page.getByRole('button', { name: /retry|try again/i }).count() >= 1);
  failFolk = false;
  await page.getByRole('button', { name: /retry|try again/i }).first().click();
  await page.waitForSelector('section[aria-label="Heartfelt melodies & love songs"]');
  check('Retry loads the shelf', true);

  // back to All: the same page again (the feed is requested once per visit of the tab)
  await page.getByRole('button', { name: 'All Tamil Music' }).click();
  await page.waitForSelector('section[aria-label="Trending now"]');
  check('back on All the Speed Dial songs are left out again', (calls.at(-1).exclude || []).length > 0);
  // a fresh mix: every app open has a visit token, tab switches keep it, Refresh makes a new one and sends what was on screen
  const first = calls[0];
  check('the page sends a visit token (a new mix on every app open)', /^[a-z0-9]{10}$/.test(first.visit || ''), JSON.stringify(first));
  check('switching tabs keeps the same visit', calls.every((c) => c.visit === first.visit), calls.map((c) => c.visit).join(','));
  check('a shelf shows its subtitle (Daily Mix style)', (await page.locator('section[aria-label="New releases"] >> text=Singer A, Singer B and more').count()) === 1);
  const before = calls.length;
  await page.getByRole('button', { name: 'Refresh for a fresh mix' }).click();
  // wait for the refresh request itself (the old shelves stay on screen while it loads, so a selector would not wait)
  await waitFor(() => calls.length >= before + 1);
  await page.waitForSelector('button[aria-label="Refresh for a fresh mix"]:not([disabled])'); // the new mix has arrived
  const refreshed = calls.at(-1);
  check('Refresh asks for a new mix (a different visit token)', calls.length === before + 1 && refreshed.visit && refreshed.visit !== first.visit, JSON.stringify(refreshed));
  check('Refresh sends the songs that were on screen so they sink', refreshed.avoid.length >= 5 && refreshed.avoid.every((id) => /^[\w.:~-]+$/.test(id)), JSON.stringify(refreshed.avoid));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// Pull down at the top of the page on a phone: the same fresh mix
async function pullToRefresh(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/music/home', (r) => r.fulfill({ json: { success: true, data: FEED } }));
  await page.route('**/api/home**', homeHandler);
  await page.route('**/api/**', (r) => (/music\/home|\/api\/home/.test(r.request().url()) ? r.fallback() : r.fulfill({ json: { success: true } })));
  await page.route('https://aac.saavncdn.com/**', (r) => r.abort());
  calls.length = 0;
  await page.goto(`${BASE}/`);
  await page.waitForSelector('section[aria-label="Trending now"]');
  const firstVisit = calls.at(-1).visit;
  const n = calls.length;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 150 }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 150 + i * 25 }] }); await page.waitForTimeout(20); }
  const indicator = await page.locator('[data-testid=pull-indicator]').innerText().catch(() => '');
  check('pulling down shows "Release for a fresh mix"', /Release for a fresh mix/.test(indicator), indicator);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitFor(() => calls.length >= n + 1);
  await page.waitForSelector('section[aria-label="Trending now"]');
  check('letting go asks for a new mix', calls.length === n + 1 && calls.at(-1).visit !== firstVisit, JSON.stringify(calls.slice(n)));
  check('no page errors (pull to refresh)', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

let server;
let browser;
try {
  server = await startServer();
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  await run(browser);
  await pullToRefresh(browser);
} catch (err) {
  console.error('Home audit crashed:', String(err.message).split('\n').slice(0, 12).join('\n'));
  results.push({ ok: false });
} finally {
  await browser?.close();
  if (server) { try { if (process.platform === 'win32') server.kill(); else process.kill(-server.pid); } catch { /* already gone */ } }
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} home checks passed`);
process.exit(failed.length ? 1 : 0);
