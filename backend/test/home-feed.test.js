import assert from 'node:assert/strict';
import { canonTitle, canonMovie, sameSong, createSeen } from '../src/services/homeFeed/normalize.js';
import { rngFrom, hashSeed, dayKey, weightedOrder } from '../src/services/homeFeed/seed.js';
import { assembleHome, pickSection, candidateWeight, MIN_ITEMS, MAX_ITEMS, MAX_PER_MOVIE, MAX_PER_ARTIST, ROTATION_PLAYS } from '../src/services/homeFeed/assemble.js';

const S = (id, title, album, artist = 'Artist ' + id, extra = {}) => ({ id, title, album, artist, singers: artist, year: '2020', ...extra });
const many = (prefix, n, make = (i) => S(`${prefix}${i}`, `${prefix} song ${i}`, `${prefix} film ${i}`, `${prefix} singer ${i}`)) => Array.from({ length: n }, (_, i) => make(i));
const idsOf = (sections) => sections.flatMap((s) => s.items.map((x) => x.id));

// ---- same song under different ids
assert.equal(canonTitle(S('1', 'Vaathi Coming (From "Master")')), 'vaathi coming');
assert.equal(canonTitle(S('1', 'Hukum - From "Jailer"')), 'hukum');
assert.equal(canonTitle(S('1', 'Kadhal Kadhal [Remastered]')), 'kadhal kadhal');
assert.equal(canonTitle(S('1', 'One Name - Theme')), 'one name theme', 'a real subtitle stays');
assert.equal(canonMovie(S('1', 'x', 'Leo (Original Motion Picture Soundtrack)')), 'leo');
assert.ok(sameSong(S('a', 'Vaathi Coming', 'Master', 'Anirudh'), S('b', 'Vaathi Coming (From "Master")', 'Master (Original Motion Picture Soundtrack)', 'Anirudh Ravichander')), 'remaster / duplicate upload is one song');
assert.ok(sameSong(S('a', 'Vaathi Coming', null, 'Anirudh'), S('b', 'Vaathi Coming', 'Master', 'Anirudh')), 'a missing movie does not make them different');
assert.ok(!sameSong(S('a', 'Kadhal', 'Film One', 'Singer A'), S('b', 'Kadhal', 'Film Two', 'Singer A')), 'same title in different films are different songs');
assert.ok(!sameSong(S('a', 'Kadhal', 'Film', 'Singer A'), S('b', 'Kadhal', 'Film', 'Singer B')), 'different singers are different songs');
assert.ok(sameSong(S('a', 'கண்ணான கண்ணே', 'விஸ்வாசம்', 'சித் ஸ்ரீராம்'), S('b', 'கண்ணான கண்ணே (From "விஸ்வாசம்")', 'விஸ்வாசம்', 'சித் ஸ்ரீராம்')), 'Tamil titles are normalised too');
const seen = createSeen([S('a', 'Hukum', 'Jailer', 'Anirudh')]);
assert.ok(seen.has(S('zzz', 'Hukum (From "Jailer")', 'Jailer', 'Anirudh Ravichander')) && !seen.has(S('q', 'Other', 'Jailer')));
console.log('✓ home feed: look-alike songs with different ids, titles or albums count as one');

// ---- seeded random
assert.equal(hashSeed('x'), hashSeed('x'));
const r1 = rngFrom('u1:2026-11-18'); const r2 = rngFrom('u1:2026-11-18');
assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()]);
assert.notDeepEqual([rngFrom('u1:2026-11-18')()], [rngFrom('u1:2026-11-19')()]);
assert.equal(dayKey(Date.UTC(2026, 10, 18, 23, 59)), '2026-11-18');
assert.equal(dayKey(Date.UTC(2026, 10, 19, 0, 1)), '2026-11-19');
const order = (seed) => weightedOrder(Array.from({ length: 20 }, (_, i) => ({ item: i, weight: 1 })), rngFrom(seed)).join(',');
assert.equal(order('a'), order('a'));
assert.notEqual(order('a'), order('b'));
console.log('✓ home feed: seeded random is repeatable for the same person and day and changes with either');

// ---- assembling
const plan = () => [
  { id: 'continue', title: 'Continue listening', pool: many('c', 10) },
  { id: 'trending', title: 'Trending now', heroFrom: true, pool: [...many('t', 30), ...many('c', 10)] }, // trending also contains songs shown in "continue"
  { id: 'new', title: 'New releases', pool: [...many('n', 14), ...many('t', 30)] },
  { id: 'nineties', title: '90s melodies', pool: many('p', 20) },
];
const out = assembleHome(plan(), { seed: 'u1:2026-11-18' });
const ids = idsOf(out.sections);
assert.equal(new Set(ids).size, ids.length, 'no id in two sections');
assert.ok(out.sections.length === 4 && out.sections.every((s) => s.items.length >= MIN_ITEMS && s.items.length <= MAX_ITEMS));
assert.ok(out.hero && !ids.includes(out.hero.id), 'the hero is not repeated in a shelf');
assert.ok(out.hero.id.startsWith('t') || out.hero.id.startsWith('c'));
console.log('✓ home feed: no song id appears in two sections, and the hero is not repeated');

// look-alikes with different ids across sections
const dupPlan = [
  { id: 'a', title: 'A', pool: many('a', 12, (i) => S(`a${i}`, `Song ${i}`, `Film ${i}`, `Singer ${i}`)) },
  { id: 'b', title: 'B', pool: [...many('b', 12, (i) => S(`b${i}`, `Song ${i} (From "Film ${i}")`, `Film ${i} (Original Motion Picture Soundtrack)`, `Singer ${i}`)), ...many('x', 10, (i) => S(`x${i}`, `Fresh ${i}`, `Other ${i}`, `Other singer ${i}`))] },
];
const dupOut = assembleHome(dupPlan, { seed: 's' });
assert.equal(dupOut.sections.length, 2);
assert.ok(dupOut.sections[1].items.every((s) => s.id.startsWith('x')), 'remastered / duplicate uploads of songs already shown are skipped');
console.log('✓ home feed: the same song under another id is not shown again');

// Speed dial
const dial = [S('t0', 'trending song 0', 't film 0', 't singer 0'), S('p3', 'whatever', 'x', 'y'), { id: 'gone', title: '', artist: '' }];
const withDial = assembleHome(plan(), { seed: 'u1:2026-11-18', exclude: dial });
assert.ok(!idsOf(withDial.sections).includes('t0') && !idsOf(withDial.sections).includes('p3') && withDial.hero?.id !== 't0');
const dialLook = assembleHome(plan(), { seed: 'u1:2026-11-18', exclude: [S('zz', 'T Song 1 (From "t film 1")', 't film 1', 't singer 1')] });
assert.ok(!idsOf(dialLook.sections).includes('t1'), 'a Speed dial song also keeps its look-alikes out');
console.log('✓ home feed: Speed dial songs (and their look-alikes) never appear below');

// caps
const heavy = [
  ...many('m', 10, (i) => S(`m${i}`, `Same film song ${i}`, 'One Big Film', `Singer m${i}`)),
  ...many('r', 10, (i) => S(`r${i}`, `Same artist song ${i}`, `Film r${i}`, 'Prolific Artist')),
  ...many('o', 10, (i) => S(`o${i}`, `Other ${i}`, `Other film ${i}`, `Other singer ${i}`)),
];
for (let k = 0; k < 20; k++) {
  const picked = pickSection(heavy, { seen: createSeen(), rng: rngFrom(`caps${k}`) });
  assert.ok(picked.filter((s) => s.album === 'One Big Film').length <= MAX_PER_MOVIE, 'at most 2 per movie');
  assert.ok(picked.filter((s) => s.artist === 'Prolific Artist').length <= MAX_PER_ARTIST, 'at most 3 per artist');
  assert.ok(picked.length <= MAX_ITEMS);
}
console.log('✓ home feed: at most 2 songs per movie and 3 per artist in a section');

// hidden when it cannot fill
const thin = assembleHome([
  { id: 'big', title: 'Big', pool: many('b', 12) },
  { id: 'thin', title: 'Thin', pool: [...many('b', 12), ...many('t', 5)] }, // only 5 unique songs after dedupe
  { id: 'albums', title: 'Albums', kind: 'albums', pool: [] },
], { seed: 's' });
assert.deepEqual(thin.sections.map((s) => s.id), ['big']);
assert.deepEqual(thin.hidden.sort(), ['albums', 'thin']);
const leftover = assembleHome([{ id: 'thin', title: 'Thin', pool: many('t', 5) }, { id: 'big', title: 'Big', pool: [...many('t', 5), ...many('z', 5)] }], { seed: 's' });
assert.ok(idsOf(leftover.sections).includes('t0'), 'songs of a hidden section stay available to the next one');
console.log('✓ home feed: a section with fewer than 8 unique songs is hidden instead of repeating songs');

// rotation
assert.ok(candidateWeight(0, 10, 0) > candidateWeight(0, 10, 1), 'unplayed songs are lifted');
assert.ok(candidateWeight(0, 10, ROTATION_PLAYS) < candidateWeight(5, 10, 1), 'songs played 3+ times this week sink below fresh ones');
const pool40 = many('w', 40);
const worn = new Map(pool40.slice(0, 10).map((s) => [s.id, 5])); // the first 10 were played 5 times this week
let wornPicked = 0;
let total = 0;
for (let k = 0; k < 200; k++) {
  const p = pickSection(pool40, { seen: createSeen(), rng: rngFrom(`rot${k}`), weekPlays: worn, caps: false });
  wornPicked += p.filter((s) => worn.has(s.id)).length;
  total += p.length;
}
assert.ok(wornPicked / total < 0.12, `songs played 3+ times this week are rare in discovery shelves (${(wornPicked / total).toFixed(3)})`);
const fresh = pickSection(pool40, { seen: createSeen(), rng: rngFrom('x'), weekPlays: new Map(), caps: false });
assert.equal(fresh.length, MAX_ITEMS);
console.log('✓ home feed: songs played 3+ times this week sink, unplayed songs rise');

// stable for a day
const a = assembleHome(plan(), { seed: 'u1:2026-11-18' });
const b = assembleHome(plan(), { seed: 'u1:2026-11-18' });
const c = assembleHome(plan(), { seed: 'u1:2026-11-19' });
const d = assembleHome(plan(), { seed: 'u2:2026-11-18' });
assert.deepEqual(idsOf(a.sections), idsOf(b.sections), 'same person, same day: identical page');
assert.notDeepEqual(idsOf(a.sections), idsOf(c.sections), 'a new day looks different');
assert.notDeepEqual(idsOf(a.sections), idsOf(d.sections), 'another person looks different');
console.log('✓ home feed: the page is stable within a day and changes the next day');

// ---- the API, with the offline mock catalogue
const { default: app } = await import('../src/app.js');
const { initDb } = await import('../src/prisma/client.js');
const { musicService } = await import('../src/services/music/providerManager.js');
const { musicCache } = await import('../src/services/cacheService.js');
const { clearHomeCache } = await import('../src/services/homeFeed/homeFeedService.js');
await initDb();
musicService.setProvider('mock');
musicCache.clear();
clearHomeCache();
const server = app.listen(5018);
const BASE = 'http://localhost:5018/api';
const get = async (path) => { const r = await fetch(`${BASE}${path}`); return { status: r.status, json: await r.json() }; };
try {
  const home = await get('/home');
  assert.equal(home.status, 200);
  assert.equal(home.json.success, true);
  assert.ok(Array.isArray(home.json.sections) && home.json.seed);
  const apiIds = idsOf(home.json.sections.filter((s) => s.kind === 'songs'));
  assert.equal(new Set(apiIds).size, apiIds.length, 'API: no song in two sections');
  if (home.json.hero) assert.ok(!apiIds.includes(home.json.hero.id));
  for (const s of home.json.sections.filter((x) => x.kind === 'songs')) assert.ok(s.items.length >= 4, 'no thin shelves');

  const again = await get('/home');
  assert.deepEqual(again.json, home.json, 'same page on a refresh');

  const first = home.json.hero?.id || apiIds[0];
  if (first) {
    const excl = await get(`/home?exclude=${encodeURIComponent(first)},bad%20id,../x`);
    assert.equal(excl.status, 200);
    assert.ok(!idsOf(excl.json.sections.filter((s) => s.kind === 'songs')).includes(first) && excl.json.hero?.id !== first, 'API: excluded (Speed dial) songs are never returned');
  }

  const tab = await get('/home?tab=melodies');
  assert.equal(tab.status, 200);
  assert.ok(tab.json.sections.length <= 1 && tab.json.hero === null);
  const noTab = await get('/home?tab=drop-table');
  assert.equal(noTab.status, 200, 'an unknown tab is ignored, not an error');
  console.log('✓ home feed API: one call, no repeats, Speed dial ids excluded, stable on refresh, tabs, bad input ignored');
} finally {
  server.close();
}
