import assert from 'node:assert/strict';
import { createRelatedService } from '../src/services/related/relatedService.js';
import { createMemorySignals } from '../src/services/related/signalsStore.js';
import { LruCacheService } from '../src/services/cacheService.js';
import { isSameSong, clusterSongs, withCanonical, collapseDuplicates, pickBest } from '../src/services/related/identity.js';
import { assembleSpeedDial } from '../src/services/speedDial/assemble.js';
import { assembleHome } from '../src/services/homeFeed/assemble.js';

const S = (id, title, artist, album, duration, extra = {}) => ({ id, title, artist, singers: artist, album, duration, language: 'tamil', year: '2015', streamUrl: 'https://x/y.mp4', ...extra });
const konjam1 = S('k1', 'Innum Konjam Neram', 'Vijay Prakash, Shreya Ghoshal', 'Maryan', 313);
const konjam2 = S('k2', 'Innum Konjam Neram', 'Vijay Prakash', 'A.R. Rahman Romantic Hits', 313);
const nanun1 = S('n1', 'Naan Un (From "24")', 'Arijit Singh, Chinmayi', 'A.R. Rahman Romantic Hits', 288);
const nanun2 = S('n2', 'Naan Un (From "24")', 'Arijit Singh', 'Konjam Paatu Konjam Kaadhal', 288);
const annul1 = S('a1', 'Annul Maelae', 'Pradeep Kumar', 'Aadhavan', 322);
const annul2 = S('a2', 'Annul Melae', 'Pradeep Kumar', 'Aadhavan', 322);

// the screenshots
assert.ok(isSameSong(konjam1, konjam2) && isSameSong(nanun1, nanun2) && isSameSong(annul1, annul2));
assert.ok(!isSameSong(S('p1', 'Pavazha Malli', 'Sam CS', 'Think Indie', 235), S('p2', 'Pavazha Malli Unplugged', 'Sam CS', 'Think Indie', 198)));
assert.ok(!isSameSong(S('1', 'Kadhal Sadugudu', 'A.R. Rahman', 'Alai Payuthey', 270), S('2', 'Mathura Marikozhundhu', 'A.R. Rahman', 'Alai Payuthey', 270)));
assert.equal(pickBest([konjam2, konjam1]).id, 'k1', 'the original film release beats the compilation');
const { groups, canonicalOf } = clusterSongs([konjam2, nanun1, annul2, konjam1, nanun2, annul1]);
assert.equal(groups.length, 3);
assert.equal(canonicalOf.get('k2'), 'k1');
console.log('✓ canonical: fixtures from the screenshots cluster; negatives stay apart');

// search: duplicates collapse, every song carries canonicalId
const found = withCanonical([konjam2, annul1, konjam1, annul2]);
assert.equal(found.length, 2);
assert.equal(found[0].id, 'k1', 'the original film release is the copy shown');
assert.ok(/annul/i.test(found[1].title));
assert.ok(found.every((s) => s.canonicalId));
assert.equal(collapseDuplicates([nanun1, nanun2]).length, 1);
console.log('✓ canonical: search results collapse to one copy and carry canonicalId');

// related API: the radio block has no duplicates by canonical id, and the playing song's twins are never offered
const seedSong = S('seed', 'Innum Konjam Neram', 'Vijay Prakash', 'Maryan', 313);
const filler = Array.from({ length: 12 }, (_, i) => S(`f${i}`, `Filler Tune ${String.fromCharCode(97 + i)}${i}`, `Singer ${i}`, `Film ${i}`, 200 + i * 7, { composer: 'Seed Composer' }));
const svc = createRelatedService({
  manager: { getSong: async (id) => (id === 'seed' ? seedSong : null), searchTracks: async () => ({ songs: [] }), getRecommendations: async () => [konjam2, nanun1, nanun2, annul1, annul2, ...filler], getHomeFeed: async () => null },
  signals: createMemorySignals(),
  cache: new LruCacheService(50, 300),
});
const r = await svc.getRelated('seed', { limit: 20 });
assert.ok(!r.items.some((s) => s.id === 'k2'), 'a twin of the playing song is not offered');
const canon = clusterSongs(r.items).canonicalOf;
assert.equal(new Set(r.items.map((s) => canon.get(s.id))).size, r.items.length, 'zero duplicates by canonicalId in the block');
assert.ok(r.items.every((s) => s.canonicalId));
assert.equal(r.items.filter((s) => /naan un/i.test(s.title)).length, 1);
assert.equal(r.items.filter((s) => /annul/i.test(s.title)).length, 1);
console.log('✓ canonical: related block has no duplicates by canonicalId');

// Speed Dial: two copies are one tile with the plays added up
const songs = new Map([['a1', annul1], ['a2', annul2], ['n1', nanun1]]);
const dial = assembleSpeedDial({ scores: [{ songId: 'a1', score: 2, plays: 2 }, { songId: 'a2', score: 3, plays: 3 }, { songId: 'n1', score: 4, plays: 4 }], overrides: [], songs, suggestions: [] });
assert.equal(dial.length, 2);
assert.equal(dial[0].playCount, 5, 'the plays of both copies add up');
assert.equal(dial[0].title.startsWith('Annul'), true);
assert.equal(dial[1].id, 'n1');
console.log('✓ canonical: Speed Dial merges copies of one song');

// Home: a section never shows two copies
const home = assembleHome([{ id: 't', title: 'Trending', pool: [konjam1, konjam2, nanun1, nanun2, annul1, annul2, ...filler], min: 1 }], { seed: 'u:2026-11-18', hero: false });
const homeCanon = clusterSongs(home.sections[0].items).groups;
assert.equal(homeCanon.length, home.sections[0].items.length);
console.log('✓ canonical: home sections hold one copy per song');
