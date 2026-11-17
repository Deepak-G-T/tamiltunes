// UI audit for the Audio/Video toggle. Runs the built app (vite preview) in Chromium at
// 360x640 and 390x844 against a MOCK backend and a STUBBED YouTube IFrame API.
// It does NOT exercise real YouTube playback or a real phone. See README.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 4173;
const OUT = process.env.UI_AUDIT_OUT || path.resolve('ui-audit-out');
fs.mkdirSync(OUT, { recursive: true });

const SONG_VIDEO = {
  id: 'tt_video_1', title: 'Badass (Leo)', artist: 'Anirudh Ravichander', album: 'Leo', duration: 10,
  image: '', streamUrl: 'https://aac.saavncdn.com/test_320.mp4', source: 'audio', videoId: 'IqwIOlhfCak'
};
const SONG_PLAIN = {
  id: 'tt_plain_1', title: 'Plain Audio Song', artist: 'Someone', album: 'Plain', duration: 10,
  image: '', streamUrl: 'https://aac.saavncdn.com/plain_320.mp4', source: 'audio'
};
const FEED = {
  trending: [SONG_VIDEO, SONG_PLAIN], latest: [], gana: [], nineties: [], twoThousands: [], melodies: [],
  love: [], sad: [], folk: [], instrumental: [], popularAlbums: [], popularArtists: [], albums: [], artists: []
};

// 10 s of silence, 8 kHz 8-bit mono WAV
const wav = (() => {
  const n = 80000, b = Buffer.alloc(44 + n, 0x80);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28);
  b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  return b;
})();

// Fake YT IFrame API: records calls, simulates playing state and a clock, can raise errors.
const YT_STUB = `
window.__yt = { calls: [], playing: false, time: 0, handlers: null };
window.YT = { PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  Player: class {
    constructor(id, opts) {
      const host = document.getElementById(id);
      const f = document.createElement('div'); f.id = 'fake-yt-iframe'; f.style.cssText = 'width:100%;height:100%;background:#111';
      host.appendChild(f);
      window.__yt.handlers = opts.events;
      this._ev = opts.events;
      // The app creates the player WITH a videoId (autoplay/start in playerVars): model that like the real API
      if (opts.videoId) {
        const pv = opts.playerVars || {};
        window.__yt.calls.push(['init', { videoId: opts.videoId, autoplay: pv.autoplay, startSeconds: pv.start || 0 }]);
        window.__yt.time = pv.start || 0;
        if (pv.autoplay) setTimeout(() => this._set(1), 0);
      }
      setInterval(() => { if (window.__yt.playing) window.__yt.time += 0.25; }, 250);
      setTimeout(() => this._ev.onReady && this._ev.onReady({}), 0);
    }
    _set(state) { window.__yt.playing = state === 1; this._ev.onStateChange({ data: state }); }
    loadVideoById(o) { window.__yt.calls.push(['load', o]); window.__yt.time = o.startSeconds || 0; this._set(1); }
    cueVideoById(o) { window.__yt.calls.push(['cue', o]); window.__yt.time = o.startSeconds || 0; window.__yt.playing = false; }
    playVideo() { window.__yt.calls.push(['play']); this._set(1); }
    pauseVideo() { window.__yt.calls.push(['pause']); if (window.__yt.playing) this._set(2); }
    seekTo(s) { window.__yt.time = s; }
    getCurrentTime() { return window.__yt.time; }
    getDuration() { return 10; }
    setVolume() {} mute() {} unMute() {} destroy() {}
  } };
window.__ytFail = (code) => window.__yt.handlers.onError({ data: code });
setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 0);
`;

const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  -> ${detail}`}`);
};

const startServer = () =>
  new Promise((resolve, reject) => {
    const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let done = false;
    p.stdout.on('data', (d) => { if (!done && /127\.0\.0\.1:4173|Local/.test(d.toString())) { done = true; resolve(p); } });
    p.stderr.on('data', (d) => { if (!done) console.error(String(d)); });
    p.on('exit', (c) => { if (!done) reject(new Error(`vite preview exited ${c}`)); });
    setTimeout(() => { if (!done) reject(new Error('vite preview start timeout')); }, 30000);
  });

const state = (page) =>
  page.evaluate(() => {
    const a = window.__tamiltunes_audio;
    return { audioPlaying: !!a && !a.paused && !a.ended, audioTime: a ? a.currentTime : 0, ytPlaying: window.__yt.playing, ytTime: window.__yt.time };
  });

const box = async (loc) => (await loc.boundingBox());

async function runViewport(browser, width, height) {
  const tag = `${width}x${height}`;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  let bothPlaying = false;
  await page.route('**/api/music/home', (r) => r.fulfill({ json: { success: true, data: FEED } }));
  await page.route('**/api/**', (r) => (r.request().url().includes('/music/home') ? r.fallback() : r.fulfill({ json: { success: true } })));
  await page.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'application/javascript', body: YT_STUB }));
  await page.route('https://aac.saavncdn.com/**', (r) => {
    const range = r.request().headers()['range'];
    const m = range && /bytes=(\d+)-(\d*)/.exec(range);
    if (m) {
      const s = Number(m[1]), e = m[2] ? Number(m[2]) : wav.length - 1;
      return r.fulfill({ status: 206, contentType: 'audio/wav', body: wav.subarray(s, e + 1),
        headers: { 'Content-Range': `bytes ${s}-${e}/${wav.length}`, 'Accept-Ranges': 'bytes' } });
    }
    return r.fulfill({ status: 200, contentType: 'audio/wav', body: wav, headers: { 'Accept-Ranges': 'bytes' } });
  });
  await page.route('https://images.unsplash.com/**', (r) => r.abort());

  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('text=Plain Audio Song');

  // sampler: assert both engines are never playing at once
  await page.exposeFunction('__reportBoth', () => { bothPlaying = true; });
  await page.evaluate(() => setInterval(() => {
    const a = window.__tamiltunes_audio;
    if (a && !a.paused && window.__yt && window.__yt.playing) window.__reportBoth();
  }, 50));

  // 1. song WITHOUT videoId -> no toggle
  await page.getByText('Plain Audio Song').first().click();
  await page.waitForSelector('[aria-label="Open now playing full screen"]');
  check(`[${tag}] no toggle for a song without videoId`, (await page.locator('[data-testid=video-toggle], [data-testid=mode-video], [data-testid=mode-audio]').count()) === 0);

  // 2. song WITH videoId -> toggle in mini player
  await page.getByText('Badass (Leo)').first().click();
  await page.waitForFunction(() => { const a = window.__tamiltunes_audio; return a && !a.paused && a.currentTime > 0.3; }, null, { timeout: 8000 });
  const mini = page.locator('[aria-label="Open now playing full screen"]');
  const titleBox = await box(mini.locator('h4'));
  check(`[${tag}] MiniPlayer song title keeps >= 80px of room next to the toggle`, titleBox && titleBox.width >= 80, JSON.stringify(titleBox));
  check(`[${tag}] toggle visible in MiniPlayer for a song with videoId`, await mini.locator('[data-testid=mode-video]').isVisible());
  let s = await state(page);
  check(`[${tag}] starts in audio mode (audio playing, YouTube idle)`, s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  check(`[${tag}] YouTube container parked offscreen in audio mode`, (await page.locator('[data-testid=yt-player-container]').getAttribute('data-visible')) === 'false');

  // 3. switch to Video: pauses audio, cues at same time, no autoplay, visible >=200x200
  const tBefore = (await state(page)).audioTime;
  await mini.locator('[data-testid=mode-video]').click();
  await page.waitForTimeout(600);
  s = await state(page);
  const calls = await page.evaluate(() => window.__yt.calls);
  // Position is carried either by cueVideoById (player already existed) or by creating the player with start= and autoplay=0
  const cue = calls.filter((c) => (c[0] === 'cue') || (c[0] === 'init' && !c[1].autoplay)).pop();
  check(`[${tag}] switch to Video: audio paused, YouTube NOT autoplaying`, !s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  check(`[${tag}] switch to Video keeps position (cue startSeconds ~ audio time)`, cue && Math.abs(cue[1].startSeconds - tBefore) <= 1.5, `cue/init=${JSON.stringify(cue)} audioTime=${tBefore}`);
  const container = page.locator('[data-testid=yt-player-container]');
  check(`[${tag}] YouTube container visible in video mode`, (await container.getAttribute('data-visible')) === 'true');
  const vb = await box(container);
  check(`[${tag}] video surface >= 200x200`, vb && vb.width >= 199.5 && vb.height >= 199.5, JSON.stringify(vb));
  check(`[${tag}] video surface inside viewport`, vb && vb.x >= 0 && vb.y >= 0 && vb.x + vb.width <= width + 0.5 && vb.y + vb.height <= height + 0.5, JSON.stringify(vb));
  await page.screenshot({ path: path.join(OUT, `video-mode-${tag}.png`) });

  // 4. tap play in video mode -> only YouTube plays
  await page.locator('button[aria-label="Play"]').first().click();
  await page.waitForTimeout(700);
  s = await state(page);
  check(`[${tag}] tap play in Video mode: only YouTube plays`, s.ytPlaying && !s.audioPlaying, JSON.stringify(s));

  // 5. back to Audio: YouTube paused, audio paused (needs tap), position carried
  const ytT = (await state(page)).ytTime;
  await mini.locator('[data-testid=mode-audio]').click();
  await page.waitForTimeout(600);
  s = await state(page);
  check(`[${tag}] switch to Audio: nothing plays until tap`, !s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  check(`[${tag}] switch to Audio keeps position`, Math.abs(s.audioTime - ytT) <= 1.5, `audio=${s.audioTime} yt=${ytT}`);
  await page.locator('button[aria-label="Play"]').first().click();
  await page.waitForTimeout(700);
  s = await state(page);
  check(`[${tag}] tap play in Audio mode: only audio plays`, s.audioPlaying && !s.ytPlaying, JSON.stringify(s));

  // 6. full-screen player: toggle present, video surface >=200x200 in video mode
  await mini.click({ position: { x: 20, y: 10 } });
  await page.waitForSelector('[aria-label="Close now playing"]');
  check(`[${tag}] toggle visible in FullScreenPlayer`, await page.locator('[data-testid=video-toggle]').last().isVisible());
  await page.locator('[data-testid=mode-video]').last().click(); // portal is last in DOM
  await page.waitForTimeout(700);
  const fb = await box(page.locator('[data-testid=yt-player-container]'));
  check(`[${tag}] full-screen video surface >= 200x200 and in viewport`, fb && fb.width >= 199.5 && fb.height >= 199.5 && fb.x >= 0 && fb.x + fb.width <= width + 0.5 && fb.y >= 0 && fb.y + fb.height <= height + 0.5, JSON.stringify(fb));
  await page.screenshot({ path: path.join(OUT, `fullscreen-video-${tag}.png`) });

  // 7. error 101 -> fall back to audio + toast, toggle hidden for that song, nothing playing
  await page.locator('[data-testid=fs-play]').click(); // full-screen play button
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__ytFail(101));
  await page.waitForSelector('[data-testid=toast]', { timeout: 3000 });
  s = await state(page);
  check(`[${tag}] error 101: toast shown`, await page.locator('[data-testid=toast]').isVisible());
  check(`[${tag}] error 101: fell back to audio, nothing autoplays`, !s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  check(`[${tag}] error 101: toggle hidden for the failed video`, (await page.locator('[data-testid=video-toggle], [data-testid=mode-video], [data-testid=mode-audio]').count()) === 0);
  const title = await box(page.locator('[data-testid=toast]'));
  check(`[${tag}] toast fits the viewport`, title && title.x >= 0 && title.x + title.width <= width + 0.5, JSON.stringify(title));
  check(`[${tag}] YouTube container parked offscreen again`, (await page.locator('[data-testid=yt-player-container]').getAttribute('data-visible')) === 'false');
  await page.screenshot({ path: path.join(OUT, `fallback-toast-${tag}.png`) });

  check(`[${tag}] audio and YouTube never played at the same time`, !bothPlaying);
  check(`[${tag}] no uncaught page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

let server;
let browser;
try {
  server = await startServer();
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  for (const [w, h] of [[360, 640], [390, 844]]) await runViewport(browser, w, h);
} catch (err) {
  console.error("UI audit crashed:", String(err.message).split("\n").slice(0,12).join("\n"));
  results.push({ name: 'audit run', ok: false, detail: String(err) });
} finally {
  await browser?.close();
  if (server) { try { process.kill(-server.pid); } catch { /* already gone */ } } // kill npx AND its vite child
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
