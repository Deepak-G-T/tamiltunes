import assert from 'node:assert/strict';
import { initDb, db } from '../src/prisma/client.js';
import { createRelatedService } from '../src/services/related/relatedService.js';
import { loadMemory, createMemory } from '../src/services/noRepeat/memory.js';
import { filterCandidates, softAvoidRecent } from '../src/services/noRepeat/filter.js';
import { NO_REPEAT } from '../src/services/noRepeat/config.js';
import { getBlocksStore, resetMemoryBlocks } from '../src/services/noRepeat/blocksStore.js';
import { getSignalsStore, memoryEvents } from '../src/services/related/signalsStore.js';
import { LruCacheService } from '../src/services/cacheService.js';
import { isSameSong } from '../src/services/related/identity.js';

// THE RULE (docs/NO_REPEAT.md): the same song never appears twice inside the QUEUE. Listening history is not a rule.
await initDb();
const S = (id, title, artist, album, duration = 300, extra = {}) => ({ id, title, artist, album, duration, ...extra });
const pairs = {
  pavazha: [S('p1', 'Pavazha Malli', 'Sid Sriram', 'Pavazha Malli - Single', 255), S('p2', 'Pavazha Malli (Unplugged)', 'Sid Sriram', 'Pavazha Malli (Unplugged)', 231)],
  naanUn: [S('n1', 'Naan Un (From "24")', 'A.R. Rahman, Arijit Singh', '24', 281, { image: 'a.jpg' }), S('n2', 'Naan Un (From "24")', 'Arijit Singh, A.R. Rahman', 'Romantic Hits', 281, { image: 'b.jpg' })],
  annul: [S('a1', 'Annul Maelae', 'Sid Sriram', 'Thaanaa Serndha Koottam', 247), S('a2', 'Annul Melae', 'Sid Sriram', 'Thaana Serndha Kootam', 247)],
  innum: [S('i1', 'Innum Konjam Neram', 'Vijay Prakash', 'Maryan', 313), S('i2', 'Innum Konjam Neram', 'Vijay Prakash', 'Maryan (Original Motion Picture Soundtrack)', 313)],
};

// ------------------------------------------------------------------ 1. the hard rules (pure filter)
{
  const mem = createMemory({});
  const other = S('o1', 'Something Else', 'Other Singer', 'Other Film', 200);
  for (const [name, [a, b]] of Object.entries(pairs)) {
    if (name === 'pavazha') continue; // a version, not the same song: covered below
    const out = filterCandidates([b], { current: other, queueSongs: [a], memory: mem });
    assert.equal(out.fresh.length, 0, `${name}: the same song under another id, cover or spelling is not added while it is queued`);
    assert.equal(out.dropped.inQueue, 1);
    const batch = filterCandidates([a, b], { current: other, queueSongs: [], memory: mem });
    assert.equal(batch.fresh.length, 1, `${name}: one copy of the song inside a batch`);
    assert.equal(batch.dropped.duplicateInBatch, 1);
  }
  const [orig, unplugged] = pairs.pavazha;
  assert.equal(filterCandidates([unplugged], { current: orig, queueSongs: [], memory: mem }).fresh.length, 0, 'a version of the PLAYING song is skipped');
  assert.equal(filterCandidates([unplugged], { current: orig, queueSongs: [], memory: mem }).dropped.variantOfCurrent, 1);
  assert.equal(filterCandidates([unplugged], { current: other, queueSongs: [orig], memory: mem }).fresh.length, 1, 'a version of a song that is only queued is allowed (the rule is about the same song, and the current one)');
  assert.equal(filterCandidates([{ ...other, id: 'h1', isHidden: true }, { ...other, id: 'h2', deletedAt: new Date() }], { memory: mem }).fresh.length, 0, 'hidden and deleted songs never');
  const blocked = createMemory({ blocks: [{ id: 'b1', title: 'Kannana Kanne (Unplugged)', artist: 'Sid Sriram', album: 'x', duration: 200 }] });
  assert.equal(filterCandidates([S('b9', 'Kannana Kanne', 'Sid Sriram', 'Viswasam', 240)], { memory: blocked }).fresh.length, 0, '"Don\'t recommend this" blocks the song and its versions');
  // nothing about history is an input any more
  assert.equal(filterCandidates([S('y1', 'Played Yesterday', 'Someone', 'Film', 200)], { current: other, queueSongs: [], memory: mem }).fresh.length, 1);
  console.log('✓ no-repeat: only the playing song (and its versions), what is queued (any id, cover or spelling), blocked and hidden songs are kept out');
}

// ------------------------------------------------------------------ 2. the soft preference
{
  const song = (i) => S(`r${i}`, `Recent Pool Song ${i} ${'abcdefgh'[i % 8]}${i * 7}`, `Singer ${i}`, `Film ${i}`, 200 + i);
  const pool = Array.from({ length: 30 }, (_, i) => song(i));
  const recent = pool.slice(0, 10);
  const big = softAvoidRecent(pool, recent, { minPool: NO_REPEAT.softMinPool });
  assert.equal(big.pool.length, 20, 'a big pool leaves out the last played songs');
  assert.equal(big.applied, true);
  assert.deepEqual(big.pool.map((s) => s.id), pool.slice(10).map((s) => s.id), 'order untouched');
  const small = softAvoidRecent(pool.slice(0, 18), pool.slice(0, 10), { minPool: NO_REPEAT.softMinPool });
  assert.equal(small.pool.length, 18, '18 songs with 10 recent would leave 8 (< 15): the preference is dropped first');
  assert.equal(small.applied, false);
  assert.equal(softAvoidRecent(pool, [], { minPool: 15 }).applied, false);
  assert.equal(NO_REPEAT.recentAvoid, 20);
  assert.equal(NO_REPEAT.softMinPool, 15);
  console.log('✓ no-repeat: the last 20 played are avoided only while at least 15 songs remain; a small pool drops that preference first');
}

// ------------------------------------------------------------------ 3. a big simulated catalogue: the queue never holds the same song twice
let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const ARTISTS = Array.from({ length: 45 }, (_, i) => `Singer ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26)}`);
const WORDS = ['Kanne', 'Nila', 'Mazhai', 'Vennila', 'Kadhal', 'Poove', 'Thendral', 'Nenjam', 'Uyire', 'Megam', 'Vaanam', 'Kaatru', 'Raja', 'Rani', 'Azhagu', 'Imai', 'Siragu', 'Paadal'];
const catalogue = [];
for (let i = 0; i < 900; i++) {
  const title = `${WORDS[i % WORDS.length]} ${WORDS[(i * 7 + 3) % WORDS.length]} ${i}`;
  const artist = ARTISTS[i % ARTISTS.length];
  const base = S(`s${i}`, title, artist, `Film ${Math.floor(i / 6)}`, 200 + (i % 120), { year: 1995 + (i % 28), composer: `Composer ${i % 9}`, language: 'tamil' });
  catalogue.push(base);
  if (i % 12 === 0) catalogue.push({ ...base, id: `dup${i}`, album: 'Romantic Hits' });                                                         // compilation copy, another id
  if (i % 17 === 0) catalogue.push({ ...base, id: `unp${i}`, title: `${title} (Unplugged)`, album: `Unplugged ${i}`, duration: base.duration - 40 }); // a version
  if (i % 29 === 0) { const t = title.replace('Kanne', 'Kaanne').replace('Mazhai', 'Mazhaai'); if (t !== title) catalogue.push({ ...base, id: `spl${i}`, title: t, album: `Alt ${i}` }); } // spelling variant
}
const byId = new Map(catalogue.map((s) => [s.id, s]));
const providerOf = (list) => ({
  getSong: async (id) => list.find((s) => s.id === id) || null,
  getRecommendations: async (id, n = 30) => Array.from({ length: n }, () => list[Math.floor(rnd() * list.length)]),
  searchTracks: async (q) => ({ songs: list.filter((s) => s.artist.includes(q) || s.album.includes(q) || (s.composer || '').includes(q)).slice(0, 40) }),
  getHomeFeed: async () => ({ trending: list.slice(0, 60), latest: list.slice(60, 120), gana: [], nineties: list.slice(120, 200), twoThousands: list.slice(200, 280), melodies: list.slice(280, 360), love: [], sad: [], folk: [], instrumental: [] }),
});
const signals = getSignalsStore();
for (const s of catalogue) db.songs.set(s.id, { ...s, createdAt: new Date() });
const serviceFor = (list, userId = null) => createRelatedService({
  manager: providerOf(list), signals, cache: new LruCacheService(500, 300), now: () => Date.UTC(2026, 10, 20),
  loadMemory: (o) => loadMemory({ ...o, blocksStore: getBlocksStore() }),
});

{
  const service = serviceFor(catalogue);
  let current = catalogue[0];
  const upcoming = [];
  let maxRadio = 0; let refills = 0; let requested = 0;
  const everyQueue = () => [current, ...upcoming];
  const assertNoDuplicates = (label) => {
    const q = everyQueue();
    for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) assert.ok(!isSameSong(q[i], q[j]), `${label}: the queue holds the same song twice: ${q[i].id} and ${q[j].id}`);
  };
  const played = [];
  for (let step = 0; step < 300; step++) {
    if (upcoming.length < 5) {
      refills++;
      const { items, meta } = await service.getRelated(current.id, { limit: 50, exclude: everyQueue().map((s) => s.id), recent: played.slice(-30).reverse().map((s) => s.id) });
      requested += 50;
      assert.ok(!meta.exhausted, 'a 900-song catalogue never runs dry');
      upcoming.push(...items);
      maxRadio = Math.max(maxRadio, upcoming.length);
      assertNoDuplicates(`step ${step}`);
      assert.ok(items.length >= 10, 'a batch is big (we ask for 50)');
    }
    played.push(current);
    current = upcoming.shift();
    assertNoDuplicates(`after step ${step}`);
  }
  assert.ok(maxRadio >= 30, `the queue is kept well stocked (reached ${maxRadio})`);
  console.log(`✓ no-repeat: 300 songs played, ${refills} refills of 50: never the same song (id, cover, spelling) twice in the queue; the queue peaked at ${maxRadio} songs`);
}

// ------------------------------------------------------------------ 4. history is not a rule
{
  const user = 'history-user';
  const yesterday = Date.UTC(2026, 10, 19, 12);
  const clock = Date.UTC(2026, 10, 20, 12);
  const tiny = [S('t0', 'Seed Song', 'Solo', 'Film', 250, { language: 'tamil', composer: 'Comp' }), ...Array.from({ length: 7 }, (_, i) => S(`t${i + 1}`, `Tiny ${i + 1} ${WORDS[i]}`, `Voice ${i + 1}`, `Film ${i + 1}`, 200 + i * 7, { language: 'tamil', composer: 'Comp', year: 2010 + i }))];
  for (const s of tiny) db.songs.set(s.id, { ...s, createdAt: new Date() });
  const svc = (list) => createRelatedService({ manager: providerOf(list), signals, cache: new LruCacheService(50, 300), now: () => clock, loadMemory: (o) => loadMemory({ ...o, blocksStore: getBlocksStore() }) });

  // the listener played EVERY song to the end yesterday, and skipped some early last week
  tiny.forEach((s, i) => signals.recordPlayEvent({ userId: user, songId: s.id, completed: true, source: 'radio', playedAt: new Date(yesterday + i * 60e3) }));
  tiny.slice(1, 4).forEach((s, i) => signals.recordPlayEvent({ userId: user, songId: s.id, completed: false, skippedAtSec: 5, source: 'radio', playedAt: new Date(clock - 3 * 86400e3 + i * 60e3) }));
  const all = await svc(tiny).getRelated('t0', { limit: 50, exclude: ['t0'], userId: user });
  assert.equal(all.items.length, 7, 'songs played yesterday (and skipped early last week) come back: history is not a rule');
  assert.equal(all.meta.exhausted, false, 'the listener having heard everything never means "out of new songs"');

  // a small pool still fills the queue, even when every song is among the last played
  const recent = tiny.slice().reverse().map((s) => s.id);
  const small = await svc(tiny).getRelated('t0', { limit: 50, exclude: ['t0'], userId: user, recent });
  assert.equal(small.items.length, 7, 'a pool smaller than 15 drops the preference and returns everything');
  assert.equal(small.meta.softApplied, false);

  // exhausted only when nothing is left after the hard rules: everything is already in the queue
  const inQueue = await svc(tiny).getRelated('t0', { limit: 50, exclude: tiny.map((s) => s.id), userId: user });
  assert.equal(inQueue.items.length, 0);
  assert.equal(inQueue.meta.exhausted, true, 'every song is in the queue (or a copy of it): nothing new is left');
  assert.ok(inQueue.meta.widened.includes('trending'), 'every widening step was tried first');
  // ... and a copy of a queued song under another id does not count as new
  const copies = tiny.slice(1).map((s) => ({ ...s, id: `copy_${s.id}`, album: 'Compilation' }));
  const withCopies = [...tiny, ...copies];
  for (const s of copies) db.songs.set(s.id, { ...s, createdAt: new Date() });
  const copyRun = await svc(withCopies).getRelated('t0', { limit: 50, exclude: tiny.map((s) => s.id), userId: user });
  assert.equal(copyRun.items.length, 0, 'copies of queued songs are the same song');
  assert.equal(copyRun.meta.exhausted, true);

  // a big pool does avoid the last 20 played (a preference), a small one does not
  const bigList = catalogue.slice(0, 120);
  const bigSvc = serviceFor(bigList);
  const seedSong = bigList[0];
  const first = await bigSvc.getRelated(seedSong.id, { limit: 50, exclude: [seedSong.id] });
  const recent20 = first.items.slice(0, 20).map((s) => s.id);
  const second = await bigSvc.getRelated(seedSong.id, { limit: 50, exclude: [seedSong.id], recent: recent20 });
  assert.equal(second.meta.softApplied, true, 'with plenty of songs left the last 20 played are left out');
  assert.ok(second.items.every((s) => !recent20.some((id) => isSameSong(s, byId.get(id)))), 'none of the last played songs came back while the pool was big');
  memoryEvents.length = 0;
  console.log('✓ no-repeat: a song played yesterday can come back; a small pool still fills the queue; "out of new songs" only when everything is already queued; the last-20 preference works on a big pool only');
}

// ------------------------------------------------------------------ 5. "Don't recommend this" still holds
{
  const user = 'block-user';
  const list = [S('k0', 'Seed', 'Solo', 'Film', 250, { language: 'tamil' }), ...Array.from({ length: 5 }, (_, i) => S(`k${i + 1}`, `Block Test ${i + 1} ${WORDS[i]}`, `Voice ${i + 1}`, `Film ${i + 1}`, 200 + i, { language: 'tamil' }))];
  for (const s of list) db.songs.set(s.id, { ...s, createdAt: new Date() });
  const svc = createRelatedService({ manager: providerOf(list), signals, cache: new LruCacheService(50, 300), loadMemory: (o) => loadMemory({ ...o, blocksStore: getBlocksStore() }) });
  await getBlocksStore().add(user, list[1]);
  const run = await svc.getRelated('k0', { limit: 50, exclude: ['k0'], userId: user });
  assert.ok(!run.items.some((i) => i.id === 'k1'), 'a blocked song never returns');
  assert.equal(run.items.length, 4);
  resetMemoryBlocks();
  console.log('✓ no-repeat: "Don\'t recommend this" still keeps a song out');
}
process.exit(0);
