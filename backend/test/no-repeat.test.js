import assert from 'node:assert/strict';
import app from '../src/app.js';
import { initDb } from '../src/prisma/client.js';
import { config } from '../src/config/env.js';
import { musicService } from '../src/services/music/providerManager.js';
import { createRelatedService } from '../src/services/related/relatedService.js';
import { createMemory, loadMemory } from '../src/services/noRepeat/memory.js';
import { filterCandidates } from '../src/services/noRepeat/filter.js';
import { NO_REPEAT } from '../src/services/noRepeat/config.js';
import { getBlocksStore, resetMemoryBlocks } from '../src/services/noRepeat/blocksStore.js';
import { getQueueStore, } from '../src/services/queueState/store.js';
import { getSignalsStore, memoryEvents } from '../src/services/related/signalsStore.js';
import { LruCacheService } from '../src/services/cacheService.js';
import { variantKey } from '../src/services/related/identity.js';

await initDb();
musicService.setProvider('mock');
const DAY = 86400e3;
const S = (id, title, artist, album, duration = 300, extra = {}) => ({ id, title, artist, album, duration, ...extra });

// ------------------------------------------------------------------ 1. the reported pairs (same song, different id / cover / spelling / version)
const pairs = {
  pavazha: [S('p1', 'Pavazha Malli', 'Sid Sriram', 'Pavazha Malli - Single', 255), S('p2', 'Pavazha Malli (Unplugged)', 'Sid Sriram', 'Pavazha Malli (Unplugged)', 231)],
  naanUn: [S('n1', 'Naan Un (From "24")', 'A.R. Rahman, Arijit Singh', '24', 281, { image: 'a.jpg' }), S('n2', 'Naan Un (From "24")', 'Arijit Singh, A.R. Rahman', 'Romantic Hits', 281, { image: 'b.jpg' })],
  annul: [S('a1', 'Annul Maelae', 'Sid Sriram', 'Thaanaa Serndha Koottam', 247), S('a2', 'Annul Melae', 'Sid Sriram', 'Thaana Serndha Kootam', 247)],
  innum: [S('i1', 'Innum Konjam Neram', 'Vijay Prakash', 'Maryan', 313), S('i2', 'Innum Konjam Neram', 'Vijay Prakash', 'Maryan (Original Motion Picture Soundtrack)', 313)],
};
{
  const mem = createMemory({});
  for (const [name, [a, b]] of Object.entries(pairs)) {
    const out = filterCandidates([b], { queueSongs: [a], memory: mem });
    assert.equal(out.fresh.length, 0, `${name}: the copy / version of a queued song is not offered`);
    const batch = filterCandidates([a, b], { queueSongs: [], memory: mem });
    assert.equal(batch.fresh.length, 1, `${name}: one copy per song inside a batch`);
  }
  console.log('✓ no-repeat identity: re-uploads, compilation copies, spelling variants and versions all count as the same song (the reported fixtures)');
}

// ------------------------------------------------------------------ 2. memory, cool-down, blocks, hidden
{
  const now = Date.UTC(2026, 10, 20, 12);
  const song = S('x1', 'Kannana Kanne', 'Sid Sriram', 'Viswasam', 240);
  const play = (s, daysAgo, over = {}) => ({ song: s, playedAt: now - daysAgo * DAY, completed: true, skippedAtSec: null, ...over });
  const mk = (plays, extra = {}) => createMemory({ plays, now, ...extra });
  const dropped = (mem, s, opts = {}) => filterCandidates([s], { memory: mem, ...opts }).fresh.length === 0;

  assert.ok(dropped(mk([play(song, 6)]), song), 'played to the end 6 days ago: held back (7-day cool-down)');
  const rolledOut = mk([play(song, 8)]);
  assert.ok(rolledOut.inRolling(song) === true && !rolledOut.inCooldown(song), '8 days ago: out of the cool-down');
  assert.ok(!dropped(mk([play(song, 8)], { }), S('y9', 'Totally Different', 'Other', 'Film', 200)), 'an unrelated song is never held back');
  assert.ok(mk([play(song, 29, { completed: false, skippedAtSec: 8 })]).inCooldown(song), 'skipped early 29 days ago: still cooling (30-day cool-down)');
  assert.ok(!mk([play(song, 31, { completed: false, skippedAtSec: 8 })]).inCooldown(song), 'skipped early 31 days ago: free (outside the cool-down)');
  assert.ok(!mk([play(song, 8, { completed: false, skippedAtSec: 120 })]).inCooldown(song), 'left after 2 minutes counts as heard (7 days), not as an early skip');

  const blocked = createMemory({ now, blocks: [{ id: 'b1', title: 'Kannana Kanne (Unplugged)', artist: 'Sid Sriram', album: 'x', duration: 200 }] });
  assert.ok(dropped(blocked, song), '"Don\'t recommend this" blocks the song and its versions for ever');
  assert.ok(dropped(blocked, song, { allowRepeats: true }), '... even when repeats are allowed');
  assert.ok(dropped(mk([]), { ...song, isHidden: true }), 'hidden songs never come back');

  // liked songs: exempt inside "Liked songs" playback, back after 24 h in Taste Radio, normal in a plain radio
  const liked = new Set(['x1']);
  const recent = (hoursAgo) => mk([play(song, hoursAgo / 24)], { liked });
  assert.ok(!recent(2).inCooldown(song, { context: 'liked' }), 'liked: never held back inside Liked songs');
  assert.ok(recent(2).inCooldown(song, { context: 'taste' }) && !recent(30).inCooldown(song, { context: 'taste' }), 'liked: Taste Radio may bring it back after 24 hours, not before');
  assert.ok(recent(30).inCooldown(song, { context: 'radio' }), 'liked: a plain radio still keeps it out for 7 days');
  console.log('✓ cool-down 7 days after a full listen, 30 days after an early skip, blocks and hidden never return, liked-song exemptions');
}

// ------------------------------------------------------------------ 3. a big simulated catalogue and a 500-song session
let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const ARTISTS = Array.from({ length: 45 }, (_, i) => `Singer ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26)}`);
const WORDS = ['Kanne', 'Nila', 'Mazhai', 'Vennila', 'Kadhal', 'Poove', 'Thendral', 'Nenjam', 'Uyire', 'Megam', 'Vaanam', 'Kaatru', 'Raja', 'Rani', 'Azhagu', 'Imai', 'Siragu', 'Paadal'];
const group = new Map(); // song id -> the TRUE canonical song group (the test's own oracle)
const catalogue = [];
for (let i = 0; i < 900; i++) {
  const title = `${WORDS[i % WORDS.length]} ${WORDS[(i * 7 + 3) % WORDS.length]} ${i}`; // unique, "i" keeps titles apart
  const artist = ARTISTS[i % ARTISTS.length];
  const base = S(`s${i}`, title, artist, `Film ${Math.floor(i / 6)}`, 200 + (i % 120), { year: 1995 + (i % 28), composer: `Composer ${i % 9}` });
  catalogue.push(base); group.set(base.id, i);
  if (i % 12 === 0) { const d = S(`dup${i}`, title, artist, 'Romantic Hits', base.duration, { year: base.year }); catalogue.push(d); group.set(d.id, i); }        // compilation copy, another id
  if (i % 17 === 0) { const u = S(`unp${i}`, `${title} (Unplugged)`, artist, `Unplugged ${i}`, base.duration - 40, { year: base.year }); catalogue.push(u); group.set(u.id, i); } // a version
  if (i % 29 === 0) { const sp = S(`spl${i}`, title.replace('Kanne', 'Kaanne').replace('Mazhai', 'Mazhaai'), artist, `Alt ${i}`, base.duration, { year: base.year }); if (sp.title !== title) { catalogue.push(sp); group.set(sp.id, i); } } // spelling variant
}
const byId = new Map(catalogue.map((s) => [s.id, s]));
const manager = {
  getSong: async (id) => byId.get(id) || null,
  getRecommendations: async (id, n = 30) => Array.from({ length: n }, () => catalogue[Math.floor(rnd() * catalogue.length)]),
  searchTracks: async (q) => ({ songs: catalogue.filter((s) => s.artist.includes(q) || s.album.includes(q) || (s.composer || '').includes(q)).slice(0, 40) }),
  getHomeFeed: async () => ({ trending: catalogue.slice(0, 60), latest: catalogue.slice(60, 120), gana: catalogue.slice(120, 150), nineties: catalogue.slice(150, 220), twoThousands: catalogue.slice(220, 300), melodies: catalogue.slice(300, 380), love: [], sad: [], folk: [], instrumental: [] }),
};
byId.forEach((s) => { /* the mock catalogue keeps Tamil as the language */ s.language = 'tamil'; });
const signals = getSignalsStore();
// the catalogue lives in the in-memory song table so play history can be joined back to song metadata (like the real database does)
const { db } = await import('../src/prisma/client.js');
for (const s of catalogue) db.songs.set(s.id, { ...s, createdAt: new Date() });

{
  const user = 'sim-user';
  let clock = Date.UTC(2026, 10, 1);
  const service = createRelatedService({
    manager, signals, cache: new LruCacheService(500, 300), now: () => clock,
    loadMemory: (opts) => loadMemory({ ...opts, signals, queueStore: getQueueStore(), blocksStore: getBlocksStore() }),
  });
  let current = catalogue[0];
  let upcoming = [];
  const played = [];            // song ids in play order
  const playedGroups = [];      // the oracle's canonical group of each played song
  const heard = [];             // session memory saved with the queue
  let exhausted = 0, maxQueueRepeats = 0, rollingRepeats = 0, totalRepeats = 0;
  const groupsIn = (list) => list.map((s) => group.get(s.id));
  const remember = (song) => { if (!heard.some((h) => h.id === song.id)) heard.push({ k: variantKey(song), id: song.id }); };
  remember(current);
  for (let step = 0; step < 500; step++) {
    if (upcoming.length < 3) {
      const exclude = [current.id, ...upcoming.map((s) => s.id), ...played.slice(-150).reverse()].slice(0, NO_REPEAT.maxExclude);
      await getQueueStore().put(user, { items: [], currentIndex: -1, positionSec: 0, shuffle: false, repeat: 'off', autoplay: true, mode: 'radio', heard: heard.slice(-NO_REPEAT.sessionMemoryMax), allowRepeats: false });
      const { items, meta } = await service.getRelated(current.id, { limit: 10, exclude, userId: user });
      if (meta.exhausted) { exhausted++; break; }
      for (const it of items) {
        const g = group.get(it.id);
        const inQueue = [current, ...upcoming].some((q) => group.get(q.id) === g);
        if (inQueue) maxQueueRepeats++;
        if (playedGroups.slice(-NO_REPEAT.rollingHistory).includes(g)) rollingRepeats++;
        if (playedGroups.includes(g)) totalRepeats++;
        upcoming.push(it); remember(it);
      }
    }
    const next = upcoming.shift();
    // listening: 70% to the end, 30% an early skip
    const full = rnd() < 0.7;
    signals.recordPlayEvent({ userId: user, songId: current.id, completed: full, skippedAtSec: full ? null : 8, source: 'radio', playedAt: new Date(clock) });
    clock += 4 * 60e3;
    played.push(current.id); playedGroups.push(group.get(current.id));
    current = next;
    // the queue never holds the same song twice at any moment
    const g = groupsIn([current, ...upcoming]);
    assert.equal(new Set(g).size, g.length, `step ${step}: the queue holds the same song twice`);
  }
  assert.equal(exhausted, 0, 'a 900-song catalogue is never "exhausted" in a 500-song session');
  assert.equal(played.length, 500);
  assert.equal(maxQueueRepeats, 0, 'zero repeats inside the queue');
  assert.equal(rollingRepeats, 0, 'zero repeats of the last 200 played');
  assert.equal(totalRepeats, 0, 'and none at all inside the 7-day cool-down (the whole session lasts 33 hours)');
  console.log(`✓ 500-song simulated session: zero repeats in the queue, zero repeats of the last 200 played, zero repeats overall (catalogue ${catalogue.length} songs, ${new Set(group.values()).size} real songs)`);
  memoryEvents.length = 0;
}

// ------------------------------------------------------------------ 4. a tiny catalogue: widening, then the prompt, then repeats only when allowed
{
  const user = 'tiny-user';
  const tiny = [S('t0', 'Seed Song', 'Solo', 'Film', 250, { language: 'tamil', composer: 'Comp' }), ...Array.from({ length: 6 }, (_, i) => S(`t${i + 1}`, `Tiny ${i + 1} ${WORDS[i]}`, `Voice ${i + 1}`, `Film ${i + 1}`, 200 + i * 7, { language: 'tamil', composer: 'Comp' }))];
  const tinyMap = new Map(tiny.map((s) => [s.id, s]));
  for (const s of tiny) db.songs.set(s.id, { ...s, createdAt: new Date() });
  const searched = [];
  const tinyManager = {
    getSong: async (id) => tinyMap.get(id) || null,
    getRecommendations: async () => tiny.slice(1),
    searchTracks: async (q) => { searched.push(q); return { songs: tiny }; },
    getHomeFeed: async () => ({ trending: tiny, latest: [], gana: [], nineties: [], twoThousands: [], melodies: [], love: [], sad: [], folk: [], instrumental: [] }),
  };
  let clock = Date.UTC(2026, 10, 10);
  const svc = createRelatedService({ manager: tinyManager, signals, cache: new LruCacheService(50, 300), now: () => clock, loadMemory: (o) => loadMemory({ ...o, signals, queueStore: getQueueStore(), blocksStore: getBlocksStore() }) });
  const first = await svc.getRelated('t0', { limit: 10, userId: user, exclude: ['t0'] });
  assert.equal(first.items.length, 6, 'a fresh listener gets every song');
  assert.ok(first.meta.widened.length > 0, 'fewer than 10 fresh songs: the search was widened step by step');
  assert.deepEqual(first.meta.widened.slice(0, 2), ['composer', 'era'], 'in the order: same music director, then same era');
  assert.equal(first.meta.exhausted, false);

  // the listener plays everything
  tiny.forEach((s, i) => signals.recordPlayEvent({ userId: user, songId: s.id, completed: true, source: 'radio', playedAt: new Date(clock - (tiny.length - i) * 60e3) }));
  const second = await svc.getRelated('t0', { limit: 10, userId: user, exclude: ['t0'] });
  assert.equal(second.items.length, 0, 'everything heard: no old song is silently reused');
  assert.equal(second.meta.exhausted, true, 'the app is told so it can show "You\'ve heard everything close to this"');
  assert.ok(second.meta.widened.includes('trending'), 'every widening step was tried first');

  // "Play something different" (wide) also finds nothing new here, never repeats
  const wide = await svc.getRelated('t0', { limit: 10, userId: user, exclude: ['t0'], wide: true });
  assert.equal(wide.items.length, 0);

  // the listener agrees to repeats: least recently played first, flagged, queue duplicates still refused
  const again = await svc.getRelated('t0', { limit: 4, userId: user, exclude: ['t0'], allowRepeats: true });
  assert.equal(again.items.length, 4);
  assert.ok(again.items.every((i) => i.repeat === true && i.why === 'Played before'));
  assert.deepEqual(again.items.map((i) => i.id).slice(0, 2), ['t1', 't2'], 'the least recently played songs come first');
  assert.ok(!again.items.some((i) => i.id === 't0'), 'the playing song is never repeated');
  // a blocked song never returns, not even with repeats
  await getBlocksStore().add(user, tinyMap.get('t1'));
  const blockedRun = await svc.getRelated('t0', { limit: 6, userId: user, exclude: ['t0'], allowRepeats: true });
  assert.ok(!blockedRun.items.some((i) => i.id === 't1'), '"Don\'t recommend this" holds even with repeats allowed');
  resetMemoryBlocks(); memoryEvents.length = 0;
  console.log('✓ pool exhaustion: widens composer > era > language > trending, then says "exhausted" (never a silent repeat); allow repeats brings the least recently played back first; blocks always hold');
}

// ------------------------------------------------------------------ 5. API: the saved memory is shared by devices, blocks over HTTP
config.requireLogin = true;
const server = app.listen(5041);
const BASE = 'http://localhost:5041/api';
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, json: ct.includes('json') ? await res.json() : null };
};
try {
  const tag = Math.random().toString(36).slice(2, 7);
  const reg = await call('POST', '/auth/register', { body: { name: 'No Repeat', email: `norepeat.${tag}@example.com`, password: 'password-12345' } });
  assert.equal(reg.status, 201);
  const token = reg.json.token;
  const home = await call('GET', '/music/home', { token });
  const ids = (home.json.data.trending || []).slice(0, 6).map((s) => s.id);
  assert.ok(ids.length >= 4, 'the mock provider has songs');

  // device A saves its queue with a session memory; device B reads the same account and sees it
  const heard = ids.slice(0, 3).map((id) => ({ k: `key-${id}`, id }));
  const put = await call('PUT', '/me/queue', { token, body: { items: [{ id: ids[3], o: 'r' }], currentIndex: 0, positionSec: 0, shuffle: false, repeat: 'off', autoplay: true, mode: 'radio', deviceId: 'deviceA', heard, allowRepeats: false } });
  assert.equal(put.status, 200, JSON.stringify(put.json));
  const get = await call('GET', '/me/queue', { token });
  assert.deepEqual(get.json.queue.heard, heard, 'a second device gets the same session memory');
  assert.equal((await call('PUT', '/me/queue', { token, body: { items: [], currentIndex: -1, positionSec: 0, shuffle: false, repeat: 'off', autoplay: true, mode: 'radio', heard: Array.from({ length: NO_REPEAT.sessionMemoryMax + 1 }, (_, i) => ({ k: `k${i}` })) } })).status, 400, 'the memory is capped');
  assert.equal((await call('PUT', '/me/queue', { token, body: { items: [], currentIndex: -1, positionSec: 0, shuffle: false, repeat: 'off', autoplay: true, mode: 'radio', heard: [{ k: 'x', title: 'injected' }] } })).status, 400, 'nothing but compact keys is accepted');

  // the related endpoint on "device B" leaves the remembered songs out
  const rel = await call('GET', `/songs/${ids[3]}/related?limit=20`, { token });
  assert.equal(rel.status, 200);
  assert.ok(rel.json.items.every((s) => !ids.slice(0, 3).includes(s.id)), 'songs remembered by another device are not suggested');
  assert.ok('exhausted' in rel.json.meta && 'widened' in rel.json.meta && 'fresh' in rel.json.meta, 'the batch tells the app what it needs for the prompt');

  // "Don't recommend this" over HTTP
  assert.equal((await call('POST', '/me/blocks', { token: null, body: { songId: ids[4] } })).status, 401);
  assert.equal((await call('POST', '/me/blocks', { token, body: { songId: ids[4], title: 'client text is never trusted' } })).status, 400);
  const add = await call('POST', '/me/blocks', { token, body: { songId: ids[4] } });
  assert.equal(add.status, 201);
  assert.notEqual(add.json.item.title, 'client text is never trusted');
  assert.equal((await call('GET', '/me/blocks', { token })).json.items.length, 1);
  const rel2 = await call('GET', `/songs/${ids[3]}/related?limit=30`, { token });
  assert.ok(!rel2.json.items.some((s) => s.id === ids[4]), 'a blocked song never comes back in a radio');
  assert.equal((await call('DELETE', `/me/blocks/${ids[4]}`, { token })).status, 200);
  assert.equal((await call('GET', '/me/blocks', { token })).json.items.length, 0, 'unblocking works');
  assert.equal((await call('DELETE', `/me/blocks/${ids[4]}`, { token })).status, 404);
  // another account never sees or is affected by these blocks
  const other = await call('POST', '/auth/register', { body: { name: 'Other One', email: `other.${tag}@example.com`, password: 'password-12345' } });
  await call('POST', '/me/blocks', { token, body: { songId: ids[5] } });
  assert.equal((await call('GET', '/me/blocks', { token: other.json.token })).json.items.length, 0, 'blocks belong to one account');
  console.log('✓ API: the session memory is saved with the queue and shared by devices (capped, compact keys only); "Don\'t recommend this" works, ignores client text, is per account');
} finally {
  server.close();
}
process.exit(0);
