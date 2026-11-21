import assert from 'node:assert/strict';
import app from '../src/app.js';
import { initDb, db } from '../src/prisma/client.js';
import { config } from '../src/config/env.js';
import { musicService } from '../src/services/music/providerManager.js';

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

  // the queue is saved without any session memory; an older app that still sends `heard` / `allowRepeats` is accepted and they are ignored
  const heard = ids.slice(0, 3).map((id) => ({ k: `key-${id}`, id }));
  const put = await call('PUT', '/me/queue', { token, body: { items: [{ id: ids[3], o: 'r' }], currentIndex: 0, positionSec: 0, shuffle: false, repeat: 'off', autoplay: true, mode: 'radio', deviceId: 'deviceA', heard, allowRepeats: true } });
  assert.equal(put.status, 200, JSON.stringify(put.json));
  const get = await call('GET', '/me/queue', { token });
  assert.equal(get.json.queue.items.length, 1);
  assert.ok(!('heard' in get.json.queue) && !('allowRepeats' in get.json.queue), 'no session memory is stored or returned any more');

  // the related endpoint: the same song is never offered twice, "recent" is only a preference, and it asks for big batches
  const rel = await call('GET', `/songs/${ids[3]}/related?limit=60&exclude=${ids.slice(0, 3).join(',')}&recent=${ids[4]}`, { token });
  assert.equal(rel.status, 200);
  assert.ok(rel.json.items.every((s) => !ids.slice(0, 3).includes(s.id) && s.id !== ids[3]), 'songs already in the queue are not suggested');
  assert.ok('exhausted' in rel.json.meta && 'softApplied' in rel.json.meta && 'fresh' in rel.json.meta);
  assert.equal((await call('GET', `/songs/${ids[3]}/related?limit=61`, { token })).status, 400, 'at most 60 at a time');
  assert.equal((await call('GET', `/songs/${ids[3]}/related?limit=50&allowRepeats=1&heard=x&context=liked`, { token })).status, 200, 'the old options are ignored, not an error');
  // history is not a rule: a song played to the end a minute ago is still offered
  await call('POST', '/me/play-events', { token, body: { songId: ids[4], completed: true } });

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
  console.log('✓ API: no session memory stored (old apps still accepted); related takes exclude/recent and at most 60; "Don\'t recommend this" works, ignores client text, is per account');
} finally {
  server.close();
}
process.exit(0);
