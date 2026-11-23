// Admin video audit: the "YouTube video" screen on Admin > Songs. Paste a link, Check, Save, Remove, Restore, errors and small screens.
// Runs the built app (vite preview) in Chromium against a MOCK backend. A real admin account, the real YouTube answers and a real phone are UNTESTED.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const PORT = 4187;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0; let fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name}  -> ${detail}`); } };

const GOOD = 'ZdMZ40GSVmc'; const LYRIC = 'IqwIOlhfCak'; const BLOCKED = 'AbCdEfGhIj1';
const SONGS = [{ id: 's1', title: 'Badass', artist: 'Anirudh Ravichander', movie: 'Leo', year: 2023, isHidden: false }, { id: 's2', title: 'Naan Pizhai', artist: 'Anirudh Ravichander', movie: 'Kaathuvaakula Rendu Kaadhal', year: 2022, isHidden: false }];
const CHECKS = {
  [GOOD]: { embeddable: true, title: 'Leo - Badass Video', channel: 'SonyMusicSouthVEVO' },
  [LYRIC]: { embeddable: true, title: 'LEO - Badass Lyric | Thalapathy Vijay', channel: 'Sony Music South' },
  [BLOCKED]: { embeddable: false, reason: 'embedding-disabled', title: 'Some video', channel: 'Someone' },
};

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

async function open(browser, { width = 1280, height = 800, forbidden = false, hidden = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, serviceWorkers: 'block', ...(width < 500 ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  const seen = []; const errors = [];
  const db = { chosen: null, hidden };
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('tamiltunes_require_login', 'false');
    localStorage.setItem('tamiltunes_token', 'admin_token');
    localStorage.setItem('tamiltunes_user', JSON.stringify({ id: 'a1', email: 'admin@example.com', name: 'Admin', role: 'admin', isActive: true }));
  });
  await page.route(/\/api\//, async (r) => {
    const url = r.request().url(); const method = r.request().method(); const u = new URL(url);
    const body = r.request().postData();
    if (/\/auth\/me/.test(url)) return r.fulfill({ json: { success: true, user: { id: 'a1', email: 'admin@example.com', name: 'Admin', role: 'admin', isActive: true } } });
    if (/\/api\/admin\/videos\//.test(url)) {
      seen.push({ method, path: u.pathname.replace('/api', ''), body: body ? JSON.parse(body) : null });
      if (forbidden) return r.fulfill({ status: 403, json: { success: false, message: 'Forbidden' } });
      const m = u.pathname.match(/\/admin\/videos\/(.+)$/);
      const tail = decodeURIComponent(m[1]);
      if (tail.startsWith('check/')) { const c = CHECKS[tail.slice(6)]; return r.fulfill({ json: { success: true, videoId: tail.slice(6), ...(c || { embeddable: null, reason: 'network' }) } }); }
      if (tail.endsWith('/restore')) { db.hidden = false; return r.fulfill({ json: { success: true, item: {} } }); }
      if (method === 'GET') return r.fulfill({ json: { success: true, item: { songId: tail, title: 'Badass', artist: 'Anirudh', chosenVideoId: db.chosen, hidden: db.hidden, servedVideoId: db.chosen, source: db.chosen ? 'admin' : db.hidden ? 'hidden' : 'none' } } });
      if (method === 'PUT') { db.chosen = JSON.parse(body).videoId; return r.fulfill({ json: { success: true, item: { videoId: db.chosen } } }); }
      if (method === 'DELETE') { db.chosen = null; return r.fulfill({ json: { success: true, item: {} } }); }
    }
    if (/\/api\/admin\/songs/.test(url)) return r.fulfill({ json: { songs: SONGS, total: 2, page: 1, totalPages: 1 } });
    if (/\/api\/music\/home/.test(url)) return r.fulfill({ json: { success: true, data: { trending: [], latest: [], gana: [], nineties: [], twoThousands: [], melodies: [], love: [], sad: [], folk: [], instrumental: [], popularAlbums: [], popularArtists: [], albums: [], artists: [] } } });
    if (/\/api\/home(\?|$)/.test(url)) return r.fulfill({ json: { success: true, seed: 's', hero: null, sections: [] } });
    return r.fulfill({ json: { success: true } });
  });
  await page.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto(`${BASE}/admin/songs`);
  await page.getByRole('button', { name: /^YouTube video for/ }).first().waitFor({ timeout: 10000 }).catch(async () => { console.log('DEBUG url', page.url(), 'errors', errors.join('|'), 'text', (await page.locator('body').innerText()).slice(0, 400).replace(/\n+/g, ' / ')); throw new Error('songs list did not load'); });
  return { ctx, page, seen, errors, db };
}
const openModal = async (page, title) => { await page.getByRole('button', { name: `YouTube video for ${title}` }).click(); await page.waitForSelector('[data-testid=song-video-modal]'); await page.waitForSelector('[data-testid=video-current] p, [data-testid=video-current] button', { timeout: 5000 }).catch(() => {}); };
const rect = (page, sel) => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; });

const server = await startPreview();
let browser;
try {
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });

  // 1. the whole flow
  {
    const { ctx, page, seen, errors, db } = await open(browser);
    check('[flow] every song row has a YouTube video button', (await page.getByRole('button', { name: /^YouTube video for/ }).count()) === 2);
    await openModal(page, 'Badass');
    check('[flow] the screen names the song and says there is no video yet', /Badass/.test(await page.getByTestId('video-song-name').innerText()) && /No video yet/.test(await page.getByTestId('video-current').innerText()));
    check('[flow] it asked the server about this song only', seen[0]?.method === 'GET' && seen[0]?.path === '/admin/videos/s1', JSON.stringify(seen[0]));
    check('[flow] Check and Save start disabled', await page.getByTestId('video-check-button').isDisabled() && await page.getByTestId('video-save').isDisabled());

    const input = page.getByTestId('video-input');
    await input.fill('not a link');
    check('[flow] text that is not a link shows a clear message and nothing can be saved', (await page.getByTestId('video-parse-error').count()) === 1 && await page.getByTestId('video-save').isDisabled());
    await input.fill('https://www.youtube.com/playlist?list=PL1234567890abcdef');
    check('[flow] a playlist link is refused', (await page.getByTestId('video-parse-error').count()) === 1);
    await input.fill('https://evil.example/watch?v=' + GOOD);
    check('[flow] a link on another website is refused', (await page.getByTestId('video-parse-error').count()) === 1);

    await input.fill(`https://youtu.be/${GOOD}?si=abc`);
    check('[flow] a youtu.be link is understood and shows the video id', (await page.getByTestId('video-parsed').innerText()).includes(GOOD) && (await page.getByTestId('video-parse-error').count()) === 0);
    const open_ = page.getByRole('link', { name: /Open on YouTube/ });
    check('[flow] "Open on YouTube" opens a new tab safely', (await open_.getAttribute('target')) === '_blank' && /noopener/.test((await open_.getAttribute('rel')) || '') && (await open_.getAttribute('href')) === `https://www.youtube.com/watch?v=${GOOD}`);
    await page.getByTestId('video-check-button').click();
    await page.waitForSelector('[data-testid=video-check]');
    const c1 = await page.getByTestId('video-check').innerText();
    check('[flow] Check shows the title and channel and says it can be played', /can be played/.test(c1) && /Leo - Badass Video/.test(c1) && /SonyMusicSouthVEVO/.test(c1), c1);
    check('[flow] no warning for a real video song', (await page.getByTestId('video-hint').count()) === 0);

    await input.fill(`https://www.youtube.com/watch?v=${LYRIC}`);
    await page.getByTestId('video-check-button').click();
    await page.waitForSelector('[data-testid=video-hint]');
    check('[flow] a lyric video gets a gentle warning, but can still be saved', (await page.getByTestId('video-hint').count()) === 1 && !(await page.getByTestId('video-save').isDisabled()));

    await input.fill(BLOCKED);
    await page.getByTestId('video-check-button').click();
    await page.waitForSelector('[data-testid=video-check]');
    check('[flow] a video that cannot be embedded says so and cannot be saved', /cannot be played/.test(await page.getByTestId('video-check').innerText()) && await page.getByTestId('video-save').isDisabled());
    await input.fill(GOOD);
    check('[flow] changing the link clears the old check', (await page.getByTestId('video-check').count()) === 0);

    await page.getByTestId('video-save').click();
    await page.getByText('A video you chose').waitFor();
    const put = seen.find((s) => s.method === 'PUT');
    check('[flow] Save sends exactly the video id for this song', put?.path === '/admin/videos/s1' && JSON.stringify(put.body) === JSON.stringify({ videoId: GOOD }), JSON.stringify(put));
    check('[flow] the screen now shows the chosen video and a Remove button', (await page.getByTestId('video-clear').count()) === 1 && (await page.getByTestId('video-current').innerText()).includes(GOOD));
    check('[flow] a message says it was saved', (await page.getByText('Video saved.').count()) >= 1);
    await page.getByTestId('video-clear').click();
    await page.getByText('No video yet').waitFor();
    check('[flow] Remove my choice sends a DELETE and goes back to "No video yet"', seen.some((s) => s.method === 'DELETE' && s.path === '/admin/videos/s1') && db.chosen === null);
    await page.getByRole('button', { name: 'Close' }).click();
    check('[flow] closing returns to the list', (await page.getByTestId('song-video-modal').count()) === 0);
    check('[flow] no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2. a hidden video can be shown again
  {
    const { ctx, page, seen } = await open(browser, { hidden: true });
    await openModal(page, 'Badass');
    check('[hidden] it says the video is hidden and offers to show it again', /Hidden/.test(await page.getByTestId('video-current').innerText()) && (await page.getByTestId('video-restore').count()) === 1);
    await page.getByTestId('video-restore').click();
    await page.getByText('No video yet').waitFor();
    check('[hidden] "Show the video again" sends the restore request', seen.some((s) => s.method === 'POST' && s.path === '/admin/videos/s1/restore'));
    await ctx.close();
  }

  // 3. an account that is not allowed gets a clear message
  {
    const { ctx, page } = await open(browser, { forbidden: true });
    await page.getByRole('button', { name: 'YouTube video for Badass' }).click();
    await page.waitForSelector('[data-testid=video-error]');
    check('[403] a refused account is told to add its id to ADMIN_VIDEO_USER_IDS', /ADMIN_VIDEO_USER_IDS/.test(await page.getByTestId('video-error').innerText()));
    await ctx.close();
  }

  // 4. small screens
  for (const [width, height] of [[360, 640], [390, 844]]) {
    const { ctx, page } = await open(browser, { width, height });
    await page.getByRole('button', { name: 'YouTube video for Badass' }).first().tap();
    await page.waitForSelector('[data-testid=song-video-modal]');
    await page.getByTestId('video-input').fill(`https://youtu.be/${GOOD}`);
    await page.getByTestId('video-check-button').click();
    await page.waitForSelector('[data-testid=video-check]');
    const m = await rect(page, '[data-testid=song-video-modal] > div');
    check(`[${width}x${height}] the screen fits inside the phone`, m.x >= 0 && m.r <= width + 0.5 && m.b <= height + 0.5, JSON.stringify(m));
    const bs = await page.locator('[data-testid=song-video-modal] button').evaluateAll((els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 43.5 || r.width < 43.5); }).map((e) => e.getAttribute('aria-label') || e.textContent.trim()));
    check(`[${width}x${height}] every button is a 44px target`, bs.length === 0, bs.join(' | '));
    await ctx.close();
  }
} catch (e) {
  fail++;
  console.log(`Admin video audit crashed: ${e.message}`);
} finally {
  await browser?.close();
  try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(server.pid), '/f', '/t']) : process.kill(-server.pid); } catch { /* already gone */ }
}
console.log(`\n${pass}/${pass + fail} admin video checks passed`);
process.exit(fail ? 1 : 0);
