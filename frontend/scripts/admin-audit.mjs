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

    if (url.includes('/api/admin/dashboard')) {
      return route.fulfill({
        status: 200,
        json: {
          totalUsers: 1420,
          signups7d: 84,
          signups30d: 310,
          activeUsers: 1290,
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
            { id: '1', name: 'TamilTunes Admin', email: 'admin@tamiltunes.live', role: 'admin', isActive: true, createdAt: new Date().toISOString() },
            { id: '2', name: 'Regular User', email: 'listener@example.com', role: 'user', isActive: true, createdAt: new Date().toISOString() },
            { id: '3', name: 'Blocked Account', email: 'spammer@example.com', role: 'user', isActive: false, createdAt: new Date().toISOString() }
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
  const browser = await chromium.launch({ headless: true });

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
      await page.goto(`${BASE}/admin`);
      await page.waitForSelector('text=System Dashboard');
      await page.waitForSelector('text=Total Users');
      console.log('PASS  admin desktop 1280px sees System Dashboard & KPIs');
      await page.screenshot({ path: path.join(outDir, 'admin-dashboard-1280.png') });

      // Navigate to Users
      await page.locator('aside a[href="/admin/users"]').click();
      await page.waitForSelector('text=Users Management');
      await page.locator('table').getByText('listener@example.com').waitFor();
      console.log('PASS  admin desktop 1280px sees Users Management table');
      await page.screenshot({ path: path.join(outDir, 'admin-users-1280.png') });

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
