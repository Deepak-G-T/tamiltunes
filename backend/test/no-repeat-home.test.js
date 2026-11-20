import assert from 'node:assert/strict';
import { assembleHome } from '../src/services/homeFeed/assemble.js';
import { variantKey } from '../src/services/related/identity.js';

const mk = (id, title, artist, movie) => ({ id, title, artist, album: movie, movie, duration: 240 });
let n = 0;
const pool = (prefix, count) => Array.from({ length: count }, (_, i) => mk(`${prefix}${i}`, `${prefix} Song ${i} ${'abcdefghij'[i % 10]}${n++}`, `Artist ${prefix}${i}`, `Film ${prefix}${i}`));
const shared = pool('s', 14);                          // appears in several shelves
const plan = [
  { id: 'continue', title: 'Continue listening', pool: shared.slice(0, 6), min: 4 },
  { id: 'mix1', title: 'Daily Mix 1', pool: [...pool('m1_', 12), ...shared.slice(6, 10)] },
  { id: 'mix2', title: 'Daily Mix 2', pool: [...pool('m2_', 12), ...shared.slice(6, 10)] },
  { id: 'mix3', title: 'Daily Mix 3', pool: [...pool('m3_', 12), ...shared.slice(6, 10)] },
  { id: 'trending', title: 'Trending', pool: [...shared, ...pool('t', 12)], heroFrom: true },
  { id: 'new', title: 'New', pool: [...shared.slice(0, 5), ...pool('n', 3)] },   // would be thin after de-duplication
];
const recentSong = pool('r', 1)[0];
const reupload = { ...recentSong, id: 'r0-copy', album: 'Compilation', movie: 'Compilation' };
plan[4].pool.push(recentSong, reupload);
plan[0].pool.push(recentSong);
const blockedSong = plan[1].pool[0];

const out = assembleHome(plan, { seed: 'u:1', exclude: [], recent: [recentSong], blocked: [blockedSong], exempt: ['continue'] });
const all = [...(out.hero ? [out.hero] : []), ...out.sections.flatMap((s) => s.items)];
const keys = all.map((s) => variantKey(s));
assert.equal(new Set(keys).size, keys.length, 'no song (by identity) appears twice on the page');
assert.equal(new Set(all.map((s) => s.id)).size, all.length);
const shelf = (id) => out.sections.find((s) => s.id === id);
assert.ok(shelf('continue').items.some((s) => s.id === recentSong.id), '"Continue listening" may show what was just played');
assert.ok(!out.sections.filter((s) => s.id !== 'continue').some((s) => s.items.some((x) => variantKey(x) === variantKey(recentSong))), 'other shelves skip songs played in the last 24 hours, and their re-uploads');
assert.ok(!all.some((s) => s.id === blockedSong.id), 'a blocked song is on no shelf');
const mixIds = ['mix1', 'mix2', 'mix3'].filter((id) => shelf(id)).map((id) => new Set(shelf(id).items.map((s) => variantKey(s))));
for (let i = 0; i < mixIds.length; i++) for (let j = i + 1; j < mixIds.length; j++) assert.ok([...mixIds[i]].every((k) => !mixIds[j].has(k)), 'Daily Mixes share no songs');
assert.ok(out.hidden.includes('new') && !shelf('new'), 'a shelf that cannot be filled is hidden, not padded with repeats');
// without the new options nothing changes (older callers)
const plain = assembleHome(plan, { seed: 'u:1', exclude: [] });
assert.ok(plain.sections.length >= out.sections.length - 1);
console.log('✓ Home no-repeat: one identity set across shelves (variants too), 24 h skip except "Continue listening", blocked songs gone, Daily Mixes disjoint, thin shelves hidden');
