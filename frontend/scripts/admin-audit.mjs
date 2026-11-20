import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PORT = 4178;
const BASE = `http://127.0.0.1:${PORT}`;

const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const startServer = () => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let done = false;
  p.stdout.on('data', (d) => { if (!done && /127\.0\.0\.1:4178|Local/.test(String(d))) { done = true; resolve(p); } });
  p.stderr.on('data', (d) => { if (!done) console.error(String(d)); });
  p.on('exit', (c) => { if (!done) reject(new Error(`vite preview exited ${c}`)); });
  setTimeout(() => { if (!done) reject(new Error('vite preview timeout')); }, 30000);
});

const outDir = path.join(__dirname, '..', 'audit', 'screenshots');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function setupMockApi(page, role = 'admin') {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/api/auth/me') || url.includes('/auth/me')) {
      if (role === 'guest') {
        return route.fulfill({ status: 401, json: { success: false, message: 'Not logged in' } });
      }
      return route.fulfill({
        status: 200,
        json: {
          success: true,
          user: {
            id: 'mock_uid_1',
            email: role === 'admin' ? 'admin@tamiltunes.live' : 'user@tamiltunes.live',
            name: role === 'admin' ? 'TamilTunes Admin' : 'Tamil Listener',
            role: role,
            isActive: true
          }
        }
      });
    }

    // the normal app's own data (an admin also uses the app, not only the admin panel)
    if (url.includes('/api/music/home')) {
      return route.fulfill({ status: 200, json: { success: true, data: { trending: [], latest: [], gana: [], nineties: [], twoThousands: [], melodies: [], love: [], sad: [], folk: [], instrumental: [], popularAlbums: [], popularArtists: [] } } });
    }
    if (/\/api\/home(\?|$)/.test(url)) {
      return route.fulfill({ status: 200, json: { success: true, seed: 's', hero: null, hidden: [], sections: [] } });
    }

    if (url.includes('/api/admin/dashboard')) {
      return route.fulfill({
        status: 200,
        json: {
          totalUsers: 1420,
          signups7d: 84,
          signups30d: 310,
          activeUsers: 1290,
          onlineNow: 7,
          totalPlays: 48920,
          totalSongs: 3200,
          totalPlaylists: 450,
          chartData: [
            { date: 'Mon', signups: 10 },
            { date: 'Tue', signups: 14 },
            { date: 'Wed', signups: 12 },
            { date: 'Thu', signups: 18 },
            { date: 'Fri', signups: 11 },
            { date: 'Sat', signups: 9 },
            { date: 'Sun', signups: 10 }
          ],
          recentLogs: [
            { id: '1', action: 'USER_ROLE_CHANGE', actorEmail: 'admin@tamiltunes.live', createdAt: new Date().toISOString() },
            { id: '2', action: 'SETTINGS_UPDATE', actorEmail: 'admin@tamiltunes.live', createdAt: new Date().toISOString() }
          ]
        }
      });
    }

    if (url.includes('/api/admin/users')) {
      return route.fulfill({
        status: 200,
        json: {
          users: [
            { id: 'mock_uid_1', name: 'TamilTunes Admin', email: 'admin@tamiltunes.live', role: 'admin', isActive: true, signsInWithGoogle: true, online: true, lastSeenAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(), createdAt: new Date().toISOString() },
            { id: '2', name: 'Regular User', email: 'listener@example.com', role: 'user', isActive: true, signsInWithGoogle: true, online: true, lastSeenAt: new Date().toISOString(), lastLoginAt: new Date(Date.now() - 3600000).toISOString(), createdAt: new Date().toISOString() },
            { id: '3', name: 'Blocked Account', email: 'spammer@example.com', role: 'user', isActive: false, signsInWithGoogle: false, online: false, lastSeenAt: new Date(Date.now() - 2 * 86400000).toISOString(), lastLoginAt: null, createdAt: new Date().toISOString() }
          ],
          total: 3,
          page: 1,
          totalPages: 1
        }
      });
    }

    if (url.includes('/api/admin/songs')) {
      return route.fulfill({
        status: 200,
        json: {
          songs: [
            { id: 's1', title: 'Aalaporaan Thamizhan', artist: 'A.R. Rahman', movie: 'Mersal', year: 2017, isHidden: false },
            { id: 's2', title: 'Naan Pizhai', artist: 'Anirudh Ravichander', movie: 'Kaathuvaakula Rendu Kaadhal', year: 2022, isHidden: false }
          ],
          total: 2,
          page: 1,
          totalPages: 1
        }
      });
    }

    if (url.includes('/api/admin/settings')) {
      return route.fulfill({
        status: 200,
        json: {
          requireLogin: true,
          maintenanceBanner: { active: false, message: '' },
          announcementText: { active: false, message: '' }
        }
      });
    }

    if (url.includes('/api/admin/2fa')) {
      return route.fulfill({
        status: 200,
        json: {
          secret: 'JBSWY3DPEHPK3PXP',
          uri: 'otpauth://totp/TamilTunes:admin@tamiltunes.live?secret=JBSWY3DPEHPK3PXP',
          recoveryCodes: ['ABCD-1234', 'EFGH-5678', 'IJKL-9012', 'MNOP-3456']
        }
      });
    }

    return route.fulfill({ status: 200, json: { success: true } });
  });
}

async function run() {
  console.log('Starting preview server...');
  const server = await startServer();
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });

  try {
    // 1. Logged-out visit to /admin redirects to /login?redirect=%2Fadmin
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await setupMockApi(page, 'guest');
      await page.goto(`${BASE}/admin`);
      await page.waitForURL(/.*login\?redirect=%2Fadmin/);
      console.log('PASS  logged-out visit to /admin redirects to /login?redirect=%2Fadmin');
      await page.screenshot({ path: path.join(outDir, 'admin-logged-out-gate-1280.png') });
      await page.close();
    }

    // 2. Normal user visit to /admin gets Access Denied
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.addInitScript(() => {
        localStorage.setItem('tamiltunes_token', 'user_token');
        localStorage.setItem('tamiltunes_user', JSON.stringify({ id: 'mock_uid_1', email: 'user@tamiltunes.live', role: 'user', isActive: true }));
      });
      await setupMockApi(page, 'user');
      await page.goto(`${BASE}/admin`);
      await page.waitForSelector('text=Access Denied');
      console.log('PASS  normal user on /admin sees Access Denied');
      await page.screenshot({ path: path.join(outDir, 'admin-access-denied-1280.png') });
      await page.close();
    }

    // 3. Admin visit on Desktop (1280px)
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.addInitScript(() => {
        localStorage.setItem('tamiltunes_token', 'admin_token');
        localStorage.setItem('tamiltunes_user', JSON.stringify({ id: 'mock_uid_1', email: 'admin@tamiltunes.live', role: 'admin', isActive: true }));
      });
      await setupMockApi(page, 'admin');
      // an admin must also be able to use the normal app: the sidebar draws an extra admin-only link (a missing icon import there once blanked the whole page for admins)
      const adminPageErrors = [];
      page.on('pageerror', (e) => adminPageErrors.push(e.message));
      await page.goto(`${BASE}/`);
      await page.waitForSelector('aside a[href="/admin"]', { timeout: 15000 }).catch(async (e) => { throw new Error(`FAIL  no Admin Panel link in the sidebar. Page errors: ${adminPageErrors.join(' | ') || 'none'}. Page text: ${(await page.locator('body').innerText().catch(() => '')).slice(0, 200)}`); });
      if (adminPageErrors.length) throw new Error(`FAIL  the app crashed for an admin: ${adminPageErrors.join(' | ')}`);
      console.log('PASS  admin desktop: the normal app loads for an admin and the sidebar shows the Admin Panel link (no crash)');
      await page.goto(`${BASE}/admin`);
      await page.waitForSelector('text=System Dashboard');
      await page.waitForSelector('text=Total Users');
      await page.waitForSelector('text=Online now');
      console.log('PASS  admin desktop 1280px sees System Dashboard & KPIs');
      await page.screenshot({ path: path.join(outDir, 'admin-dashboard-1280.png') });

      // Navigate to Users
      await page.locator('aside a[href="/admin/users"]').click();
      await page.waitForSelector('text=Users Management');
      await page.locator('table').getByText('listener@example.com').waitFor();
      console.log('PASS  admin desktop 1280px sees Users Management table');
      await page.screenshot({ path: path.join(outDir, 'admin-users-1280.png') });

      // who is online, terminate / block / remove, no password prompts
      const ok = (cond, name) => { if (!cond) throw new Error(`FAIL  ${name}`); console.log(`PASS  ${name}`); };
      const seenRequests = [];
      page.on('request', (r) => { if (r.url().includes('/api/admin/users') && r.method() !== 'GET') seenRequests.push({ method: r.method(), url: r.url(), body: r.postData() }); });
      ok((await page.locator('table [data-testid=online-dot]').count()) === 2 && (await page.locator('table [data-testid=offline-dot]').count()) === 1, 'admin desktop: the list shows who is online now (green dot) and who is not');
      ok(/Online now/.test(await page.locator('table [data-testid=user-last-seen]').first().innerText()) && /2 days ago/.test(await page.locator('table [data-testid=user-last-seen]').nth(2).innerText()), 'admin desktop: each person shows online now / last seen');
      const onlineReq = page.waitForRequest((r) => r.url().includes('/api/admin/users') && r.url().includes('online=1'));
      await page.getByTestId('online-only').check();
      await onlineReq;
      ok(true, 'admin desktop: the "Online now" filter asks the server for online people only');
      await page.getByTestId('online-only').uncheck();
      ok((await page.getByText('Reset Link').count()) === 0 && (await page.locator('aside a[href="/admin/security"]').count()) === 0, 'admin desktop: no password-reset link and no 2FA page (Google only)');
      ok((await page.locator('table tr', { hasText: 'TamilTunes Admin' }).getByTestId('user-remove').count()) === 0 && (await page.locator('table tr', { hasText: 'TamilTunes Admin' }).getByText('This is you').count()) === 1, 'admin desktop: an admin cannot remove or block themselves');
      const row = page.locator('table tr', { hasText: 'listener@example.com' });
      await row.getByTestId('user-terminate').click();
      await page.waitForSelector('text=signed out everywhere');
      ok(seenRequests.some((r) => r.method === 'POST' && r.url.endsWith('/api/admin/users/2/force-logout')), 'admin desktop: Terminate session signs the person out everywhere');
      await row.getByTestId('user-role').click();
      ok((await page.locator('[data-testid=role-modal] input[type=password]').count()) === 0, 'admin desktop: changing a role asks to type CONFIRM, not for a password');
      await page.getByTestId('confirm-input').fill('confirm');
      await page.locator('[data-testid=role-modal] button[type=submit]').click();
      ok(/CONFIRM/.test(await page.locator('[data-testid=role-modal] [role=alert]').innerText()) && !seenRequests.some((r) => r.url.endsWith('/role')), 'admin desktop: a wrong confirmation sends nothing');
      await page.getByTestId('confirm-input').fill('CONFIRM');
      await page.locator('[data-testid=role-modal] button[type=submit]').click();
      await page.waitForSelector('[data-testid=role-modal]', { state: 'detached' });
      ok(seenRequests.some((r) => r.url.endsWith('/users/2/role') && JSON.parse(r.body).confirm === 'CONFIRM' && !r.body.includes('password')), 'admin desktop: the role change sends the CONFIRM word, never a password');
      await row.getByTestId('user-remove').click();
      await page.getByTestId('remove-input').fill('someone.else@example.com');
      await page.getByTestId('remove-confirm').click();
      ok(/exactly/.test(await page.locator('[data-testid=remove-modal] [role=alert]').innerText()) && !seenRequests.some((r) => r.method === 'DELETE'), 'admin desktop: Remove account needs the exact email, a wrong one sends nothing');
      await page.getByTestId('remove-input').fill('Listener@Example.com');
      await page.getByTestId('remove-confirm').click();
      await page.waitForSelector('[data-testid=remove-modal]', { state: 'detached' });
      ok(seenRequests.some((r) => r.method === 'DELETE' && r.url.endsWith('/api/admin/users/2') && JSON.parse(r.body).confirmEmail === 'Listener@Example.com'), 'admin desktop: the typed email removes the account');

      // Navigate to Songs
      await page.locator('aside a[href="/admin/songs"]').click();
      await page.waitForSelector('text=Songs Library');
      console.log('PASS  admin desktop 1280px sees Songs Library');
      await page.screenshot({ path: path.join(outDir, 'admin-songs-1280.png') });

      // Navigate to Settings
      await page.locator('aside a[href="/admin/settings"]').click();
      await page.waitForSelector('text=System Settings');
      console.log('PASS  admin desktop 1280px sees System Settings');
      await page.screenshot({ path: path.join(outDir, 'admin-settings-1280.png') });

      await page.close();
    }

    // 4. Admin visit on Mobile (375px)
    {
      const page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
      await page.addInitScript(() => {
        localStorage.setItem('tamiltunes_token', 'admin_token');
        localStorage.setItem('tamiltunes_user', JSON.stringify({ id: 'mock_uid_1', email: 'admin@tamiltunes.live', role: 'admin', isActive: true }));
      });
      await setupMockApi(page, 'admin');
      await page.goto(`${BASE}/admin`);
      await page.waitForSelector('text=System Dashboard');
      console.log('PASS  admin mobile 375px sees System Dashboard');
      await page.screenshot({ path: path.join(outDir, 'admin-dashboard-375.png') });

      await page.goto(`${BASE}/admin/users`);
      await page.waitForSelector('text=Users Management');
      await page.locator('.md\\:hidden').getByText('listener@example.com').waitFor();
      console.log('PASS  admin mobile 375px sees Users card list');
      await page.screenshot({ path: path.join(outDir, 'admin-users-375.png') });

      await page.close();
    }

    console.log('\nAll Admin Panel audits passed successfully!');
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
