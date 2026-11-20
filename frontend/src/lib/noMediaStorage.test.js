import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Audio and video are stream-only: nothing in the web app, the service worker or the Android app stores or downloads them.
// These tests read the source and fail when someone adds a cache, a file write, a download plugin or a storage permission.
const root = path.resolve(__dirname, '..', '..'); // frontend/
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'build', 'assets', 'dist'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(root, p).replaceAll('\\', '/');
const isTest = (f) => /\.test\.|\/test\//.test(f);

describe('web app: no browser storage for files or caches', () => {
  // Exclude admin CSV export (non-media) from client media storage scan
  const files = walk(path.join(root, 'src')).filter((f) => /\.(js|jsx)$/.test(f) && !isTest(rel(f)) && rel(f) !== 'src/sw.js' && rel(f) !== 'src/pages/admin/AdminUsers.jsx');
  const FORBIDDEN = /\bcaches\s*\.|\bCacheStorage\b|\bindexedDB\b|\bIDBDatabase\b|\bshowSaveFilePicker\b|navigator\.storage\b|\bFileSystem\w*\b|<a[^>]*\sdownload\b|\.download\s*=/;
  it('no Cache API, IndexedDB, file system or download links outside the service worker', () => {
    const hits = files.filter((f) => FORBIDDEN.test(read(f))).map(rel);
    expect(hits).toEqual([]);
  });
  it('createObjectURL is used only for the profile photo preview (an image the person picked)', () => {
    const hits = files.filter((f) => /createObjectURL/.test(read(f))).map(rel);
    expect(hits).toEqual(['src/lib/avatarImage.js']);
  });
  it('AdminUsers CSV export is the only non-media download', () => {
    const adminUserFile = read(path.join(root, 'src/pages/admin/AdminUsers.jsx'));
    expect(adminUserFile).toMatch(/\.download\s*=\s*`tamiltunes-users-/);
    expect(adminUserFile).toMatch(/type:\s*'text\/csv'/);
  });
});

describe('service worker: only public JSON, pictures and pages are stored', () => {
  const sw = read(path.join(root, 'src/sw.js'));
  it('exactly three caches', () => {
    expect([...sw.matchAll(/cacheName:\s*'([^']+)'/g)].map((m) => m[1]).sort()).toEqual(['api-public-v1', 'images-v1', 'pages-v1']);
  });
  it('exactly three routes, and no cache-first strategy', () => {
    expect((sw.match(/registerRoute\(/g) || []).length).toBe(3);
    expect(sw).not.toMatch(/\bCacheFirst\b/);
  });
  it('the API and picture routes both refuse stream requests', () => {
    expect((sw.match(/!isStreamRequest\(request, url\)/g) || []).length).toBe(2);
  });
});

describe('Android app: nothing that saves files', () => {
  const manifest = read(path.join(root, 'android/app/src/main/AndroidManifest.xml'));
  it('the only permissions are internet, network state, notifications, foreground service, wake lock and (for the in-app update) installing the new APK', () => {
    const perms = [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map((m) => m[1].replace('android.permission.', '')).sort();
    expect(perms).toEqual(['ACCESS_NETWORK_STATE', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'INTERNET', 'POST_NOTIFICATIONS', 'REQUEST_INSTALL_PACKAGES', 'WAKE_LOCK']);
  });
  it('no file, download or HTTP plugin is installed', () => {
    const pkg = JSON.parse(read(path.join(root, 'package.json')));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => /filesystem|file-transfer|downloader|cordova-plugin-file|@capacitor\/http/i.test(d))).toEqual([]);
  });
  const UPDATER = 'android/app/src/main/java/com/tamiltunes/app/AppUpdaterPlugin.java';
  it('the native code does not download or write files, except the in-app updater (one file)', () => {
    const java = walk(path.join(root, 'android/app/src')).filter((f) => /\.(java|kt)$/.test(f));
    expect(java.filter((f) => /DownloadManager|FileOutputStream|openFileOutput|getExternalFilesDir|MediaStore/.test(read(f))).map(rel)).toEqual([UPDATER]);
  });
  it('the updater only touches the private cache folder, only GitHub release addresses, and never audio or video', () => {
    const u = read(path.join(root, UPDATER));
    expect(u).toMatch(/getCacheDir\(\)/);
    expect(u).not.toMatch(/getExternal|Environment\.|MediaStore|DownloadManager|openFileOutput|getFilesDir|Runtime\.getRuntime|ProcessBuilder/);
    expect(u).not.toMatch(/audio|video|mp3|mp4|m4a|aac|saavn|youtube/i);
    expect(u).toMatch(/startsWith\("\/" \+ REPO \+ "\/releases\/"\)/);
    expect(u).toMatch(/setInstanceFollowRedirects\(false\)/); // redirects are followed by hand, every hop checked
    expect(u).not.toMatch(/Authorization|Bearer|token/i); // no credential in the app
  });
  it('no JavaScript outside the updater talks to the updater plugin or downloads an APK', () => {
    const files = walk(path.join(root, 'src')).filter((f) => /\.(js|jsx)$/.test(f) && !isTest(rel(f)));
    const hits = files.filter((f) => /@tamiltunes\/app-updater/.test(read(f))).map(rel).sort();
    expect(hits).toEqual(['src/lib/updater.js']);
  });
  it('the app is not backed up to the cloud', () => {
    expect(manifest).toMatch(/android:allowBackup="false"/);
  });
});
