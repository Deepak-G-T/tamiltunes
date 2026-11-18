import assert from 'node:assert/strict';
import { planMixes, buildHome, clearHomeCache, MAX_MIXES } from '../src/services/homeFeed/homeFeedService.js';
import { assembleHome, ROTATION_PLAYS } from '../src/services/homeFeed/assemble.js';
import { rngFrom } from '../src/services/homeFeed/seed.js';
import { initDb, db } from '../src/prisma/client.js';
import { musicService } from '../src/services/music/providerManager.js';
import { musicCache } from '../src/services/cacheService.js';
import { getSignalsStore } from '../src/services/related/signalsStore.js';

// ---- Daily Mix planning: two artists per mix, at most three mixes
assert.deepEqual(planMixes([]), []);
assert.deepEqual(planMixes(['A']).map((m) => [m.id, m.title, m.artists]), [['daily-mix-1', 'Daily Mix 1', ['A']]]);
const six = planMixes(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
assert.equal(six.length, MAX_MIXES);
assert.deepEqual(six[1].artists, ['C', 'D']);
assert.equal(six[0].subtitle, 'A, B and more');
console.log('✓ home fresh: Daily Mix plan (two artists each, three at most)');

const S = (i, p) => ({ id: `${p}${i}`, title: `${p} song ${i}`, artist: `${p} singer ${i}`, album: `${p} film ${i}`, year: '2020' });
const pool = (p, n) => Array.from({ length: n }, (_, i) => S(i, p));
const plan = () => [
  { id: 'daily-mix-1', title: 'Daily Mix 1', subtitle: 'A, B and more', pool: pool('m', 40) },
  { id: 'trending', title: 'Trending now', pool: pool('t', 40) },
];
const ids = (r) => r.sections.flatMap((s) => s.items.map((x) => x.id));

// ---- every visit is a different mix; the same visit is stable
const a1 = assembleHome(plan(), { seed: 'u:2026-11-18:aaa', hero: false });
const a2 = assembleHome(plan(), { seed: 'u:2026-11-18:aaa', hero: false });
const b1 = assembleHome(plan(), { seed: 'u:2026-11-18:bbb', hero: false });
assert.deepEqual(ids(a1), ids(a2), 'the same visit token gives the same page');
assert.notDeepEqual(ids(a1), ids(b1), 'a new visit token gives a new mix');
assert.equal(a1.sections[0].subtitle, 'A, B and more', 'a section can carry a subtitle');
console.log('✓ home fresh: a new visit reshuffles, the same visit is stable, sections carry a subtitle');

// ---- songs shown last time sink, nothing repeats, shelves stay full
const shown = ids(a1).slice(0, 12);
const penalty = new Map(shown.map((id) => [id, ROTATION_PLAYS]));
let sunk = 0, plain = 0;
for (let i = 0; i < 30; i++) {
  const seed = `u:2026-11-18:v${i}`;
  const withP = assembleHome(plan(), { seed, hero: false, weekPlays: penalty });
  const without = assembleHome(plan(), { seed, hero: false });
  sunk += ids(withP).filter((id) => shown.includes(id)).length;
  plain += ids(without).filter((id) => shown.includes(id)).length;
  assert.equal(new Set(ids(withP)).size, ids(withP).length);
  for (const sec of withP.sections) assert.ok(sec.items.length >= 8, 'no thin shelves');
}
assert.ok(sunk < plain * 0.6, `songs shown last time appear far less often (${sunk} vs ${plain})`);
console.log('✓ home fresh: last feed songs sink without emptying shelves');

// ---- buildHome accepts the new inputs (visit changes the seed; hints and a person with history do not break it)
await initDb();
musicService.setProvider('mock');
musicCache.clear();
clearHomeCache();
const f1 = await buildHome({ visit: 'x1' });
const f2 = await buildHome({ visit: 'x2' });
assert.notEqual(f1.seed, f2.seed);
assert.equal((await buildHome({ visit: 'x1' })).seed, f1.seed);
await buildHome({ visit: 'g1', hintArtists: ['Anirudh Ravichander', 'Sid Sriram'], avoid: ['a', 'b'] });
const tag = Math.random().toString(36).slice(2, 7);
const user = await db.user.create({ data: { email: `fresh_${tag}@example.com`, password: 'x', name: 'Fresh', username: `fresh${tag}` } });
for (const [i, a] of ['Anirudh Ravichander', 'Sid Sriram', 'Yuvan Shankar Raja'].entries()) {
  const id = `fm${i}${tag}`;
  await db.song.upsert({ where: { id }, create: { id, title: `Fresh ${i}`, artist: a, duration: 200, isPlayable: true, streamUrl: 'https://s/x.mp4' }, update: {} });
  for (let n = 0; n < 4 - i; n++) await getSignalsStore().recordPlayEvent({ userId: user.id, songId: id, completed: true, source: 'test' });
}
await db.favorite.create({ data: { userId: user.id, songId: `fm2${tag}` } }).catch(() => {});
const { getHomeSignals } = await import('../src/services/homeFeed/signals.js');
const top = await getHomeSignals().topArtists(user.id, 6);
assert.equal(top[0], 'Yuvan Shankar Raja', 'a liked song counts like three plays (2 plays + a like beats 4 plays)');
assert.ok(top.includes('Anirudh Ravichander'));
await buildHome({ userId: user.id, visit: 'p1' });
console.log('✓ home fresh: buildHome takes visit, avoid and artist hints; likes count towards taste');
process.exit(0);
