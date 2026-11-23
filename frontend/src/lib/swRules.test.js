import { describe, it, expect } from 'vitest';
import { PUBLIC_API, isStreamRequest, isCacheableApi } from './swRules';
import { wasDismissed, rememberDismissed, DISMISS_KEY, DISMISS_DAYS } from './pwa';

const req = (headers = {}, destination = '') => ({ headers: new Headers(headers), destination });
const url = (u) => new URL(u, 'https://app.example');

describe('what the service worker may cache', () => {
  it('only the public music endpoints are cacheable', () => {
    for (const p of ['/api/music/home', '/api/music/search', '/api/music/albums/abc', '/api/music/artists/xyz']) expect(isCacheableApi('GET', url(p))).toBe(true);
  });
  it('never auth, personal data, admin, the song/stream endpoints or writes', () => {
    for (const p of ['/api/auth/login', '/api/auth/me', '/api/me/queue', '/api/home', '/api/admin/users', '/api/favorites', '/api/history', '/api/playlists/1',
      '/api/profile/me', '/api/music/song/abc', '/api/music/songs/abc', '/api/music/stream', '/api/songs/1/related']) expect(isCacheableApi('GET', url(p))).toBe(false);
    expect(isCacheableApi('POST', url('/api/music/search'))).toBe(false);
    expect(PUBLIC_API.test('/api/music/search/extra')).toBe(false);
  });
  it('audio and video streams are never cached', () => {
    expect(isStreamRequest(req({ Range: 'bytes=0-' }), url('/anything.mp4'))).toBe(true);
    expect(isStreamRequest(req({}, 'audio'), url('/x'))).toBe(true);
    expect(isStreamRequest(req(), url('/api/music/stream?u=1'))).toBe(true);
    expect(isStreamRequest(req(), url('https://aac.saavncdn.com/123_320.mp4'))).toBe(true);
    expect(isStreamRequest(req(), url('https://rr1.googlevideo.com/videoplayback'))).toBe(true);
    expect(isStreamRequest(req(), url('/local-songs/a.mp3'))).toBe(true);
  });
  it('covers from the audio CDN are pictures and may be cached', () => {
    expect(isStreamRequest(req({}, 'image'), url('https://c.saavncdn.com/cover.jpg'))).toBe(false);
  });
  it('nothing from YouTube is touched, thumbnails included', () => {
    for (const u of ['https://i.ytimg.com/vi/AbCdEfGhIj1/mqdefault.jpg', 'https://yt3.ggpht.com/a.jpg', 'https://www.youtube.com/embed/AbCdEfGhIj1', 'https://www.youtube-nocookie.com/embed/AbCdEfGhIj1', 'https://rr1---sn-x.googlevideo.com/videoplayback']) {
      for (const dest of ['', 'image', 'iframe', 'script', 'video']) expect(isStreamRequest(req({}, dest), url(u)), `${u} (${dest})`).toBe(true);
    }
  });
});

describe('install prompt memory', () => {
  const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
  it('"Not now" is remembered for 30 days', () => {
    const s = store();
    expect(wasDismissed(s)).toBe(false);
    rememberDismissed(s, 1_000_000);
    expect(wasDismissed(s, 1_000_000 + 86400e3)).toBe(true);
    expect(wasDismissed(s, 1_000_000 + (DISMISS_DAYS + 1) * 86400e3)).toBe(false);
  });
  it('broken storage never throws', () => {
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(wasDismissed(bad)).toBe(false);
    expect(() => rememberDismissed(bad)).not.toThrow();
    expect(DISMISS_KEY).toBeTruthy();
  });
});
