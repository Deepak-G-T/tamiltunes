// Android-app audit in Chromium: the app is built with recording mocks for the Capacitor plugins (vite build --mode nativetest) and run as if it
// were inside the native app (window.Capacitor says so). It checks what OUR code does: where the login token is kept, which server the app calls,
// the Back button order, the media notification calls, the offline banner, sharing and deep links.
// It does NOT test the real plugins or Android itself: that needs a phone (see docs/ANDROID_APP.md, every phone check is UNTESTED until reported).
// Run: npm run test:native --prefix frontend      (CHROMIUM_PATH=/path/to/chrome if Playwright's own browser is not installed)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import nodePath from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const viteBin = nodePath.join(nodePath.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const PORT = 4180;
const BASE = `http://127.0.0.1:${PORT}`;
const API = 'https://tamiltunes-backend.onrender.com';
const SITE = 'https://frontend-eosin-five-11.vercel.app';
const TOKEN = 'TEST_TOKEN_NOT_A_REAL_ONE';

const results = [];
const check = (name, cond, detail = '') => { results.push({ ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  -> ${detail}`}`); };
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

const song = (id, title) => ({ id, title, artist: 'Test Artist', album: `Film ${id}`, duration: 200, image: '', streamUrl: `https://aac.saavncdn.com/${id}_320.mp4`, source: 'audio', year: '2024' });
const S = Array.from({ length: 10 }, (_, i) => song(`s${i + 1}`, `Song ${i + 1}`));
const R = Array.from({ length: 12 }, (_, i) => song(`r${i + 1}`, `Radio Song ${i + 1}`));
const USER = { id: 'u1', name: 'Test User', email: 'test@example.com', role: 'user', username: 'testuser' };
const wav = (() => { const n = 8000 * 600; const b = Buffer.alloc(44 + n, 0x80); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); return b; })();

const startPreview = () => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [viteBin, 'preview', '--outDir', 'dist-nativetest', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let done = false;
  p.stdout.on('data', (d) => { if (!done && /127\.0\.0\.1:4180|Local/.test(String(d))) { done = true; resolve(p); } });
  p.stderr.on('data', (d) => { if (!done) console.error(String(d)); });
  p.on('exit', (c) => { if (!done) reject(new Error(`vite preview exited ${c}`)); });
  setTimeout(() => { if (!done) reject(new Error('vite preview start timeout')); }, 30000);
});

const seen = { auth: [], wrongOrigin: [] };
async function run(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => { errors.push(e.message); consoleErrors.push(e.message); });
  page.on('console', (msg) => { if (msg.type() === 'error' || msg.text().includes('is not implemented')) consoleErrors.push(msg.text()); });
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && u.origin !== API) seen.wrongOrigin.push(r.url()); });
  await page.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' }; });

  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await page.route(`${API}/api/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const p = new URL(req.url()).pathname.replace('/api', '');
    const auth = req.headers().authorization;
    if (auth) seen.auth.push({ path: p, auth });
    const json = (body, status = 200) => route.fulfill({ status, headers: cors, json: body });
    if (p === '/auth/login') return json({ success: true, token: TOKEN, user: USER });
    if (p === '/auth/me') return json({ success: true, user: USER });
    if (p === '/music/home') return json({ success: true, data: { trending: S, latest: [], gana: [], nineties: [], twoThousands: [], melodies: [], love: [], sad: [], folk: [], instrumental: [], popularAlbums: [], popularArtists: [], albums: [], artists: [] } });
    if (p === '/home') return json({ success: true, seed: 's', hero: null, hidden: [], sections: [{ id: 'trending', title: 'Trending now', kind: 'songs', items: S }] });
    if (/^\/songs\/[^/]+\/related/.test(p)) return json({ success: true, items: R });
    if (p === '/me/speed-dial') return json({ success: true, items: [] });
    if (p === '/profile/me') return json({ success: true, profile: { id: 'u1', name: 'Test User', username: 'testuser', bio: '', role: 'user', stats: { favorites: 0, playlists: 0, comments: 0, followers: 0, following: 0 }, isPublicProfile: true, showHistory: true, joinedAt: '2026-01-01T00:00:00.000Z' } });
    if (/^\/users\//.test(p)) return json({ success: false, message: 'User not found' }, 404); // a real server answers an unknown profile with 404
    return json({ success: true, items: [], songs: {} });
  });
  await page.route('https://aac.saavncdn.com/**', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wav, headers: { 'Accept-Ranges': 'bytes' } }));
  await page.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));

  const native = (fn, arg) => page.evaluate(fn, arg);
  const log = () => native(() => window.__native.log);
  const fire = (event, data) => native(({ event, data }) => window.__native.listeners[event](data), { event, data });
  const path = () => page.evaluate(() => window.location.pathname);

  // ---- start up
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('text=Sign in to TamilTunes');
  let l = await log();
  check('start up: the status bar is set to dark and the splash screen is hidden', l.some((x) => x.name === 'StatusBar.setStyle' && x.arg.style === 'DARK') && l.some((x) => x.name === 'SplashScreen.hide'), JSON.stringify(l.map((x) => x.name)));
  check('start up: no service worker is registered inside the app', (await native(async () => (await navigator.serviceWorker.getRegistrations()).length)) === 0);

  // ---- sign in: the token goes to private storage, never to localStorage
  await page.getByLabel('Email address').fill('test@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Throwaway-test-1');
  await page.locator('form button[type=submit]').click();
  await page.waitForSelector('section[aria-label="Trending now"]', { timeout: 15000 });
  check('sign in: the token is NOT in localStorage', (await native(() => localStorage.getItem('tamiltunes_token'))) === null);
  check('sign in: the token is in private storage (Preferences)', (await native(() => JSON.parse(sessionStorage.getItem('__native_prefs') || '{}').tamiltunes_token)) === TOKEN);
  check('the app calls the Render server directly, never a relative /api on the phone', seen.wrongOrigin.length === 0, seen.wrongOrigin.slice(0, 2).join(' '));
  check('later requests send the saved token as a Bearer header', seen.auth.some((a) => a.auth === `Bearer ${TOKEN}`), JSON.stringify(seen.auth.slice(0, 2)));
  const before = seen.auth.length;
  await page.reload();
  await page.waitForSelector('section[aria-label="Trending now"]', { timeout: 15000 });
  check('a restart keeps you signed in (the token is loaded from private storage)', seen.auth.slice(before).some((a) => a.path === '/auth/me' && a.auth === `Bearer ${TOKEN}`), JSON.stringify(seen.auth.slice(before, before + 3)));

  // ---- play a song: the media notification
  await page.getByRole('button', { name: 'Play Song 1', exact: true }).first().click();
  await page.waitForSelector('[aria-label="Open now playing full screen"]');
  check('playing a song creates the media notification (title, artist, previous / next, seek bar, branded icon)', await until(async () => (await log()).some((x) => x.name === 'MusicControls.create' && x.arg.track === 'Song 1' && x.arg.artist === 'Test Artist' && x.arg.hasPrev && x.arg.hasNext && x.arg.notificationIcon === 'ic_notification' && x.arg.dismissable === false)), JSON.stringify((await log()).filter((x) => x.name.startsWith('MusicControls')).slice(0, 2)));
  check('...and it is not made again every second', await (async () => { await page.waitForTimeout(2500); return (await log()).filter((x) => x.name === 'MusicControls.create').length <= 2; })());

  const hasPrompt = await until(async () => (await page.locator('[aria-label="Notification permission"]').count()) === 1);
  check('permission flow: in-app notification prompt appears on first playback', hasPrompt);
  if (hasPrompt) {
    await page.getByRole('button', { name: 'Allow' }).click();
    check('permission flow: tapping Allow requests notification permission', await until(async () => (await log()).some((x) => x.name === 'MusicControls.requestPermissions')));
  }

  const press = (message, extra = {}) => native(({ message, extra }) => { const e = new Event('controlsNotification'); e.message = message; Object.assign(e, extra); document.dispatchEvent(e); }, { message, extra });
  const playing = () => native(() => !!window.__tamiltunes_audio && !window.__tamiltunes_audio.paused);
  check('the notification Pause button pauses the music', await (async () => { await until(playing); await press('music-controls-pause'); return until(async () => !(await playing())); })());
  check('the notification Play button resumes it', await (async () => { await press('music-controls-play'); return until(playing); })());
  check('pulling out the headphones pauses it', await (async () => { await press('music-controls-headset-unplugged'); return until(async () => !(await playing())); })());
  await press('music-controls-play');
  await until(playing);
  check('the notification seek bar seeks', await (async () => { await press('music-controls-seek-to', { position: 42 }); return until(() => native(() => Math.abs(window.__tamiltunes_audio.currentTime - 42) < 2)); })());
  const creates = (await log()).filter((x) => x.name === 'MusicControls.create').length;
  await press('music-controls-next');
  check('the notification Next button plays the next song and updates the notification', await until(async () => (await log()).filter((x) => x.name === 'MusicControls.create').length > creates && (await log()).filter((x) => x.name === 'MusicControls.create').at(-1).arg.track !== 'Song 1'), JSON.stringify((await log()).filter((x) => x.name === 'MusicControls.create').map((x) => x.arg.track)));

  // ---- the Back button, in order
  await page.locator('[aria-label="Open now playing full screen"]').tap();
  await page.waitForSelector('[aria-label="Close now playing"]');
  // a video in full screen: Back leaves full screen first and keeps Now Playing open
  await native(() => {
    const el = document.body;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => (window.__fsOn ? el : null) });
    window.__fsOn = true;
    document.exitFullscreen = async () => { window.__fsOn = false; window.__fsExited = (window.__fsExited || 0) + 1; };
  });
  await fire('backButton', { canGoBack: true });
  check('Back 0: a video in full screen leaves full screen first (Now Playing stays open)', await until(() => native(() => window.__fsExited === 1)) && (await page.locator('[aria-label="Close now playing"]').count()) === 1);
  await fire('backButton', { canGoBack: true });
  check('Back 1: the full-screen player closes first (and the page does not change)', await until(async () => (await page.locator('[aria-label="Close now playing"]').count()) === 0) && (await path()) === '/');
  await page.locator('[aria-label="Show queue"]').tap();
  await page.waitForSelector('[data-testid=queue-sheet]');
  await fire('backButton', { canGoBack: true });
  check('Back 2: the queue panel closes next', await until(async () => (await page.locator('[data-testid=queue-sheet]').count()) === 0) && (await path()) === '/');
  await page.locator('button[aria-label="More actions for Song 3"]').first().click();
  await page.waitForSelector('[role=dialog]');
  await fire('backButton', { canGoBack: true });
  check('Back 3: an open menu / dialog closes before anything else', await until(async () => (await page.locator('[role=dialog]').count()) === 0) && (await path()) === '/');
  await page.locator('[aria-label="Open now playing full screen"]').tap();
  await page.waitForSelector('[aria-label="Close now playing"]');
  await page.getByRole('button', { name: 'Share song' }).click(); // opens the share sheet (mock), not a dialog
  check('sharing uses the Android share sheet with the site address', await until(async () => (await log()).some((x) => x.name === 'Share.share' && x.arg.url === SITE && /Song|Radio/.test(x.arg.title))), JSON.stringify((await log()).filter((x) => x.name === 'Share.share')));
  await fire('backButton', { canGoBack: true });
  await until(async () => (await page.locator('[aria-label="Close now playing"]').count()) === 0);
  await page.locator('a[href="/explore"]').last().tap();
  await page.waitForFunction(() => window.location.pathname === '/explore');
  await fire('backButton', { canGoBack: true });
  check('Back 4: with nothing open, Back goes to the previous page', await until(async () => (await path()) === '/'));
  const exitsBefore = (await log()).filter((x) => x.name === 'App.exitApp').length;
  await fire('backButton', { canGoBack: false });
  check('Back 5: with nowhere to go back to, the app exits', (await log()).filter((x) => x.name === 'App.exitApp').length === exitsBefore + 1);

  // ---- offline banner
  await fire('networkStatusChange', { connected: false });
  check('offline: the banner appears', await until(async () => (await page.locator('[data-testid=offline-banner]').count()) === 1));
  await fire('networkStatusChange', { connected: true });
  check('and goes away when the connection is back', await until(async () => (await page.locator('[data-testid=offline-banner]').count()) === 0));

  // ---- deep links
  await fire('appUrlOpen', { url: `${SITE}/u/someone` });
  check('a link to a profile on our site opens that page in the app', await until(async () => (await path()) === '/u/someone'), await path());
  await fire('appUrlOpen', { url: 'https://evil.example/album/x' });
  await fire('appUrlOpen', { url: `${SITE}/admin` });
  await page.waitForTimeout(300);
  check('links to other sites or to pages that must not open from a link are ignored', (await path()) === '/u/someone');

  // ---- real AndroidManifest.xml checks (permissions, foreground service, wake lock)
  const fs = await import('node:fs');
  const manifestPath = nodePath.resolve('android/app/src/main/AndroidManifest.xml');
  const manifestXml = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : '';
  check('manifest declares FOREGROUND_SERVICE permission', manifestXml.includes('android.permission.FOREGROUND_SERVICE'));
  check('manifest declares FOREGROUND_SERVICE_MEDIA_PLAYBACK permission', manifestXml.includes('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'));
  check('manifest declares WAKE_LOCK permission', manifestXml.includes('android.permission.WAKE_LOCK'));
  check('manifest declares POST_NOTIFICATIONS permission', manifestXml.includes('android.permission.POST_NOTIFICATIONS'));
  check(
    'manifest declares MusicControlsNotificationKiller with mediaPlayback and tools:replace',
    manifestXml.includes('MusicControlsNotificationKiller') &&
    manifestXml.includes('android:foregroundServiceType="mediaPlayback"') &&
    manifestXml.includes('tools:replace="android:foregroundServiceType"') &&
    manifestXml.includes('xmlns:tools="http://schemas.android.com/tools"')
  );

  const mergedGlob = nodePath.resolve('android/app/build/intermediates/merged_manifests');
  if (fs.existsSync(mergedGlob)) {
    const findMerged = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = nodePath.join(dir, entry.name);
        if (entry.isDirectory()) {
          const res = findMerged(full);
          if (res) return res;
        } else if (entry.name === 'AndroidManifest.xml') {
          return full;
        }
      }
      return null;
    };
    const mergedPath = findMerged(mergedGlob);
    if (mergedPath) {
      const mergedXml = fs.readFileSync(mergedPath, 'utf8');
      check('merged manifest retains foregroundServiceType="mediaPlayback"', mergedXml.includes('foregroundServiceType="mediaPlayback"'));
    }
  }

  // ---- in-app update (Profile > Check for updates)
  const VJ = (over = {}) => ({ versionName: '1.0.5', versionCode: 10005, sha256: 'ab'.repeat(32), size: 8000000, changelog: ['- Fix the media notification', '- Video songs'], ...over });
  const upd = (patch) => native((p) => { Object.assign((window.__native.update ||= { installed: { versionName: '1.0.0', versionCode: 4 }, versionJson: null, fetchError: null, downloadError: null, needPermission: false }), p); }, patch);
  const calls = async (name) => (await log()).filter((x) => x.name === name);
  await page.goto(`${BASE}/profile`);
  await page.waitForSelector('[data-testid=app-update-card]', { timeout: 15000 });
  check('Profile shows the installed version and a Check for updates button (app only)', await until(async () => /Version 1\.0\.0/.test(await page.locator('[data-testid=app-version]').innerText())) && (await page.locator('[data-testid=check-updates]').count()) === 1);
  check('...and "Never checked" before the first check', /Never checked/.test(await page.locator('[data-testid=update-last-checked]').innerText()));
  
  check('the quiet startup check asked once, only for version.json, and showed nothing (it failed here: no release in the mock)', await (async () => { await page.waitForTimeout(800); const f = await calls('AppUpdater.fetchText'); return f.length === 1 && f[0].arg.url.endsWith('/releases/latest/download/version.json') && (await page.locator('[data-testid=update-sheet], [data-testid=update-check-error]').count()) === 0; })());
  check('the startup also deletes a leftover downloaded APK', (await calls('AppUpdater.cleanup')).length >= 1);
  await upd({ versionJson: VJ({ versionName: '1.0.0', versionCode: 4 }) });
  await page.locator('[data-testid=check-updates]').click();
  check('up to date: toast "You\'re on the latest version"', await until(async () => (await page.locator('text=latest version').count()) > 0));
  check('...the check asked only for version.json inside our releases (no token, no other host)', (await calls('AppUpdater.fetchText')).some((x) => x.arg.url === 'https://github.com/Deepak-G-T/tamiltunes/releases/latest/download/version.json'));
  check('...and "Last checked" now says just now', await until(async () => /just now/.test(await page.locator('[data-testid=update-last-checked]').innerText())));
  check('no update sheet and no dot when up to date', (await page.locator('[data-testid=update-sheet]').count()) === 0 && (await page.locator('[data-testid=update-dot]').count()) === 0);

  await upd({ versionJson: VJ({ sha256: 'zz' }) });
  await page.locator('[data-testid=check-updates]').click();
  check('a damaged version.json is refused with a clear message', await until(async () => /not valid/.test(await page.locator('[data-testid=update-check-error]').innerText().catch(() => ''))));
  await upd({ fetchError: 'rate_limited' });
  await page.locator('[data-testid=check-updates]').click();
  check('GitHub rate limit: friendly message, no crash', await until(async () => /busy/.test(await page.locator('[data-testid=update-check-error]').innerText().catch(() => ''))));
  await upd({ fetchError: 'offline' });
  await page.locator('[data-testid=check-updates]').click();
  check('no network: friendly message', await until(async () => /No internet/.test(await page.locator('[data-testid=update-check-error]').innerText().catch(() => ''))));

  await upd({ fetchError: null, versionJson: VJ() });
  await page.locator('[data-testid=check-updates]').click();
  check('newer version: a sheet shows the new version and the changelog', await until(async () => (await page.locator('[data-testid=update-sheet]').count()) === 1 && /1\.0\.5/.test(await page.locator('[data-testid=update-sheet]').innerText()) && (await page.locator('[data-testid=update-changelog] li').count()) === 2));
  await page.getByRole('button', { name: 'Later' }).click();
  check('Later closes the sheet and deletes anything downloaded', await until(async () => (await page.locator('[data-testid=update-sheet]').count()) === 0) && (await calls('AppUpdater.cleanup')).length >= 1);
  check('...the Profile tab shows an "Update available" dot', (await page.locator('[data-testid=update-dot]').count()) === 1);
  check('...and the card offers "Version 1.0.5 is available"', (await page.locator('[data-testid=update-available]').count()) === 1);

  await upd({ downloadError: 'hash_mismatch' });
  await page.locator('[data-testid=update-available]').click();
  await page.locator('[data-testid=update-now]').click();
  check('hash mismatch: shows an error and never opens the installer', await until(async () => /damaged/.test(await page.locator('[data-testid=update-error]').innerText().catch(() => ''))) && (await calls('AppUpdater.install')).length === 0);
  await upd({ downloadError: 'low_storage' });
  await page.locator('[data-testid=update-now]').click();
  check('low storage: friendly message', await until(async () => /free space/.test(await page.locator('[data-testid=update-error]').innerText().catch(() => ''))));

  await upd({ downloadError: null, needPermission: true });
  await page.locator('[data-testid=update-now]').click();
  check('Update now: downloads the release APK with its hash (progress bar shown) from our releases only', await until(async () => (await calls('AppUpdater.download')).some((x) => x.arg.url === 'https://github.com/Deepak-G-T/tamiltunes/releases/latest/download/app-release.apk' && x.arg.sha256 === 'ab'.repeat(32) && x.arg.size === 8000000)));
  check('...without "install apps" permission it opens that settings page and explains', await until(async () => (await calls('AppUpdater.openInstallSettings')).length === 1 && /Allow TamilTunes/.test(await page.locator('[data-testid=update-error]').innerText().catch(() => ''))) && (await calls('AppUpdater.install')).length === 0);
  await page.locator('[data-testid=update-now]').click();
  check('...after allowing it, Install now opens the installer without downloading again', await until(async () => (await calls('AppUpdater.install')).length === 1) && (await calls('AppUpdater.download')).length === 3);
  await page.getByRole('button', { name: 'Later' }).click();

  check('the update sheet shows a progress bar while downloading', await (async () => {
    await upd({ needPermission: false });
    await page.locator('[data-testid=update-available]').click();
    await page.locator('[data-testid=update-now]').click();
    return until(async () => (await page.locator('[data-testid=update-progress]').count()) === 1, 3000);
  })());
  await until(async () => (await calls('AppUpdater.install')).length === 2);
  await page.getByRole('button', { name: 'Later' }).click();

  check("no 'is not implemented' errors in the page console", !consoleErrors.some((e) => e.includes('is not implemented')), consoleErrors.filter((e) => e.includes('is not implemented')).join(' | '));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

let preview;
let browser;
try {
  preview = await startPreview();
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--autoplay-policy=no-user-gesture-required'] });
  await run(browser);
} catch (e) {
  console.error('Native audit crashed:', String(e.message).split('\n').slice(0, 8).join('\n'));
  results.push({ ok: false });
} finally {
  await browser?.close();
  if (preview) { try { process.platform === 'win32' ? preview.kill() : process.kill(-preview.pid); } catch { /* gone */ } }
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} native checks passed`);
process.exit(failed.length ? 1 : 0);
