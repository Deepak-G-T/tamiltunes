import assert from 'node:assert/strict';
import app from '../src/app.js';
import { initDb } from '../src/prisma/client.js';
import { musicService } from '../src/services/music/providerManager.js';
import { musicCache } from '../src/services/cacheService.js';
import { createVideoLookup, normalizeTitle } from '../src/services/music/videoLookup.js';
import { CURATED_VIDEOS } from '../src/services/music/curatedVideos.js';

// ---- fake YouTube API ----
const OFFICIAL = 'UC_official_channel';
const mkFetch = ({ items, details }) => {
  const calls = [];
  const fn = async (url) => {
    const u = new URL(url);
    calls.push(u);
    const path = u.pathname.split('/').pop();
    const body = path === 'search' ? { items } : { items: details };
    return { ok: true, status: 200, json: async () => body };
  };
  fn.calls = calls;
  return fn;
};
const searchItems = [{ id: { videoId: 'AAAAAAAAAAA' } }];
const detail = (over = {}) => [{
  id: 'AAAAAAAAAAA',
  status: { embeddable: true, privacyStatus: 'public' },
  snippet: { channelId: OFFICIAL },
  ...over
}];
const song = { id: 'js_1', title: 'Some Unmapped Song', artist: 'Someone' };
const cfgWith = (over = {}) => ({
  youtubeApiKey: 'test-key', videoChannelAllowlist: [OFFICIAL], youtubeDailyBudget: 5000, ...over
});

// 1. no key -> no network at all, null result, nothing cached
{
  const f = mkFetch({ items: searchItems, details: detail() });
  const v = createVideoLookup({ fetchImpl: f, cfg: cfgWith({ youtubeApiKey: '' }) });
  assert.equal(await v.lookup(song), null);
  assert.equal(f.calls.length, 0);
  assert.equal(v.peek(song), undefined);
  console.log('✓ no API key: no network calls, no result');
}

// 2. key but empty allow-list -> fail closed, no network
{
  const f = mkFetch({ items: searchItems, details: detail() });
  const v = createVideoLookup({ fetchImpl: f, cfg: cfgWith({ videoChannelAllowlist: [] }) });
  assert.equal(await v.lookup(song), null);
  assert.equal(f.calls.length, 0);
  console.log('✓ empty allow-list: rejects everything, no network calls');
}

// 3. official + embeddable accepted; second lookup is served from cache (no extra API calls)
{
  const f = mkFetch({ items: searchItems, details: detail() });
  const v = createVideoLookup({ fetchImpl: f, cfg: cfgWith() });
  assert.equal(await v.lookup(song), 'AAAAAAAAAAA');
  const callsAfterFirst = f.calls.length;
  assert.equal(callsAfterFirst, 2); // search + videos.list
  assert.equal(await v.lookup(song), 'AAAAAAAAAAA');
  assert.equal(v.peek(song), 'AAAAAAAAAAA');
  assert.equal(f.calls.length, callsAfterFirst);
  assert.ok(f.calls.every((u) => u.searchParams.get('key') === 'test-key'));
  console.log('✓ official embeddable video accepted and cached');
}

// 4. non-official channel rejected, and the "none" result is cached
{
  const f = mkFetch({ items: searchItems, details: detail({ snippet: { channelId: 'UC_someone_else' } }) });
  const v = createVideoLookup({ fetchImpl: f, cfg: cfgWith() });
  assert.equal(await v.lookup(song), null);
  const n = f.calls.length;
  assert.equal(await v.lookup(song), null);
  assert.equal(f.calls.length, n, 'negative result must be cached');
  assert.equal(v.peek(song), null); // known-none, not unknown
  console.log('✓ non-official channel rejected; "no video" cached');
}

// 5. non-embeddable and private rejected
for (const over of [{ status: { embeddable: false, privacyStatus: 'public' } }, { status: { embeddable: true, privacyStatus: 'private' } }, { status: {} }]) {
  const f = mkFetch({ items: searchItems, details: detail(over) });
  const v = createVideoLookup({ fetchImpl: f, cfg: cfgWith() });
  assert.equal(await v.lookup(song), null);
}
console.log('✓ non-embeddable / non-public / missing status rejected');

// 6. 24h TTL for results, short TTL for errors (injected clock)
{
  let t = 1_000_000;
  const f = mkFetch({ items: searchItems, details: detail() });
  const cache = new (await import('../src/services/cacheService.js')).LruCacheService(100, 86400);
  const realNow = Date.now;
  Date.now = () => t;
  try {
    const v = createVideoLookup({ fetchImpl: f, cfg: cfgWith(), cache, now: () => t });
    await v.lookup(song);
    t += 23 * 3600 * 1000;
    assert.equal(v.peek(song), 'AAAAAAAAAAA', 'still cached at 23h');
    t += 2 * 3600 * 1000;
    assert.equal(v.peek(song), undefined, 'expired after 24h');
  } finally { Date.now = realNow; }
  const failing = async () => { throw new Error('network down'); };
  const v2 = createVideoLookup({ fetchImpl: failing, cfg: cfgWith() });
  assert.equal(await v2.lookup(song), null);
  assert.equal(v2.peek(song), null);
  console.log('✓ 24h TTL, errors cached briefly and never thrown');
}

// 7. concurrent lookups share one API call; daily budget enforced and configurable
{
  const f = mkFetch({ items: searchItems, details: detail() });
  const v = createVideoLookup({ fetchImpl: f, cfg: cfgWith() });
  await Promise.all([v.lookup(song), v.lookup(song), v.lookup(song)]);
  assert.equal(f.calls.length, 2, 'single in-flight lookup');

  const f2 = mkFetch({ items: searchItems, details: detail() });
  const v2 = createVideoLookup({ fetchImpl: f2, cfg: cfgWith({ youtubeDailyBudget: 150 }) });
  await v2.lookup({ id: 'a', title: 'Song A', artist: 'X' }); // costs 101
  await v2.lookup({ id: 'b', title: 'Song B', artist: 'X' }); // would exceed 150
  assert.equal(f2.calls.length, 2);
  assert.equal(v2.stats.skippedNoBudget, 1);
  assert.equal(v2.peek({ id: 'b', title: 'Song B', artist: 'X' }), undefined, 'budget skip is not cached');
  const f3 = mkFetch({ items: searchItems, details: detail() });
  const v3 = createVideoLookup({ fetchImpl: f3, cfg: cfgWith({ youtubeDailyBudget: 0 }) });
  await v3.lookup(song);
  assert.equal(f3.calls.length, 0);
  console.log('✓ in-flight dedupe and YOUTUBE_DAILY_BUDGET enforced');
}

// 8. curated map: matching rules, candidate not served, inputs not mutated
{
  const v = createVideoLookup({ cfg: cfgWith({ youtubeApiKey: '' }) });
  assert.equal(v.peek({ id: 'x', title: 'Badass (From "Leo")', artist: 'Anirudh Ravichander' }), 'IqwIOlhfCak');
  assert.equal(v.peek({ id: 'x', title: 'Badass', artist: 'Some Random Band' }), undefined, 'title alone is not enough');
  assert.equal(v.peek({ id: 'x', title: 'Hukum - Thalaivar Alappara', artist: 'Anirudh' }), '1F3hm6MfR1k');
  assert.ok(CURATED_VIDEOS.some((e) => e.videoId === '1F3HM635S0k' && e.candidate), 'conflicting candidate kept');
  assert.ok(!CURATED_VIDEOS.some((e) => e.videoId === '1F3HM635S0k' && !e.candidate), 'old id never served');
  assert.equal(CURATED_VIDEOS.length, 10); // 9 owner ids + 1 extra Hukum candidate
  assert.ok(CURATED_VIDEOS.every((e) => /embeddability unverified/.test(e.status)));
  const input = Object.freeze({ id: 'x', title: 'Naa Ready', artist: 'Vijay' });
  const [out] = v.attach([input]);
  assert.equal(out.videoId, 'szvt1vD0Uug');
  assert.equal(input.videoId, undefined);
  assert.equal(normalizeTitle('Kaavaalaa (From "Jailer")'), 'kaavaalaa');
  console.log('✓ curated map matching, unverified Hukum candidate not served');
}

// ---- HTTP level: home/search/song carry videoId, existing fields unchanged ----
await initDb();
musicService.setProvider('mock');
musicCache.clear();
const server = app.listen(5004);
const BASE = 'http://localhost:5004/api/music';
try {
  const home = await fetch(`${BASE}/home`).then((r) => r.json());
  const badass = home.data.trending.find((s) => /badass/i.test(s.title));
  assert.ok(badass, 'mock home has Badass');
  assert.equal(badass.videoId, 'IqwIOlhfCak');
  assert.ok(badass.id && badass.title && badass.streamUrl, 'existing fields intact');

  const search = await fetch(`${BASE}/search?query=Badass`).then((r) => r.json());
  assert.ok(search.data.songs.some((s) => s.videoId === 'IqwIOlhfCak'));

  const one = await fetch(`${BASE}/song/${badass.id}`).then((r) => r.json());
  assert.equal(one.success, true);
  assert.equal(one.data.videoId, 'IqwIOlhfCak'); // pre-existing response shape: { success, data }
  assert.equal(one.data.title, badass.title);
  const alias = await fetch(`${BASE}/songs/${badass.id}`).then((r) => r.json());
  assert.equal(alias.data.videoId, 'IqwIOlhfCak');

  assert.equal((await fetch(`${BASE}/song/does_not_exist`)).status, 404);
  assert.equal((await fetch(`${BASE}/song/${encodeURIComponent('a b/../c')}`)).status, 400);
  // fresh=1 keeps working for guests (expired-stream recovery); abuse is limited by songLimiter instead
  const fresh = await fetch(`${BASE}/song/${badass.id}?fresh=1`);
  assert.equal(fresh.status, 200);
  assert.equal((await fresh.json()).data.videoId, 'IqwIOlhfCak');
  // cached feed objects must not have been mutated by enrichment
  const raw = await musicService.getHomeFeed();
  assert.equal(raw.trending.find((s) => /badass/i.test(s.title)).videoId, badass.source === 'youtube' ? badass.videoId : undefined);
  console.log('✓ home / search / song responses carry videoId; fresh=1 still works for guests');
} finally {
  server.close();
}
