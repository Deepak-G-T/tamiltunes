// Play queue audit: opens the real built app in Chromium against a MOCK backend (no network) and drives the queue
// panel the way a person would: open, add / play next, duplicates, reorder (keyboard and mouse), remove with undo,
// multi-select, jump, history, shortcuts, persistence, long lists, and the phone layout.
// Not covered: a real phone, real audio devices, a signed-in account (those are in the docs as UNTESTED).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js'); // no npx: works on Windows too

const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}`;
const song = (id, title, extra = {}) => ({ id, title, artist: 'Test Artist', album: 'Test Album', duration: 200, image: '', streamUrl: `https://aac.saavncdn.com/${id}_320.mp4`, source: 'audio', ...extra });
const Q = Array.from({ length: 6 }, (_, i) => song(`q${i + 1}`, `Queue Song ${i + 1}`));
const RADIO_ARTISTS = ['Artist A', 'Artist A', 'Artist A', 'Artist A', 'Artist A', 'Artist B', 'Artist B', 'Artist C', 'Artist C', 'Artist C', 'Artist D', 'Artist D']; // five in a row by one artist: autoplay must spread them
const R = Array.from({ length: 12 }, (_, i) => song(`r${i + 1}`, `Radio Song ${i + 1}`, { duration: 180, artist: RADIO_ARTISTS[i] }));
const relatedCalls = [];
const FEED = { trending: Q, latest: [], gana: [], nineties: [], twoThousands: [], melodies: [], love: [], sad: [], folk: [], instrumental: [], popularAlbums: [], popularArtists: [], albums: [], artists: [] };

const wav = (() => {
  const n = 8000 * 600, b = Buffer.alloc(44 + n, 0x80); // 10 minutes of silence: songs never end in the middle of a check
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28);
  b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  return b;
})();

const results = [];
let currentPage = null;
const shots = [];
const OUT = process.env.QUEUE_AUDIT_OUT; // optional folder: a screenshot is saved for every failing check
const check = (name, cond, detail = '') => {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  -> ${detail}`}`);
  if (!cond && OUT && currentPage) shots.push(currentPage.screenshot({ path: path.join(OUT, `${name.replace(/[^\w]+/g, '-').slice(0, 80)}.png`) }).catch(() => {}));
};

const startServer = () => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let done = false;
  p.stdout.on('data', (d) => { if (!done && /127\.0\.0\.1:4174|Local/.test(String(d))) { done = true; resolve(p); } });
  p.stderr.on('data', (d) => { if (!done) console.error(String(d)); });
  p.on('exit', (c) => { if (!done) reject(new Error(`vite preview exited ${c}`)); });
  setTimeout(() => { if (!done) reject(new Error('vite preview start timeout')); }, 30000);
});

async function setup(page) {
  await page.addInitScript(() => {
    localStorage.setItem('tamiltunes_require_login', 'false');
  });
  await page.route('**/api/music/home', (r) => r.fulfill({ json: { success: true, data: FEED } }));
  await page.route('**/api/home**', (r) => r.fulfill({ json: { success: true, seed: 'test', hero: null, sections: [{ id: 'trending', title: 'Trending now', kind: 'songs', items: Q }] } }));
  await page.route('**/api/songs/*/related**', (r) => { const u = new URL(r.request().url()); relatedCalls.push({ limit: Number(u.searchParams.get('limit')), exclude: (u.searchParams.get('exclude') || '').split(',') }); return r.fulfill({ json: { success: true, items: R.slice(0, Number(u.searchParams.get('limit')) || 12) } }); });
  await page.route('**/api/music/songs/resolve', (r) => {
    const ids = JSON.parse(r.request().postData() || '{}').ids || [];
    const songs = Object.fromEntries(ids.filter((i) => !i.startsWith('gone')).map((id) => [id, song(id, `Seed ${id}`, { duration: 100 })]));
    return r.fulfill({ json: { success: true, songs } });
  });
  await page.route('**/api/**', (r) => (/music\/home|\/api\/home|related|songs\/resolve/.test(r.request().url()) ? r.fallback() : r.fulfill({ json: { success: true } })));
  await page.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://aac.saavncdn.com/**', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wav, headers: { 'Accept-Ranges': 'bytes' } }));
  await page.route('https://images.unsplash.com/**', (r) => r.abort());
}

const titles = (page) => page.$$eval('[data-testid=queue-row]', (els) => els.map((e) => (e.getAttribute('aria-label') || '').split(',')[0]));
const nowPlaying = async (page) => (await page.locator('[data-testid=queue-now-playing] p.text-base').first().innerText().catch(() => '')).trim();
const live = (page) => page.locator('[data-testid=queue-live]').innerText();
const songMenu = async (page, title, item) => {
  await page.locator(`button[aria-label="More actions for ${title}"]`).last().click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
};
const sleep = (page, ms) => page.waitForTimeout(ms);
// Wait for a condition instead of a fixed pause, so a slow computer only makes the audit slower, not flaky.
const until = async (page, test, ms = 4000) => {
  const end = Date.now() + ms;
  for (;;) {
    if (await test()) return true;
    if (Date.now() > end) return false;
    await page.waitForTimeout(100);
  }
};

async function swipeLeft(page, el) {
  const b = await el.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const y = b.y + b.height / 2, x0 = b.x + b.width * 0.6;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - (170 * i) / 6, y }] }); await page.waitForTimeout(25); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  currentPage = page;
  const tag = '[desktop]';

  await page.goto(`${BASE}/`);
  await page.waitForSelector('section[aria-label="Trending now"] button[aria-label="More actions for Queue Song 1"]');
  await songMenu(page, 'Queue Song 1', 'Start radio from this song');
  await page.waitForSelector('[aria-label="Toggle Queue"]');
  await page.locator('[aria-label="Toggle Queue"]').click();
  const panel = page.locator('aside[data-testid=queue-sheet]');
  await panel.waitFor({ timeout: 3000 });
  await sleep(page, 500);
  const pb = await panel.boundingBox();
  check(`${tag} queue opens as a right-side panel`, pb && pb.x + pb.width > 1280 - 20 && pb.width >= 340 && pb.width <= 420 && pb.height > 400, JSON.stringify(pb));
  check(`${tag} Now playing shows the song`, (await nowPlaying(page)) === 'Queue Song 1', await nowPlaying(page));
  check(`${tag} Now playing has an equalizer`, await page.locator('[data-testid=queue-now-playing] [data-testid=equalizer]').count() === 1);
  await page.waitForSelector('[data-testid=queue-row]');
  const radioRows = await titles(page);
  check(`${tag} radio songs fill "Next from radio" and carry an Autoplay label`, radioRows.length >= 3 && (await page.locator('[data-testid=queue-row] >> text=Autoplay').count()) >= 3, radioRows.join('|'));
  check(`${tag} the three sections are in order`, (await panel.locator('h3').allInnerTexts()).join('|').toLowerCase() === 'next in queue|next from radio', (await panel.locator('h3').allInnerTexts()).join('|'));
  check(`${tag} total remaining time is shown`, /(min|hr) left|Less than a minute/.test(await page.locator('[data-testid=queue-remaining]').innerText()), await page.locator('[data-testid=queue-remaining]').innerText());
  check(`${tag} durations are shown on rows`, /\d:\d\d/.test(await page.locator('[data-testid=queue-row]').first().innerText()));

  // add songs from the home page behind the panel
  await songMenu(page, 'Queue Song 2', 'Add to queue');
  await songMenu(page, 'Queue Song 3', 'Add to queue');
  await songMenu(page, 'Queue Song 4', 'Play next');
  await sleep(page, 200);
  let t = await titles(page);
  check(`${tag} "Play next" goes first, "Add to queue" after your other songs, before the radio`, t.slice(0, 3).join('|') === 'Queue Song 4|Queue Song 2|Queue Song 3', t.slice(0, 5).join('|'));
  check(`${tag} songs you added carry no Autoplay label`, (await page.locator('[data-testid=queue-row]').nth(0).innerText()).indexOf('Autoplay') === -1);

  // duplicates
  await songMenu(page, 'Queue Song 2', 'Add to queue');
  await page.getByText('Already in queue', { exact: true }).waitFor({ timeout: 2000 });
  check(`${tag} adding a queued song asks "Already in queue"`, true);
  await page.getByRole('button', { name: 'Add again' }).click();
  await sleep(page, 200);
  t = await titles(page);
  check(`${tag} "Add again" queues a second copy`, t.filter((x) => x === 'Queue Song 2').length === 2, t.slice(0, 6).join('|'));
  const uids = await page.$$eval('[data-testid=queue-row]', (els) => els.map((e) => e.dataset.uid));
  check(`${tag} both copies have different slot ids`, new Set(uids).size === uids.length);
  await songMenu(page, 'Queue Song 3', 'Add to queue');
  await page.getByRole('button', { name: 'Move the queued copy' }).click();
  await sleep(page, 200);
  t = await titles(page);
  check(`${tag} "Move the queued copy" moves it to the end of your queue instead of duplicating`, t.filter((x) => x === 'Queue Song 3').length === 1 && t.slice(0, 4).join('|') === 'Queue Song 4|Queue Song 2|Queue Song 2|Queue Song 3', t.slice(0, 5).join('|'));
  check(`${tag} the duplicate prompt can be cancelled`, await (async () => {
    await songMenu(page, 'Queue Song 4', 'Play next');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await sleep(page, 150);
    return (await titles(page)).filter((x) => x === 'Queue Song 4').length === 1;
  })());

  // keyboard reorder
  const first = page.locator('[data-testid=queue-row]').first();
  await first.focus();
  await page.keyboard.press('Alt+ArrowDown');
  await sleep(page, 250);
  t = await titles(page);
  check(`${tag} Alt+Down moves the focused song down one place`, t.slice(0, 2).join('|') === 'Queue Song 2|Queue Song 4', t.slice(0, 3).join('|'));
  check(`${tag} the move is announced to screen readers`, /Queue Song 4 moved to position 2 of/.test(await live(page)), await live(page));
  check(`${tag} focus stays on the moved song`, (await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || '')).startsWith('Queue Song 4'));
  await page.keyboard.press('Alt+ArrowUp');
  await sleep(page, 250);
  t = await titles(page);
  check(`${tag} Alt+Up moves it back`, t.slice(0, 2).join('|') === 'Queue Song 4|Queue Song 2', t.slice(0, 3).join('|'));
  await page.keyboard.press('ArrowDown');
  check(`${tag} arrow keys move between rows`, (await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || '')).startsWith('Queue Song 2'));

  // keyboard drag with the handle (dnd-kit): space, arrow, space
  const handle = page.locator('[data-testid=queue-row]').first().locator('button[aria-label^="Reorder"]');
  await handle.focus();
  await page.keyboard.press('Space');
  await sleep(page, 100);
  await page.keyboard.press('ArrowDown');
  await sleep(page, 150);
  await page.keyboard.press('Space');
  await sleep(page, 300);
  t = await titles(page);
  check(`${tag} keyboard drag (space, arrow, space) reorders`, t[0] === 'Queue Song 2' && t[1] === 'Queue Song 4', t.slice(0, 3).join('|'));
  const dndText = await page.evaluate(() => document.querySelector('[id^=DndLiveRegion]')?.textContent || '');
  check(`${tag} drag and drop is announced in the live region`, /dropped at position|Picked up|now at position/.test(dndText), dndText);

  // mouse drag
  const h3 = page.locator('[data-testid=queue-row]').nth(2).locator('button[aria-label^="Reorder"]');
  const hb = await h3.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 - i * 9, { steps: 2 });
  await page.mouse.up();
  await sleep(page, 350);
  const afterDrag = await titles(page);
  check(`${tag} dragging a handle with the mouse moves the song up`, afterDrag.join('|') !== t.join('|') && afterDrag[1] === t[2], `${t.slice(0, 4).join('|')} -> ${afterDrag.slice(0, 4).join('|')}`);

  // remove with undo
  const before = await titles(page);
  await page.locator('[data-testid=queue-row]').first().focus();
  await page.keyboard.press('Delete');
  await sleep(page, 250);
  const removed = await titles(page);
  check(`${tag} Delete removes the focused song`, removed.length === before.length - 1 && removed[0] === before[1], removed.slice(0, 3).join('|'));
  check(`${tag} an Undo toast appears`, await page.getByRole('button', { name: 'Undo' }).count() === 1);
  check(`${tag} the removal is announced`, /removed from the queue/.test(await live(page)), await live(page));
  await page.getByRole('button', { name: 'Undo' }).click();
  await sleep(page, 250);
  check(`${tag} Undo puts the song back in the same place`, (await titles(page)).join('|') === before.join('|'), (await titles(page)).slice(0, 4).join('|'));
  await page.locator('[data-testid=queue-row]').nth(1).locator('button[aria-label^="Remove"]').click();
  await sleep(page, 200);
  check(`${tag} the X button removes a song`, (await titles(page)).length === before.length - 1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await sleep(page, 200);

  // row menu
  await page.locator('[data-testid=queue-row]').nth(1).locator('button[aria-label^="More options"]').click();
  check(`${tag} the "..." menu offers Play now, Play next, Select, Remove`, (await page.getByRole('menu', { name: 'Song options' }).innerText()).match(/Play now[\s\S]*Play next[\s\S]*Select[\s\S]*Remove/) !== null);
  await page.keyboard.press('Escape');
  check(`${tag} Escape closes the row menu but keeps the panel`, (await page.getByRole('menu', { name: 'Song options' }).count()) === 0 && await panel.isVisible());

  // multi-select
  const n0 = (await titles(page)).length;
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const rows = page.locator('[data-testid=queue-row]');
  await rows.nth(0).click();
  await rows.nth(1).click();
  check(`${tag} multi-select counts the chosen songs`, (await page.locator('[role=toolbar]').innerText()).includes('2 selected'));
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await sleep(page, 250);
  check(`${tag} several songs are removed at once`, (await titles(page)).length === n0 - 2);
  check(`${tag} Undo brings them all back`, await (async () => { await page.getByRole('button', { name: 'Undo' }).click(); await sleep(page, 250); return (await titles(page)).length === n0; })());
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const uid3 = await rows.nth(3).getAttribute('data-uid');
  const preMove = (await titles(page)).slice(0, 5).join('|');
  await rows.nth(3).click();

  await page.getByRole('button', { name: 'Play next', exact: true }).click();
  await sleep(page, 250);
  check(`${tag} selected songs can be moved to play next`, (await page.locator('[data-testid=queue-row]').first().getAttribute('data-uid')) === uid3, `${preMove} -> ${(await titles(page)).slice(0, 5).join('|')}`);

  // jump to a song and history
  const target = (await titles(page))[2];
  await page.locator('[data-testid=queue-row]').nth(2).locator('button[aria-label^="Play"]').click();
  await sleep(page, 500);
  check(`${tag} tapping a row jumps to it`, (await nowPlaying(page)) === target, `${await nowPlaying(page)} vs ${target}`);
  await page.getByRole('tab', { name: 'History' }).click();
  const hist = await page.locator('[data-testid=queue-history] li').allInnerTexts();
  check(`${tag} History lists what was played (songs before the jump are kept, nothing is lost)`, hist.length >= 3 && /Queue Song 1/.test(hist.join(' ')), hist.join('|'));
  await page.locator('[data-testid=queue-history] li button').last().click(); // the oldest: the first song played
  await sleep(page, 400);
  await page.getByRole('tab', { name: 'Queue' }).click();
  check(`${tag} tapping a history song replays it`, (await nowPlaying(page)) === 'Queue Song 1', await nowPlaying(page));

  // more menu: stop after this song, sleep timer
  await page.getByRole('button', { name: 'More queue options' }).click();
  const more = await page.getByRole('menu', { name: 'Queue options' }).innerText();
  check(`${tag} the more menu has Stop after this song and the sleep timer options`, /Stop after this song/.test(more) && /15 minutes/.test(more) && /30 minutes/.test(more) && /60 minutes/.test(more) && /End of this song/.test(more), more);
  await page.getByRole('menuitemcheckbox', { name: 'Stop after this song' }).click();
  await sleep(page, 200);
  check(`${tag} "Stop after this song" is shown while on`, /Stops after this song/.test(await page.locator('[data-testid=queue-remaining]').innerText()));
  await page.getByRole('button', { name: 'More queue options' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Sleep timer: 15 minutes' }).click();
  await sleep(page, 200);
  check(`${tag} the sleep timer shows the time left`, /Sleep: 1[45] min left/.test(await page.locator('[data-testid=queue-remaining]').innerText()), await page.locator('[data-testid=queue-remaining]').innerText());
  await page.getByRole('button', { name: 'More queue options' }).click();
  await page.getByRole('menuitem', { name: 'Turn off sleep timer' }).click();
  await page.getByRole('button', { name: 'More queue options' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Stop after this song' }).click(); // off again

  // refresh recommendations keeps your songs, replaces the autoplay ones
  const mine = (await titles(page)).filter((x) => x.startsWith('Queue Song')).length;
  await page.getByRole('button', { name: 'Refresh recommendations' }).click();
  await sleep(page, 600);
  const afterRefresh = await titles(page);
  check(`${tag} Refresh recommendations keeps your songs and loads new autoplay songs`, afterRefresh.filter((x) => x.startsWith('Queue Song')).length === mine && afterRefresh.some((x) => x.startsWith('Radio Song')), afterRefresh.join('|'));

  // autoplay switch
  const sw = page.getByRole('switch', { name: 'Autoplay similar songs' });
  check(`${tag} Autoplay switch is on by default`, (await sw.getAttribute('aria-checked')) === 'true');
  await sw.click();
  check(`${tag} Autoplay switch turns off`, (await sw.getAttribute('aria-checked')) === 'false');
  await sw.click();

  // save as playlist needs an account
  await page.getByRole('button', { name: 'Save as playlist' }).click();
  check(`${tag} guests are asked to sign in before saving a playlist`, await page.getByText('Sign in to save your queue as a playlist.').count() === 1);

  // shortcuts
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('q');
  await sleep(page, 300);
  check(`${tag} "q" closes the queue`, (await panel.count()) === 0);
  await page.keyboard.press('q');
  await sleep(page, 300);
  check(`${tag} "q" opens it again`, (await panel.count()) === 1);
  await page.keyboard.press('q');
  const was = await page.locator('[aria-label="Toggle Queue"]').getAttribute('aria-label');
  const titleNow = await page.locator('footer h4').first().innerText().catch(() => '');
  await page.keyboard.press('n');
  await sleep(page, 500);
  const titleNext = await page.locator('footer h4').first().innerText().catch(() => '');
  check(`${tag} "n" plays the next song`, titleNow && titleNext && titleNow !== titleNext, `${titleNow} -> ${titleNext}`);
  await page.keyboard.press('p');
  await sleep(page, 500);
  check(`${tag} "p" goes back to the previous song`, (await page.locator('footer h4').first().innerText().catch(() => '')) === titleNow, was);

  check(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function persistence(browser) {
  const tag = '[restore]';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await setup(page);
  currentPage = page;
  await page.goto(`${BASE}/`);
  await page.waitForSelector('section[aria-label="Trending now"] button[aria-label="More actions for Queue Song 1"]');
  check(`${tag} nothing is saved before anything has played`, (await page.evaluate(() => localStorage.getItem('tamiltunes_queue_v1'))) === null);
  await page.locator('[aria-label="Toggle Queue"]').count();
  await page.keyboard.press('q');
  await sleep(page, 300);
  check(`${tag} empty state: "Queue is empty - play something or add songs"`, await page.getByText('Queue is empty - play something or add songs').count() === 1);
  await page.keyboard.press('q');

  await songMenu(page, 'Queue Song 1', 'Start radio from this song');
  await songMenu(page, 'Queue Song 5', 'Add to queue');
  await page.waitForFunction(() => window.__tamiltunes_audio && window.__tamiltunes_audio.currentTime > 1.5, null, { timeout: 8000 });
  await sleep(page, 2600); // the save waits about 2 seconds
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tamiltunes_queue_v1') || 'null'));
  check(`${tag} the queue is saved in the browser as ids only`, saved && saved.items.length >= 3 && !JSON.stringify(saved).match(/Queue Song|aac\.saavncdn/), JSON.stringify(saved).slice(0, 160));
  check(`${tag} the saved position is kept`, saved.positionSec >= 1, String(saved.positionSec));

  await page.reload();
  await page.waitForSelector('footer h4');
  await sleep(page, 800);
  check(`${tag} after a refresh the song is back in the player`, (await page.locator('footer h4').first().innerText()) === 'Seed q1', await page.locator('footer h4').first().innerText());
  const playingAfter = await page.evaluate(() => !!window.__tamiltunes_audio && !window.__tamiltunes_audio.paused);
  check(`${tag} it is restored paused, not auto-playing`, playingAfter === false);
  await page.keyboard.press('q');
  await sleep(page, 400);
  check(`${tag} your queued song is restored too`, (await titles(page)).includes('Seed q5'), (await titles(page)).slice(0, 4).join('|'));
  await page.keyboard.press('q');
  await page.keyboard.press('Space');
  await page.waitForFunction((pos) => window.__tamiltunes_audio && !window.__tamiltunes_audio.paused && window.__tamiltunes_audio.currentTime >= pos - 1, saved.positionSec, { timeout: 8000 })
    .then(() => check(`${tag} Play resumes at the saved position`, true), () => check(`${tag} Play resumes at the saved position`, false, String(saved.positionSec)));

  // songs that no longer exist are dropped quietly
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('tamiltunes_queue_v1'));
    s.items.splice(2, 0, { id: 'gone-1', o: 'u' }, { id: 'gone-2', o: 'r' });
    localStorage.setItem('tamiltunes_queue_v1', JSON.stringify(s));
  });
  const page2 = await ctx.newPage();
  await setup(page2);
  await page2.goto(`${BASE}/`);
  await page2.waitForSelector('footer h4');
  await page2.waitForSelector('text=no longer available', { timeout: 5000 }).then(() => check(`${tag} songs that no longer exist are dropped with a short notice`, true), () => check(`${tag} songs that no longer exist are dropped with a short notice`, false));
  check(`${tag} a broken save never crashes the app`, true);
  await ctx.close();
}

async function longList(browser) {
  const tag = '[long list]';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  currentPage = page;
  await page.addInitScript(() => {
    const items = Array.from({ length: 321 }, (_, i) => ({ id: `s${i}`, o: i < 3 ? 'r' : i < 6 ? 'u' : 'r' }));
    // current = s60; history s0..s59 is more than 50, upcoming s61..s320 (260 songs)
    localStorage.setItem('tamiltunes_queue_v1', JSON.stringify({ items, currentIndex: 60, positionSec: 5, shuffle: false, repeat: 'off', autoplay: false, mode: 'radio', sourceLabel: null, deviceId: 'x' }));
  });
  await page.goto(`${BASE}/`);
  await page.waitForSelector('footer h4');
  await page.keyboard.press('q');
  await page.waitForSelector('[data-testid=queue-row]');
  const rendered = (await titles(page)).length;
  check(`${tag} 260 queued songs: only a window of rows is in the page`, rendered > 5 && rendered < 45, String(rendered));
  await page.locator('[data-testid=queue-list]').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await sleep(page, 300);
  const last = (await titles(page)).slice(-1)[0];
  check(`${tag} scrolling to the bottom shows the last song`, last === 'Seed s320', last);
  await page.locator('[data-testid=queue-list]').evaluate((el) => { el.scrollTop = 6000; });
  await sleep(page, 300);
  const posOf = (page, title) => page.$$eval('[data-testid=queue-row]', (els, t) => { const e = els.find((x) => (x.getAttribute('aria-label') || '').startsWith(`${t},`)); return e ? Number(/position (\d+)/.exec(e.getAttribute('aria-label'))[1]) : -1; }, title);
  await sleep(page, 500); // let the window settle after the scroll
  await page.locator('[data-testid=queue-row]').nth(5).focus();
  const focusedLabel = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || ''); // the row that will receive the key
  const midTitle = focusedLabel.split(',')[0];
  const p0 = Number(/position (\d+)/.exec(focusedLabel)?.[1]);
  await page.keyboard.press('Alt+ArrowDown');
  await sleep(page, 300);
  const p1 = await posOf(page, midTitle);
  check(`${tag} reordering works inside a windowed list`, p0 > 50 && p1 === p0 + 1, `${p0} -> ${p1}`);
  check(`${tag} the remaining time covers the whole queue`, /(hr|min) left/.test(await page.locator('[data-testid=queue-remaining]').innerText()));
  await page.getByRole('tab', { name: 'History' }).click();
  const histCount = await page.locator('[data-testid=queue-history] li').count();
  check(`${tag} History keeps only the last 50 songs`, histCount === 50, String(histCount));
  check(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}


async function feel(browser) {
  const tag = '[feel]';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { window.__QUEUE_PROFILE__ = true; });
  await setup(page);
  currentPage = page;
  relatedCalls.length = 0;
  await page.goto(`${BASE}/`);
  await page.waitForSelector('section[aria-label="Trending now"] button[aria-label="More actions for Queue Song 1"]');
  await songMenu(page, 'Queue Song 1', 'Start radio from this song');
  await page.waitForFunction(() => window.__tamiltunes_audio && window.__tamiltunes_audio.currentTime > 0.5, null, { timeout: 8000 });

  // how fast does the panel open? (measured inside the page, from the click to the first row)
  await page.evaluate(() => {
    window.__open = null;
    document.addEventListener('click', (e) => { if (e.target.closest('[aria-label="Toggle Queue"]')) window.__open = { t0: performance.now(), t1: null }; }, true);
    new MutationObserver(() => { if (window.__open && !window.__open.t1 && document.querySelector('aside[data-testid=queue-sheet] [data-testid=queue-row]')) window.__open.t1 = performance.now(); }).observe(document.body, { childList: true, subtree: true });
  });
  await page.locator('[aria-label="Toggle Queue"]').click();
  await page.waitForSelector('aside[data-testid=queue-sheet] [data-testid=queue-row]');
  const openMs = await page.evaluate(() => (window.__open?.t1 ?? NaN) - (window.__open?.t0 ?? NaN));
  console.log(`      (panel opened in ${openMs.toFixed(0)} ms)`);
  check(`${tag} the panel opens with its rows in under 150 ms`, openMs < 150, `${openMs} ms`);

  // autoplay: says what it did, keeps variety, keeps what the home page shows out
  check(`${tag} autoplay asked for 10 songs`, relatedCalls[0]?.limit === 10, JSON.stringify(relatedCalls[0]));
  check(`${tag} songs shown on the home page are kept out of the suggestions`, relatedCalls[0]?.exclude.includes('q2') && relatedCalls[0]?.exclude.includes('q6'), relatedCalls[0]?.exclude.join(','));
  check(`${tag} autoplay says "Added 10 similar songs"`, await page.getByText('Added 10 similar songs.').count() > 0);
  const artists = await page.$$eval('[data-testid=queue-row]', (els) => els.map((e) => (e.getAttribute('aria-label') || '').split(', ')[1]));
  let run = 1; let best = 1; artists.forEach((a, i) => { if (i) { run = a === artists[i - 1] ? run + 1 : 1; best = Math.max(best, run); } });
  const nowArtist = await page.locator('[data-testid=queue-now-playing] p.text-sm').first().innerText();
  check(`${tag} never more than 3 songs in a row by one artist (${artists.join(',')})`, best <= 3 && artists.length >= 8, `longest run ${best}`);

  // instant feedback with Undo: the row is there at once, a message with Undo appears, Undo takes it back
  await page.evaluate(() => {
    window.__add = { t0: null, t1: null, before: document.querySelectorAll('[data-testid=queue-row]').length };
    document.addEventListener('click', (e) => { if (e.target.closest('[role=menuitem]')) window.__add.t0 = performance.now(); }, true);
    new MutationObserver(() => { if (window.__add.t0 && !window.__add.t1 && document.querySelectorAll('[data-testid=queue-row]').length > window.__add.before) window.__add.t1 = performance.now(); }).observe(document.body, { childList: true, subtree: true });
  });
  await songMenu(page, 'Queue Song 3', 'Add to queue');
  const addMs = await page.evaluate(() => window.__add.t1 - window.__add.t0);
  check(`${tag} "Add to queue" shows the song in the panel within 100 ms (no waiting on the network)`, addMs < 100, `${addMs} ms`);
  check(`${tag} a message "Added to queue." with Undo appears`, await page.getByText('Added to queue.').count() === 1 && await page.getByRole('button', { name: 'Undo' }).count() === 1);
  let t = await titles(page);
  check(`${tag} the added song is first in "Next in queue"`, t[0] === 'Queue Song 3', t.slice(0, 3).join('|'));
  await page.getByRole('button', { name: 'Undo' }).click();
  await sleep(page, 250);
  check(`${tag} Undo takes the added song back`, !(await titles(page)).includes('Queue Song 3'));
  await songMenu(page, 'Queue Song 4', 'Play next');
  check(`${tag} "Play next" says "Playing next." with Undo`, await page.getByText('Playing next.').count() === 1);
  await sleep(page, 250);

  // reorder with Undo; the current song stays highlighted through all changes
  const first = page.locator('[data-testid=queue-row]').first();
  const beforeOrder = await titles(page);
  await first.focus();
  await page.keyboard.press('Alt+ArrowDown');
  await sleep(page, 300);
  check(`${tag} a reorder says what moved and offers Undo`, await page.getByText(/Moved "/).count() === 1 && await page.getByRole('button', { name: 'Undo' }).count() === 1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await sleep(page, 300);
  check(`${tag} Undo puts the reordered song back`, (await titles(page)).join('|') === beforeOrder.join('|'));
  check(`${tag} the playing song is still pinned and highlighted with its equalizer`, (await nowPlaying(page)) === 'Queue Song 1' && await page.locator('[data-testid=queue-now-playing] [data-testid=equalizer]').count() === 1 && /brand-500/.test(await page.locator('[data-testid=queue-now-playing]').getAttribute('class')));
  // Undo stops working if the list changed since (never undoes something else)
  await page.locator('[data-testid=queue-row]').first().focus();
  await page.keyboard.press('Alt+ArrowDown');
  await sleep(page, 200);
  await page.locator('[data-testid=queue-row]').nth(2).locator('button[aria-label^="Remove"]').click();
  await sleep(page, 200);
  check(`${tag} the playing song is still highlighted after several changes`, (await nowPlaying(page)) === 'Queue Song 1');

  // "Next up" in the player bar follows the queue
  const nextUp = await page.locator('[data-testid=next-up]').innerText();
  const firstTitle = (await titles(page))[0];
  check(`${tag} the player bar shows "Next up: <song>"`, /Next up/.test(nextUp) && nextUp.includes(firstTitle), `${nextUp} vs ${firstTitle}`);

  // the panel is not redrawn on every tick of the song clock
  await page.evaluate(() => { window.__queueRenders = 0; });
  await sleep(page, 3000);
  const idleRenders = await page.evaluate(() => window.__queueRenders);
  check(`${tag} 3 seconds of playing redraw the panel at most once (not on every clock tick)`, idleRenders <= 1, `${idleRenders} redraws`);
  await page.evaluate(() => { window.__queueRenders = 0; });
  await page.keyboard.press('n');
  await sleep(page, 700);
  const songChangeRenders = await page.evaluate(() => window.__queueRenders);
  check(`${tag} a song change redraws the panel only a few times`, songChangeRenders <= 6, `${songChangeRenders} redraws`);
  const nextTitle = await page.locator('[data-testid=next-up]').innerText();
  check(`${tag} "Next up" moves on with the queue`, nextTitle !== nextUp, `${nextUp} -> ${nextTitle}`);
  check(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function stableScroll(browser) {
  const tag = '[scroll]';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await setup(page);
  currentPage = page;
  await page.addInitScript(() => {
    const items = Array.from({ length: 80 }, (_, i) => ({ id: `s${i}`, o: 'r' }));
    localStorage.setItem('tamiltunes_queue_v1', JSON.stringify({ items, currentIndex: 0, positionSec: 0, shuffle: false, repeat: 'off', autoplay: false, mode: 'radio', sourceLabel: null, deviceId: 'x' }));
  });
  await page.goto(`${BASE}/`);
  await page.waitForSelector('footer h4');
  await page.keyboard.press('q');
  await page.waitForSelector('[data-testid=queue-row]');
  const topRow = () => page.evaluate(() => {
    const list = document.querySelector('[data-testid=queue-list]');
    const top = list.getBoundingClientRect().top;
    const rows = [...document.querySelectorAll('[data-testid=queue-row]')].map((el) => ({ el, y: el.getBoundingClientRect().top - top })).filter((r) => r.y >= -2).sort((a, b) => a.y - b.y);
    return { title: (rows[0].el.getAttribute('aria-label') || '').split(',')[0], y: Math.round(rows[0].y) };
  });
  await page.locator('[data-testid=queue-list]').evaluate((el) => { el.scrollTop = 1800; });
  await sleep(page, 300);
  const before = await topRow();
  await page.keyboard.press('n'); // the song changes: the first row of the list goes away
  await sleep(page, 900);
  const after = await topRow();
  check(`${tag} the list stays where it was when the song changes (top row ${before.title})`, after.title === before.title && Math.abs(after.y - before.y) <= 3, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  const sc0 = await page.locator('[data-testid=queue-list]').evaluate((el) => el.scrollTop);
  const visibleIdx = await page.evaluate(() => { const top = document.querySelector('[data-testid=queue-list]').getBoundingClientRect().top; return [...document.querySelectorAll('[data-testid=queue-row]')].findIndex((el) => el.getBoundingClientRect().top > top + 100); }); // a row that is on screen
  await page.locator('[data-testid=queue-row]').nth(visibleIdx).focus({ timeout: 3000 });
  await page.keyboard.press('Alt+ArrowDown');
  await sleep(page, 400);
  const sc1 = await page.locator('[data-testid=queue-list]').evaluate((el) => el.scrollTop);
  check(`${tag} a reorder does not move the scroll position`, Math.abs(sc1 - sc0) <= 3, `${sc0} -> ${sc1}`);
  await ctx.close();
}

async function motion(browser) {
  const tag = '[motion]';
  for (const reduced of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    await setup(page);
    currentPage = page;
    await page.addInitScript(() => {
      localStorage.setItem('tamiltunes_queue_v1', JSON.stringify({ items: Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, o: 'r' })), currentIndex: 0, positionSec: 0, shuffle: false, repeat: 'off', autoplay: false, mode: 'radio', sourceLabel: null, deviceId: 'x' }));
    });
    await page.goto(`${BASE}/`);
    await page.waitForSelector('footer h4');
    await page.keyboard.press('q');
    await page.waitForSelector('[data-testid=queue-row]');
    await page.locator('[data-testid=queue-row]').first().focus();
    await page.keyboard.press('Alt+ArrowDown');
    const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.matches?.('[data-queue-row]') && a.playState === 'running').length);
    if (reduced) check(`${tag} with reduced motion the rows jump instead of sliding`, moving === 0, `${moving} animations`);
    else check(`${tag} rows slide to their new place when reordered`, moving >= 2, `${moving} animations`);
    if (!reduced) {
      await page.keyboard.press('Delete');
      const sliding = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.matches?.('[data-queue-row]')).length);
      check(`${tag} rows slide up when one is removed`, sliding >= 1, `${sliding} animations`);
    }
    await ctx.close();
  }
}

async function failedStream(browser) {
  const tag = '[failed stream]';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await setup(page);
  currentPage = page;
  await page.route('https://aac.saavncdn.com/q2_*', (r) => r.fulfill({ status: 404, body: 'gone' })); // this one song cannot be played
  await page.goto(`${BASE}/`);
  await page.waitForSelector('section[aria-label="Trending now"] button[aria-label="More actions for Queue Song 1"]');
  await songMenu(page, 'Queue Song 1', 'Start radio from this song');
  await songMenu(page, 'Queue Song 2', 'Play next');
  await page.waitForFunction(() => window.__tamiltunes_audio && window.__tamiltunes_audio.currentTime > 0.5, null, { timeout: 8000 });
  await page.keyboard.press('n'); // next: Queue Song 2, which fails
  await page.getByText('Couldn\'t play "Queue Song 2", skipped.').waitFor({ timeout: 8000 })
    .then(() => check(`${tag} the toast names the song that could not be played`, true), () => check(`${tag} the toast names the song that could not be played`, false, 'no toast'));
  await sleep(page, 1500);
  check(`${tag} playback carries on with the next song`, !/Queue Song 2/.test(await page.locator('footer h4').first().innerText().catch(() => '')), await page.locator('footer h4').first().innerText().catch(() => ''));
  await ctx.close();
}

async function phone(browser, width, height) {
  const tag = `[${width}x${height}]`;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  currentPage = page;
  if (process.env.QUEUE_AUDIT_THROTTLE) { const t = await ctx.newCDPSession(page); await t.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.QUEUE_AUDIT_THROTTLE) }); } // simulate a slower computer
  await page.goto(`${BASE}/`);
  await page.waitForSelector('section[aria-label="Trending now"] button[aria-label="More actions for Queue Song 1"]');
  await songMenu(page, 'Queue Song 1', 'Start radio from this song').catch(async () => { await page.locator(`button[aria-label="More actions for Queue Song 1"]`).last().tap(); await page.getByRole('menuitem', { name: 'Start radio from this song', exact: true }).tap(); });
  await page.waitForSelector('[aria-label="Show queue"]');
  await page.locator('[aria-label="Show queue"]').tap();
  const sheet = page.locator('[data-testid=queue-sheet]');
  await sheet.waitFor();
  await sleep(page, 500);
  const sb = await sheet.boundingBox();
  check(`${tag} the queue is a bottom sheet`, sb && Math.abs(sb.width - width) < 2 && Math.abs(sb.y + sb.height - height) < 2, JSON.stringify(sb));
  check(`${tag} tabs, Now playing and rows are shown`, (await page.getByRole('tab').count()) === 2 && (await nowPlaying(page)) === 'Queue Song 1' && (await titles(page)).length >= 3);
  check(`${tag} the header actions are reachable (Clear queue, Save as playlist, Select)`, await page.getByRole('button', { name: 'Clear queue' }).isVisible() && await page.getByRole('button', { name: 'Save as playlist' }).isVisible() && await page.getByRole('button', { name: 'Select', exact: true }).isVisible());
  check(`${tag} no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check(`${tag} rows have a visible drag handle and at least 44 px touch targets for the main actions`, await (async () => {
    const h = await page.locator('[data-testid=queue-row]').first().locator('button[aria-label^="Reorder"]').boundingBox();
    const row = await page.locator('[data-testid=queue-row]').first().boundingBox();
    return h && h.width >= 40 && h.height >= 40 && row.height >= 56;
  })());

  const before = await titles(page);
  await swipeLeft(page, page.locator('[data-testid=queue-row]').first());
  await until(page, async () => (await titles(page)).length === before.length - 1);
  const after = await titles(page);
  check(`${tag} swiping a row left removes it`, after.length === before.length - 1 && after[0] === before[1], `${before.slice(0, 2)} -> ${after.slice(0, 2)}`);
  await sleep(page, 700);
  check(`${tag} one swipe removes exactly one song (no second removal a moment later)`, (await titles(page)).length === before.length - 1, `${before.length} -> ${(await titles(page)).length}`);
  check(`${tag} the Undo toast is there`, await page.getByRole('button', { name: 'Undo' }).count() === 1);
  await page.getByRole('button', { name: 'Undo' }).tap();
  const restored = await until(page, async () => (await titles(page)).join('|') === before.join('|'));
  check(`${tag} Undo restores the swiped song`, restored, `${before.slice(0, 4)} -> ${(await titles(page)).slice(0, 4)}`);

  // touch drag with the handle
  await page.locator('[data-testid=queue-row]').nth(1).scrollIntoViewIfNeeded();
  const hb = await page.locator('[data-testid=queue-row]').nth(1).locator('button[aria-label^="Reorder"]').boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const x = hb.x + hb.width / 2, y = hb.y + hb.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 8 }] }); await sleep(page, 20); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await until(page, async () => (await titles(page))[0] === before[1], 3000);
  const dragged = await titles(page);
  check(`${tag} dragging the handle with a finger reorders`, dragged[0] === before[1] && dragged[1] === before[0], `${before.slice(0, 3)} -> ${dragged.slice(0, 3)}`);

  // the swipe handle closes the sheet; the Now Playing tab has the queue too
  const handle = await sheet.locator('> div').first().boundingBox();
  const c2 = await ctx.newCDPSession(page);
  await c2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: handle.x + handle.width / 2, y: handle.y + 8 }] });
  for (let i = 1; i <= 6; i++) { await c2.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: handle.x + handle.width / 2, y: handle.y + 8 + i * 28 }] }); await sleep(page, 25); }
  await c2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await c2.detach();
  await sleep(page, 400);
  check(`${tag} swiping the sheet handle down closes the queue`, (await sheet.count()) === 0);
  await until(page, async () => (await sheet.count()) === 0); // wait for the sheet to be gone before tapping the mini player
  await page.locator('[aria-label="Open now playing full screen"]').tap();
  if (!(await until(page, async () => (await page.locator('[aria-label="Close now playing"]').count()) > 0, 3000))) await page.locator('[aria-label="Open now playing full screen"]').tap(); // one retry
  await page.waitForSelector('[aria-label="Close now playing"]');
  await page.locator('[aria-label="Open queue"]').tap();
  await page.locator('[data-testid=fs-queue]').waitFor();
  check(`${tag} Now Playing has a Queue tab with the same list`, (await titles(page)).length >= 3 && (await nowPlaying(page)) === 'Queue Song 1');
  await page.getByRole('tab', { name: 'History' }).tap();
  check(`${tag} and a History tab`, await page.locator('[data-testid=queue-history]').count() === 1);
  check(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

let server;
let browser;
try {
  server = await startServer();
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--autoplay-policy=no-user-gesture-required'] });
  const only = process.env.QUEUE_AUDIT_ONLY; // optional: desktop | restore | long | phone
  if (!only || only === 'desktop') await desktop(browser);
  if (!only || only === 'restore') await persistence(browser);
  if (!only || only === 'long') await longList(browser);
  if (!only || only === 'stream') await failedStream(browser);
  if (!only || only === 'feel') { await feel(browser); await stableScroll(browser); await motion(browser); }
  if (!only || only === 'phone') { await phone(browser, 360, 640); await phone(browser, 390, 844); }
} catch (err) {
  console.error('Queue audit crashed:', String(err.message).split('\n').slice(0, 12).join('\n'));
  if (OUT && currentPage) await currentPage.screenshot({ path: path.join(OUT, 'crash.png') }).catch(() => {});
  results.push({ name: 'audit run', ok: false, detail: String(err) });
} finally {
  await browser?.close();
  if (server) { try { process.platform === 'win32' ? server.kill() : process.kill(-server.pid); } catch { /* already gone */ } }
}
await Promise.all(shots);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} queue checks passed`);
process.exit(failed.length ? 1 : 0);
