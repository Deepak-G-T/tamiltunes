import assert from 'node:assert/strict';
import app from '../src/app.js';
import { initDb, db } from '../src/prisma/client.js';
import { musicService } from '../src/services/music/providerManager.js';
import { musicCache } from '../src/services/cacheService.js';
import { getSpeedDialStore } from '../src/services/speedDial/store.js';
import { SPEED_DIAL as C } from '../src/services/speedDial/config.js';

await initDb();
musicService.setProvider('mock'); // offline catalogue: trending songs are the suggestions
musicCache.clear();
const server = app.listen(5014);
const BASE = 'http://localhost:5014/api';
const tag = Math.random().toString(36).slice(2, 7);

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
};
const signup = async (label) => {
  const r = await call('POST', '/auth/register', { body: { name: `Dial ${label}`, email: `dial_${label}_${tag}@example.com`, password: 'secret12' } });
  assert.equal(r.status, 201);
  return { token: r.json.token, id: r.json.user.id };
};
const SONG = (id, extra = {}) => ({ songId: id, title: `Test ${id}`, artist: 'Tester', album: 'Alb', image: 'https://img/x.jpg', duration: 200, streamUrl: `https://s/${id}.mp4`, ...extra });
const ensureSong = (id) => db.song.upsert({ where: { id }, create: { id, title: `Test ${id}`, artist: 'Tester', duration: 200, streamUrl: `https://s/${id}.mp4`, isPlayable: true }, update: {} });
const DAY = 86400e3;
// seed events straight into the store with a chosen date (what the API cannot do)
const seed = async (userId, songId, n, daysAgo, label = songId) => {
  await ensureSong(songId);
  for (let i = 0; i < n; i++) await getSpeedDialStore().upsertPlayEvent(userId, { songId, playedAt: new Date(Date.now() - daysAgo * DAY), listenedSec: 60, durationSec: 200, playId: `seed:${label}:${daysAgo}:${i}`, source: 'speed-dial' });
};
const ids = (r) => r.json.items.map((i) => i.id);
const sd = (token) => call('GET', '/me/speed-dial', { token });
let n = 0;
const playId = () => `play-${tag}-${++n}-xxxxxxxx`;

try {
  const [A, B, G] = await Promise.all(['a', 'b', 'g'].map(signup));

  // ---------- auth ----------
  for (const [m, p] of [['GET', '/me/speed-dial'], ['POST', '/me/play-events'], ['PUT', '/me/speed-dial/order'], ['DELETE', '/me/speed-dial/x']]) {
    assert.equal((await call(m, p)).status, 401, `${m} ${p} needs a login`);
  }

  // ---------- new user: suggestions fill the grid ----------
  let r = await sd(A.token);
  assert.equal(r.status, 200);
  assert.ok(r.json.items.length >= 3 && r.json.items.length <= C.slots, `got ${r.json.items.length}`);
  assert.ok(r.json.items.every((i) => i.source === 'suggested' && i.playCount === 0 && !i.hot), 'nothing played yet: every tile is a suggestion');
  assert.equal(r.json.meta.hasPlayed, false);
  assert.deepEqual(r.json.items.map((i) => i.rank), r.json.items.map((_, i) => i + 1));
  console.log('✓ new user gets a full grid of suggested popular songs, marked as suggested');

  // ---------- the play threshold is enforced by the server ----------
  const below = await call('POST', '/me/play-events', { token: A.token, body: { ...SONG('t1'), listenedSec: 10, durationSec: 200, playId: playId() } });
  assert.equal(below.status, 202);
  assert.equal(below.json.recorded, false);
  assert.equal(below.json.reason, 'below-threshold');
  const at30 = await call('POST', '/me/play-events', { token: A.token, body: { ...SONG('t1'), listenedSec: 30, durationSec: 200, playId: playId() } });
  assert.equal(at30.status, 201);
  assert.equal(at30.json.counted, true);
  const half = await call('POST', '/me/play-events', { token: A.token, body: { ...SONG('short'), duration: 40, listenedSec: 20, durationSec: 40, playId: playId() } });
  assert.equal(half.json.counted, true, 'half of a 40 s song counts');
  assert.equal((await call('POST', '/me/play-events', { token: A.token, body: { ...SONG('t1'), listenedSec: -1 } })).status, 400);
  assert.equal((await call('POST', '/me/play-events', { token: A.token, body: { songId: 'x' } })).status, 400);
  r = await sd(A.token);
  // t1 and short tie on score (one play each): the one played most recently comes first
  assert.deepEqual(ids(r).slice(0, 2), ['short', 't1']);
  const t1 = r.json.items.find((i) => i.id === 't1');
  assert.equal(t1.source, 'played');
  assert.equal(t1.playCount, 1);
  assert.equal(r.json.meta.hasPlayed, true);
  console.log('✓ plays count only after 30 s or 50% of the song; below that is ignored; bad input is rejected');

  // ---------- completion updates the same play; skips ----------
  const pid = playId();
  await call('POST', '/me/play-events', { token: A.token, body: { ...SONG('t2'), listenedSec: 40, durationSec: 200, playId: pid } });
  await call('POST', '/me/play-events', { token: A.token, body: { ...SONG('t2'), listenedSec: 200, durationSec: 200, completed: true, playId: pid } });
  const t2 = (await getSpeedDialStore().scoreSongs(A.id)).find((x) => x.songId === 't2');
  assert.equal(t2.plays, 1, 'completion updates the existing play: it is not a second play');
  assert.ok(Math.abs(t2.score - (C.playWeight + C.completionBonus)) < 0.01, `score ${t2.score}`);
  const skip = await call('POST', '/me/play-events', { token: A.token, body: { ...SONG('t3'), listenedSec: 5, durationSec: 200, skippedAtSec: 5, playId: playId() } });
  assert.equal(skip.status, 201, 'an early skip is recorded');
  assert.equal(skip.json.counted, false);
  assert.equal((await call('POST', '/me/play-events', { token: A.token, body: { ...SONG('t3'), listenedSec: 1, skippedAtSec: 1, playId: playId() } })).json.reason, 'too-short', 'a 1 s mis-tap is not a skip');
  assert.ok(!ids(await sd(A.token)).includes('t3'), 'a song that was only skipped never reaches the grid');
  console.log('✓ completion upgrades the same play; early skips are kept but never rank; mis-taps are ignored');

  // ---------- ranking with recency decay (the brief's example) ----------
  await Promise.all(['recent', 'older', 'ancient'].map(ensureSong));
  await seed(B.id, 'recent', 20, 6);
  await seed(B.id, 'older', 10, 60);
  await seed(B.id, 'ancient', 30, 365);
  r = await sd(B.token);
  const played = r.json.items.filter((i) => i.source === 'played');
  assert.deepEqual(played.map((i) => i.id), ['recent', 'older'], '20 plays last week beat 10 plays two months ago; plays from a year ago are ignored');
  assert.equal(played[0].playCount, 20);
  assert.deepEqual(played.map((i) => i.hot), [true, true]);
  assert.equal(r.json.items.length > 2, true, 'rest filled with suggestions');
  console.log('✓ ranking over 90 days with recency decay, played songs first, then suggestions');

  // ---------- pin, hide, unpin, reset ----------
  let pinRes = await call('POST', '/me/speed-dial/pin', { token: B.token, body: { songId: 'older', slot: 0 } });
  assert.equal(pinRes.status, 200);
  r = await sd(B.token);
  assert.equal(r.json.items[0].id, 'older');
  assert.equal(r.json.items[0].pinned, true);
  assert.equal(r.json.items[1].id, 'recent', 'ranking continues around the pin');
  assert.equal((await call('POST', '/me/speed-dial/pin', { token: B.token, body: { songId: 'nope_zz' } })).status, 404);
  assert.equal((await call('POST', '/me/speed-dial/pin', { token: B.token, body: { songId: 'x', slot: 9 } })).status, 400);
  // pin a suggested song straight from the grid
  const suggestion = r.json.items.find((i) => i.source === 'suggested');
  assert.equal((await call('POST', '/me/speed-dial/pin', { token: B.token, body: { songId: suggestion.id, slot: 4 } })).status, 200);
  r = await sd(B.token);
  assert.equal(r.json.items[Math.min(4, r.json.items.length - 1)].id, suggestion.id);
  // hide (remove)
  assert.equal((await call('DELETE', '/me/speed-dial/recent', { token: B.token })).status, 200);
  r = await sd(B.token);
  assert.ok(!ids(r).includes('recent'), 'removed songs leave the grid');
  // hiding a pinned song unpins it
  await call('DELETE', '/me/speed-dial/older', { token: B.token });
  assert.ok(!ids(await sd(B.token)).includes('older'));
  // unpin the suggestion; reset restores the automatic ranking
  await call('DELETE', `/me/speed-dial/${suggestion.id}/pin`, { token: B.token });
  assert.equal((await call('DELETE', '/me/speed-dial', { token: B.token })).status, 200);
  r = await sd(B.token);
  assert.deepEqual(r.json.items.filter((i) => i.source === 'played').map((i) => i.id), ['recent', 'older']);
  assert.equal(r.json.items.some((i) => i.pinned), false);
  console.log('✓ pin keeps a slot, hide removes, hiding unpins, unpin and reset restore automatic ranking');

  // ---------- drag and drop ----------
  r = await sd(B.token);
  const order = ids(r);
  const swapped = [order[1], order[0], ...order.slice(2)];
  assert.equal((await call('PUT', '/me/speed-dial/order', { token: B.token, body: { order: swapped, moved: order[1] } })).json.pinned, 1, 'only the dragged tile is pinned');
  r = await sd(B.token);
  assert.deepEqual(ids(r), swapped);
  assert.equal(r.json.items[0].pinned, true);
  assert.equal(r.json.items[1].pinned, false);
  // a drop that shifts an already-pinned tile moves that pin too, so the saved order equals what was shown
  await call('POST', '/me/speed-dial/pin', { token: B.token, body: { songId: ids(r)[1], slot: 1 } });
  r = await sd(B.token);
  const o2 = ids(r);
  const dragged = o2[3];
  const shown = [dragged, o2[0], o2[1], o2[2], ...o2.slice(4)];
  await call('PUT', '/me/speed-dial/order', { token: B.token, body: { order: shown, moved: dragged } });
  assert.deepEqual(ids(await sd(B.token)), shown, 'dragging a tile in front of a pinned one keeps the order that was shown');
  await call('DELETE', '/me/speed-dial', { token: B.token }); // back to automatic for the checks below
  assert.equal((await call('PUT', '/me/speed-dial/order', { token: B.token, body: { order: ['not', 'these'] } })).status, 400, 'order must list the songs shown');
  assert.equal((await call('PUT', '/me/speed-dial/order', { token: B.token, body: { order: [...order, 'extra'].slice(0, C.slots + 1) } })).status, 400);
  console.log('✓ drag and drop pins the moved tile; invalid orders are rejected');

  // ---------- cache ----------
  const c1 = await sd(G.token);
  const c2 = await sd(G.token);
  assert.equal(c2.json.meta.cached, true, 'second read is served from the cache');
  await call('POST', '/me/play-events', { token: G.token, body: { ...SONG('gx'), listenedSec: 31, durationSec: 200, playId: playId() } });
  const c3 = await sd(G.token);
  assert.equal(c3.json.meta.cached, false, 'a new play clears the cache');
  assert.equal(c3.json.items[0].id, 'gx');
  assert.ok(c1.json.items.length > 0);
  console.log('✓ results are cached briefly and the cache clears when a play is recorded');

  // ---------- guests signing in ----------
  const imp = { plays: [
    { song: { id: 'guest1', title: 'Guest One', artist: 'G', image: 'https://i/g1.jpg', duration: 180 }, count: 3, lastAt: new Date(Date.now() - 2 * DAY).toISOString() },
    { song: { id: 'guest2', title: 'Guest Two', artist: 'G', duration: 180 }, count: 1, lastAt: new Date(Date.now() - 1 * DAY).toISOString() },
  ] };
  const Z = await signup('z');
  let ir = await call('POST', '/me/speed-dial/import', { token: Z.token, body: imp });
  assert.equal(ir.status, 201);
  assert.equal(ir.json.events, 4);
  r = await sd(Z.token);
  assert.deepEqual(r.json.items.filter((i) => i.source === 'played').map((i) => i.id), ['guest1', 'guest2']);
  assert.equal(r.json.items[0].playCount, 3);
  await call('POST', '/me/speed-dial/import', { token: Z.token, body: imp }); // signing in twice must not double count
  assert.equal((await sd(Z.token)).json.items[0].playCount, 3);
  assert.equal((await call('POST', '/me/speed-dial/import', { token: Z.token, body: { plays: [{ song: { id: 'x', title: 't' }, count: 0, lastAt: new Date().toISOString() }] } })).status, 400);
  assert.equal((await call('POST', '/me/speed-dial/import', { token: Z.token, body: { plays: [] } })).status, 400);
  const huge = { plays: [{ song: { id: 'big', title: 'Big' }, count: 1000, lastAt: new Date().toISOString() }] };
  assert.equal((await call('POST', '/me/speed-dial/import', { token: Z.token, body: huge })).json.events, C.importMaxPlaysPerSong, 'a guest cannot inflate counts');
  console.log('✓ guest plays are imported once (capped), duplicates and bad input are rejected');

  // ---------- users are isolated ----------
  assert.ok(!ids(await sd(A.token)).includes('recent'), "one user's plays never show in another's dial");
  assert.equal((await sd(B.token)).json.items.some((i) => i.id === 't1'), false);
  console.log('✓ each user sees only their own Speed Dial');
} finally {
  server.close();
}
