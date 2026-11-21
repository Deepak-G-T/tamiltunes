// Queue refill audit (the simplified no-repeat rule): the radio refills when fewer than 5 songs remain and asks for 50; only the queue is excluded
// (history is a hint, not a rule); "Out of new songs" appears only when the server says nothing is left; a failed request shows "Couldn't load more
// songs - Retry"; both are small banners, not cards. Runs the built app in Chromium against a MOCK backend; a real catalogue and a real phone are UNTESTED.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const PORT = 4185;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0; let fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name}  -> ${detail}`); } };

const song = (id, title, extra = {}) => ({ id, title, artist: `Artist ${id}`, album: `Film ${id}`, duration: 200, image: '', streamUrl: `https://aac.saavncdn.com/${id}_320.mp4`, source: 'audio', ...extra });
const Q = [song('q1', 'Seed Song One'), song('q2', 'Seed Song Two')];
const R = Array.from({ length: 12 }, (_, i) => song(`r${i + 1}`, `Radio Song ${i + 1}`));
const FEED = { trending: Q, latest: [], gana: [], nineties: [], twoThousands: [], melodies: [], love: [], sad: [], folk: [], instrumental: [], popularAlbums: [], popularArtists: [], albums: [], artists: [] };
const wav = (() => { const n = 8000 * 600, b = Buffer.alloc(44 + n, 0x80); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); return b; })();

async function startServer() {
  const p = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  await new Promise((resolve, reject) => {
    let done = false;
    p.stdout.on('data', (d) => { if (!done && /Local|127\.0\.0\.1/.test(String(d))) { done = true; resolve(); } });
    p.on('exit', (c) => { if (!done) reject(new Error(`vite preview exited ${c}`)); });
    setTimeout(() => { if (!done) reject(new Error('vite preview start timeout')); }, 30000);
  });
  return p;
}

/** `mode.kind`: ok (12 songs) | small (6) | exhausted | fail | empty. `calls` records every request for more songs. */
async function open(browser, { width = 1280, height = 800, phone = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, serviceWorkers: 'block', ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  const state = { mode: { kind: 'small' }, calls: [], errors: [] };
  page.on('pageerror', (e) => state.errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('tamiltunes_require_login', 'false'); });
  await page.route('**/api/music/home', (r) => r.fulfill({ json: { success: true, data: FEED } }));
  await page.route('**/api/home**', (r) => r.fulfill({ json: { success: true, seed: 't', hero: null, sections: [{ id: 'trending', title: 'Trending now', kind: 'songs', items: Q }] } }));
  await page.route('**/api/songs/*/related**', (r) => {
    const u = new URL(r.request().url());
    const csv = (k) => (u.searchParams.get(k) || '').split(',').filter(Boolean);
    state.calls.push({ seed: decodeURIComponent(u.pathname.split('/').at(-2)), limit: Number(u.searchParams.get('limit')), exclude: csv('exclude'), recent: csv('recent'), params: [...u.searchParams.keys()] });
    const k = state.mode.kind;
    if (k === 'fail') return r.fulfill({ status: 500, json: { success: false } });
    if (k === 'exhausted') return r.fulfill({ json: { success: true, items: [], meta: { exhausted: true, widened: ['composer', 'era', 'language', 'trending'] } } });
    if (k === 'empty') return r.fulfill({ json: { success: true, items: [], meta: { exhausted: false } } });
    return r.fulfill({ json: { success: true, items: k === 'small' ? R.slice(0, 6) : R, meta: { exhausted: false } } });
  });
  await page.route('**/api/music/songs/resolve', (r) => r.fulfill({ json: { success: true, songs: {} } }));
  await page.route('**/api/**', (r) => (/music\/home|\/api\/home|related|songs\/resolve/.test(r.request().url()) ? r.fallback() : r.fulfill({ json: { success: true } })));
  await page.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://aac.saavncdn.com/**', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wav, headers: { 'Accept-Ranges': 'bytes' } }));
  await page.goto(`${BASE}/`);
  await page.waitForSelector('section[aria-label="Trending now"] button[aria-label="More actions for Seed Song One"]');
  const tap = (loc) => (phone ? loc.tap() : loc.click());
  await tap(page.locator('button[aria-label="More actions for Seed Song One"]').last());
  await tap(page.getByRole('menuitem', { name: 'Start radio from this song', exact: true }));
  if (phone) { await page.waitForSelector('[aria-label="Show queue"]'); await page.locator('[aria-label="Show queue"]').tap(); await page.locator('[data-testid=queue-sheet]').waitFor({ timeout: 4000 }); }
  else { await page.waitForSelector('[aria-label="Toggle Queue"]'); await page.locator('[aria-label="Toggle Queue"]').click(); await page.locator('aside[data-testid=queue-sheet]').waitFor({ timeout: 4000 }); }
  return { ctx, page, state };
}
const titles = (page) => page.$$eval('[data-testid=queue-row]', (els) => els.map((e) => (e.getAttribute('aria-label') || '').split(',')[0]));
const until = async (page, test, ms = 5000) => { const end = Date.now() + ms; for (;;) { if (await test()) return true; if (Date.now() > end) return false; await page.waitForTimeout(100); } };
const next = async (page) => { await page.getByRole('button', { name: 'Next track' }).first().click(); await page.waitForTimeout(250); };

const server = await startServer();
let browser;
try {
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--autoplay-policy=no-user-gesture-required'] });

  // 1. the request: a big batch, only the queue excluded, history is a hint
  {
    const { ctx, page, state } = await open(browser);
    await until(page, async () => state.calls.length >= 1);
    check('[refill] the first request asks for 50 songs', state.calls[0]?.limit === 50, JSON.stringify(state.calls[0]));
    check('[refill] it excludes only the playing song (nothing else is a rule)', state.calls[0]?.exclude.join(',') === 'q1', state.calls[0]?.exclude.join(','));
    check('[refill] it sends no history on a fresh start, and only the known options', !state.calls[0]?.params.includes('recent') && state.calls[0]?.params.every((k) => ['limit', 'exclude', 'recent'].includes(k)), state.calls[0]?.params.join(','));
    await until(page, async () => (await titles(page)).length >= 6);
    check('[refill] six songs arrive (the server had six)', (await titles(page)).length === 6, (await titles(page)).join('|'));

    // 6 queued after Seed: refill is due when fewer than 5 remain
    await next(page); // 5 left
    await page.waitForTimeout(600);
    check('[refill] with 5 songs left nothing is requested yet', state.calls.length === 1, String(state.calls.length));
    state.mode.kind = 'ok';
    await next(page); // 4 left
    await until(page, async () => state.calls.length >= 2);
    check('[refill] with 4 songs left (fewer than 5) a new batch is requested', state.calls.length === 2, String(state.calls.length));
    const second = state.calls[1];
    check('[refill] the next request is seeded by the song now playing', second?.seed === 'r2', second?.seed);
    check('[refill] it excludes the playing song and what is queued, not what was played', second && second.exclude[0] === 'r2' && !second.exclude.includes('r1') && !second.exclude.includes('q1'), second?.exclude.join(','));
    check('[refill] what was played is only sent as a hint, newest first', second?.recent[0] === 'r1' && second.recent.includes('q1'), second?.recent.join(','));
    // history is not a rule: the mock offers r1..r12 again, r1 (played a minute ago) comes back, queued songs do not repeat
    await until(page, async () => (await titles(page)).length >= 10);
    const t = await titles(page);
    check('[refill] a song played a moment ago can come back', t.includes('Radio Song 1'), t.join('|'));
    check('[refill] no song appears twice in the queue', new Set(t).size === t.length, t.join('|'));
    check('[refill] the batch filled the queue well (10+ songs)', t.length >= 10, String(t.length));
    check('[refill] no banner while all is well', (await page.locator('[data-testid=queue-banner-exhausted], [data-testid=queue-banner-error]').count()) === 0);
    check('[refill] no page errors', state.errors.length === 0, state.errors.join(' | '));
    await ctx.close();
  }

  // 2. "Out of new songs": only when the server says so; small banner, no card, no choices
  {
    const { ctx, page, state } = await open(browser);
    await until(page, async () => (await titles(page)).length >= 6);
    state.mode.kind = 'exhausted';
    await next(page); await next(page);
    await page.waitForSelector('[data-testid=queue-banner-exhausted]', { timeout: 5000 }).catch(() => {});
    const b = page.locator('[data-testid=queue-banner-exhausted]');
    check('[exhausted] "Out of new songs" shows when the server says nothing is left', (await b.count()) === 1 && /Out of new songs/.test(await b.innerText()));
    const box = await b.boundingBox();
    check(`[exhausted] it is a small banner (${box?.height.toFixed(0)}px high), not a card`, box && box.height <= 48, JSON.stringify(box));
    check('[exhausted] it has no buttons and no choices', (await b.locator('button').count()) === 0 && (await page.getByText(/heard everything|Allow repeats|Play something different/).count()) === 0);
    const calls = state.calls.length;
    await page.waitForTimeout(1500);
    check('[exhausted] it stops asking while out of songs', state.calls.length === calls, `${calls} -> ${state.calls.length}`);
    check('[exhausted] the error banner is not shown', (await page.locator('[data-testid=queue-banner-error]').count()) === 0);
    await ctx.close();
  }

  // 3. an empty answer that is NOT "exhausted" (everything offered was already queued) is no banner at all
  {
    const { ctx, page, state } = await open(browser);
    await until(page, async () => (await titles(page)).length >= 6);
    state.mode.kind = 'empty';
    await next(page); await next(page);
    await until(page, async () => state.calls.length >= 2);
    await page.waitForTimeout(500);
    check('[empty] nothing new but not exhausted: no "Out of new songs" and no error', (await page.locator('[data-testid=queue-banner-exhausted], [data-testid=queue-banner-error]').count()) === 0);
    await ctx.close();
  }

  // 4. a failed request: "Couldn't load more songs" with Retry
  {
    const { ctx, page, state } = await open(browser);
    await until(page, async () => (await titles(page)).length >= 6);
    state.mode.kind = 'fail';
    await next(page); await next(page);
    await page.waitForSelector('[data-testid=queue-banner-error]', { timeout: 6000 }).catch(() => {});
    const b = page.locator('[data-testid=queue-banner-error]');
    check('[error] a failed request shows "Couldn\'t load more songs" with Retry', (await b.count()) === 1 && /Couldn't load more songs/.test(await b.innerText()) && (await b.getByRole('button', { name: 'Retry' }).count()) === 1);
    const box = await b.boundingBox();
    check(`[error] it is a small banner (${box?.height.toFixed(0)}px high)`, box && box.height <= 56, JSON.stringify(box));
    check('[error] it is not the "Out of new songs" banner', (await page.locator('[data-testid=queue-banner-exhausted]').count()) === 0);
    state.mode.kind = 'ok';
    const before = state.calls.length;
    await b.getByRole('button', { name: 'Retry' }).click();
    await until(page, async () => state.calls.length > before);
    check('[error] Retry asks again at once', state.calls.length === before + 1, `${before} -> ${state.calls.length}`);
    await until(page, async () => (await page.locator('[data-testid=queue-banner-error]').count()) === 0);
    check('[error] and the banner goes away when songs arrive', (await page.locator('[data-testid=queue-banner-error]').count()) === 0 && (await titles(page)).length >= 8, String((await titles(page)).length));
    check('[error] no page errors', state.errors.length === 0, state.errors.join(' | '));
    await ctx.close();
  }

  // 5. on a phone the banners fit the screen
  for (const [width, height] of [[360, 640], [390, 844]]) {
    const { ctx, page, state } = await open(browser, { width, height, phone: true });
    await until(page, async () => (await titles(page)).length >= 6);
    state.mode.kind = 'exhausted';
    await page.locator('[data-testid=queue-row]').nth(3).tap(); // jump ahead: fewer than 5 songs are left now
    await page.waitForSelector('[data-testid=queue-banner-exhausted]', { timeout: 8000 }).catch(() => {});
    const b = page.locator('[data-testid=queue-banner-exhausted]');
    const box = (await b.count()) ? await b.boundingBox() : null;
    check(`[phone ${width}x${height}] "Out of new songs" is a small banner inside the screen`, box && box.x >= 0 && box.x + box.width <= width && box.height <= 48, JSON.stringify(box));
    await ctx.close();
  }
} catch (e) {
  fail++;
  console.log(`Queue refill audit crashed: ${e.message}`);
} finally {
  await browser?.close();
  try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(server.pid), '/f', '/t']) : process.kill(-server.pid); } catch { /* already gone */ }
}
console.log(`\n${pass}/${pass + fail} queue refill checks passed`);
process.exit(fail ? 1 : 0);
