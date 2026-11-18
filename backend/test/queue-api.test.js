import assert from 'node:assert/strict';
import app from '../src/app.js';
import { config } from '../src/config/env.js';
import { initDb, db } from '../src/prisma/client.js';
import { musicService } from '../src/services/music/providerManager.js';
import { musicCache } from '../src/services/cacheService.js';
import { resolveSongs } from '../src/services/queueState/resolve.js';

await initDb();
musicService.setProvider('mock');
musicCache.clear();
const server = app.listen(5017);
const BASE = 'http://localhost:5017/api';
const origRequireLogin = config.requireLogin;
const tag = Math.random().toString(36).slice(2, 7);
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
};
const signup = async (label) => {
  const r = await call('POST', '/auth/register', { body: { name: `Queue ${label}`, email: `q_${label}_${tag}@example.com`, password: 'secret12' } });
  assert.equal(r.status, 201);
  return r.json.token;
};
const ensureSong = (id, title = `Song ${id}`) => db.song.upsert({ where: { id }, create: { id, title, artist: 'Tester', duration: 200, streamUrl: `https://s/${id}.mp4`, isPlayable: true }, update: {} });
const payload = (items, extra = {}) => ({ items, currentIndex: 0, positionSec: 12, shuffle: false, repeat: 'off', autoplay: true, mode: 'radio', ...extra });

try {
  const [A, B] = await Promise.all(['a', 'b'].map(signup));
  for (const id of [`qa1${tag}`, `qa2${tag}`, `qa3${tag}`]) await ensureSong(id);
  const [s1, s2, s3] = [`qa1${tag}`, `qa2${tag}`, `qa3${tag}`];

  // auth
  assert.equal((await call('GET', '/me/queue')).status, 401);
  assert.equal((await call('PUT', '/me/queue', { body: payload([{ id: s1, o: 'u' }]) })).status, 401);
  assert.equal((await call('DELETE', '/me/queue')).status, 401);

  // nothing saved yet
  const empty = await call('GET', '/me/queue', { token: A });
  assert.equal(empty.status, 200);
  assert.equal(empty.json.queue, null);

  // save and read back, with metadata fetched from the server's own data
  const items = [{ id: s1, o: 'r' }, { id: s2, o: 'u' }, { id: s3, o: 'c' }];
  const put = await call('PUT', '/me/queue', { token: A, body: payload(items, { currentIndex: 1, positionSec: 45.9, shuffle: true, repeat: 'all', mode: 'context', sourceLabel: 'My mix', deviceId: 'dev-1' }) });
  assert.equal(put.status, 200);
  assert.ok(put.json.updatedAt);
  const got = await call('GET', '/me/queue', { token: A });
  assert.deepEqual(got.json.queue.items, items);
  assert.equal(got.json.queue.currentIndex, 1);
  assert.equal(got.json.queue.positionSec, 45, 'position is stored in whole seconds');
  assert.equal(got.json.queue.shuffle, true);
  assert.equal(got.json.queue.repeat, 'all');
  assert.equal(got.json.queue.sourceLabel, 'My mix');
  assert.equal(got.json.queue.deviceId, 'dev-1');
  assert.equal(got.json.songs[s2].title, `Song ${s2}`);
  assert.equal(got.json.songs[s2].artist, 'Tester');

  // meta: what the "continue on this device?" check reads (no song lookups)
  assert.equal((await call('GET', '/me/queue/meta')).status, 401);
  const meta = (await call('GET', '/me/queue/meta', { token: A })).json.meta;
  assert.equal(meta.deviceId, 'dev-1');
  assert.equal(meta.count, 3);
  assert.equal(meta.currentId, s2);
  assert.ok(meta.updatedAt);
  assert.equal((await call('GET', '/me/queue/meta', { token: B })).json.meta, null);

  // last write wins
  await call('PUT', '/me/queue', { token: A, body: payload([{ id: s3, o: 'c' }]) });
  assert.deepEqual((await call('GET', '/me/queue', { token: A })).json.queue.items, [{ id: s3, o: 'c' }]);

  // one user never sees another's queue
  assert.equal((await call('GET', '/me/queue', { token: B })).json.queue, null);

  // client-supplied song data is refused, never stored
  assert.equal((await call('PUT', '/me/queue', { token: A, body: payload([{ id: s1, o: 'u', title: 'Hacked', streamUrl: 'http://evil' }]) })).status, 400);
  assert.equal((await call('PUT', '/me/queue', { token: A, body: { ...payload([{ id: s1, o: 'u' }]), role: 'admin' } })).status, 400);
  assert.equal((await call('GET', '/me/queue', { token: A })).json.songs[s3].title, `Song ${s3}`);

  // validation
  const bad = [
    payload([{ id: s1, o: 'x' }]),
    payload([{ id: '', o: 'u' }]),
    payload([{ id: 'has space/../x', o: 'u' }]),
    payload([{ id: s1, o: 'u' }], { currentIndex: 5 }),
    payload([{ id: s1, o: 'u' }], { positionSec: -1 }),
    payload([{ id: s1, o: 'u' }], { repeat: 'twice' }),
    payload([{ id: s1, o: 'u' }], { mode: 'weird' }),
    payload([{ id: s1, o: 'u' }], { deviceId: 'a b' }),
    payload(Array.from({ length: 552 }, (_, i) => ({ id: `s${i}`, o: 'r' }))),
    { items: 'nope' },
  ];
  for (const b of bad) assert.equal((await call('PUT', '/me/queue', { token: A, body: b })).status, 400, `rejects ${JSON.stringify(b).slice(0, 60)}`);
  // the largest allowed queue (500 upcoming + 50 history + current) is accepted
  const big = Array.from({ length: 551 }, (_, i) => ({ id: `big${i}`, o: 'r' }));
  assert.equal((await call('PUT', '/me/queue', { token: A, body: payload(big, { currentIndex: 50 }) })).status, 200);
  assert.equal((await call('PUT', '/me/queue', { token: A, body: payload([], { currentIndex: -1 }) })).status, 200, 'an empty queue can be saved');

  // songs that no longer exist are simply absent from the result
  await call('PUT', '/me/queue', { token: A, body: payload([{ id: s1, o: 'u' }, { id: `gone-${tag}`, o: 'r' }]) });
  const withGone = await call('GET', '/me/queue', { token: A });
  assert.ok(withGone.json.songs[s1]);
  assert.equal(withGone.json.songs[`gone-${tag}`], undefined);

  // delete
  assert.equal((await call('DELETE', '/me/queue', { token: A })).status, 200);
  assert.equal((await call('GET', '/me/queue', { token: A })).json.queue, null);

  // guests: ids -> songs, no login, capped
  config.requireLogin = false;
  const guest = await call('POST', '/music/songs/resolve', { body: { ids: [s1, `gone-${tag}`] } });
  assert.equal(guest.status, 200);
  assert.ok(guest.json.songs[s1]);
  assert.equal(guest.json.songs[`gone-${tag}`], undefined);
  assert.equal((await call('POST', '/music/songs/resolve', { body: { ids: Array.from({ length: 101 }, (_, i) => `x${i}`) } })).status, 400);
  assert.equal((await call('POST', '/music/songs/resolve', { body: { ids: [] } })).status, 400);
  config.requireLogin = origRequireLogin;

  // resolver: database first, provider only for the rest, capped, failures tolerated
  const calls = [];
  const out = await resolveSongs(['a', 'b', 'c', 'd'], {
    byIds: async () => [{ id: 'a', title: 'A', artist: 'x' }],
    fetchOne: async (id) => { calls.push(id); if (id === 'c') throw new Error('provider down'); return id === 'd' ? null : { id, title: `T${id}` }; },
    save: async () => {},
  });
  assert.deepEqual(Object.keys(out).sort(), ['a', 'b']);
  assert.deepEqual(calls.sort(), ['b', 'c', 'd']);
  const capped = await resolveSongs(['m1', 'm2', 'm3', 'm4', 'm5'], { byIds: async () => [], fetchOne: async (id) => ({ id, title: id }), maxLookups: 2 });
  assert.equal(Object.keys(capped).length, 2, 'provider lookups are capped');

  // save the queue as a playlist: ids only, unknown songs skipped, order kept, private by default
  assert.equal((await call('POST', '/playlists/from-queue', { body: { name: 'x', songIds: [s1] } })).status, 401);
  assert.equal((await call('POST', '/playlists/from-queue', { token: A, body: { name: '', songIds: [s1] } })).status, 400);
  assert.equal((await call('POST', '/playlists/from-queue', { token: A, body: { name: 'x', songIds: [] } })).status, 400);
  assert.equal((await call('POST', '/playlists/from-queue', { token: A, body: { name: 'x', songIds: [s1], title: 'nope' } })).status, 400);
  assert.equal((await call('POST', '/playlists/from-queue', { token: A, body: { name: 'x', songIds: [`gone-${tag}`] } })).status, 422);
  const made = await call('POST', '/playlists/from-queue', { token: A, body: { name: 'From my queue', songIds: [s3, s1, `gone-${tag}`, s3, s2] } });
  assert.equal(made.status, 201);
  assert.equal(made.json.added, 3);
  assert.equal(made.json.skipped, 1);
  const pl = await call('GET', `/playlists/${made.json.playlist.id}`, { token: A });
  assert.deepEqual((pl.json.playlist?.songs || pl.json.songs || []).map((x) => x.songId || x.id || x.song?.id), [s3, s1, s2]);
  assert.equal(made.json.playlist.isPublic, false);

  console.log('✓ queue: auth, validation, id-only storage, isolation, last-write-wins, dropped songs, guest resolve, resolver caps');
} finally {
  config.requireLogin = origRequireLogin;
  server.close();
}
