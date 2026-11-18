// Sign in / sign up / forgot password / reset password audit: real built app in Chromium, MOCK backend (no network).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';

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
let mode = {}; // what the fake server answers
const USER = { id: 'u1', name: 'Test', email: 'name@example.com', username: 'test_1' };
async function fakeApi(route) {
  const req = route.request();
  const url = new URL(req.url());
  const endpoint = url.pathname.replace(/^.*\/api/, '');
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  if (req.method() === 'POST' && endpoint.startsWith('/auth/')) {
    calls.push({ endpoint, body });
    await new Promise((r) => setTimeout(r, mode.delay || 0));
    if (endpoint === '/auth/login') return mode.login === 'ok' ? route.fulfill({ json: { success: true, token: 'tok', user: USER } }) : route.fulfill({ status: 401, json: { success: false, message: 'Invalid email or password' } });
    if (endpoint === '/auth/register') return mode.register === 'exists' ? route.fulfill({ status: 400, json: { success: false, code: 'EMAIL_EXISTS', message: 'An account with this email already exists' } }) : route.fulfill({ status: 201, json: { success: true, token: 'tok', user: USER } });
    if (endpoint === '/auth/forgot-password') return mode.forgot === 'limited' ? route.fulfill({ status: 429, json: { success: false, message: 'Too many attempts. Please try again later.' } }) : route.fulfill({ json: { success: true, message: 'If an account exists, we sent a link' } });
    if (endpoint === '/auth/reset-password') return mode.reset === 'bad' ? route.fulfill({ status: 400, json: { success: false, code: 'RESET_INVALID', message: 'This reset link is invalid or has expired. Please request a new one.' } }) : route.fulfill({ json: { success: true, token: 'tok2', user: USER } });
  }
  if (endpoint === '/music/home') return route.fulfill({ json: { success: true, data: { trending: [], latest: [], gana: [], nineties: [], twoThousands: [], melodies: [], love: [], sad: [], folk: [], instrumental: [], popularAlbums: [], popularArtists: [], albums: [], artists: [] } } });
  return route.fulfill({ json: { success: true, sections: [], items: [] } });
}

async function newPage(browser, width = 1280, height = 800) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.route('**/api/**', fakeApi);
  return { ctx, page };
}
const emailBox = (page) => page.getByLabel('Email address');

async function run(browser) {
  let { ctx, page } = await newPage(browser);
  mode = {};
  calls.length = 0;
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('text=Sign in to TamilTunes');

  // eye button
  const pw = page.getByLabel('Password', { exact: true });
  check('the password is hidden by default', (await pw.getAttribute('type')) === 'password');
  await pw.fill('  pass word 1  ');
  await page.getByRole('button', { name: 'Show password' }).click();
  check('the eye button shows the password', (await pw.getAttribute('type')) === 'text' && (await page.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')) === 'true');
  await page.getByRole('button', { name: 'Hide password' }).click();
  check('and hides it again', (await pw.getAttribute('type')) === 'password');
  check('"Forgot password?" is on the Sign in page', await page.getByRole('link', { name: 'Forgot password?' }).count() === 1);

  // inline validation
  await emailBox(page).fill('nonsense');
  await emailBox(page).blur();
  check('an invalid email is flagged when you leave the field', await page.getByText('Enter a valid email, like name@example.com').count() === 1);
  await emailBox(page).fill('');
  await pw.fill('');
  await page.getByRole('button', { name: /^Sign In/ }).click();
  check('submitting empty shows both messages and sends nothing', await page.getByText('Enter your email').count() === 1 && await page.getByText('Enter your password').count() === 1 && calls.length === 0);

  // the request: email trimmed, password exactly as typed; button disabled while loading
  mode = { delay: 700, login: 'bad' };
  await emailBox(page).fill('  Name@Example.COM ');
  await pw.fill('  pass word 1  ');
  await page.getByRole('button', { name: /^Sign In/ }).click();
  const btn = page.locator('button[type=submit]');
  await page.waitForTimeout(150);
  check('the button is disabled and says what is happening while it loads', (await btn.isDisabled()) && /Signing in/.test(await btn.innerText()) && (await btn.getAttribute('aria-busy')) === 'true');
  await btn.click({ force: true }).catch(() => {});
  await page.waitForSelector('text=Invalid email or password');
  check('only one request was sent', calls.filter((c) => c.endpoint === '/auth/login').length === 1);
  check('the email is trimmed and the password is sent exactly as typed (spaces kept)', calls[0].body.email.toLowerCase() === 'name@example.com' && calls[0].body.password === '  pass word 1  ', JSON.stringify(calls[0].body));
  check('a wrong password shows the one generic message', await page.getByText('Invalid email or password').count() === 1);
  check('the typed email is kept after the error', (await emailBox(page).inputValue()) === '  Name@Example.COM ' || (await emailBox(page).inputValue()).trim() === 'Name@Example.COM');

  // the email follows you between the forms
  await emailBox(page).fill('keep@example.com');
  await page.getByRole('link', { name: 'Sign up for free' }).click();
  await page.waitForSelector('text=Create your Account');
  check('the typed email is kept when you switch to Sign up', (await emailBox(page).inputValue()) === 'keep@example.com');
  await page.getByRole('link', { name: 'Log in' }).click();
  await page.waitForSelector('text=Sign in to TamilTunes');
  check('and back to Sign in', (await emailBox(page).inputValue()) === 'keep@example.com');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.waitForSelector('text=Forgot your password?');
  check('and on the Forgot password page', (await emailBox(page).inputValue()) === 'keep@example.com');
  await ctx.close();

  // ---- sign up
  ({ ctx, page } = await newPage(browser));
  mode = {};
  calls.length = 0;
  await page.goto(`${BASE}/signup`);
  await page.waitForSelector('text=Create your Account');
  await page.getByLabel('Your name').fill('Test User');
  await emailBox(page).fill('new@example.com');
  const spw = page.getByLabel('Password', { exact: true });
  const cpw = page.getByLabel('Confirm password');
  await spw.fill('short');
  await spw.blur();
  check('a short password is flagged', await page.getByText('Use at least 8 characters').count() === 1);
  check('the strength hint appears while typing', await page.locator('[data-testid=strength]').count() === 1 && /Too short/.test(await page.locator('[data-testid=strength]').innerText()));
  await spw.fill('Abcdefg1');
  check('and updates as the password gets better', /Good|Okay/.test(await page.locator('[data-testid=strength]').innerText()), await page.locator('[data-testid=strength]').innerText());
  await cpw.fill('Different1');
  await cpw.blur();
  check('a confirmation that does not match is flagged', await page.getByText('The two passwords are not the same').count() === 1);
  check('both password fields have an eye button', await page.getByRole('button', { name: 'Show password' }).count() === 2);
  await cpw.fill('Abcdefg1');
  await page.getByRole('button', { name: /Sign Up Free/ }).click();
  await page.waitForURL(`${BASE}/`);
  check('a good form creates the account and goes home', calls.at(-1).endpoint === '/auth/register' && calls.at(-1).body.email === 'new@example.com' && calls.at(-1).body.password === 'Abcdefg1');
  check('the confirmation is not sent to the server', !('confirm' in calls.at(-1).body));
  await ctx.close();

  // ---- the email already exists
  ({ ctx, page } = await newPage(browser));
  mode = { register: 'exists' };
  await page.goto(`${BASE}/signup`);
  await page.getByLabel('Your name').fill('Test User');
  await emailBox(page).fill('taken@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Abcdefg1');
  await page.getByLabel('Confirm password').fill('Abcdefg1');
  await page.getByRole('button', { name: /Sign Up Free/ }).click();
  await page.waitForSelector('[data-testid=email-exists]');
  const box = await page.locator('[data-testid=email-exists]').innerText();
  check('"already exists" offers "Log in instead" and "Forgot password?"', /already exists/.test(box) && /Log in instead/.test(box) && /Forgot password\?/.test(box), box);
  await page.getByRole('link', { name: 'Log in instead' }).click();
  await page.waitForSelector('text=Sign in to TamilTunes');
  check('"Log in instead" keeps the email', (await emailBox(page).inputValue()) === 'taken@example.com');
  await ctx.close();

  // ---- forgot password
  ({ ctx, page } = await newPage(browser));
  mode = {};
  calls.length = 0;
  await page.goto(`${BASE}/forgot-password`);
  await emailBox(page).fill('someone@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.waitForSelector('[data-testid=forgot-sent]');
  check('the answer is always "If an account exists, we sent a link"', /If an account exists, we sent a link/.test(await page.locator('[data-testid=forgot-sent]').innerText()) && calls[0].body.email === 'someone@example.com');
  await ctx.close();
  ({ ctx, page } = await newPage(browser));
  mode = { forgot: 'limited' };
  await page.goto(`${BASE}/forgot-password`);
  await emailBox(page).fill('someone@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.waitForSelector('text=Too many attempts');
  check('being rate limited shows a calm message', true);
  await ctx.close();

  // ---- reset password
  ({ ctx, page } = await newPage(browser));
  mode = {};
  calls.length = 0;
  await page.goto(`${BASE}/reset-password`);
  await page.waitForSelector('[data-testid=reset-invalid]');
  check('a reset page without a link says it cannot be used', await page.locator('[data-testid=reset-invalid]').count() === 1 && await page.getByRole('link', { name: 'Send me a new link' }).count() === 1);
  await page.goto(`${BASE}/reset-password?token=abcdefghijklmnopqrstuvwxyz0123456789`);
  await page.waitForSelector('text=Choose a new password');
  await page.getByLabel('New password', { exact: true }).fill('short');
  await page.getByLabel('New password', { exact: true }).blur();
  check('the reset form checks the length', await page.getByText('Use at least 8 characters').count() === 1);
  await page.getByLabel('New password', { exact: true }).fill('A-good-pass-9');
  check('and shows the strength hint', await page.locator('[data-testid=strength]').count() === 1);
  await page.getByLabel('Confirm new password').fill('A-good-pass-0');
  await page.getByRole('button', { name: /Save password/ }).click();
  check('a mismatch stops the form', await page.getByText('The two passwords are not the same').count() === 1 && calls.length === 0);
  await page.getByLabel('Confirm new password').fill('A-good-pass-9');
  await page.getByRole('button', { name: /Save password/ }).click();
  await page.waitForURL(`${BASE}/`);
  check('a good reset signs you in and goes home', calls.at(-1).endpoint === '/auth/reset-password' && calls.at(-1).body.token.startsWith('abcdef') && (await page.evaluate(() => localStorage.getItem('tamiltunes_token'))) === 'tok2');
  await ctx.close();
  ({ ctx, page } = await newPage(browser));
  mode = { reset: 'bad' };
  await page.goto(`${BASE}/reset-password?token=abcdefghijklmnopqrstuvwxyz0123456789`);
  await page.getByLabel('New password', { exact: true }).fill('A-good-pass-9');
  await page.getByLabel('Confirm new password').fill('A-good-pass-9');
  await page.getByRole('button', { name: /Save password/ }).click();
  await page.waitForSelector('[data-testid=reset-invalid]');
  check('a used or expired link shows how to get a new one', await page.getByRole('link', { name: 'Send me a new link' }).count() === 1);
  await ctx.close();

  // ---- phone width
  for (const [w, h] of [[375, 667], [360, 640]]) {
    ({ ctx, page } = await newPage(browser, w, h));
    for (const p of ['/login', '/signup', '/forgot-password', '/reset-password?token=abcdefghijklmnopqrstuvwxyz0123456789']) {
      await page.goto(`${BASE}${p}`);
      await page.waitForSelector('main button[type=submit], main [data-testid=reset-invalid]');
      await page.waitForTimeout(250);
      check(`[${w}px] ${p.split('?')[0]}: no horizontal scroll and the button is reachable`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) && (await page.locator('main button[type=submit]').count() === 0 || await page.locator('main button[type=submit]').first().isVisible()));
    }
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
