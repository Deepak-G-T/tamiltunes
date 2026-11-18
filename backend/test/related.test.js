import assert from 'node:assert/strict';
import { splitNames, normMovie, yearOf, primaryArtist } from '../src/services/related/text.js';
import { scoreCandidate, rankCandidates, whyLabel } from '../src/services/related/scoring.js';
import { diversify } from '../src/services/related/diversify.js';
import { createRelatedService } from '../src/services/related/relatedService.js';
import { createMemorySignals } from '../src/services/related/signalsStore.js';
import { LruCacheService } from '../src/services/cacheService.js';
import { WEIGHTS, VARIETY } from '../src/services/related/weights.js';

const song = (id, extra = {}) => ({ id, title: `Song ${id}`, artist: 'Nobody', singers: 'Nobody', album: `Album ${id}`, year: '2010', language: 'tamil', streamUrl: 'https://x/y.mp4', ...extra });

// ---------- text helpers ----------
assert.deepEqual(splitNames('Anirudh Ravichander, Super Subu & Vijay feat. Dhanush'), ['anirudh ravichander', 'super subu', 'vijay', 'dhanush']);
assert.deepEqual(splitNames(['A', 'a']), ['a']);
assert.equal(normMovie('Leo (Original Motion Picture Soundtrack)'), 'leo');
assert.equal(normMovie('Jailer - Tamil'), normMovie('JAILER'));
assert.equal(yearOf('2023'), 2023);
assert.equal(yearOf('c. 1994'), 1994);
assert.equal(yearOf(undefined), null);
assert.equal(primaryArtist({ singers: 'Ilaiyaraaja, S. Janaki' }), 'ilaiyaraaja');
console.log('✓ text helpers: name splitting, film-name normalisation, years');

// ---------- scoring ----------
const seed = song('seed', { singers: 'Anirudh Ravichander', composer: 'Anirudh Ravichander', album: 'Leo', year: '2023' });
const sameEverything = song('a', { singers: 'Anirudh Ravichander', composer: 'Anirudh Ravichander', album: 'Leo (Original Motion Picture Soundtrack)', year: '2023' });
const sameSingerOnly = song('b', { singers: 'Anirudh Ravichander', composer: 'Someone Else', album: 'Other', year: '2015' });
const unrelated = song('c', { singers: 'Zed', album: 'Z', year: '1985' });
const wrongLanguage = song('d', { singers: 'Anirudh Ravichander', album: 'Leo', year: '2023', language: 'telugu' });

const sa = scoreCandidate(seed, sameEverything);
assert.ok(sa.reasons.sameComposer && sa.reasons.sharedSinger && sa.reasons.sameMovie && sa.reasons.era);
assert.ok(sa.score > scoreCandidate(seed, sameSingerOnly).score, 'same composer+movie+singer beats singer only');
assert.ok(scoreCandidate(seed, sameSingerOnly).score > scoreCandidate(seed, unrelated).score);
assert.ok(scoreCandidate(seed, wrongLanguage).score < 0, 'a different language drops below zero');
assert.equal(scoreCandidate(seed, sameEverything).reasons.sameMovie, WEIGHTS.sameMovie, 'film names are compared after normalising');

// era buckets get weaker with distance
const era = (y) => scoreCandidate(seed, song('e', { year: String(y) })).reasons.era || 0;
assert.ok(era(2023) > era(2021) && era(2021) > era(2017) && era(2017) > era(2012) && era(2012) > era(1990));
assert.equal(era(1990), 0);

// share of the seed's singers
const duet = song('duet', { singers: 'Anirudh Ravichander, Vijay' });
const half = scoreCandidate(duet, song('h', { singers: 'Anirudh Ravichander' })).reasons.sharedSinger;
assert.ok(Math.abs(half - WEIGHTS.sharedSinger / 2) < 1e-9, 'sharing 1 of 2 singers earns half the weight');

// listener signals
const base = scoreCandidate(seed, sameSingerOnly).score;
assert.ok(scoreCandidate(seed, sameSingerOnly, { liked: new Set(['b']) }).score > base, 'liked songs get a small boost');
assert.ok(scoreCandidate(seed, sameSingerOnly, { recent: new Set(['b']) }).score < base, 'recently played songs are penalised');
assert.ok(scoreCandidate(seed, sameSingerOnly, { skipped: new Set(['b']) }).score < base, 'recently skipped songs are penalised');
// co-listening grows with count but saturates
const co = (n) => scoreCandidate(seed, unrelated, { coListening: new Map([['c', n]]) }).reasons.coListening || 0;
assert.ok(co(1) > 0 && co(3) > co(1) && co(WEIGHTS.coListeningSaturation) === WEIGHTS.coListening && co(500) === WEIGHTS.coListening);
// popularity only breaks ties (never outweighs a real relationship)
assert.ok(scoreCandidate(seed, { ...unrelated, playCount: 9e9 }).score < scoreCandidate(seed, sameSingerOnly).score);
// shelves (genre/mood stand-in) and provider recommendation
const shelves = new Map([['seed', new Set(['melodies'])], ['c', new Set(['melodies', 'love'])]]);
assert.ok(scoreCandidate(seed, unrelated, { shelves }).reasons.sameShelf > 0);
assert.ok(scoreCandidate(seed, unrelated, { providerRecIds: new Set(['c']) }).reasons.providerRecommendation > 0);
// ranking is stable and best-first
const ranked = rankCandidates(seed, [unrelated, sameSingerOnly, sameEverything]);
assert.deepEqual(ranked.map((r) => r.song.id), ['a', 'b', 'c']);
assert.equal(whyLabel(sa.reasons), 'Same music director');
assert.equal(whyLabel({}), 'Popular pick');
console.log('✓ scoring: composer / singers / film / era / language / co-listening / likes / recent / skipped');

// ---------- diversify ----------
const items = (n, fn) => Array.from({ length: n }, (_, i) => ({ song: fn(i), score: 5 - i * 0.01 }));
const maxRunOf = (list, key) => {
  let best = 0, run = 0, last = null;
  for (const x of list) { const k = key(x); run = k === last ? run + 1 : 1; last = k; best = Math.max(best, run); }
  return best;
};
// 12 songs from one artist + 12 others: never more than 3 in a row
const manyOneArtist = [
  ...items(12, (i) => song(`s${i}`, { singers: 'Same Singer', album: `A${i}` })),
  ...items(12, (i) => song(`o${i}`, { singers: `Other ${i}`, album: `B${i}` })).map((r) => ({ ...r, score: 3 })),
];
const out = diversify(manyOneArtist, { limit: 20 });
assert.equal(out.length, 20);
assert.ok(maxRunOf(out, (r) => primaryArtist(r.song)) <= VARIETY.maxRun, 'artist run capped');
// album run capped too
const oneAlbum = [...items(10, (i) => song(`a${i}`, { singers: `S${i}`, album: 'Same Album' })), ...items(10, (i) => song(`b${i}`, { singers: `T${i}`, album: `Alb ${i}` })).map((r) => ({ ...r, score: 3 }))];
assert.ok(maxRunOf(diversify(oneAlbum, { limit: 15 }), (r) => normMovie(r.song.album)) <= VARIETY.maxRun, 'album run capped');
// ~30% discovery, spread out
const mix = [...items(20, (i) => song(`v${i}`, { singers: `V${i}`, album: `VA${i}` })), ...items(20, (i) => song(`d${i}`, { singers: `D${i}`, album: `DA${i}`, playCount: 1000 - i })).map((r) => ({ ...r, score: 0.5 }))];
const batch = diversify(mix, { limit: 20 });
const disc = batch.filter((r) => r.discovery).length;
assert.equal(batch.length, 20);
assert.equal(disc, 6, '30% of 20');
assert.ok(batch[0].discovery !== true, 'the first song is a very-similar one');
assert.equal(new Set(batch.map((r) => r.song.id)).size, 20, 'no duplicates');
// not enough similar songs: fill with discovery; not enough of anything: return what exists
assert.equal(diversify(mix.filter((r) => r.score < 1), { limit: 10 }).length, 10);
assert.equal(diversify(mix.slice(0, 3), { limit: 20 }).length, 3);
assert.deepEqual(diversify([], { limit: 5 }), []);
// duplicates in the input collapse
assert.equal(diversify([mix[0], mix[0], mix[1]], { limit: 5 }).length, 2);
console.log('✓ variety: max 3 in a row per artist/album, ~30% discovery, no duplicates, small pools');

// ---------- service with fake sources ----------
const catalogue = {
  seed: song('seed', { singers: 'Anirudh Ravichander', composer: 'Anirudh Ravichander', album: 'Leo', year: '2023' }),
  same1: song('same1', { singers: 'Anirudh Ravichander', composer: 'Anirudh Ravichander', album: 'Leo', year: '2023' }),
  same2: song('same2', { singers: 'Anirudh Ravichander', composer: 'Anirudh Ravichander', album: 'Leo', year: '2023' }),
  singer1: song('singer1', { singers: 'Anirudh Ravichander', album: 'X', year: '2019' }),
  singer2: song('singer2', { singers: 'Anirudh Ravichander', album: 'Y', year: '2020' }),
  old1: song('old1', { singers: 'Ilaiyaraaja', album: 'Old', year: '1985', playCount: 5000 }),
  telugu: song('telugu', { singers: 'Anirudh Ravichander', album: 'Leo', language: 'telugu' }),
};
const calls = { search: 0, reco: 0, feed: 0, userSignals: 0 };
const makeManager = (over = {}) => ({
  getSong: async (id) => catalogue[id] || null,
  getRecommendations: async () => { calls.reco++; return [catalogue.same1, catalogue.singer1]; },
  searchTracks: async (q) => { calls.search++; return { songs: Object.values(catalogue).filter((s) => s.singers.includes(q) || s.album === q) }; },
  getHomeFeed: async () => { calls.feed++; return { trending: [catalogue.old1], melodies: [catalogue.old1, catalogue.seed] }; },
  ...over,
});
const sig = createMemorySignals();
const spySignals = { ...sig, userSignals: async (...a) => { calls.userSignals++; return sig.userSignals(...a); } };
const svc = (manager = makeManager(), signals = spySignals) => createRelatedService({ manager, signals, cache: new LruCacheService(50, 300) });

let r = await svc().getRelated('seed', { limit: 10 });
const ids = r.items.map((s) => s.id);
assert.ok(!ids.includes('seed'), 'the seed is never in its own radio');
assert.ok(!ids.includes('telugu'), 'wrong-language songs are filtered out');
assert.equal(new Set(ids).size, ids.length, 'no duplicates');
assert.ok(ids.includes('same1') && ids.includes('same2'), 'same composer/film songs are found by search even when the provider did not recommend them');
assert.ok(ids.includes('old1'), 'a shelf song fills in as discovery');
assert.ok(r.items.every((s) => typeof s.why === 'string' && s.why.length));
assert.equal(r.meta.short, true, 'asked for 10, catalogue only has 5: flagged as short, not padded');
// exclusion = "never repeat a song already played this session"
r = await svc().getRelated('seed', { limit: 10, exclude: ['same1', 'old1', 'nope'] });
assert.ok(!r.items.some((s) => ['same1', 'old1'].includes(s.id)), 'excluded ids never come back');
// unknown seed
await assert.rejects(() => svc().getRelated('missing'), (e) => e.statusCode === 404);
// the pool is cached: a second request does no provider work
const s1 = svc();
Object.keys(calls).forEach((k) => (calls[k] = 0));
const first = await s1.getRelated('seed', { limit: 5 });
const providerCalls = calls.search + calls.reco + calls.feed;
const second = await s1.getRelated('seed', { limit: 5, exclude: ['same1'] });
assert.equal(first.meta.cached, false);
assert.equal(second.meta.cached, true);
assert.equal(calls.search + calls.reco + calls.feed, providerCalls, 'second request is served from the cache');
// a failing or hanging source does not break the response
const flaky = makeManager({ getRecommendations: async () => { throw new Error('provider down'); }, searchTracks: async () => { throw new Error('search down'); } });
r = await svc(flaky).getRelated('seed', { limit: 5 });
assert.ok(r.items.length >= 1, 'falls back to home-feed songs when other sources fail');
const hanging = makeManager({ getRecommendations: () => new Promise(() => {}) });
const t0 = Date.now();
r = await createRelatedService({ manager: hanging, signals: spySignals, cache: new LruCacheService(5, 60) }).getRelated('seed', { limit: 5 });
assert.ok(Date.now() - t0 < 8000 && r.items.length >= 1, 'a hanging source times out instead of blocking');
console.log('✓ service: seed excluded, language filter, no repeats via exclude, 404, pool cache, failing/hanging sources tolerated');

// ---------- personalisation ----------
const userId = 'user-1';
await sig.recordPlayEvent({ userId, songId: 'same2', skippedAtSec: 5 });   // skipped early
await sig.recordPlayEvent({ userId, songId: 'singer1', completed: true });  // played just now
const plain = await svc().getRelated('seed', { limit: 10 });
const mine = await svc().getRelated('seed', { limit: 10, userId });
assert.equal(mine.meta.personalised, true);
const scoreOf = (res, id) => res.items.find((x) => x.id === id)?.radioScore;
assert.ok(scoreOf(plain, 'same2') !== undefined, 'baseline includes the song');
assert.ok(scoreOf(mine, 'same2') === undefined || scoreOf(mine, 'same2') < scoreOf(plain, 'same2'), 'an early skip lowers the song score');
assert.ok(scoreOf(mine, 'singer1') === undefined || scoreOf(mine, 'singer1') < scoreOf(plain, 'singer1'), 'a song just played scores lower');
assert.equal(scoreOf(mine, 'same1'), scoreOf(plain, 'same1'), 'songs the user did not touch are unaffected');
console.log('✓ personalisation: early skips and recent plays are penalised');

// ---------- co-listening from playlists and listeners ----------
import { db } from '../src/prisma/client.js';
db.songs.set('seed', catalogue.seed); db.songs.set('cl1', song('cl1', { singers: 'Zed', album: 'ZZ' }));
db.playlistSongs.set('p1_seed', { playlistId: 'p1', songId: 'seed' });
db.playlistSongs.set('p1_cl1', { playlistId: 'p1', songId: 'cl1' });
db.playlistSongs.set('p2_seed', { playlistId: 'p2', songId: 'seed' });
db.playlistSongs.set('p2_cl1', { playlistId: 'p2', songId: 'cl1' });
db._historyItems.push({ userId: 'u9', songId: 'seed', playedAt: new Date() }, { userId: 'u9', songId: 'cl1', playedAt: new Date() });
const coMap = await createMemorySignals().coListening('seed');
assert.equal(coMap.get('cl1'), 3, 'two shared playlists + one shared listener');
assert.equal(coMap.has('seed'), false);
console.log('✓ co-listening counts shared playlists and listeners');
