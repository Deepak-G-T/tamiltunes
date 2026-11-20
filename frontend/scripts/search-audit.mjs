// Recent searches audit: real built app in Chromium, mock backend (no network).
// Typing must never save anything; only a committed search (Enter, a chip or tile, an action on a result) does.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const PORT = 4176;
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = 'tamiltunes_recent_searches_v2';
const LEGACY = 'tamiltunes_recent_searches';

const song = (id, title) => ({ id, title, artist: 'Test Artist', album: 'Test Album', duration: 200, image: '', streamUrl: `https://aac.saavncdn.com/${id}_320.mp4`, source: 'audio' });
const results = { songs: [song('s1', 'Found Song One'), song('s2', 'Found Song Two')], albums: [], artists: [], playlists: [] };

const wav = (() => {
  const n = 8000 * 30, b = Buffer.alloc(44 + n, 0x80);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28);
  b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  return b;
})();

const rows = [];
const check = (name, cond, detail = '') => {
  rows.push({ name, ok: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  -> ${detail}`}`);
};

const startServer = () => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let done = false;
  p.stdout.on('data', (d) => { if (!done && /127\.0\.0\.1:4176|Local/.test(String(d))) { done = true; resolve(p); } });
  p.stderr.on('data', (d) => { if (!done) console.error(String(d)); });
  p.on('exit', (c) => { if (!done) reject(new Error(`vite preview exited ${c}`)); });
  setTimeout(() => { if (!done) reject(new Error('vite preview start timeout')); }, 30000);
});

let searchCalls = [];
async function open(browser, { legacy } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' } /* the service worker answers /api/music/search itself, which skips page.route: block it so the mock is used */);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('tamiltunes_token', 'audit_token');
    localStorage.setItem('tamiltunes_user', JSON.stringify({ id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' }));
  });
  if (legacy) await page.addInitScript(([k, v]) => { if (!localStorage.getItem('__seeded')) { localStorage.setItem(k, v); localStorage.setItem('__seeded', '1'); } }, [LEGACY, JSON.stringify(legacy)]);
  searchCalls = [];
  await page.route('**/api/**', (r) => {
    const u = r.request().url();
    if (/\/auth\/me/.test(u)) return r.fulfill({ json: { success: true, user: { id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' } } });
    if (/\/music\/search/.test(u)) {
      searchCalls.push(new URL(u).searchParams.get('query'));
      return r.fulfill({ json: { success: true, data: results } });
    }
    if (/\/music\/home/.test(u)) return r.fulfill({ json: { success: true, data: { trending: [], latest: [], gana: [], nineties: [], twoThousands: [], melodies: [], love: [], sad: [], folk: [], instrumental: [], popularAlbums: [], popularArtists: [], albums: [], artists: [] } } });
    return r.fulfill({ json: { success: true } });
  });
  await page.route('https://aac.saavncdn.com/**', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wav }));
  await page.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto(`${BASE}/search`);
  await page.waitForSelector('input[aria-label="Search"]');
  return { ctx, page };
}
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const chips = (page) => page.$$eval('ul[aria-label="Recent searches"] li > button:first-child', (els) => els.map((e) => e.textContent.trim()));
const box = (page) => page.locator('input[aria-label="Search"]');
const enter = async (page, text) => { await box(page).fill(''); await box(page).fill(text); await box(page).press('Enter'); await page.waitForTimeout(150); };

async function run(browser) {
  // 1. the old list is cleaned once
  let { ctx, page } = await open(browser, { legacy: ['Ponniyin Selvan', 'Leo', 'Master', 'ko', 'aambala', 'ambala', 'amba', 'am'] });
  check('the old list is cleaned on first load (half-typed entries gone)', JSON.stringify(await chips(page)) === JSON.stringify(['Ponniyin Selvan', 'Leo', 'Master', 'ko', 'aambala', 'ambala']), (await chips(page)).join('|'));
  check('the old storage key is removed and the new one is used', (await page.evaluate((k) => localStorage.getItem(k), LEGACY)) === null && (await stored(page)).length === 6);
  await page.reload();
  await page.waitForSelector('ul[aria-label="Recent searches"]');
  check('the cleaning runs once: reloading changes nothing', (await chips(page)).length === 6);
  await ctx.close();

  // 2. typing saves nothing
  ({ ctx, page } = await open(browser));
  await box(page).click();
  await page.keyboard.type('ambala', { delay: 140 });
  await page.waitForTimeout(1200); // well past the typing pause
  check('typing "ambala" letter by letter saves nothing', ((await stored(page)) || []).length === 0, JSON.stringify(await stored(page)));
  const recentKeys = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => /recent/i.test(k)).map((k) => [k, localStorage.getItem(k)])));
  check('nothing was written to any "recent" storage key while typing', JSON.stringify(recentKeys) === JSON.stringify({ [KEY]: '[]' }), JSON.stringify(recentKeys));
  check('results still update while typing', searchCalls.includes('ambala'), searchCalls.join(','));
  check('only the finished word is searched, not every letter', !searchCalls.includes('a') && !searchCalls.includes('am'), searchCalls.join(','));

  // 3. Enter saves exactly one
  await box(page).press('Enter');
  await page.waitForTimeout(200);
  check('pressing Enter saves exactly one "ambala"', JSON.stringify(await stored(page)) === JSON.stringify(['ambala']), JSON.stringify(await stored(page)));
  await box(page).press('Enter');
  check('pressing Enter again does not add a second one', (await stored(page)).length === 1);

  // 4. a longer search replaces the shorter one
  await enter(page, 'ambala song');
  check('"ambala" then "ambala song" leaves one entry', JSON.stringify(await stored(page)) === JSON.stringify(['ambala song']), JSON.stringify(await stored(page)));

  // 5. repeat goes to the top; chips run the search without duplicates
  await enter(page, 'Leo');
  await enter(page, 'Master');
  await enter(page, 'leo');
  check('a repeated search moves to the top', JSON.stringify((await stored(page)).slice(0, 2).map((s) => s.toLowerCase())) === JSON.stringify(['leo', 'master']) && (await stored(page)).length === 3, JSON.stringify(await stored(page)));
  await page.getByRole('button', { name: 'clear search', exact: false }).count();
  await box(page).fill('');
  await page.waitForTimeout(600);
  const before = await chips(page);
  check('the chips show on an empty search page', before.length === 3, before.join('|'));
  await page.locator('ul[aria-label="Recent searches"] li > button:first-child', { hasText: 'Master' }).click();
  await page.waitForTimeout(300);
  check('pressing a chip runs the search', searchCalls.includes('Master'), searchCalls.join(','));
  check('and moves it to the top without a duplicate', JSON.stringify(await stored(page)) === JSON.stringify(['Master', 'leo', 'ambala song']), JSON.stringify(await stored(page)));

  // 6. the cap
  for (let i = 1; i <= 12; i++) await enter(page, `search ${String.fromCharCode(96 + i)}${i}`);
  const capped = await stored(page);
  check('at most 10 entries, newest first', capped.length === 10 && capped[0] === 'search l12' && capped[9] === 'search c3', JSON.stringify(capped));

  // 7. remove one, clear all
  await box(page).fill('');
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Remove search l12 from recent searches' }).click();
  check('the x removes one entry', (await stored(page)).length === 9 && !(await stored(page)).includes('search l12'));
  await page.getByRole('button', { name: 'Clear all' }).click();
  check('"Clear all" empties the list', (await stored(page)).length === 0 && (await chips(page)).length === 0);

  // 8. an action on a result saves the search that found it
  await box(page).fill('');
  await box(page).type('zzz test', { delay: 60 });
  await page.waitForSelector('text=Found Song One');
  check('looking at results alone saves nothing', ((await stored(page)) || []).length === 0);
  await page.locator('button[aria-label="Play Found Song One"]').first().click();
  await page.waitForTimeout(300);
  check('playing a result saves the search text that found it', JSON.stringify(await stored(page)) === JSON.stringify(['zzz test']), JSON.stringify(await stored(page)));

  // 9. a tile counts as a chosen suggestion
  await box(page).fill('');
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Anirudh' }).click();
  await page.waitForTimeout(300);
  check('choosing a Browse tile saves it', (await stored(page))[0] === 'Anirudh', JSON.stringify(await stored(page)));

  // 10. short and spaced queries
  await enter(page, 'a');
  await enter(page, '   ');
  check('a one-character search is not saved', !(await stored(page)).includes('a'));
  await enter(page, '  big    boss  ');
  check('spaces are trimmed and collapsed', (await stored(page))[0] === 'big boss', JSON.stringify(await stored(page)));
  await ctx.close();
}

let server;
let browser;
try {
  server = await startServer();
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--autoplay-policy=no-user-gesture-required'] });
  await run(browser);
} catch (err) {
  console.error('Search audit crashed:', String(err.message).split('\n').slice(0, 12).join('\n'));
  rows.push({ name: 'audit run', ok: false });
} finally {
  await browser?.close();
  if (server) { try { if (process.platform === 'win32') server.kill(); else process.kill(-server.pid); } catch { /* already gone */ } }
}
const failed = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} search checks passed`);
process.exit(failed.length ? 1 : 0);
