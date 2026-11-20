import assert from 'node:assert/strict';
import app from '../src/app.js';
import { initDb, db } from '../src/prisma/client.js';
import { config } from '../src/config/env.js';
import { musicService } from '../src/services/music/providerManager.js';
import { NO_REPEAT } from '../src/services/noRepeat/config.js';

// Runs on the in-memory store and, with TEST_DATABASE_URL, on real PostgreSQL (queue_state.heard, user_song_blocks).
await initDb();
musicService.setProvider('mock');
const ensureSong = (id) => db.song.upsert({ where: { id }, create: { id, title: `Song ${id}`, artist: 'Tester', duration: 200, streamUrl: `https://s/${id}.mp4`, isPlayable: true }, update: {} });
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
  for (const id of ids) await ensureSong(id);

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
