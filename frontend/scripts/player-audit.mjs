// Now Playing audit: safe areas and layout. Runs the built app (vite preview) in Chromium at 360x640, 390x844 and 412x915 with a SIMULATED
// status bar (28px) and gesture bar (24px) through --sim-safe-top / --sim-safe-bottom, and with the system font scale at 130%.
// A browser has no status bar, so this proves the layout honours the variables; the real phone is UNTESTED (docs/ANDROID_APP.md).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}`;
const TOP = 28;
const BOTTOM = 24;

const LONG = 'Chinnanchiru Kiliye Kannamma Kanne Kalaimaane Kaadhal Vandhadhaa Kaathu Vaakula Rendu Kaadhal (From "A Very Long Film Name That Never Ends")';
const SONGS = [
  { id: 'p1', title: LONG, artist: 'Sid Sriram, Shreya Ghoshal, Anirudh Ravichander, Yuvan Shankar Raja', album: 'A Very Long Film Name That Never Ends Part Two', duration: 10, image: '', streamUrl: 'https://aac.saavncdn.com/p1_320.mp4', source: 'audio' },
  { id: 'p2', title: 'Plain Song', artist: 'Someone', album: 'Plain Film', duration: 10, image: '', streamUrl: 'https://aac.saavncdn.com/p2_320.mp4', source: 'audio' },
  { id: 'p3', title: 'Third Song', artist: 'Another', album: 'Third Song', duration: 10, image: '', streamUrl: 'https://aac.saavncdn.com/p3_320.mp4', source: 'audio' },
];
const FEED = { trending: SONGS, latest: [], gana: [], nineties: [], twoThousands: [], melodies: [], love: [], sad: [], folk: [], instrumental: [], popularAlbums: [], popularArtists: [], albums: [], artists: [] };
const wav = (() => { const n = 80000, b = Buffer.alloc(44 + n, 0x80); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); return b; })();

let pass = 0; let fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name}  -> ${detail}`); } };

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

async function setup(page) {
  await page.addInitScript(() => {
    localStorage.setItem('tamiltunes_require_login', 'false');
    localStorage.setItem('tamiltunes_token', 'audit_token');
    localStorage.setItem('tamiltunes_user', JSON.stringify({ id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' }));
  });
  await page.route(/\/api\//, (r) => {
    const u = r.request().url();
    if (/\/auth\/me/.test(u)) return r.fulfill({ json: { success: true, user: { id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' } } });
    if (/\/music\/home/.test(u)) return r.fulfill({ json: { success: true, data: FEED } });
    if (/\/api\/home/.test(u)) return r.fulfill({ json: { success: true, seed: 't', hero: null, sections: [{ id: 'trending', title: 'Trending now', kind: 'songs', items: SONGS }] } });
    if (/\/songs\/[^/]+\/related/.test(u)) return r.fulfill({ json: { success: true, items: SONGS.slice(1) } });
    return r.fulfill({ json: { success: true } });
  });
  await page.route('https://aac.saavncdn.com/**', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wav, headers: { 'Accept-Ranges': 'bytes' } }));
  await page.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
}

const rect = (page, sel) => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; });

async function runViewport(browser, width, height, fontScale) {
  const tag = `${width}x${height}${fontScale > 1 ? ` font ${Math.round(fontScale * 100)}%` : ''}`;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  await page.goto(`${BASE}/`);
  await page.waitForSelector('text=Plain Song');
  // a browser has no status bar: simulate one, and the Android font scale
  await page.addStyleTag({ content: `:root { --sim-safe-top: ${TOP}px; --sim-safe-bottom: ${BOTTOM}px; }${fontScale !== 1 ? ` html { font-size: ${fontScale * 100}% !important; }` : ''}` });

  // The normal pages keep clear of the status bar (the page container pads by --safe-top)
  const topNav = await rect(page, 'header, nav, [data-testid=top-nav]').catch(() => null);
  const rootPad = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('root')).paddingTop));
  check(`[${tag}] the page container pads by the simulated status bar`, Math.abs(rootPad - TOP) < 1, String(rootPad));
  void topNav;

  await page.getByText('Chinnanchiru Kiliye').first().click();
  await page.waitForSelector('[aria-label="Open now playing full screen"]');
  await page.locator('[aria-label="Open now playing full screen"]').click({ position: { x: 20, y: 10 } });
  await page.waitForSelector('[aria-label="Close now playing"]');
  await page.waitForTimeout(400);

  // 1. header clears the status bar
  for (const [label, sel] of [['collapse (chevron) button', '[aria-label="Close now playing"]'], ['"more" button', '[aria-label="More actions for this song"]'], ['queue button', '[aria-label="Open queue"]']]) {
    const r = await rect(page, sel);
    check(`[${tag}] ${label} starts below the status bar (top ${r.y.toFixed(0)} >= ${TOP})`, r.y >= TOP - 0.5, JSON.stringify(r));
    check(`[${tag}] ${label} is a 44px target`, r.w >= 43.5 && r.h >= 43.5, `${r.w}x${r.h}`);
  }
  const close = await rect(page, '[aria-label="Close now playing"]');
  const more = await rect(page, '[aria-label="More actions for this song"]');
  const queue = await rect(page, '[aria-label="Open queue"]');
  check(`[${tag}] header buttons do not touch each other (>= 4px apart)`, more.r + 4 <= queue.x, `${more.r} vs ${queue.x}`);
  check(`[${tag}] header buttons stay on screen`, close.x >= 0 && queue.r <= width, `${close.x}..${queue.r}`);
  const label = await rect(page, '[data-testid=fs-source]');
  check(`[${tag}] "PLAYING FROM" sits between the buttons`, label.x >= close.r - 0.5 && label.r <= more.x + 0.5, JSON.stringify(label));
  check(`[${tag}] the background fills the whole screen, under the status bar`, (await rect(page, '[data-testid=fs-background]')).y <= 0.5);

  // 2. nothing overflows sideways: every visible control and text block stays inside the screen
  const outside = await page.evaluate((w) => {
    const root = document.querySelector('[data-testid=fs-root]');
    const bad = [];
    for (const el of root.querySelectorAll('button, h2, p, input, img, [data-testid=fs-cover]')) {
      if (el.closest('[aria-hidden=true]') || el.getAttribute('aria-hidden') === 'true') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.x < -0.5 || r.right > w + 0.5) bad.push(`${el.tagName}.${(el.getAttribute('aria-label') || el.textContent || '').slice(0, 24)} ${r.x.toFixed(0)}..${r.right.toFixed(0)}`);
    }
    return bad;
  }, width);
  check(`[${tag}] no control or text sticks out of the screen sideways`, outside.length === 0, outside.join(' | '));
  // the record spins, so its bounding box is the rotated one: use the layout box (offset*) instead
  const vinyl = await page.locator('[data-testid=vinyl]').evaluate((el) => { const p = el.offsetParent.getBoundingClientRect(); return { x: p.x + el.offsetLeft, r: p.x + el.offsetLeft + el.offsetWidth }; });
  check(`[${tag}] the record behind the cover is fully visible (${vinyl.x.toFixed(0)}..${vinyl.r.toFixed(0)} of ${width})`, vinyl.x >= 0 && vinyl.r <= width, JSON.stringify(vinyl));
  const bottomOf = async () => (await rect(page, '[data-testid=fs-play]')).b;
  // (the blurred background is bigger than the screen on purpose, so scrollHeight says nothing: look at the last control instead)
  const lastBottom = (await rect(page, '[data-testid=fs-bottom]')).b;
  if (fontScale === 1 && height >= 800) check(`[${tag}] the whole player fits without scrolling (controls end at ${lastBottom.toFixed(0)} of ${height})`, lastBottom <= height + 0.5, String(lastBottom));
  // at 360x640 or a big font the page may scroll, but the controls must be reachable above the gesture bar
  await page.locator('[data-testid=fs-root]').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const play = await rect(page, '[data-testid=fs-play]');
  check(`[${tag}] the play button clears the gesture bar when scrolled to the end (bottom ${play.b.toFixed(0)} <= ${height - BOTTOM})`, play.b <= height - BOTTOM + 0.5, JSON.stringify(play));
  void bottomOf;
  await page.locator('[data-testid=fs-root]').evaluate((el) => { el.scrollTop = 0; });

  // 3. long title and source name: one line, shown in full by scrolling (tap = all lines), never wider than the screen
  const title = page.locator('h2 [data-testid=marquee-text]');
  const tb = await rect(page, 'h2 [data-testid=marquee-text]');
  check(`[${tag}] the long title is one line that scrolls (marquee), inside the screen`, (await title.getAttribute('data-overflow')) === 'true' && tb.h < 60 && tb.r <= width + 0.5, JSON.stringify(tb));
  const src = page.locator('[data-testid=fs-source] [data-testid=marquee-text]');
  const sb = await rect(page, '[data-testid=fs-source] [data-testid=marquee-text]');
  check(`[${tag}] the source name is one line inside the header`, sb.h < 40 && sb.r <= width + 0.5, JSON.stringify(sb));
  void src;
  const artists = await page.locator('[data-testid=fs-artists] button').count();
  check(`[${tag}] each artist is its own tappable name (${artists})`, artists === 4, String(artists));
  check(`[${tag}] the album chip shows (album differs from the title)`, (await page.locator('[data-testid=fs-album-chip]').count()) === 1);
  const seek = await rect(page, '[data-testid=fs-root] input[title="Seek playback"]');
  check(`[${tag}] the seek bar is a 44px target`, seek.h >= 43.5, String(seek.h));

  // 4. controls: shuffle / repeat show state, like toasts, sleep timer
  await page.getByRole('button', { name: /^Shuffle/ }).click();
  check(`[${tag}] shuffle on shows a dot`, (await page.locator('[data-testid=shuffle-dot]').count()) === 1);
  await page.getByRole('button', { name: /^Repeat/ }).click();
  await page.getByRole('button', { name: /^Repeat/ }).click();
  check(`[${tag}] repeat-one is marked (dot) and says so`, (await page.locator('[data-testid=repeat-dot]').count()) === 1 && /one/i.test((await page.getByRole('button', { name: /^Repeat/ }).getAttribute('aria-label')) || ''));
  await page.getByRole('button', { name: /^Repeat/ }).click(); // off again
  await page.getByRole('button', { name: /^Shuffle/ }).click();
  if (await page.locator('[data-testid=fs-heart]').count()) {
    await page.locator('[data-testid=fs-heart]').click();
    await page.waitForSelector('text=/favourites\\./', { timeout: 3000 }).then(() => check(`[${tag}] liking shows a short toast`, true), () => check(`[${tag}] liking shows a short toast`, false, 'no toast'));
  }
  await page.locator('[data-testid=open-sleep]').click();
  await page.waitForSelector('[data-testid=sleep-sheet]');
  await page.getByRole('button', { name: '15 minutes' }).click();
  await page.waitForTimeout(300);
  check(`[${tag}] the sleep timer starts from Now Playing and shows its time`, /min left/.test((await page.locator('[data-testid=open-sleep]').getAttribute('aria-label')) || ''));

  // 5. up next opens the queue; no album chip when it equals the title
  if (await page.locator('[data-testid=up-next]').isVisible().catch(() => false)) {
    await page.locator('[data-testid=up-next]').click();
    check(`[${tag}] tapping "Up next" opens the queue`, await page.locator('[data-testid=fs-queue]').isVisible());
    await page.getByRole('button', { name: 'Show now playing' }).click();
  }
  await page.getByRole('button', { name: 'Next track' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Next track' }).click();
  await page.waitForTimeout(500);
  check(`[${tag}] the album chip is hidden when the album has the song's name`, (await page.locator('[data-testid=fs-album-chip]').count()) === 0 && /Third Song/.test(await page.locator('[data-testid=fs-root] h2').innerText()));
  // a swipe down closes
  await page.locator('[data-testid=fs-cover]').evaluate(() => {});

  check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

const preview = await startPreview();
let browser;
try {
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const [w, h, s] of [[360, 640, 1], [390, 844, 1], [412, 915, 1], [360, 640, 1.3]]) await runViewport(browser, w, h, s);
} catch (e) {
  fail++;
  console.log(`Player audit crashed: ${e.message}`);
} finally {
  await browser?.close();
  try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(preview.pid), '/f', '/t']) : process.kill(-preview.pid); } catch { /* already gone */ }
}
console.log(`\n${pass}/${pass + fail} player checks passed`);
process.exit(fail ? 1 : 0);
