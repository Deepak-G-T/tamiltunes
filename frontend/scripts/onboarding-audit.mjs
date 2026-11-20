// Onboarding audit: the first-login taste picker. Runs the built app (vite preview) in Chromium with a mock backend, at three phone sizes with a simulated
// status bar (28px) and gesture bar (24px), and the Android font scale at 130%. A real phone and a real new account are UNTESTED.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const PORT = 4183;
const BASE = `http://127.0.0.1:${PORT}`;
const TOP = 28;
const BOTTOM = 24;

let pass = 0; let fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name}  -> ${detail}`); } };

const ARTISTS = ['Sid Sriram', 'Shreya Ghoshal', 'S. P. Balasubrahmanyam', 'K. J. Yesudas', 'Chinmayi', 'Karthik', 'Hariharan', 'S. Janaki', 'K. S. Chithra', 'Haricharan', 'Vijay Prakash', 'Benny Dayal', 'Andrea Jeremiah', 'Dhanush', 'Anirudh Ravichander', 'Yuvan Shankar Raja', 'Jonita Gandhi', 'Pradeep Kumar', 'Swetha Mohan', 'Unni Menon', 'Mano', 'T. M. Soundararajan', 'P. Susheela', 'Vijay Yesudas'];
const COMPOSERS = ['Ilaiyaraaja', 'A. R. Rahman', 'Yuvan Shankar Raja', 'Anirudh Ravichander', 'Harris Jayaraj', 'D. Imman', 'G. V. Prakash Kumar', 'Santhosh Narayanan', 'Sam C. S.', 'Vidyasagar', 'Deva', 'M. S. Viswanathan', 'Hiphop Tamizha', 'Devi Sri Prasad', 'Sean Roldan', 'Ghibran'];
const ERAS = [{ id: 'before-1990', label: 'Before 1990' }, { id: '90s', label: '90s' }, { id: '2000s', label: '2000s' }, { id: '2010s', label: '2010s' }, { id: '2020s', label: '2020s' }];
const OPTIONS = { artists: ARTISTS, composers: COMPOSERS, eras: ERAS, limits: { artists: 12, composers: 8, eras: 5 } };
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

/** shouldOnboard: what GET /me/taste answers; saved: the picks it returns; getFails / putFails: server errors. */
async function open(browser, { width = 390, height = 844, shouldOnboard = true, saved = null, getFails = false, putFails = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const state = { puts: [], gets: 0, errors: [] };
  page.on('pageerror', (e) => state.errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('tamiltunes_require_login', 'false');
    localStorage.setItem('tamiltunes_token', 'audit_token');
    localStorage.setItem('tamiltunes_user', JSON.stringify({ id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' }));
  });
  await page.route(/\/api\//, (r) => {
    const u = r.request().url(); const m = r.request().method();
    if (/\/auth\/me/.test(u)) return r.fulfill({ json: { success: true, user: { id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' } } });
    if (/\/me\/taste/.test(u)) {
      if (m === 'PUT') { state.puts.push(JSON.parse(r.request().postData() || '{}')); return putFails ? r.fulfill({ status: 500, json: { success: false } }) : r.fulfill({ json: { success: true, taste: state.puts.at(-1) } }); }
      state.gets++;
      return getFails ? r.fulfill({ status: 500, json: { success: false } }) : r.fulfill({ json: { success: true, taste: saved, shouldOnboard, options: OPTIONS } });
    }
    if (/\/music\/home/.test(u)) return r.fulfill({ json: { success: true, data: FEED } });
    if (/\/api\/home/.test(u)) return r.fulfill({ json: { success: true, seed: 't', hero: null, sections: [{ id: 'trending', title: 'Trending now', kind: 'songs', items: FEED.trending }] } });
    return r.fulfill({ json: { success: true } });
  });
  await page.route('https://aac.saavncdn.com/**', (r) => r.abort());
  await page.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  return { ctx, page, state };
}
const simulate = (page, scale = 1) => page.addStyleTag({ content: `:root { --sim-safe-top: ${TOP}px; --sim-safe-bottom: ${BOTTOM}px; }${scale !== 1 ? ` html { font-size: ${scale * 100}% !important; }` : ''}` });
const rect = (page, sel) => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; });
const choices = (page) => page.locator('[data-testid=choice]');
const pick = async (page, name) => page.getByRole('button', { name, exact: true }).click();
const count = (page) => page.locator('[data-testid=choice-count]').innerText();

const preview = await startPreview();
let browser;
try {
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });

  // 1. a new account is taken to the picker, and the whole flow saves exactly what was picked
  {
    const { ctx, page, state } = await open(browser);
    await page.goto(`${BASE}/`);
    await page.waitForSelector('[data-testid=welcome-step-artists]', { timeout: 10000 });
    check('[flow] a new account is taken to the picker from Home', /\/welcome/.test(page.url()));
    check('[flow] three steps in the progress bar', (await page.locator('[role=progressbar] > span').count()) === 3);
    check('[flow] the singers are offered (24)', (await choices(page).count()) === 24);
    check('[flow] nothing is selected at the start', (await page.locator('[data-testid=choice][aria-pressed=true]').count()) === 0 && /0 of 12/.test(await count(page)));
    await pick(page, 'Sid Sriram'); await pick(page, 'Chinmayi'); await pick(page, 'Karthik');
    check('[flow] choosing marks the buttons and counts them', (await page.locator('[data-testid=choice][aria-pressed=true]').count()) === 3 && /3 of 12/.test(await count(page)));
    await pick(page, 'Chinmayi');
    check('[flow] choosing again removes it', /2 of 12/.test(await count(page)));
    await pick(page, 'Chinmayi');
    await page.getByTestId('welcome-next').click();
    await page.waitForSelector('[data-testid=welcome-step-composers]');
    check('[flow] Next shows the music directors (16)', (await choices(page).count()) === 16);
    await pick(page, 'Ilaiyaraaja'); await pick(page, 'A. R. Rahman');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForSelector('[data-testid=welcome-step-artists]');
    check('[flow] Back keeps the picks of the earlier step', (await page.locator('[data-testid=choice][aria-pressed=true]').count()) === 3);
    await page.getByTestId('welcome-next').click();
    await page.getByTestId('welcome-next').click();
    await page.waitForSelector('[data-testid=welcome-step-eras]');
    check('[flow] the last step shows the eras (5) and the button says Finish', (await choices(page).count()) === 5 && /Finish/.test(await page.getByTestId('welcome-next').innerText()));
    await pick(page, '90s'); await pick(page, '2010s');
    await page.getByTestId('welcome-next').click();
    await page.waitForSelector('[data-testid=wrapped-banner], text=Plain Song', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    check('[flow] Finish saves exactly the picks, in the order chosen', state.puts.length === 1 && JSON.stringify(state.puts[0]) === JSON.stringify({ artists: ['Sid Sriram', 'Karthik', 'Chinmayi'], composers: ['Ilaiyaraaja', 'A. R. Rahman'], eras: ['90s', '2010s'] }), JSON.stringify(state.puts));
    check('[flow] and returns Home', !/\/welcome/.test(page.url()));
    check('[flow] with a friendly message', (await page.getByText('Your Daily Mixes are being built from your picks.').count()) === 1);
    await page.goto(`${BASE}/explore`); await page.waitForTimeout(500);
    check('[flow] it asks only once per session (no new redirect)', !/\/welcome/.test(page.url()));
    check('[flow] no page errors', state.errors.length === 0, state.errors.join(' | '));
    await ctx.close();
  }

  // 2. limits
  {
    const { ctx, page } = await open(browser);
    await page.goto(`${BASE}/welcome`);
    await page.waitForSelector('[data-testid=welcome-step-artists]');
    for (const n of ARTISTS.slice(0, 12)) await pick(page, n);
    check('[limit] 12 singers can be picked', /12 of 12/.test(await count(page)));
    check('[limit] then the rest are marked unavailable and a note says why', (await page.locator('[data-testid=choice][aria-disabled=true]').count()) === 12 && /up to 12/.test(await count(page)));
    await page.getByRole('button', { name: ARTISTS[12], exact: true }).click({ force: true }); // a finger can still tap it (aria-disabled is not the disabled attribute)
    check('[limit] a thirteenth pick does nothing', /12 of 12/.test(await count(page)) && (await page.locator('[data-testid=choice][aria-pressed=true]').count()) === 12);
    await pick(page, ARTISTS[0]);
    check('[limit] removing one frees a place', /11 of 12/.test(await count(page)));
    await ctx.close();
  }

  // 3. skip: saves "skipped", never traps, and is not asked again in this session
  {
    const { ctx, page, state } = await open(browser);
    await page.goto(`${BASE}/`);
    await page.waitForSelector('[data-testid=welcome-step-artists]');
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.waitForTimeout(500);
    check('[skip] "Skip for now" saves a skip and goes Home', state.puts.length === 1 && state.puts[0].skipped === true && state.puts[0].artists.length === 0 && !/\/welcome/.test(page.url()), JSON.stringify(state.puts) + page.url());
    await ctx.close();
  }
  {
    const { ctx, page, state } = await open(browser, { putFails: true });
    await page.goto(`${BASE}/`);
    await page.waitForSelector('[data-testid=welcome-step-artists]');
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.waitForTimeout(600);
    check('[skip] even if saving fails, Skip lets the person in', !/\/welcome/.test(page.url()));
    await ctx.close();
    const second = await open(browser, { putFails: true });
    await second.page.goto(`${BASE}/welcome`);
    await second.page.waitForSelector('[data-testid=welcome-step-artists]');
    await second.page.getByRole('button', { name: 'Sid Sriram', exact: true }).click();
    for (let i = 0; i < 2; i++) await second.page.getByTestId('welcome-next').click();
    await second.page.waitForSelector('[data-testid=welcome-step-eras]');
    await second.page.getByTestId('welcome-next').click();
    await second.page.waitForSelector('[role=alert]');
    check('[save] a failed save shows a message and keeps the picks on screen', /Could not save/.test(await second.page.locator('[role=alert]').innerText()) && /welcome/.test(second.page.url()));
    void state;
    await second.ctx.close();
  }

  // 4. not asked when the server says no, and fail-open when the server is down
  {
    const { ctx, page, state } = await open(browser, { shouldOnboard: false });
    await page.goto(`${BASE}/`);
    await page.waitForSelector('text=Plain Song');
    await page.waitForTimeout(800);
    check('[no ask] a regular listener or someone who already chose is not interrupted', !/\/welcome/.test(page.url()) && state.gets >= 1);
    await ctx.close();
    const down = await open(browser, { getFails: true });
    await down.page.goto(`${BASE}/`);
    await down.page.waitForSelector('text=Plain Song');
    await down.page.waitForTimeout(800);
    check('[no ask] if the server cannot be reached the app just opens', !/\/welcome/.test(down.page.url()));
    await down.page.goto(`${BASE}/welcome`);
    await down.page.waitForSelector('[role=alert]');
    check('[error] opening the picker with the server down shows a message with Try again and Continue without', (await down.page.getByRole('button', { name: 'Try again' }).count()) === 1 && (await down.page.getByRole('button', { name: 'Continue without' }).count()) === 1);
    await down.ctx.close();
  }

  // 5. edit later (from Settings): prefilled, closes back, saves
  {
    const saved = { artists: ['Sid Sriram', 'Karthik'], composers: ['Deva'], eras: ['2000s'], skipped: false };
    const { ctx, page, state } = await open(browser, { shouldOnboard: false, saved });
    await page.goto(`${BASE}/welcome?edit=1`);
    await page.waitForSelector('[data-testid=welcome-step-artists]');
    check('[edit] the saved picks are filled in', (await page.locator('[data-testid=choice][aria-pressed=true]').count()) === 2 && /2 of 12/.test(await count(page)));
    check('[edit] there is a Close button, not "Skip for now"', (await page.getByRole('button', { name: 'Close' }).count()) === 1 && (await page.getByRole('button', { name: 'Skip for now' }).count()) === 0);
    await page.getByTestId('welcome-next').click(); await page.getByTestId('welcome-next').click();
    await page.waitForSelector('[data-testid=welcome-step-eras]');
    check('[edit] the last button says Save', /Save/.test(await page.getByTestId('welcome-next').innerText()));
    await page.getByTestId('welcome-next').click();
    await page.waitForTimeout(400);
    check('[edit] saving sends the picks again', state.puts.length === 1 && JSON.stringify(state.puts[0]) === JSON.stringify({ artists: ['Sid Sriram', 'Karthik'], composers: ['Deva'], eras: ['2000s'] }), JSON.stringify(state.puts));
    await ctx.close();
  }

  // 6. phone sizes: clear of the status bar and gesture bar, nothing sticks out, 44px targets, big fonts
  for (const [width, height, scale] of [[360, 640, 1], [390, 844, 1], [412, 915, 1], [360, 640, 1.3]]) {
    const tag = `${width}x${height}${scale > 1 ? ' font 130%' : ''}`;
    const { ctx, page, state } = await open(browser, { width, height });
    await page.goto(`${BASE}/welcome`);
    await page.waitForSelector('[data-testid=welcome-step-artists]');
    await simulate(page, scale);
    await page.waitForTimeout(200);
    const skip = await rect(page, 'button:has-text("Skip for now")');
    check(`[${tag}] "Skip for now" clears the status bar (top ${skip.y.toFixed(0)} >= ${TOP}) and is a 44px target`, skip.y >= TOP - 0.5 && skip.h >= 43.5, JSON.stringify(skip));
    const next = await rect(page, '[data-testid=welcome-next]');
    check(`[${tag}] the Next button clears the gesture bar (bottom ${next.b.toFixed(0)} <= ${height - BOTTOM}) and is 44px+`, next.b <= height - BOTTOM + 0.5 && next.h >= 43.5, JSON.stringify(next));
    const out = await page.evaluate((w) => [...document.querySelectorAll('[data-testid=welcome] h1, [data-testid=welcome] p, [data-testid=welcome] button')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.x < -0.5 || r.right > w + 0.5); }).map((el) => (el.textContent || '').slice(0, 20)), width);
    check(`[${tag}] nothing sticks out sideways`, out.length === 0, out.join(' | '));
    const small = await page.locator('[data-testid=choice]').evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().height < 43.5).length);
    check(`[${tag}] every choice is a 44px target`, small === 0, String(small));
    // the list scrolls inside, the buttons stay on screen
    await page.locator('[data-testid=welcome-step-artists]').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const nextAfter = await rect(page, '[data-testid=welcome-next]');
    check(`[${tag}] the Next button stays put while the list scrolls`, Math.abs(nextAfter.y - next.y) < 1, `${next.y} vs ${nextAfter.y}`);
    check(`[${tag}] no page errors`, state.errors.length === 0, state.errors.join(' | '));
    await ctx.close();
  }
} catch (e) {
  fail++;
  console.log(`Onboarding audit crashed: ${e.message}`);
} finally {
  await browser?.close();
  try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(preview.pid), '/f', '/t']) : process.kill(-preview.pid); } catch { /* already gone */ }
}
console.log(`\n${pass}/${pass + fail} onboarding checks passed`);
process.exit(fail ? 1 : 0);
