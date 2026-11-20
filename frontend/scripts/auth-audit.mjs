// Sign-in audit: real built app in Chromium, MOCK backend and a FAKE Google (scripts/google-stub.mjs). Nothing reaches the network.
// Google is the only way to sign in: no email / password form, no sign-up, no password reset. It does NOT test the real Google button or the server's token check
// (the server test does that).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { installGoogleStub } from './google-stub.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const PORT = 4178;
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
const check = (name, cond, detail = '') => { results.push({ ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  -> ${detail}`}`); };
const startServer = () => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let done = false;
  p.stdout.on('data', (d) => { if (!done && /127\.0\.0\.1:4178|Local/.test(String(d))) { done = true; resolve(p); } });
  p.stderr.on('data', (d) => { if (!done) console.error(String(d)); });
  p.on('exit', (c) => { if (!done) reject(new Error(`vite preview exited ${c}`)); });
  setTimeout(() => { if (!done) reject(new Error('vite preview start timeout')); }, 30000);
});

const calls = [];
let mode = {}; // what the fake server answers to /auth/google
const USER = { id: 'u1', name: 'Test', email: 'name@example.com', username: 'test_1', role: 'user' };
async function fakeApi(route) {
  const req = route.request();
  const endpoint = new URL(req.url()).pathname.replace(/^.*\/api/, '');
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  if (req.method() === 'POST' && endpoint.startsWith('/auth/')) {
    calls.push({ endpoint, body });
    await new Promise((r) => setTimeout(r, mode.delay || 0));
    if (endpoint === '/auth/google') {
      if (mode.google === 'rejected') return route.fulfill({ status: 401, json: { success: false, message: 'Google sign-in could not be verified' } });
      if (mode.google === 'blocked') return route.fulfill({ status: 403, json: { success: false, message: 'Account has been deactivated' } });
      return route.fulfill({ json: { success: true, token: 'tok', user: USER } });
    }
    return route.fulfill({ status: 404, json: { success: false, code: 'GOOGLE_ONLY', message: 'Sign in with Google' } });
  }
  if (endpoint === '/auth/me') return route.fulfill({ status: 401, json: { success: false } });
  if (endpoint === '/music/home') return route.fulfill({ json: { success: true, data: { trending: [], latest: [], gana: [], nineties: [], twoThousands: [], melodies: [], love: [], sad: [], folk: [], instrumental: [], popularAlbums: [], popularArtists: [] } } });
  return route.fulfill({ json: { success: true, sections: [], items: [] } });
}

async function newPage(browser, width, height, { google = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  if (google) await installGoogleStub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', fakeApi);
  return { ctx, page, errors };
}

async function run(browser) {
  for (const [w, h] of [[360, 640], [390, 844]]) {
    let { ctx, page, errors } = await newPage(browser, w, h);
    const tag = `[${w}x${h}]`;
    mode = {}; calls.length = 0;
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('text=Sign in to TamilTunes');
    await page.waitForSelector('[data-testid=fake-google]');
    check(`${tag} the sign-in screen offers Google and nothing else (no email or password field, no sign-up link)`, (await page.locator('input[type=email], input[type=password]').count()) === 0 && (await page.locator('a[href*=signup], a[href*=forgot]').count()) === 0 && (await page.locator('[data-testid=fake-google]').count()) === 1);
    check(`${tag} the page does not scroll sideways and the Google button is easy to reach`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth) && (await page.locator('[data-testid=fake-google]').boundingBox()).height >= 44);
    check(`${tag} the Google button is asked for in the "continue with" style, and nothing is sent before it is pressed`, (await page.evaluate(() => window.__gsiButtonOpts?.text)) === 'continue_with' && calls.length === 0);

    await page.goto(`${BASE}/login?redirect=%2Fexplore`);
    await page.waitForSelector('[data-testid=fake-google]');
    await page.click('[data-testid=fake-google]');
    await page.waitForURL('**/explore', { timeout: 8000 }).catch(() => {});
    check(`${tag} Google sign-in sends the ID token to /auth/google and goes back to where the person was heading`, page.url().endsWith('/explore') && calls.some((c) => c.endpoint === '/auth/google' && c.body?.idToken === 'TEST_GOOGLE_ID_TOKEN_0123456789'), `${page.url()} ${JSON.stringify(calls)}`);
    check(`${tag} the session token is kept and no password is ever sent`, (await page.evaluate(() => localStorage.getItem('tamiltunes_token'))) === 'tok' && !JSON.stringify(calls).includes('password'));
    await ctx.close();

    // the server refuses the token
    ({ ctx, page } = await newPage(browser, w, h));
    mode = { google: 'rejected' };
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('[data-testid=fake-google]');
    await page.click('[data-testid=fake-google]');
    await page.waitForSelector('[role=alert]');
    check(`${tag} a token the server refuses shows a clear message and stays on the sign-in screen`, /could not be verified/.test(await page.locator('[role=alert]').first().innerText()) && page.url().includes('/login') && !(await page.evaluate(() => localStorage.getItem('tamiltunes_token'))));
    await ctx.close();

    // a blocked account
    ({ ctx, page } = await newPage(browser, w, h));
    mode = { google: 'blocked' };
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('[data-testid=fake-google]');
    await page.click('[data-testid=fake-google]');
    await page.waitForSelector('[role=alert]');
    check(`${tag} a blocked account is told so`, /deactivated/.test(await page.locator('[role=alert]').first().innerText()));
    await ctx.close();

    // old addresses lead to the same screen
    ({ ctx, page } = await newPage(browser, w, h));
    mode = {};
    for (const p of ['/signup', '/forgot-password', '/reset-password?token=abcdefghijklmnopqrstuvwxyz0123456789']) {
      await page.goto(`${BASE}${p}`);
      await page.waitForSelector('text=Sign in to TamilTunes');
      check(`${tag} ${p.split('?')[0]} leads to the Google sign-in screen`, page.url().includes('/login'), page.url());
    }
    await ctx.close();

    // slow answer: the button area shows progress and a second tap does nothing
    ({ ctx, page } = await newPage(browser, w, h));
    mode = { delay: 900 }; calls.length = 0;
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('[data-testid=fake-google]');
    await page.click('[data-testid=fake-google]');
    check(`${tag} while the server answers, "Signing in..." is shown`, await page.locator('text=Signing in').first().isVisible().catch(() => false));
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 8000 }).catch(() => {});
    await ctx.close();

    // a build without a client id says so instead of showing a dead button
    ({ ctx, page, errors } = await newPage(browser, w, h, { google: false }));
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('text=Sign in to TamilTunes');
    check(`${tag} without a Google client id the screen says sign-in is not set up (no dead button)`, (await page.locator('[data-testid=google-not-configured]').count()) === 1 && (await page.locator('[data-testid=google-button]').count()) === 0);
    check(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}

let server;
let browser;
try {
  server = await startServer();
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  await run(browser);
} catch (err) {
  console.error('Auth audit crashed:', String(err.message).split('\n').slice(0, 12).join('\n'));
  results.push({ ok: false });
} finally {
  await browser?.close();
  if (server) { try { if (process.platform === 'win32') server.kill(); else process.kill(-server.pid); } catch { /* already gone */ } }
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} auth checks passed`);
process.exit(failed.length ? 1 : 0);
