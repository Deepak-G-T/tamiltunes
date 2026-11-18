import assert from 'node:assert/strict';
import { createRelatedService } from '../src/services/related/relatedService.js';
import { createMemorySignals } from '../src/services/related/signalsStore.js';
import { LruCacheService } from '../src/services/cacheService.js';
import { diversify } from '../src/services/related/diversify.js';
import { songFingerprint, variantKey, sameSong, sameVariant, titleCore, variantCore } from '../src/services/related/identity.js';

const think = (id, extra = {}) => ({ id, title: 'Pavazha Malli (From "Think Indie")', album: 'Think Indie', singers: 'Sam CS, Pragathi Guruprasad', artist: 'Sam CS', composer: 'Sam CS', year: '2023', language: 'tamil', streamUrl: 'https://x/y.mp4', ...extra });
const song = (id, extra = {}) => ({ id, title: `Song ${id}`, artist: `Artist ${id}`, singers: `Artist ${id}`, album: `Album ${id}`, year: '2015', language: 'tamil', streamUrl: 'https://x/y.mp4', ...extra });

// ---- the identity rules match the ones in the web app (same examples)
assert.equal(titleCore(think('a')), 'pavazha malli');
assert.equal(songFingerprint(think('a')), songFingerprint(think('b', { singers: 'Pragathi Guruprasad, Sam CS' })));
assert.ok(sameSong(think('a'), think('b', { image: 'x.jpg', singers: 'Pragathi Guruprasad, Sam CS' })));
const unplugged = think('u', { title: 'Pavazha Malli Unplugged (From "Think Indie")' });
assert.ok(!sameSong(think('a'), unplugged) && sameVariant(think('a'), unplugged) && variantKey(think('a')) === variantKey(unplugged));
for (const w of ['Unplugged', 'Acoustic', 'Remix', 'Reprise', 'Lofi', 'Slowed', 'Reverb', 'Instrumental', 'Karaoke', 'Cover', '8D', 'Male Version', 'Female Version']) assert.equal(variantCore({ title: `Pavazha Malli ${w}` }), 'pavazha malli', w);
assert.ok(!sameSong(think('a'), think('x', { album: 'Another Film', singers: 'Someone Else', artist: 'Someone Else' })));
console.log('✓ related: song identity rules (same song, other id / singer order; versions)');

// ---- the related endpoint (service) collapses duplicates
const sig = createMemorySignals();
const makeService = (list, seedSong = think('seed')) => createRelatedService({
  manager: {
    getSong: async (id) => (id === seedSong.id ? seedSong : null),
    searchTracks: async () => ({ songs: [] }),
    getRecommendations: async () => list,
    getHomeFeed: async () => null,
  },
  signals: sig,
  cache: new LruCacheService(50, 300),
});
const filler = Array.from({ length: 14 }, (_, i) => song(`f${i}`, { year: String(2000 + i) }));

let svc = makeService([
  think('dup1', { singers: 'Pragathi Guruprasad, Sam CS', image: 'other-cover.jpg' }), // the playing song again
  unplugged,                                                                          // a version of it
  think('rm', { title: 'Pavazha Malli (Remix)' }),
  ...filler,
]);
let r = await svc.getRelated('seed', { limit: 10 });
let ids = r.items.map((s) => s.id);
assert.ok(!ids.includes('dup1'), 'the seed under another id / singer order is never offered');
assert.ok(!ids.includes('u') && !ids.includes('rm'), 'versions of the seed are never offered');
assert.equal(r.items.length, 10);
console.log('✓ related: the seed, its copies and its versions never come back');

// duplicates among the candidates collapse to the best copy
svc = makeService([
  song('o1', { title: 'Veezha Veera', singers: 'A, B', album: 'Film', playCount: 10 }),
  song('o2', { title: 'Veezha Veera (From "Film")', singers: 'B, A', album: 'Film', playCount: 5000, image: 'big.jpg' }), // same song, more played
  song('o3', { title: 'Veezha Veera Unplugged', singers: 'A, B', album: 'Film', playCount: 1 }),                          // a version
  ...filler,
]);
r = await svc.getRelated('seed', { limit: 20 });
const vv = r.items.filter((s) => /veezha/i.test(s.title));
assert.equal(vv.length, 1, 'one song per variant');
assert.equal(vv[0].id, 'o2', 'the best copy (most played) is kept');
// ties go to the original over a version
svc = makeService([song('v1', { title: 'Kadhal Reprise', singers: 'Q', album: 'K' }), song('v2', { title: 'Kadhal', singers: 'Q', album: 'K' }), ...filler]);
r = await svc.getRelated('seed', { limit: 20 });
assert.deepEqual(r.items.filter((s) => /kadhal/i.test(s.title)).map((s) => s.id), ['v2'], 'the original wins over a version');
console.log('✓ related: duplicates and versions collapse to one song, keeping the best copy');

// excluded ids keep out their look-alikes and versions too
svc = makeService([song('x1', { title: 'Mazhai', singers: 'M, N', album: 'Rain' }), song('x2', { title: 'Mazhai (From "Rain")', singers: 'N, M', album: 'Rain' }), song('x3', { title: 'Mazhai Acoustic', singers: 'M, N', album: 'Rain' }), ...filler]);
r = await svc.getRelated('seed', { limit: 20, exclude: ['x1'] });
assert.ok(!r.items.some((s) => /mazhai/i.test(s.title)), 'excluding a song also excludes its copies and versions');
console.log('✓ related: an excluded song also keeps out its copies and versions');

// ---- variety: 2 per film per 10, "same singer" alone does not fill a batch
const ranked = (n, make) => Array.from({ length: n }, (_, i) => ({ song: make(i), score: 5 - i * 0.01, reasons: { sameMovie: 2.5 } }));
const sameFilm = ranked(8, (i) => song(`m${i}`, { album: 'One Film', singers: `S${i}`, artist: `A${i}` }));
const others = ranked(12, (i) => song(`d${i}`, { album: `Film ${i}` }));
const batch = diversify([...sameFilm, ...others], { limit: 10 });
assert.ok(batch.filter((b) => b.song.album === 'One Film').length <= 2, 'at most 2 songs from one film in a batch of 10');
assert.equal(batch.length, 10, 'the gap is filled from the next best songs');
const singerOnlyRanked = Array.from({ length: 10 }, (_, i) => ({ song: song(`ss${i}`, { album: `X${i}`, artist: `AA${i}` }), score: 3 - i * 0.01, reasons: { sharedSinger: 2 } }));
const strong = Array.from({ length: 6 }, (_, i) => ({ song: song(`st${i}`, { album: `Y${i}`, artist: `BB${i}` }), score: 2.5 - i * 0.01, reasons: { sameComposer: 3 } }));
const mixed = diversify([...singerOnlyRanked, ...strong], { limit: 10 });
assert.ok(mixed.filter((b) => b.song.id.startsWith('ss')).length <= 3, '"same singer" is not the only reason for more than 30% of a batch');
console.log('✓ related: at most 2 songs per film per 10, "same singer" alone cannot fill a batch');

// ---- the report script's finder
const { findDuplicateGroups } = await import('../src/services/related/duplicates.js');
const rows = [think('a'), think('b', { singers: 'Pragathi Guruprasad, Sam CS' }), unplugged, think('c', { title: 'Pavazha Malli (Remix)', singers: 'Sam CS' }), song('z1'), song('z2')];
const groups = findDuplicateGroups(rows);
assert.equal(groups.find((g) => g.kind === 'same-song').songs.map((s) => s.id).sort().join(','), 'a,b');
assert.equal(groups.find((g) => g.kind === 'versions').songs.map((s) => s.id).sort().join(','), 'a,b,c,u');
assert.equal(groups.filter((g) => g.songs.some((s) => s.id.startsWith('z'))).length, 0, 'songs without a twin are not listed');
assert.deepEqual(findDuplicateGroups([]), []);
console.log('✓ report: duplicate groups are found (same song, versions), nothing is changed');
