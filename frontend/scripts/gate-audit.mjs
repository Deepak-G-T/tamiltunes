import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const PORT = 4188;
const BASE = `http://127.0.0.1:${PORT}`;

const startServer = () => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let done = false;
  p.stdout.on('data', (d) => { if (!done && /127\.0\.0\.1|Local/.test(String(d))) { done = true; resolve(p); } });
  p.stderr.on('data', (d) => { if (!done) console.error(String(d)); });
  p.on('exit', (c) => { if (!done) reject(new Error(`vite preview exited ${c}`)); });
  setTimeout(() => { if (!done) reject(new Error('vite preview start timeout')); }, 30000);
});

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -> ${detail}` : ''}`);
};

async function run(browser) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();

  // Mock all API calls
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: { success: false } }));
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 200,
      json: { success: true, token: 'mock-jwt-token', user: { id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' } }
    })
  );

  // 1. Visit root while logged out -> redirects to /login
  await page.goto(`${BASE}/`);
  await page.waitForURL('**/login*');
  check('logged-out visitor to root lands on /login', page.url().includes('/login'));

  // 2. MainLayout / Music player should NOT be present on /login
  const playerOnLogin = await page.locator('[data-testid="music-player"], [data-testid="mini-player"]').count();
  check('logged-out login screen does not show music player', playerOnLogin === 0);

  // 3. Visit deep protected route -> preserves redirect param
  await page.goto(`${BASE}/explore`);
  await page.waitForURL('**/login?redirect=*');
  check('deep link /explore redirects to /login with redirect param', page.url().includes('redirect='));

  // 4. Log in and verify destination is restored
  await page.fill('input[type="email"]', 'tester@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/explore');
  check('after login, user is redirected back to the original page (/explore)', page.url().includes('/explore'));

  await ctx.close();
}

let server;
let browser;
try {
  server = await startServer();
  browser = await chromium.launch();
  await run(browser);
} catch (err) {
  console.error('Gate audit crashed:', err.message);
  results.push({ ok: false });
} finally {
  await browser?.close();
  if (server) {
    try {
      if (process.platform === 'win32') server.kill();
      else process.kill(-server.pid);
    } catch {}
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} gate checks passed`);
process.exit(failed.length ? 1 : 0);
