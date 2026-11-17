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
      setTimeout(() => this._ev.onReady && this._ev.onReady({ target: this }), 0);
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

async function setupRoutes(page) {
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
}

async function runViewport(browser, width, height) {
  const tag = `${width}x${height}`;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  let bothPlaying = false;
  await setupRoutes(page);

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

  // 3. switch to Video while PLAYING: audio stops, YouTube starts by itself at the same time, visible >=200x200
  const tBefore = (await state(page)).audioTime;
  await mini.locator('[data-testid=mode-video]').click();
  await page.waitForTimeout(700);
  s = await state(page);
  const calls = await page.evaluate(() => window.__yt.calls);
  // Position is carried by loadVideoById({startSeconds}) or by creating the player with start= and autoplay=1
  const started = calls.filter((c) => c[0] === 'load' || (c[0] === 'init' && c[1].autoplay)).pop();
  check(`[${tag}] switch to Video while playing: YouTube plays by itself, audio stops`, s.ytPlaying && !s.audioPlaying, JSON.stringify(s));
  check(`[${tag}] switch to Video keeps position (start ~ audio time)`, started && Math.abs(started[1].startSeconds - tBefore) <= 1.5, `call=${JSON.stringify(started)} audioTime=${tBefore}`);
  const container = page.locator('[data-testid=yt-player-container]');
  check(`[${tag}] YouTube container visible in video mode`, (await container.getAttribute('data-visible')) === 'true');
  const vb = await box(container);
  check(`[${tag}] video surface >= 200x200`, vb && vb.width >= 199.5 && vb.height >= 199.5, JSON.stringify(vb));
  check(`[${tag}] video surface inside viewport`, vb && vb.x >= 0 && vb.y >= 0 && vb.x + vb.width <= width + 0.5 && vb.y + vb.height <= height + 0.5, JSON.stringify(vb));
  await page.screenshot({ path: path.join(OUT, `video-mode-${tag}.png`) });

  // 4. switch back to Audio while playing: audio plays by itself at the same time, YouTube stops
  const ytT = (await state(page)).ytTime;
  await mini.locator('[data-testid=mode-audio]').click();
  await page.waitForTimeout(700);
  s = await state(page);
  check(`[${tag}] switch to Audio while playing: audio plays by itself, YouTube stops`, s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  check(`[${tag}] switch to Audio keeps position`, Math.abs(s.audioTime - ytT) <= 2, `audio=${s.audioTime} yt=${ytT}`);

  // 5. PAUSED songs stay paused when switching either way
  await page.locator('button[aria-label="Pause"]').first().click();
  await page.waitForTimeout(400);
  await mini.locator('[data-testid=mode-video]').click();
  await page.waitForTimeout(600);
  s = await state(page);
  check(`[${tag}] switch to Video while paused: stays paused`, !s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  await mini.locator('[data-testid=mode-audio]').click();
  await page.waitForTimeout(600);
  s = await state(page);
  check(`[${tag}] switch to Audio while paused: stays paused`, !s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
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
  s = await state(page);
  check(`[${tag}] full-screen switch to Video while playing: YouTube plays by itself`, s.ytPlaying && !s.audioPlaying, JSON.stringify(s));
  const fb = await box(page.locator('[data-testid=yt-player-container]'));
  check(`[${tag}] full-screen video surface >= 200x200 and in viewport`, fb && fb.width >= 199.5 && fb.height >= 199.5 && fb.x >= 0 && fb.x + fb.width <= width + 0.5 && fb.y >= 0 && fb.y + fb.height <= height + 0.5, JSON.stringify(fb));
  await page.screenshot({ path: path.join(OUT, `fullscreen-video-${tag}.png`) });

  // 7. error 101 while the video is PLAYING -> back to audio (keeps playing) + toast, toggle hidden for that song
  await page.evaluate(() => window.__ytFail(101));
  await page.waitForSelector('[data-testid=toast]', { timeout: 3000 });
  await page.waitForTimeout(500);
  s = await state(page);
  check(`[${tag}] error 101: toast shown`, await page.locator('[data-testid=toast]').isVisible());
  check(`[${tag}] error 101: fell back to audio and keeps playing, YouTube stopped`, s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  check(`[${tag}] error 101: toggle hidden for the failed video`, (await page.locator('[data-testid=video-toggle], [data-testid=mode-video], [data-testid=mode-audio]').count()) === 0);
  const title = await box(page.locator('[data-testid=toast]'));
  check(`[${tag}] toast fits the viewport`, title && title.x >= 0 && title.x + title.width <= width + 0.5, JSON.stringify(title));
  check(`[${tag}] YouTube container parked offscreen again`, (await page.locator('[data-testid=yt-player-container]').getAttribute('data-visible')) === 'false');
  await page.screenshot({ path: path.join(OUT, `fallback-toast-${tag}.png`) });

  check(`[${tag}] audio and YouTube never played at the same time`, !bothPlaying);
  check(`[${tag}] no uncaught page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// Real touch swipe (touchStart -> touchMove steps -> touchEnd), fast enough to count as a swipe
async function swipe(page, from, to, ms = 160) {
  const cdp = await page.context().newCDPSession(page);
  const steps = 6;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]
    });
    await page.waitForTimeout(ms / steps);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
const center = async (loc) => {
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
};

async function runGestures(browser, width, height) {
  const tag = `${width}x${height}`;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setupRoutes(page);
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('text=Plain Audio Song');

  await page.getByText('Badass (Leo)').first().click();
  await page.waitForFunction(() => { const a = window.__tamiltunes_audio; return a && !a.paused && a.currentTime > 0.3; }, null, { timeout: 8000 });
  const mini = page.locator('[aria-label="Open now playing full screen"]');
  const titleOf = async () => (await page.locator('h2').last().innerText().catch(() => '')).trim();

  // mini player: swipe UP opens the full-screen player
  const mc = await center(mini);
  await swipe(page, { x: mc.x, y: mc.y }, { x: mc.x, y: mc.y - 140 });
  await page.waitForSelector('[aria-label="Close now playing"]', { timeout: 3000 }).catch(() => {});
  check(`[${tag}] swipe up on the mini player opens the full-screen player`, (await page.locator('[aria-label="Close now playing"]').count()) === 1);

  // a plain TAP on the artwork changes nothing
  const art = page.locator('[data-testid=fs-artwork]');
  check(`[${tag}] artwork has the swipe hook`, (await art.count()) === 1);
  const before = await titleOf();
  const ac = await center(art);
  await page.touchscreen.tap(ac.x, ac.y);
  await page.waitForTimeout(300);
  check(`[${tag}] tapping the artwork changes nothing`, (await titleOf()) === before && (await page.locator('[aria-label="Close now playing"]').count()) === 1, `title=${await titleOf()}`);

  // swipe LEFT on the artwork = next song, RIGHT = previous
  await swipe(page, { x: ac.x + 60, y: ac.y }, { x: ac.x - 80, y: ac.y });
  await page.waitForTimeout(500);
  const afterNext = await titleOf();
  check(`[${tag}] swipe left on the artwork plays the next song`, afterNext !== before && afterNext.length > 0, `${before} -> ${afterNext}`);
  const ac2 = await center(art);
  await swipe(page, { x: ac2.x - 60, y: ac2.y }, { x: ac2.x + 80, y: ac2.y });
  await page.waitForTimeout(500);
  check(`[${tag}] swipe right on the artwork goes back`, (await titleOf()) === before, `now=${await titleOf()}`);

  // a horizontal drag that starts on the progress slider must NOT change the song
  const slider = page.locator('input[title="Seek playback"]:visible').first();
  const sc = await center(slider);
  await swipe(page, { x: sc.x + 40, y: sc.y }, { x: sc.x - 90, y: sc.y });
  await page.waitForTimeout(300);
  check(`[${tag}] dragging the slider does not change the song`, (await titleOf()) === before, `now=${await titleOf()}`);

  // swipe DOWN on the artwork closes the player
  const ac3 = await center(art);
  await swipe(page, { x: ac3.x, y: ac3.y - 40 }, { x: ac3.x, y: ac3.y + 150 });
  await page.waitForTimeout(500);
  check(`[${tag}] swipe down on the artwork closes the player`, (await page.locator('[aria-label="Close now playing"]').count()) === 0);

  check(`[${tag}] no uncaught page errors during gestures`, errors.length === 0, errors.join(' | '));
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
  for (const [w, h] of [[360, 640], [390, 844]]) {
    await runViewport(browser, w, h);
    await runGestures(browser, w, h);
  }
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
