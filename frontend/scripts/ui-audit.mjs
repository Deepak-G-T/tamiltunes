// UI audit for the Audio/Video toggle. Runs the built app (vite preview) in Chromium at
// 360x640 and 390x844 against a MOCK backend and a STUBBED YouTube IFrame API.
// It does NOT exercise real YouTube playback or a real phone. See README.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js'); // run vite directly, not through npx: works on Windows too

const PORT = 4173;
const OUT = process.env.UI_AUDIT_OUT || path.resolve('ui-audit-out');
fs.mkdirSync(OUT, { recursive: true });

const SONG_VIDEO = {
  id: 'tt_video_1', title: 'Badass (Leo)', artist: 'Anirudh Ravichander', album: 'Leo', duration: 10,
  image: '', streamUrl: 'https://aac.saavncdn.com/test_320.mp4', source: 'audio', videoId: 'IqwIOlhfCak',
  licenseNotice: 'High-Quality Tamil Audio Stream (cyberboysumanjay/JioSaavnAPI)'
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
      window.__yt.host = opts.host;
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
    const p = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let done = false;
    p.stdout.on('data', (d) => { if (!done && /127\.0\.0\.1:4173|Local/.test(d.toString())) { done = true; resolve(p); } });
    p.stderr.on('data', (d) => { if (!done) console.error(String(d)); });
    p.on('exit', (c) => { if (!done) reject(new Error(`vite preview exited ${c}`)); });
    setTimeout(() => { if (!done) reject(new Error('vite preview start timeout')); }, 30000);
  });

const state = (page) =>
  page.evaluate(() => {
    const a = window.__tamiltunes_audio;
    return { audioPlaying: !!a && !a.paused && !a.ended, audioTime: a ? a.currentTime : 0, ytPlaying: Boolean(window.__yt?.playing), ytTime: window.__yt?.time ?? 0 };
  });

const box = async (loc) => (await loc.boundingBox());

const reports = []; // video-report requests the app sent
async function setupRoutes(page, { loggedIn = true } = {}) {
  await page.addInitScript(({ loggedIn }) => {
    localStorage.setItem('tamiltunes_require_login', 'false');
    if (loggedIn) {
      localStorage.setItem('tamiltunes_token', 'audit_token');
      localStorage.setItem('tamiltunes_user', JSON.stringify({ id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' }));
    }
  }, { loggedIn });
  await page.route('**/api/**', (r) => {
    const u = r.request().url();
    if (/\/auth\/me/.test(u)) return r.fulfill({ json: { success: true, user: { id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' } } });
    if (/\/music\/home/.test(u)) return r.fulfill({ json: { success: true, data: FEED } });
    if (/\/api\/home/.test(u)) return r.fulfill({ json: { success: true, seed: 'test', hero: null, sections: [{ id: 'trending', title: 'Trending now', kind: 'songs', items: FEED.trending }] } });
    return r.fulfill({ json: { success: true } });
  });
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
  await page.route('**/api/songs/*/video-report', (r) => { reports.push({ url: r.request().url(), body: JSON.parse(r.request().postData() || '{}') }); return r.fulfill({ json: { success: true, reports: 1, hidden: false, needed: 2 } }); });
}

async function runViewport(browser, width, height) {
  const tag = `${width}x${height}`;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  let bothPlaying = false;
  await setupRoutes(page, { loggedIn: false });

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

  // 2. song WITH videoId: the mini player stays audio-style (no toggle); the toggle is in Now Playing
  await page.getByText('Badass (Leo)').first().click();
  await page.waitForFunction(() => { const a = window.__tamiltunes_audio; return a && !a.paused && a.currentTime > 0.3; }, null, { timeout: 8000 });
  const mini = page.locator('[aria-label="Open now playing full screen"]');
  const titleBox = await box(mini.locator('h4'));
  check(`[${tag}] MiniPlayer song title keeps >= 80px of room`, titleBox && titleBox.width >= 80, JSON.stringify(titleBox));
  check(`[${tag}] the mini player has no Audio / Video toggle (stays audio-style)`, (await mini.locator('[data-testid=mode-video], [data-testid=mode-audio]').count()) === 0);
  let s = await state(page);
  check(`[${tag}] starts in audio mode (audio playing, YouTube idle)`, s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  check(`[${tag}] YouTube container parked offscreen in audio mode`, (await page.locator('[data-testid=yt-player-container]').getAttribute('data-visible')) === 'false');
  check(`[${tag}] the YouTube script is not loaded before Video is first opened`, await page.evaluate(() => typeof window.__yt === 'undefined' && !document.getElementById('youtube-iframe-api')));
  await mini.click({ position: { x: 20, y: 10 } });
  await page.waitForSelector('[aria-label="Close now playing"]');
  const fsText = await page.locator('[aria-label="Close now playing"]').evaluate((el) => (el.closest('div[style*="z-index"]') || document.body).innerText);
  check(`[${tag}] full-screen player never shows the provider/licence line`, !/cyberboysumanjay|High-Quality Tamil Audio Stream/i.test(fsText), fsText.slice(0, 200));
  check(`[${tag}] toggle visible in Now Playing for a song with a video`, await page.locator('[data-testid=video-toggle]').last().isVisible());
  const vid = () => page.locator('[data-testid=mode-video]').last();
  const aud = () => page.locator('[data-testid=mode-audio]').last();

  // 3. switch to Video while PLAYING: audio stops, YouTube starts by itself at the same time, visible >=200x200, 16:9
  const tBefore = (await state(page)).audioTime;
  await vid().click();
  await page.waitForTimeout(700);
  s = await state(page);
  const calls = await page.evaluate(() => window.__yt.calls);
  const started = calls.filter((c) => c[0] === 'load' || (c[0] === 'init' && c[1].autoplay)).pop();
  check(`[${tag}] switch to Video while playing: YouTube plays by itself, audio stops`, s.ytPlaying && !s.audioPlaying, JSON.stringify(s));
  check(`[${tag}] switch to Video keeps position (start ~ audio time)`, started && Math.abs(started[1].startSeconds - tBefore) <= 1.5, `call=${JSON.stringify(started)} audioTime=${tBefore}`);
  check(`[${tag}] the embed uses youtube-nocookie.com (privacy-enhanced mode)`, await page.evaluate(() => window.__yt.host === 'https://www.youtube-nocookie.com'), await page.evaluate(() => String(window.__yt.host)));
  const container = page.locator('[data-testid=yt-player-container]');
  check(`[${tag}] YouTube container visible in video mode`, (await container.getAttribute('data-visible')) === 'true');
  const vb = await box(container);
  check(`[${tag}] video surface >= 200x200 and inside the viewport`, vb && vb.width >= 199.5 && vb.height >= 199.5 && vb.x >= 0 && vb.y >= 0 && vb.x + vb.width <= width + 0.5 && vb.y + vb.height <= height + 0.5, JSON.stringify(vb));
  const slot = await box(page.locator('[data-testid=video-slot]').last());
  // 16:9, except where 16:9 would be shorter than YouTube's 200 px minimum: then exactly 200 px tall
  check(`[${tag}] the video area is 16:9 (never below YouTube's 200 px minimum)`, slot && (slot.width * 9 / 16 >= 200 ? Math.abs(slot.width / slot.height - 16 / 9) < 0.03 : Math.abs(slot.height - 200) < 1), JSON.stringify(slot));
  const fsBtn = await box(page.locator('[data-testid=video-fullscreen]'));
  check(`[${tag}] a Full screen button (44px) under the video`, fsBtn && fsBtn.height >= 44, JSON.stringify(fsBtn));
  await page.screenshot({ path: path.join(OUT, `video-mode-${tag}.png`) });
  const notice = page.locator('[data-testid=screen-lock-notice]');
  check(`[${tag}] video shows "This song pauses when the screen locks" (with the audio hint)`, (await notice.count()) === 1 && /pauses when the screen locks/.test(await notice.innerText()) && /Switch to audio/.test(await notice.innerText()));

  // 4. switch back to Audio while playing: audio plays by itself at the same time, YouTube stops
  const ytT = (await state(page)).ytTime;
  await aud().click();
  await page.waitForTimeout(700);
  s = await state(page);
  check(`[${tag}] switch to Audio while playing: audio plays by itself, YouTube stops`, s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  check(`[${tag}] switch to Audio keeps position`, Math.abs(s.audioTime - ytT) <= 2, `audio=${s.audioTime} yt=${ytT}`);
  check(`[${tag}] and the notice is gone again on the audio engine`, (await notice.count()) === 0);

  // 5. PAUSED songs stay paused when switching either way
  await page.locator('button[aria-label="Pause"]').last().click();
  await page.waitForTimeout(400);
  await vid().click();
  await page.waitForTimeout(600);
  s = await state(page);
  check(`[${tag}] switch to Video while paused: stays paused`, !s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  await aud().click();
  await page.waitForTimeout(600);
  s = await state(page);
  check(`[${tag}] switch to Audio while paused: stays paused`, !s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  await page.locator('button[aria-label="Play"]').last().click();
  await page.waitForTimeout(700);
  s = await state(page);
  check(`[${tag}] tap play in Audio mode: only audio plays`, s.audioPlaying && !s.ytPlaying, JSON.stringify(s));

  // 6. closing Now Playing while a video plays switches to audio at the same spot (no hidden player)
  await vid().click();
  await page.waitForTimeout(700);
  const ytBeforeClose = (await state(page)).ytTime;
  await page.locator('[aria-label="Close now playing"]').click();
  await page.waitForTimeout(800);
  s = await state(page);
  check(`[${tag}] closing Now Playing during a video: audio carries on, YouTube stops`, s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  check(`[${tag}] ...at the same position`, Math.abs(s.audioTime - ytBeforeClose) <= 2, `audio=${s.audioTime} yt=${ytBeforeClose}`);
  check(`[${tag}] ...and the YouTube player is parked, not hidden while playing`, (await container.getAttribute('data-visible')) === 'false');

  // 7. an embed error while the video PLAYS: back to audio (keeps playing), toast, toggle hidden for that song, remembered here, no report for a guest
  await mini.click({ position: { x: 20, y: 10 } });
  await page.waitForSelector('[aria-label="Close now playing"]');
  await vid().click();
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__ytFail(150));
  await page.waitForSelector('[data-testid=toast]', { timeout: 3000 });
  await page.waitForTimeout(500);
  s = await state(page);
  check(`[${tag}] embed error: toast "Video isn't available for this song"`, /Video isn.t available for this song/.test(await page.locator('[data-testid=toast]').innerText()), await page.locator('[data-testid=toast]').innerText());
  check(`[${tag}] embed error: fell back to audio and keeps playing, YouTube stopped`, s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  check(`[${tag}] embed error: toggle hidden for the failed video`, (await page.locator('[data-testid=video-toggle], [data-testid=mode-video], [data-testid=mode-audio]').count()) === 0);
  check(`[${tag}] embed error: remembered in this browser (hidden for this person only)`, await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tamiltunes_video_hidden_v1') || '{}')).length === 1));
  check(`[${tag}] a guest sends no report (only signed-in people can)`, reports.length === 0, JSON.stringify(reports));
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

// Signed in: a failed embed is reported to the server once (the served video, with the YouTube error code)
async function runSignedInReport(browser) {
  const tag = 'signed in';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await setupRoutes(page);
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { success: true, user: { id: 'u1', name: 'Test User', email: 'test@example.com', role: 'user', username: 'testuser' } } }));
  await page.addInitScript(() => { localStorage.setItem('tamiltunes_token', 'TEST_TOKEN_NOT_REAL'); });
  const before = reports.length;
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('text=Badass (Leo)');
  await page.getByText('Badass (Leo)').first().click();
  await page.waitForFunction(() => { const a = window.__tamiltunes_audio; return a && !a.paused && a.currentTime > 0.3; }, null, { timeout: 8000 });
  await page.locator('[aria-label="Open now playing full screen"]').click({ position: { x: 20, y: 10 } });
  await page.waitForSelector('[aria-label="Close now playing"]');
  await page.locator('[data-testid=mode-video]').last().click();
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__ytFail(150));
  await page.waitForTimeout(800);
  const sent = reports.slice(before);
  check(`[${tag}] a failed embed is reported once, for the served video, with the error code`, sent.length === 1 && /\/api\/songs\/tt_video_1\/video-report$/.test(sent[0].url) && sent[0].body.videoId === 'IqwIOlhfCak' && sent[0].body.code === 150, JSON.stringify(sent));
  // the same person, after a reload: the video stays hidden for them (7 days) and nothing is reported again
  await page.reload();
  await page.waitForSelector('text=Badass (Leo)');
  await page.getByText('Badass (Leo)').first().click();
  await page.waitForTimeout(800);
  await page.locator('[aria-label="Open now playing full screen"]').click({ position: { x: 20, y: 10 } });
  await page.waitForSelector('[aria-label="Close now playing"]');
  check(`[${tag}] after a reload the failed video stays hidden for this person`, (await page.locator('[data-testid=video-toggle]').count()) === 0);
  check(`[${tag}] ...and is not reported again`, reports.length - before === 1);
  await ctx.close();
}

// Video settings: "Prefer video" and "Wi-Fi only video" (mobile data simulated through navigator.connection, as Chrome on Android reports it)
async function runVideoSettings(browser) {
  const tag = 'video settings';
  const open = async ({ prefs, connection }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await setupRoutes(page);
    await page.addInitScript(({ prefs, connection }) => {
      if (prefs) localStorage.setItem('tamiltunes_video_prefs_v1', JSON.stringify(prefs));
      if (connection) {
        const c = { type: connection, _l: [], addEventListener(_e, f) { this._l.push(f); }, removeEventListener() {} };
        Object.defineProperty(navigator, 'connection', { configurable: true, get: () => c });
        window.__setConnection = (t) => { c.type = t; c._l.forEach((f) => f()); };
      }
    }, { prefs, connection });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForSelector('text=Badass (Leo)');
    await page.getByText('Badass (Leo)').first().click();
    await page.waitForFunction(() => { const a = window.__tamiltunes_audio; return a && !a.paused && a.currentTime > 0.3; }, null, { timeout: 8000 });
    await page.locator('[aria-label="Open now playing full screen"]').click({ position: { x: 20, y: 10 } });
    await page.waitForSelector('[aria-label="Close now playing"]');
    await page.waitForTimeout(900);
    return { ctx, page };
  };

  // Prefer video: opening Now Playing plays the video; picking audio for this song is respected; closing goes back to audio
  let { ctx, page } = await open({ prefs: { preferVideo: true, wifiOnly: true }, connection: 'wifi' });
  let s = await state(page);
  check(`[${tag}] Prefer video: Now Playing starts the video by itself`, s.ytPlaying && !s.audioPlaying, JSON.stringify(s));
  await page.locator('[data-testid=mode-audio]').last().click();
  await page.waitForTimeout(1200);
  s = await state(page);
  check(`[${tag}] Prefer video: choosing Audio for this song is respected (not forced back to video)`, s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  await page.locator('[data-testid=mode-video]').last().click();
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__setConnection('cellular'));
  await page.waitForTimeout(900);
  s = await state(page);
  check(`[${tag}] Wi-Fi only: moving to mobile data during a video switches to audio`, s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  check(`[${tag}] ...and says why`, /Wi-Fi only/.test(await page.locator('[data-testid=toast]').innerText().catch(() => '')));
  await ctx.close();

  // Wi-Fi only on mobile data: Video does not start, nothing from YouTube is loaded
  ({ ctx, page } = await open({ prefs: { preferVideo: true, wifiOnly: true }, connection: 'cellular' }));
  s = await state(page);
  check(`[${tag}] Wi-Fi only on mobile data: Prefer video does not start a video`, s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  await page.locator('[data-testid=mode-video]').last().click();
  await page.waitForTimeout(700);
  s = await state(page);
  check(`[${tag}] Wi-Fi only on mobile data: tapping Video keeps audio and explains`, s.audioPlaying && !s.ytPlaying && /Wi-Fi only/.test(await page.locator('[data-testid=toast]').innerText().catch(() => '')), JSON.stringify(s));
  check(`[${tag}] ...and the YouTube script was never loaded`, await page.evaluate(() => typeof window.__yt === 'undefined'));
  // turning Wi-Fi only off in Video settings (Now Playing) allows it
  await page.locator('[data-testid=video-settings-button]').click();
  const sw = page.locator('[data-testid=pref-wifi-only]');
  check(`[${tag}] Video settings open from Now Playing with both switches`, (await sw.count()) === 1 && (await page.locator('[data-testid=pref-prefer-video]').count()) === 1);
  check(`[${tag}] the Video settings button is a 44px target`, ((await box(page.locator('[data-testid=video-settings-button]')))?.height || 0) >= 44);
  await sw.click();
  check(`[${tag}] the setting is saved on this device`, await page.evaluate(() => JSON.parse(localStorage.getItem('tamiltunes_video_prefs_v1')).wifiOnly === false));
  await page.locator('[data-testid=mode-video]').last().click();
  await page.waitForTimeout(700);
  s = await state(page);
  check(`[${tag}] with Wi-Fi only off, video plays on mobile data`, s.ytPlaying && !s.audioPlaying, JSON.stringify(s));
  await ctx.close();

  // defaults: Prefer video is off, so Now Playing stays on audio
  ({ ctx, page } = await open({}));
  s = await state(page);
  check(`[${tag}] by default Now Playing stays on audio (Prefer video is off)`, s.audioPlaying && !s.ytPlaying, JSON.stringify(s));
  await ctx.close();
}

// Video songs in lists: Home shelf, song card icon, Search "videos" chip, artist page. Thumbnails only: nothing from YouTube plays or loads until a tap.
async function runVideoLists(browser) {
  const tag = 'video lists';
  // several page loads in one window: block the service worker, or it would answer the mocked API itself (page.route cannot see its requests)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setupRoutes(page);
  const more = [2, 3, 4].map((i) => ({ ...SONG_VIDEO, id: `tt_video_${i}`, title: `Video Song ${i}`, videoId: `VIDEOid000${i}`.slice(0, 11) }));
  const videoSongs = [SONG_VIDEO, ...more];
  const thumbs = [];
  await page.route('https://i.ytimg.com/**', (r) => { thumbs.push(r.request().url()); return r.abort(); }); // abort: the fallback must take over
  await page.route('**/api/home**', (r) => r.fulfill({ json: { success: true, seed: 'test', hero: null, sections: [
    { id: 'videos', title: 'Video songs', display: 'video', kind: 'songs', items: videoSongs },
    { id: 'trending', title: 'Trending now', kind: 'songs', items: FEED.trending },
  ] } }));
  const searchTypes = [];
  await page.route('**/api/music/search**', (r) => { searchTypes.push(new URL(r.request().url()).searchParams.get('type')); return r.fulfill({ json: { success: true, data: { songs: [SONG_PLAIN, ...videoSongs], albums: [], artists: [], playlists: [] } } }); });
  await page.route('**/api/music/artists/**', (r) => r.fulfill({ json: { success: true, artist: { id: 'a1', name: 'Anirudh Ravichander', image: '', topSongs: [SONG_PLAIN, ...videoSongs], albums: [] } } }));

  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('section[aria-label="Video songs"]');
  const cards = page.locator('section[aria-label="Video songs"] [data-testid=video-thumb-card]');
  check(`[${tag}] Home has a "Video songs" shelf of thumbnails`, (await cards.count()) === 4);
  const img = await page.locator('section[aria-label="Video songs"] img').first().evaluate((el) => ({ loading: el.getAttribute('loading'), src: el.getAttribute('src') })).catch(() => null);
  check(`[${tag}] thumbnails use the standard YouTube thumbnail address, loaded lazily`, thumbs.some((u) => /i\.ytimg\.com\/vi\/IqwIOlhfCak\/mqdefault\.jpg$/.test(u)) && (!img || img.loading === 'lazy'), JSON.stringify({ img, thumbs: thumbs.slice(0, 2) }));
  check(`[${tag}] a thumbnail that cannot load falls back (no broken picture)`, await page.locator('section[aria-label="Video songs"] img').evaluateAll((els) => els.every((e) => !/ytimg/.test(e.src)) || els.length === 0));
  const tb = await box(cards.first());
  const pic = await box(cards.first().locator('span').first());
  check(`[${tag}] thumbnails are 16:9`, pic && Math.abs(pic.width / pic.height - 16 / 9) < 0.03, JSON.stringify(pic));
  check(`[${tag}] nothing from YouTube is loaded on Home (no autoplay, no embed)`, await page.evaluate(() => typeof window.__yt === 'undefined' && !document.getElementById('youtube-iframe-api') && !document.querySelector('iframe')));
  check(`[${tag}] a song card shows a small video icon when the song has a video`, (await page.locator('section[aria-label="Trending now"] [data-testid=song-video-icon]').count()) === 1);
  check(`[${tag}] ...and none on a song without one`, (await page.locator('section[aria-label="Trending now"] [data-testid=song-video-icon]').count()) < (await page.locator('section[aria-label="Trending now"] li, section[aria-label="Trending now"] [role=listitem], section[aria-label="Trending now"] .snap-start').count() || 2));
  await cards.first().click();
  await page.waitForSelector('[aria-label="Close now playing"]');
  await page.waitForTimeout(900);
  const s = await state(page);
  check(`[${tag}] tapping a thumbnail opens Now Playing and plays the video (the embed loads only now)`, s.ytPlaying && !s.audioPlaying, JSON.stringify(s));
  check(`[${tag}] ...at a size YouTube allows`, ((await box(page.locator('[data-testid=yt-player-container]')))?.width || 0) >= 199.5);
  await page.locator('[aria-label="Close now playing"]').click();
  await page.waitForTimeout(500);

  // Search: the "videos" chip shows only songs with a video
  await page.goto(`http://127.0.0.1:${PORT}/search?q=leo`);
  const videosChip = page.locator('button[aria-pressed]', { hasText: /^\s*videos\s*$/i }); // the filter chip, not any button mentioning videos
  await videosChip.waitFor();
  await videosChip.click();
  await page.waitForSelector('[data-testid=search-videos]');
  for (let i = 0; i < 25 && searchTypes.at(-1) !== 'songs'; i++) await page.waitForTimeout(100);
  check(`[${tag}] Search: the videos chip asks the server for songs (it has no "videos" type)`, searchTypes.at(-1) === 'songs' && !searchTypes.includes('videos'), searchTypes.join(','));
  check(`[${tag}] Search: the videos chip shows only the songs with a video`, (await page.waitForFunction(() => document.querySelectorAll('[data-testid=search-videos] [data-testid=video-thumb-card]').length === 4, null, { timeout: 5000 }).then(() => true, () => false)) && (await page.locator('text=Plain Audio Song').count()) === 0);

  // Artist page: a Videos section
  await page.goto(`http://127.0.0.1:${PORT}/artist/a1`);
  await page.waitForSelector('[data-testid=artist-videos]');
  check(`[${tag}] artist page: a Videos section with only the video songs`, (await page.locator('[data-testid=artist-videos] [data-testid=video-thumb-card]').count()) === 4);
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

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

  // scrub bubble: shows the time ONLY while a finger is on the progress bar, and seeking works
  const seekBefore = await page.evaluate(() => window.__tamiltunes_audio.currentTime);
  const sc2 = await center(slider);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sc2.x - sc2.w / 2 + 20, y: sc2.y }] });
  await page.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sc2.x + sc2.w / 4, y: sc2.y }] });
  await page.waitForTimeout(150);
  check(`[${tag}] time bubble shows while scrubbing`, await page.locator('[data-testid=scrub-time]').isVisible());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(200);
  check(`[${tag}] time bubble disappears after scrubbing`, (await page.locator('[data-testid=scrub-time]').count()) === 0);
  const seekAfter = await page.evaluate(() => window.__tamiltunes_audio.currentTime);
  check(`[${tag}] scrubbing moved the playback position`, Math.abs(seekAfter - seekBefore) > 0.5, `before=${seekBefore} after=${seekAfter}`);
  check(`[${tag}] scrubbing did not change the song`, (await titleOf()) === before, `now=${await titleOf()}`);

  // up next: on tall phones it shows the following song, tapping it plays it, and it is hidden on the last song.
  // On short screens (<= 700px tall) it is hidden on purpose so the controls stay on screen.
  const upNext = page.locator('[data-testid=up-next]');
  if (height <= 700) {
    check(`[${tag}] up-next card is hidden on a short screen (controls stay on screen)`, !(await upNext.isVisible()));
    const ctl = await center(page.locator('[data-testid=fs-play]'));
    check(`[${tag}] transport controls fit inside the short screen`, ctl.y + ctl.h / 2 <= height, `controls bottom=${ctl.y + ctl.h / 2} of ${height}`);
  } else {
    check(`[${tag}] up-next card shows the following song`, (await upNext.count()) === 1 && /Plain Audio Song/.test(await upNext.innerText()), await upNext.innerText().catch(() => 'none'));
    await upNext.click(); // tapping the card opens the queue (it no longer skips ahead)
    await page.waitForTimeout(500);
    check(`[${tag}] tapping up-next opens the queue`, await page.locator('[data-testid=fs-queue]').isVisible());
    await page.getByRole('button', { name: 'Show now playing' }).click();
    await page.getByRole('button', { name: 'Next track' }).click();
    await page.waitForTimeout(500);
    check(`[${tag}] the next song plays`, (await titleOf()) === 'Plain Audio Song', `now=${await titleOf()}`);
    check(`[${tag}] up-next is hidden on the last song`, (await page.locator('[data-testid=up-next]').count()) === 0);
  }

  // swipe DOWN on the artwork closes the player
  const ac3 = await center(art);
  await swipe(page, { x: ac3.x, y: ac3.y - 40 }, { x: ac3.x, y: ac3.y + 150 });
  await page.waitForTimeout(500);
  check(`[${tag}] swipe down on the artwork closes the player`, (await page.locator('[aria-label="Close now playing"]').count()) === 0);

  // queue: a bottom sheet on phones; swipe down on its handle or tap the dimmed page to close; no broken pictures
  await mini.click({ position: { x: 20, y: 10 } });
  await page.waitForSelector('[aria-label="Close now playing"]', { timeout: 3000 });
  await page.locator('[aria-label="Open queue"]').click();
  await page.locator('[data-testid=fs-queue]').waitFor({ timeout: 3000 });
  check(`[${tag}] Open queue shows a Queue tab inside Now Playing`, await page.locator('[data-testid=fs-queue] [role=tab]').count() === 2);
  await page.locator('[aria-label="Show now playing"]').click();
  await page.waitForTimeout(200);
  check(`[${tag}] the queue tab can be closed again from inside Now Playing`, (await page.locator('[data-testid=fs-queue]').count()) === 0);
  await page.locator('[aria-label="Close now playing"]').click();
  await page.waitForTimeout(400);

  // Queue as a bottom sheet on phones (opened from the mini player)
  await page.locator('[aria-label="Show queue"]').click();
  const sheet = page.locator('[data-testid=queue-sheet]');
  await sheet.waitFor({ timeout: 3000 });
  await page.waitForTimeout(450); // slide-in animation
  const sb = await sheet.boundingBox();
  check(`[${tag}] queue opens as a bottom sheet (full width, anchored to the bottom)`, sb && Math.abs(sb.width - width) < 2 && Math.abs(sb.y + sb.height - height) < 2 && sb.height < height * 0.85, JSON.stringify(sb));
  const broken = await sheet.evaluate((el) => [...el.querySelectorAll('img')].filter((i) => !(i.complete && i.naturalWidth > 0)).length);
  check(`[${tag}] queue pictures are never broken (placeholder when there is no cover)`, broken === 0, `${broken} broken`);
  const handle = await center(page.locator('[data-testid=queue-sheet] > div').first());
  await swipe(page, { x: handle.x, y: handle.y }, { x: handle.x, y: handle.y + 160 });
  await page.waitForTimeout(400);
  check(`[${tag}] swiping down on the queue handle closes it`, (await page.locator('[data-testid=queue-sheet]').count()) === 0);
  await page.locator('[aria-label="Show queue"]').click();
  await page.locator('[data-testid=queue-sheet]').waitFor({ timeout: 3000 });
  await page.waitForTimeout(450);
  await page.touchscreen.tap(width / 2, 20); // the dimmed page above the sheet
  await page.waitForTimeout(400);
  if ((await page.locator('[data-testid=queue-sheet]').count()) > 0) {
    await page.locator('div[style*="z-index: 100000"] > div.absolute').click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }
  check(`[${tag}] tapping the dimmed page closes the queue`, (await page.locator('[data-testid=queue-sheet]').count()) === 0);

  // "Add to playlist" button closes the full-screen layer (the dialog sits below it)
  await mini.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await mini.click({ position: { x: 20, y: 10 } });
  await page.waitForSelector('[aria-label="Close now playing"]', { timeout: 3000 });
  const addBtn = page.locator('button[aria-label="Add to playlist"]').last();
  check(`[${tag}] "Add to playlist" button is shown in the full-screen player`, await addBtn.isVisible());
  await addBtn.click();
  await page.waitForTimeout(400);
  check(`[${tag}] "Add to playlist" closes the full-screen player`, (await page.locator('[aria-label="Close now playing"]').count()) === 0);

  // Explore: compact tiles, so several fit on one screen
  await page.goto(`http://127.0.0.1:${PORT}/explore`);
  await page.waitForSelector('text=Explore Tamil music');
  await page.waitForTimeout(900);
  const tiles = await page.locator('div.stagger > button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }));
  const onScreen = tiles.filter((t) => t.top >= 0 && t.bottom <= height - 64).length;
  check(`[${tag}] Explore fits at least 4 tiles on one screen`, tiles.length >= 8 && onScreen >= 4, `tiles=${tiles.length} onScreen=${onScreen}`);

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
  const only = process.env.UI_AUDIT_ONLY; // optional: viewports | report | settings | lists
  if (!only || only === 'viewports') {
    for (const [w, h] of [[360, 640], [390, 844]]) {
      await runViewport(browser, w, h);
      await runGestures(browser, w, h);
    }
  }
  if (!only || only === 'report') await runSignedInReport(browser);
  if (!only || only === 'settings') await runVideoSettings(browser);
  if (!only || only === 'lists') await runVideoLists(browser);
} catch (err) {
  console.error("UI audit crashed:", String(err.message).split("\n").slice(0,12).join("\n"));
  results.push({ name: 'audit run', ok: false, detail: String(err) });
} finally {
  await browser?.close();
  if (server) { try { if (process.platform === 'win32') server.kill(); else process.kill(-server.pid); } catch { /* already gone */ } }
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
