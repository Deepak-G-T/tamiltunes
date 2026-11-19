// Store-style screenshots for the web app manifest (Chrome shows them in the install dialog): the built app with a mock API.
// Songs have no covers here (placeholder art): replace public/icons/screenshot-*.png with real ones whenever you like.
// Run: node scripts/make-screenshots.mjs  (after `npm run build`; CHROMIUM_PATH=/path/to/chrome if needed)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const PORT = 4179;
const names = ['Innum Konjam Neram', 'Vaseegara', 'Kannana Kanne', 'Munbe Vaa', 'Hukum', 'Vaathi Coming', 'Chaleya', 'Naan Un', 'Pavazha Malli', 'Annul Maelae', 'Oru Devathai', 'Kadhal Sadugudu'];
const artists = ['Vijay Prakash', 'Bombay Jayashri', 'Sid Sriram', 'Shreya Ghoshal', 'Anirudh', 'Anirudh', 'Arijit Singh', 'Arijit Singh', 'Sam CS', 'Pradeep Kumar', 'Hariharan', 'A.R. Rahman'];
const songs = names.map((title, i) => ({ id: `s${i}`, title, artist: artists[i], album: `Film ${i}`, duration: 220 + i, image: '', streamUrl: 'http://127.0.0.1:5000/x.mp3', source: 'audio', year: '2024' }));
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (b) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
  if (u.pathname === '/api/music/home') return json({ success: true, data: { trending: songs, latest: [], gana: [], nineties: [], twoThousands: [], melodies: [], love: [], sad: [], folk: [], instrumental: [], popularAlbums: [], popularArtists: [], albums: [], artists: [] } });
  if (u.pathname === '/api/home') return json({ success: true, seed: 's', hero: null, hidden: [], sections: [{ id: 'daily-mix-1', title: 'Daily Mix 1', subtitle: 'Anirudh, Sid Sriram and more', kind: 'songs', items: songs.slice(0, 6) }, { id: 'trending', title: 'Trending now', kind: 'songs', items: songs.slice(4, 12) }] });
  return json({ success: true });
});
const preview = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: process.platform !== 'win32' });
await new Promise((r) => server.listen(5000, '127.0.0.1', r));
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const [file, w, h, mobile] of [['screenshot-narrow.png', 540, 960, true], ['screenshot-wide.png', 1280, 720, false]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('section[aria-label="Daily Mix 1"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.resolve('public/icons', file) });
  console.log('wrote', file);
  await ctx.close();
}
await browser.close();
server.close();
try { process.platform === 'win32' ? preview.kill() : process.kill(-preview.pid); } catch { /* gone */ }
