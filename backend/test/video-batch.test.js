import assert from 'node:assert/strict';
import { createVideoLookup, songKey } from '../src/services/music/videoLookup.js';
import { runBatch } from '../src/services/videoBatch/run.js';
import { createMemoryStore } from '../src/services/videoMatches/store.js';
import { createVideoMatchService, NONE_TTL_DAYS } from '../src/services/videoMatches/service.js';

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa'; // UC + 22 characters
const vid = (n) => `vid${String(n).padStart(8, '0')}`;

// A fake YouTube: one channel with a few uploads; searches answer from a table; every call is counted.
const makeYouTube = ({ uploads = [], searches = {} } = {}) => {
  const calls = { playlistItems: 0, videos: 0, search: 0 };
  const titleOf = new Map(uploads.map((u) => [u.id, u.title]));
  for (const hits of Object.values(searches)) for (const h of hits) titleOf.set(h.id, h.title);
  const json = (body) => ({ ok: true, status: 200, json: async () => body });
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const path = u.pathname.split('/').pop();
    calls[path]++;
    if (path === 'playlistItems') return json({ items: uploads.map((x) => ({ contentDetails: { videoId: x.id }, snippet: { title: x.title } })) });
    if (path === 'search') {
      const q = u.searchParams.get('q');
      const key = Object.keys(searches).find((k) => q.toLowerCase().includes(k));
      return json({ items: (key ? searches[key] : []).map((h) => ({ id: { videoId: h.id } })) });
    }
    if (path === 'videos') {
      const ids = u.searchParams.get('id').split(',');
      return json({ items: ids.map((id) => ({ id, status: { embeddable: true, privacyStatus: 'public' }, snippet: { channelId: CH, title: titleOf.get(id) || '' } })) });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchImpl, calls };
};

const baseCfg = { youtubeApiKey: 'TESTKEY', videoChannelAllowlist: [CH], youtubeDailyBudget: 5000, videoIndexMaxPages: 2, videoSearchFallback: true };
const songs = [
  { id: 's1', title: 'Hukum', artist: 'Anirudh', album: 'Jailer' },
  { id: 's2', title: 'Naa Ready Anna', artist: 'Vijay', album: 'Leo' },
  { id: 's3', title: 'Unknown Gem Of Nobody', artist: 'Someone', album: 'Tiny Film' },
  { id: 's4', title: 'Hukum', artist: 'Anirudh', album: 'Jailer' }, // same song under another id
];
const yt = () => makeYouTube({
  uploads: [{ id: vid(1), title: 'Hukum - Video Song | Jailer' }, { id: vid(9), title: 'Hukum - Lyric Video | Jailer' }],
  searches: { 'naa ready': [{ id: vid(2), title: 'Naa Ready - Official Video Song' }] },
});

// ---- 1. index match, search match, no match, duplicate; a dry run writes nothing, apply writes
{
  const { fetchImpl, calls } = yt();
  const lookup = createVideoLookup({ fetchImpl, cfg: baseCfg, curated: [] });
  const store = createMemoryStore();
  const dry = await runBatch({ songs, lookup, store });
  assert.equal(dry.counts.index, 1, 'Hukum is matched from the channel index (the lyric upload is skipped)');
  assert.equal(dry.rows.find((r) => r.source === 'index').videoId, vid(1));
  assert.equal(dry.counts.search, 1, 'Naa Ready Anna needs one search');
  assert.equal(dry.rows.find((r) => r.source === 'search').videoId, vid(2));
  assert.equal(dry.counts.none, 1);
  assert.equal(dry.counts.duplicates, 1, 'the same song under a second id is looked up once');
  assert.deepEqual(dry.unmatched, ['Unknown Gem Of Nobody - Someone']);
  assert.equal(dry.written, 0);
  assert.equal((await store.list()).length, 0, 'a dry run saves nothing');
  assert.equal(calls.search, 2, 'two searches: one found, one empty');

  const lookup2 = createVideoLookup({ fetchImpl: yt().fetchImpl, cfg: baseCfg, curated: [] });
  const applied = await runBatch({ songs, lookup: lookup2, store, apply: true });
  assert.equal(applied.written, 3);
  const rows = await store.list();
  assert.deepEqual(rows.map((r) => r.source).sort(), ['index', 'none', 'search']);
  console.log('✓ batch: index match, search match, none, duplicates; a dry run saves nothing, --apply saves');
}

// ---- 2. a stored match is used by the lookup (no search), and a stored "none" stops a paid search
{
  const { fetchImpl, calls } = yt();
  const matches = new Map([
    [songKey(songs[1]), { videoId: vid(2) }],
    [songKey(songs[2]), { videoId: null }],
  ]);
  const lookup = createVideoLookup({ fetchImpl, cfg: baseCfg, curated: [], getMatch: (k) => matches.get(k) });
  assert.equal(lookup.peek(songs[1]), vid(2), 'peek serves the stored match without any network');
  assert.equal(lookup.peek(songs[2]), null, 'a recent "none" is a known none');
  assert.equal(await lookup.lookup(songs[1]), vid(2));
  assert.equal(await lookup.lookup(songs[2]), null);
  assert.equal(calls.search, 0, 'no search was paid for either song');
  // The index still beats a stored none (the song may have been uploaded since)
  const dated = createVideoLookup({ fetchImpl, cfg: baseCfg, curated: [], getMatch: () => ({ videoId: null }) });
  assert.equal(await dated.lookup(songs[0]), vid(1));
  // Fail closed: without a key the stored matches are not served
  const off = createVideoLookup({ fetchImpl, cfg: { ...baseCfg, youtubeApiKey: '' }, curated: [], getMatch: () => ({ videoId: vid(2) }) });
  assert.equal(off.peek(songs[1]), undefined);
  assert.equal(await off.lookup(songs[1]), null);
  const noList = createVideoLookup({ fetchImpl, cfg: { ...baseCfg, videoChannelAllowlist: [] }, curated: [], getMatch: () => ({ videoId: vid(2) }) });
  assert.equal(noList.peek(songs[1]), undefined, 'an empty allow-list turns stored matches off too');
  console.log('✓ lookup: stored matches skip paid searches, the index still wins over "none", empty key/allow-list fails closed');
}

// ---- 3. the search budget is respected; songs it cannot afford are deferred, not recorded
{
  const { fetchImpl, calls } = yt();
  const lookup = createVideoLookup({ fetchImpl, cfg: { ...baseCfg, youtubeDailyBudget: 105 }, curated: [] });
  const res = await runBatch({ songs, lookup, store: createMemoryStore() });
  assert.equal(calls.search, 1, 'only one search fits in the budget');
  assert.equal(res.counts.deferred, 1, 'the other song is deferred');
  assert.equal(res.rows.length, 2, 'deferred songs are not stored');
  assert.ok(lookup._budget.used <= 105, 'never over budget');
  const indexOnly = await runBatch({ songs, lookup: createVideoLookup({ fetchImpl: yt().fetchImpl, cfg: baseCfg, curated: [] }), allowSearch: false });
  assert.equal(indexOnly.counts.search, 0);
  assert.equal(indexOnly.counts.deferred, 2, 'with --no-search the unmatched songs are only deferred');
  console.log('✓ batch: daily budget respected, deferred songs are not recorded, --no-search makes no searches');
}

// ---- 4. admin choices, curated songs and errors are never stored; known songs are skipped; retry-none looks again
{
  const overrides = new Map([['s1', { videoId: 'ADMINvid001' }]]);
  const curated = [{ videoId: 'CURATEDvid1', titles: ['naa ready anna'], artistHints: ['vijay'] }];
  const lookup = createVideoLookup({ fetchImpl: yt().fetchImpl, cfg: baseCfg, curated, getOverride: (s) => overrides.get(s.id) || null });
  const res = await runBatch({ songs: songs.slice(0, 3), lookup });
  assert.equal(res.counts.admin, 1);
  assert.equal(res.counts.curated, 1);
  assert.deepEqual(res.rows.map((r) => r.source), ['none'], 'only the real lookup result is stored');

  const failing = createVideoLookup({ fetchImpl: async (u) => (new URL(u).pathname.endsWith('search') ? { ok: false, status: 500 } : yt().fetchImpl(u)), cfg: baseCfg, curated: [] });
  const bad = await runBatch({ songs: [songs[1]], lookup: failing });
  assert.equal(bad.counts.errors, 1);
  assert.equal(bad.rows.length, 0, 'a failed search is not recorded as "no video"');

  const existing = new Map([[songKey(songs[1]), { videoId: vid(2), checkedAt: new Date() }], [songKey(songs[2]), { videoId: null, checkedAt: new Date() }]]);
  const { fetchImpl, calls } = yt();
  const skip = await runBatch({ songs: songs.slice(1, 3), lookup: createVideoLookup({ fetchImpl, cfg: baseCfg, curated: [] }), existing });
  assert.equal(skip.counts.alreadyFound, 1);
  assert.equal(skip.counts.alreadyNone, 1);
  assert.equal(calls.search, 0);
  const retry = await runBatch({ songs: [songs[2]], lookup: createVideoLookup({ fetchImpl: yt().fetchImpl, cfg: baseCfg, curated: [] }), existing, retryNone: true });
  assert.equal(retry.counts.none, 1, '--retry-none looks at "none" songs again');
  const old = new Map([[songKey(songs[2]), { videoId: null, checkedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000) }]]);
  const stale = await runBatch({ songs: [songs[2]], lookup: createVideoLookup({ fetchImpl: yt().fetchImpl, cfg: baseCfg, curated: [] }), existing: old });
  assert.equal(stale.counts.none, 1, 'an old "none" is looked up again');
  console.log('✓ batch: admin/curated/errors are never stored, known songs are skipped, old or forced "none" is retried');
}

// ---- 5. the in-memory service: sync answers, "none" expires
{
  let t = Date.parse('2026-12-01T00:00:00Z');
  const store = createMemoryStore();
  await store.upsertMany([{ songKey: 'a|b', videoId: vid(5), title: 'A', artist: 'B', source: 'index' }, { songKey: 'c|d', videoId: null, title: 'C', artist: 'D', source: 'none' }], new Date(t));
  const svc = createVideoMatchService({ store, now: () => t });
  assert.equal(svc.match('a|b'), undefined, 'unknown until the first refresh');
  await svc.refresh();
  assert.deepEqual(svc.match('a|b'), { videoId: vid(5) });
  assert.deepEqual(svc.match('c|d'), { videoId: null });
  assert.equal(svc.match('zzz'), undefined);
  t += (NONE_TTL_DAYS + 1) * 24 * 3600 * 1000;
  assert.equal(svc.match('c|d'), undefined, 'a "none" older than the limit is unknown again');
  assert.deepEqual(svc.match('a|b'), { videoId: vid(5) }, 'a found video does not expire');
  console.log('✓ video matches service: synchronous answers, "none" expires, a found video stays');
}

// ---- 6. nothing in the batch code can print or store the key
{
  const out = [];
  const lookup = createVideoLookup({ fetchImpl: yt().fetchImpl, cfg: baseCfg, curated: [] });
  const res = await runBatch({ songs, lookup, store: createMemoryStore(), apply: true, log: (l) => out.push(l) });
  assert.ok(!JSON.stringify(res).includes('TESTKEY') && !out.join('\n').includes('TESTKEY'), 'the key is never in the report or the log');
  console.log('✓ batch: the API key never appears in the report or the log');
}
