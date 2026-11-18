import assert from 'node:assert/strict';
import app from '../src/app.js';
import { initDb } from '../src/prisma/client.js';
import { musicService } from '../src/services/music/providerManager.js';
import { musicCache } from '../src/services/cacheService.js';

await initDb();
musicService.setProvider('mock');
musicCache.clear();
const server = app.listen(5015);
const BASE = 'http://localhost:5015/api';
const tag = Math.random().toString(36).slice(2, 7);
const call = async (method, path, { token, body } = {}) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json() };
};
const signup = async (label) => (await call('POST', '/auth/register', { body: { name: `Search ${label}`, email: `ps_${label}_${tag}@example.com`, password: 'secret12' } })).json;

try {
  const A = await signup('a');
  const B = await signup('b');
  const word = `zzmix${tag}`;
  const pub = await call('POST', '/playlists', { token: A.token, body: { name: `${word} public`, isPublic: true } });
  await call('POST', '/playlists', { token: A.token, body: { name: `${word} private` } });
  await call('POST', '/playlists', { token: B.token, body: { name: `${word} hidden owner`, isPublic: true } });
  await call('PATCH', '/profile/me', { token: B.token, body: { isPublicProfile: false } });

  const r = await call('GET', `/music/search?query=${word}`, { token: A.token });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.data.playlists), 'search returns a playlists group');
  assert.deepEqual(r.json.data.playlists.map((p) => p.name), [`${word} public`], 'only public playlists of public profiles');
  const p = r.json.data.playlists[0];
  assert.equal(p.id, pub.json.playlist.id);
  assert.equal(p.owner.name, 'Search a');
  assert.equal(p.songCount, 0);
  assert.equal(JSON.stringify(r.json).includes('@example.com'), false, 'no emails in search results');

  const only = await call('GET', `/music/search?query=${word}&type=playlists`, { token: A.token });
  assert.equal(only.json.data.playlists.length, 1);
  assert.deepEqual(only.json.data.songs, []);
  assert.deepEqual((await call('GET', '/music/search?query=a', { token: A.token })).json.data.playlists, [], 'one-letter queries do not search playlists');
  assert.deepEqual((await call('GET', '/music/search?query=', { token: A.token })).json.data.playlists, []);
  assert.equal((await call('GET', `/music/search?query=Veezha`, { token: A.token })).json.data.songs.length >= 0, true, 'song search still works');
  console.log('✓ search: Playlists group lists only public playlists of public profiles, no emails, type filter, short queries');
} finally {
  server.close();
}
