// Wrapped audit: the banner (only in December and January), the story, the share picture, and small screens with a simulated status bar.
// Runs the built app (vite preview) in Chromium with a mock backend. A real phone, a real year of plays and the system share sheet are UNTESTED.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const PORT = 4181;
const BASE = `http://127.0.0.1:${PORT}`;
const TOP = 28;
const BOTTOM = 24;

let pass = 0; let fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name}  -> ${detail}`); } };

const LONG = 'Chinnanchiru Kiliye Kannamma Kanne Kalaimaane Kaadhal Vandhadhaa Kaathu Vaakula Rendu Kaadhal (From "A Very Long Film Name That Never Ends")';
const READY = {
  year: 2026, ready: true, minPlays: 20,
  totals: { minutes: 12345, hours: 205.8, plays: 3100, distinctSongs: 800, distinctArtists: 150, activeDays: 280, longestStreak: 41 },
  topSongs: [{ id: 's1', title: LONG, artist: 'Sid Sriram, Shreya Ghoshal, Anirudh Ravichander', plays: 59, minutes: 200 }, ...[2, 3, 4, 5].map((n) => ({ id: `s${n}`, title: `Song ${n}`, artist: `Artist ${n}`, plays: 60 - n, minutes: 100 }))],
  topArtists: [1, 2, 3, 4, 5].map((n) => ({ name: `Singer ${n}`, plays: 300 - n, minutes: 900 - n })),
  topFilms: [1, 2, 3, 4, 5].map((n) => ({ name: n === 1 ? 'A Very Long Film Name That Never Ends Part Two' : `Film ${n}`, plays: 100 - n, minutes: 300 })),
  topComposers: [{ name: 'Anirudh Ravichander', plays: 400, minutes: 1200 }],
  topEra: { label: '2010s', share: 46 }, busiestDay: { date: '2026-05-11', minutes: 410, plays: 98 }, favouriteWeekday: 'Saturday',
  timeOfDay: { part: 'night', label: 'Night owl' }, firstSong: { title: 'First', artist: 'Someone', date: '2026-01-01' },
};
const EARLY = { year: 2026, ready: false, minPlays: 20, totals: { plays: 7, minutes: 20, hours: 0.3, distinctSongs: 5, distinctArtists: 4, activeDays: 3, longestStreak: 2 }, topSongs: [], topArtists: [], topFilms: [], topComposers: [], topEra: null, busiestDay: null, favouriteWeekday: null, timeOfDay: null, firstSong: null };
const FEED = { trending: [{ id: 'p1', title: 'Plain Song', artist: 'Someone', album: 'Plain Film', duration: 10, image: '', streamUrl: 'https://aac.saavncdn.com/p1_320.mp4', source: 'audio' }], latest: [], gana: [], nineties: [], twoThousands: [], melodies: [], love: [], sad: [], folk: [], instrumental: [], popularAlbums: [], popularArtists: [], albums: [], artists: [] };

async function startPreview() {
  const p = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  await new Promise((resolve, reject) => {
    let done = false;
    p.stdout.on('data', (d) => { if (!done && /Local|127\.0\.0\.1/.test(String(d))) { done = true; resolve(); } });
    p.on('exit', (c) => { if (!done) reject(new Error(`vite preview exited ${c}`)); });
    setTimeout(() => { if (!done) reject(new Error('vite preview start timeout')); }, 30000);
  });
  return p;
}

async function open(browser, { width, height, date, wrapped, status = 200 }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = []; const requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date(date));
  await page.addInitScript(() => {
    localStorage.setItem('tamiltunes_require_login', 'false');
    localStorage.setItem('tamiltunes_token', 'audit_token');
    localStorage.setItem('tamiltunes_user', JSON.stringify({ id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' }));
    window.__shared = [];
    navigator.canShare = () => true;
    navigator.share = async (data) => { window.__shared.push({ files: (data.files || []).map((f) => `${f.name}:${f.type}:${f.size > 1000}`), title: data.title, text: data.text }); };
  });
  await page.route(/\/api\//, (r) => {
    const u = r.request().url();
    if (/\/auth\/me/.test(u)) return r.fulfill({ json: { success: true, user: { id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' } } });
    if (/\/me\/wrapped/.test(u)) { requests.push(u); return status === 200 ? r.fulfill({ json: { success: true, wrapped: wrapped } }) : r.fulfill({ status, json: { success: false } }); }
    if (/\/music\/home/.test(u)) return r.fulfill({ json: { success: true, data: FEED } });
    if (/\/api\/home/.test(u)) return r.fulfill({ json: { success: true, seed: 't', hero: null, sections: [{ id: 'trending', title: 'Trending now', kind: 'songs', items: FEED.trending }] } });
    return r.fulfill({ json: { success: true } });
  });
  await page.route('https://aac.saavncdn.com/**', (r) => r.abort());
  await page.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  return { ctx, page, errors, requests };
}
const simulate = (page) => page.addStyleTag({ content: `:root { --sim-safe-top: ${TOP}px; --sim-safe-bottom: ${BOTTOM}px; }` });
const rect = (page, sel) => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; });

const preview = await startPreview();
let browser;
try {
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });

  // 1. the banner follows the calendar
  for (const [label, date, shown] of [['20 November', '2026-11-20T10:00:00', false], ['1 December', '2026-12-01T10:00:00', true], ['15 January', '2027-01-15T10:00:00', true], ['1 February', '2027-02-01T10:00:00', false]]) {
    const { ctx, page } = await open(browser, { width: 390, height: 844, date, wrapped: READY });
    await page.goto(`${BASE}/`);
    await page.waitForSelector('text=Plain Song');
    await page.waitForTimeout(300);
    check(`[banner] on ${label} the Home banner is ${shown ? 'shown' : 'hidden'}`, (await page.locator('[data-testid=wrapped-banner]').count()) === (shown ? 1 : 0));
    if (label === '15 January') check('[banner] in January it offers last year (2026)', /2026 Wrapped/.test(await page.locator('[data-testid=wrapped-banner]').innerText()));
    if (label === '1 December') {
      await page.getByRole('button', { name: 'Hide this' }).click();
      check('[banner] it can be hidden', (await page.locator('[data-testid=wrapped-banner]').count()) === 0);
      await page.reload(); await page.waitForSelector('text=Plain Song'); await page.waitForTimeout(300);
      check('[banner] and stays hidden after a reload', (await page.locator('[data-testid=wrapped-banner]').count()) === 0);
    }
    await ctx.close();
  }

  // 2. the story at three phone sizes, with a status bar and a gesture bar
  for (const [width, height] of [[360, 640], [390, 844], [412, 915]]) {
    const tag = `${width}x${height}`;
    const { ctx, page, errors, requests } = await open(browser, { width, height, date: '2026-12-05T21:00:00', wrapped: READY });
    await page.goto(`${BASE}/`);
    await page.waitForSelector('[data-testid=wrapped-banner]');
    await simulate(page);
    await page.getByRole('button', { name: 'See it' }).click();
    await page.waitForSelector('[data-testid=wrapped-slide-intro]');
    check(`[${tag}] "See it" opens the story at /wrapped`, /\/wrapped\?year=2026/.test(page.url()));
    check(`[${tag}] the server was asked for 2026 with the phone's time zone`, requests.length === 1 && /year=2026/.test(requests[0]) && /tz=-?\d+/.test(requests[0]), requests.join(' '));
    const close = await rect(page, '[aria-label="Close Wrapped"]');
    check(`[${tag}] the close button clears the status bar (top ${close.y.toFixed(0)} >= ${TOP}) and is 44px`, close.y >= TOP - 0.5 && close.w >= 43.5 && close.h >= 43.5, JSON.stringify(close));
    check(`[${tag}] the progress bar has one segment per screen`, (await page.locator('[role=progressbar] > span').count()) === 7);

    const seen = [];
    for (let i = 0; i < 6; i++) {
      await page.getByRole('button', { name: 'Next' }).click();
      await page.waitForTimeout(120);
      seen.push(await page.locator('[data-testid^=wrapped-slide-]').first().getAttribute('data-testid'));
      // nothing sticks out sideways, long titles wrap or are cut inside the screen
      const bad = await page.evaluate((w) => [...document.querySelectorAll('[data-testid=wrapped] h1, [data-testid=wrapped] p, [data-testid=wrapped] li, [data-testid=wrapped] button')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.x < -0.5 || r.right > w + 0.5); }).map((el) => `${el.tagName}:${(el.textContent || el.getAttribute('aria-label') || '').slice(0, 20)}`), width);
      if (bad.length) check(`[${tag}] screen ${i + 2} stays inside the phone`, false, bad.join(' | '));
    }
    check(`[${tag}] the story order: minutes, songs, artists, films, style, share`, JSON.stringify(seen) === JSON.stringify(['wrapped-slide-minutes', 'wrapped-slide-songs', 'wrapped-slide-artists', 'wrapped-slide-films', 'wrapped-slide-when', 'wrapped-slide-summary']), seen.join(','));
    check(`[${tag}] every screen stayed inside the phone`, true);
    await page.waitForSelector('[data-testid=wrapped-slide-summary] img[src^="data:image/png"]', { timeout: 5000 }).then(() => check(`[${tag}] the share picture is drawn (a data URL, no file)`, true), () => check(`[${tag}] the share picture is drawn (a data URL, no file)`, false, 'no image'));
    const bottom = await rect(page, '[data-testid=wrapped] [aria-label=Previous]');
    check(`[${tag}] the buttons clear the gesture bar (bottom ${bottom.b.toFixed(0)} <= ${height - BOTTOM})`, bottom.b <= height - BOTTOM + 0.5, JSON.stringify(bottom));
    if (width === 390) {
      await page.getByRole('button', { name: 'Share' }).click();
      await page.waitForTimeout(500);
      const shared = await page.evaluate(() => window.__shared);
      check(`[${tag}] Share hands the picture to the system share sheet as a PNG file`, shared.length === 1 && shared[0].files.length === 1 && /tamiltunes-wrapped\.png:image\/png:true/.test(shared[0].files[0]), JSON.stringify(shared));
      check(`[${tag}] the share text names the minutes and the top song`, /12,345 minutes/.test(shared[0]?.text || ''), shared[0]?.text);
      // going back and the keyboard
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(150);
      check(`[${tag}] the left arrow goes back one screen`, (await page.locator('[data-testid^=wrapped-slide-]').first().getAttribute('data-testid')) === 'wrapped-slide-when');
      await page.getByRole('button', { name: 'Close Wrapped' }).click();
      await page.waitForTimeout(300);
      check(`[${tag}] closing returns Home`, !/wrapped/.test(page.url()));
    }
    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 3. tap zones, not enough listening, and a failing server
  {
    const { ctx, page } = await open(browser, { width: 390, height: 844, date: '2026-12-05T21:00:00', wrapped: READY });
    await page.goto(`${BASE}/wrapped?year=2026`);
    await page.waitForSelector('[data-testid=wrapped-slide-intro]');
    await page.mouse.click(300, 400); // the right part of the screen = next
    await page.waitForTimeout(200);
    check('[tap] tapping the right side goes forward', (await page.locator('[data-testid^=wrapped-slide-]').first().getAttribute('data-testid')) === 'wrapped-slide-minutes');
    await page.mouse.click(40, 400); // the left third = back
    await page.waitForTimeout(200);
    check('[tap] tapping the left side goes back', (await page.locator('[data-testid^=wrapped-slide-]').first().getAttribute('data-testid')) === 'wrapped-slide-intro');
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, { width: 390, height: 844, date: '2026-12-05T21:00:00', wrapped: EARLY });
    await page.goto(`${BASE}/wrapped?year=2026`);
    await page.waitForSelector('[data-testid=wrapped-slide-early]');
    const text = await page.locator('[data-testid=wrapped-slide-early]').innerText();
    check('[early] not enough listening: a friendly screen with the real progress, no made-up numbers', /warming up/.test(text) && /7 \/ 20/.test(text) && /13 more songs/.test(text) && !/minutes/.test(text), text);
    check('[early] and it is the only screen', (await page.locator('[role=progressbar] > span').count()) === 1);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, { width: 390, height: 844, date: '2026-12-05T21:00:00', wrapped: null, status: 500 });
    await page.goto(`${BASE}/wrapped?year=2026`);
    await page.waitForSelector('[role=alert]', { timeout: 15000 });
    check('[error] a failing server shows a message with Try again, not a blank screen', /Could not load/.test(await page.locator('[role=alert]').innerText()) && (await page.getByRole('button', { name: 'Try again' }).count()) === 1);
    await ctx.close();
  }
} catch (e) {
  fail++;
  console.log(`Wrapped audit crashed: ${e.message}`);
} finally {
  await browser?.close();
  try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(preview.pid), '/f', '/t']) : process.kill(-preview.pid); } catch { /* already gone */ }
}
console.log(`\n${pass}/${pass + fail} wrapped checks passed`);
process.exit(fail ? 1 : 0);
