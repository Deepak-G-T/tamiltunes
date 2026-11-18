import assert from 'node:assert/strict';
import app from '../src/app.js';
import { config } from '../src/config/env.js';
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
  assert.equal(v.peek({ id: 'x', title: 'Badass (From "Leo")', artist: 'Anirudh Ravichander' }), 'ZdMZ40GSVmc');
  assert.equal(v.peek({ id: 'x', title: 'Badass', artist: 'Some Random Band' }), undefined, 'title alone is not enough');
  assert.equal(v.peek({ id: 'x', title: 'Hukum - Thalaivar Alappara', artist: 'Anirudh' }), 'gB2zKZxESTg');
  // lyric-video ids and older conflicting ids stay in the file as candidates but are never served
  for (const lyricId of ['1F3hm6MfR1k', '1F3HM635S0k', 'RVLNBVK8auM', 'szvt1vD0Uug', 'fRD_3vJagxk', 'xsbLtHql4g8', 'IqwIOlhfCak']) {
    assert.ok(CURATED_VIDEOS.some((e) => e.videoId === lyricId && e.candidate), `candidate kept: ${lyricId}`);
    assert.ok(!CURATED_VIDEOS.some((e) => e.videoId === lyricId && !e.candidate), `never served: ${lyricId}`);
  }
  assert.equal(CURATED_VIDEOS.filter((e) => !e.candidate).length, 9, '9 songs served');
  assert.equal(CURATED_VIDEOS.filter((e) => e.candidate).length, 7, '7 candidates kept, not served');
  assert.ok(CURATED_VIDEOS.every((e) => typeof e.status === 'string' && /unverified/.test(e.status)), 'every entry states what is unverified');
  const input = Object.freeze({ id: 'x', title: 'Naa Ready', artist: 'Vijay' });
  const [out] = v.attach([input]);
  assert.equal(out.videoId, '5Qk6Xc2ZVkI');
  assert.equal(input.videoId, undefined);
  assert.equal(normalizeTitle('Kaavaalaa (From "Jailer")'), 'kaavaalaa');
  console.log('✓ curated map matching, unverified Hukum candidate not served');
}

// 9. title matching tolerates real JioSaavn formats but rejects other recordings
{
  const v = createVideoLookup({ cfg: cfgWith({ youtubeApiKey: '' }) });
  const hit = (title, artist) => v.peek({ id: 'saavn_x', title, artist, singers: artist });
  const should = [
    ['Hukum - Thalaivar Alappara (From "Jailer")', 'Anirudh Ravichander, Super Subu', 'gB2zKZxESTg'],
    ['Aalaporan Thamizhan (From "Mersal")', 'A.R. Rahman', 'UN7HgzJsFZA'], // one-typo spelling
    ['Arabic Kuthu - Halamithi Habibo (From "Beast")', 'Anirudh Ravichander, Jonita Gandhi', 'KUN5Uf9mObQ'],
    ['Kaavaalaa - Kaavaalaa (From "Jailer")', 'Shilpa Rao, Anirudh Ravichander', 'lM8h5Mm6ODo'],
    ['Kavaalaa (From "Jailer")', 'Anirudh Ravichander', 'lM8h5Mm6ODo'],
    ['Why This Kolaveri Di - The Soup of Love', 'Dhanush, Anirudh Ravichander', 'YR12Z8f1Dh8'],
    ['Vaathi Coming (From "Master")', 'Anirudh Ravichander, Gana Balachandar', 'nIYZ4nbWq7w'],
    ['Rowdy Baby (From "Maari 2")', 'Dhanush, Dhee', 'x6Q7c9RyMzk']
  ];
  for (const [t, a, id] of should) assert.equal(hit(t, a), id, `should match: ${t}`);

  const shouldNot = [
    ['Badass (Remix)', 'Anirudh Ravichander'], // junk word inside brackets
    ['Badass Remix (From "Leo")', 'Anirudh Ravichander'],
    ['Hukum Lofi Flip', 'Anirudh Ravichander'],
    ['Naa Ready (Cover)', 'Anirudh Ravichander'],
    ['Vaathi Coming - Live', 'Anirudh Ravichander'],
    ['Badass Lover', 'Anirudh Ravichander'], // different song sharing a first word
    ['Hukumath', 'Anirudh Ravichander'],
    ['Maa Ready', 'Anirudh Ravichander'], // fuzzy match is not allowed on short titles
    ['Badass (From "Leo")', 'Some Random Band'] // right title, wrong artist
  ];
  for (const [t, a] of shouldNot) assert.equal(hit(t, a), undefined, `should NOT match: ${t}`);
  console.log('✓ title matching: JioSaavn variants match, remixes/covers/lookalikes rejected');
}

// 10. API lookup prefers the official video song and rejects lyric/audio uploads
{
  const mkItems = (...ids) => ids.map((id) => ({ id: { videoId: id } }));
  const vid = (id, title, channelId = OFFICIAL) => ({
    id, status: { embeddable: true, privacyStatus: 'public' }, snippet: { channelId, title }
  });
  const run = async (details, items) => {
    const f = mkFetch({ items, details });
    const v = createVideoLookup({ fetchImpl: f, cfg: cfgWith() });
    return v.lookup({ id: 'saavn_q', title: 'Some Unmapped Song', artist: 'Someone' });
  };
  const A = 'AAAAAAAAAAA', B = 'BBBBBBBBBBB', C = 'CCCCCCCCCCC';

  // lyric video listed first, official video second -> official wins
  assert.equal(await run([vid(A, 'Some Song - Lyric Video | Film'), vid(B, 'Some Song - Video Song | Film')], mkItems(A, B)), B);
  // only a lyric video exists -> nothing is returned (we want the video song, not the lyric video)
  assert.equal(await run([vid(A, 'Some Song (Lyrical)')], mkItems(A)), null);
  // audio-only / jukebox / teaser / live rejected
  assert.equal(await run([vid(A, 'Some Song (Official Audio)')], mkItems(A)), null);
  assert.equal(await run([vid(A, 'Film - Jukebox')], mkItems(A)), null);
  assert.equal(await run([vid(A, 'Some Song Live at Concert')], mkItems(A)), null);
  // "Official Video" beats a plain title; ties keep search order
  assert.equal(await run([vid(A, 'Some Song | Film'), vid(B, 'Some Song (Official Video)')], mkItems(A, B)), B);
  assert.equal(await run([vid(A, 'Some Song | Film'), vid(B, 'Some Song | Film Reprise Cut')], mkItems(A, B)), A);
  // a lyric video on a NON-allow-listed channel never wins either
  assert.equal(await run([vid(A, 'Some Song - Video Song', 'UC_not_allowed')], mkItems(A)), null);
  // the query asks for the official video song
  const f = mkFetch({ items: mkItems(A), details: [vid(A, 'Some Song - Video Song')] });
  await createVideoLookup({ fetchImpl: f, cfg: cfgWith() }).lookup({ id: 'x', title: 'Zzz Song', artist: 'Aaa' });
  assert.match(f.calls[0].searchParams.get('q'), /official video song/);
  console.log('✓ API lookup: official video song preferred, lyric/audio/live uploads rejected');
}

// 11. channel uploads index: cheap catalogue matching for songs outside the curated map
{
  const CH = `UC${'a'.repeat(22)}`;
  const V = (n) => `VID_${String(n).padStart(7, '0')}`; // 11-char video ids
  const json = (body) => ({ ok: true, status: 200, json: async () => body });
  const mkIndexFetch = ({ uploads, statuses = {}, searchItems = [], searchDetails = [] }) => {
    const calls = [];
    const fn = async (url) => {
      const u = new URL(url);
      const name = u.pathname.split('/').pop();
      calls.push({ name, params: u.searchParams });
      if (name === 'playlistItems') {
        return json({ items: uploads.map(([n, title]) => ({ contentDetails: { videoId: V(n) }, snippet: { title } })) });
      }
      if (name === 'videos') {
        const ids = u.searchParams.get('id').split(',');
        const part = u.searchParams.get('part');
        return json({
          items: ids.map((id) => {
            const hit = searchDetails.find((d) => d.id === id);
            return hit || { id, status: statuses[id] || { embeddable: true, privacyStatus: 'public' }, snippet: { channelId: CH, title: '' } };
          })
        });
      }
      if (name === 'search') return json({ items: searchItems });
      return { ok: false, status: 404, json: async () => ({}) };
    };
    fn.calls = calls;
    return fn;
  };
  const uploads = [
    [1, 'JAILER - Hukum Lyric Video'],
    [2, 'JAILER - Hukum Video Song'],
    [3, 'JAILER - Hukum (Official Audio)'],
    [4, 'LEO - Naa Ready Video Song'],
    [5, 'Master - Vaathi Coming 8K/4K Video Song'],
    [6, 'LEO - Badass Video Song'],
    [7, 'Leo Official Trailer']
  ];
  const statuses = { [V(6)]: { embeddable: false, privacyStatus: 'public' } };
  const cfg = (over = {}) => ({
    youtubeApiKey: 'k', videoChannelAllowlist: [CH], youtubeDailyBudget: 5000,
    videoIndexMaxPages: 2, videoSearchFallback: false, ...over
  });
  const mk = (over = {}, fetchOpts = {}) => {
    const f = mkIndexFetch({ uploads, statuses, ...fetchOpts });
    return { f, v: createVideoLookup({ fetchImpl: f, cfg: cfg(over), curated: [] }) }; // curated map off: test the index alone
  };
  const song = (title, album, artist = 'Anirudh Ravichander') => ({ id: `saavn_${title}`, title, album, artist });

  // a) matches by title, picks the video song over lyric/audio, costs 2 API calls (no per-song search)
  {
    const { f, v } = mk();
    assert.equal(await v.lookup(song('Hukum - Thalaivar Alappara', 'Jailer')), V(2));
    assert.deepEqual(f.calls.map((c) => c.name), ['playlistItems', 'videos']);
    assert.equal(f.calls[0].params.get('playlistId'), `UU${'a'.repeat(22)}`); // uploads playlist of the channel
    // the index is now in memory: a different song of the same film is matched with NO network
    assert.equal(v.peek(song('Hukum (From "Jailer")', 'Jailer')), V(2));
    // second lookups do not re-read the channel
    await v.lookup(song('Naa Ready', 'Leo'));
    assert.equal(f.calls.filter((c) => c.name === 'playlistItems').length, 1);
  }
  // b) two-word title needs no film match; one-word title needs the film name too
  {
    const { v } = mk();
    await v.lookup(song('Whatever', 'X')); // loads the index
    assert.equal(v.peek(song('Naa Ready', 'Some Album')), V(4));
    assert.equal(v.peek(song('Hukum', 'Jailer')), V(2));
    assert.equal(v.peek(song('Hukum', 'Other Film')), undefined);
    assert.equal(v.peek(song('Leo', 'Leo')), undefined, 'title equal to the film name is ambiguous');
  }
  // c) remixes/covers never get the official video; non-embeddable and lyric-only uploads are not served
  {
    const { v } = mk();
    await v.lookup(song('Whatever', 'X'));
    assert.equal(v.peek(song('Hukum (Remix)', 'Jailer')), undefined);
    assert.equal(v.peek(song('Naa Ready (Cover)', 'Leo')), undefined);
    assert.equal(v.peek(song('Badass', 'Leo')), undefined, 'non-embeddable upload excluded');
    assert.equal(v.peek(song('Vaathi Coming', 'Master')), V(5));
  }
  const only = (rows) => mkIndexFetch({ uploads: rows });
  {
    const f = only([[1, 'JAILER - Hukum Lyric Video'], [2, 'JAILER - Hukum (Official Audio)']]);
    const v = createVideoLookup({ fetchImpl: f, cfg: cfg(), curated: [] });
    assert.equal(await v.lookup(song('Hukum - Thalaivar Alappara', 'Jailer')), null, 'lyric/audio only -> no video');
  }
  // d) turned off / unsafe configs make no calls
  for (const over of [{ videoIndexMaxPages: 0 }, { videoChannelAllowlist: [] }, { youtubeApiKey: '' }, { videoChannelAllowlist: ['UC_short'] }, { youtubeDailyBudget: 0 }]) {
    const { f, v } = mk(over);
    await v.lookup(song('Hukum - Thalaivar Alappara', 'Jailer'));
    assert.equal(f.calls.filter((c) => c.name === 'playlistItems').length, 0, `no index calls for ${JSON.stringify(over)}`);
  }
  // e) quota: the whole channel index costs a handful of units, far below one per-song search
  {
    const { v } = mk();
    await v.lookup(song('Hukum - Thalaivar Alappara', 'Jailer'));
    assert.ok(v._budget.used <= 3, `index load used ${v._budget.used} quota units`);
  }
  // f) concurrent lookups share a single index load
  {
    const { f, v } = mk();
    await Promise.all([1, 2, 3, 4].map(() => v.lookup(song('Hukum - Thalaivar Alappara', 'Jailer'))));
    assert.equal(f.calls.filter((c) => c.name === 'playlistItems').length, 1);
  }
  // g) index miss falls back to the per-song search only when VIDEO_SEARCH_FALLBACK is on
  {
    const { f, v } = mk({ videoSearchFallback: true }, { searchItems: [{ id: { videoId: V(9) } }], searchDetails: [{ id: V(9), status: { embeddable: true, privacyStatus: 'public' }, snippet: { channelId: CH, title: 'Zzz - Video Song' } }] });
    assert.equal(await v.lookup(song('Totally Unindexed Song', 'Nowhere')), V(9));
    assert.ok(f.calls.some((c) => c.name === 'search'));
    const off = mk({ videoSearchFallback: false });
    assert.equal(await off.v.lookup(song('Totally Unindexed Song', 'Nowhere')), null);
    assert.ok(!off.f.calls.some((c) => c.name === 'search'), 'no per-song search when the fallback is off');
  }
  // h) attach() picks up indexed videos without mutating inputs, once the index is loaded
  {
    const { v } = mk();
    await v.lookup(song('Whatever', 'X'));
    const input = Object.freeze(song('Naa Ready', 'Leo'));
    const [out] = v.attach([input]);
    assert.equal(out.videoId, V(4));
    assert.equal(input.videoId, undefined);
  }
  console.log('✓ channel index: matches the whole catalogue cheaply, official video songs only, off unless configured');
}

// ---- HTTP level: home/search/song carry videoId, existing fields unchanged ----
await initDb();
musicService.setProvider('mock');
musicCache.clear();
const server = app.listen(5004);
const BASE = 'http://localhost:5004/api/music';
const origRequireLogin = config.requireLogin;
try {
  config.requireLogin = false;
  const home = await fetch(`${BASE}/home`).then((r) => r.json());
  const badass = home.data.trending.find((s) => /badass/i.test(s.title));
  assert.ok(badass, 'mock home has Badass');
  assert.equal(badass.videoId, 'ZdMZ40GSVmc');
  assert.ok(badass.id && badass.title && badass.streamUrl, 'existing fields intact');

  const search = await fetch(`${BASE}/search?query=Badass`).then((r) => r.json());
  assert.ok(search.data.songs.some((s) => s.videoId === 'ZdMZ40GSVmc'));

  const one = await fetch(`${BASE}/song/${badass.id}`).then((r) => r.json());
  assert.equal(one.success, true);
  assert.equal(one.data.videoId, 'ZdMZ40GSVmc'); // pre-existing response shape: { success, data }
  assert.equal(one.data.title, badass.title);
  const alias = await fetch(`${BASE}/songs/${badass.id}`).then((r) => r.json());
  assert.equal(alias.data.videoId, 'ZdMZ40GSVmc');

  assert.equal((await fetch(`${BASE}/song/does_not_exist`)).status, 404);
  assert.equal((await fetch(`${BASE}/song/${encodeURIComponent('a b/../c')}`)).status, 400);
  // fresh=1 keeps working for guests (expired-stream recovery); abuse is limited by songLimiter instead
  const fresh = await fetch(`${BASE}/song/${badass.id}?fresh=1`);
  assert.equal(fresh.status, 200);
  assert.equal((await fresh.json()).data.videoId, 'ZdMZ40GSVmc');
  // cached feed objects must not have been mutated by enrichment
  const raw = await musicService.getHomeFeed();
  assert.equal(raw.trending.find((s) => /badass/i.test(s.title)).videoId, badass.source === 'youtube' ? badass.videoId : undefined);
  console.log('✓ home / search / song responses carry videoId; fresh=1 still works for guests');
} finally {
  config.requireLogin = origRequireLogin;
  server.close();
}
