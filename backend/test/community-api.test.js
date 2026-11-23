import assert from 'node:assert/strict';
import app from '../src/app.js';
import { config } from '../src/config/env.js';
import { initDb, db } from '../src/prisma/client.js';

await initDb();
const server = app.listen(5012);
const BASE = 'http://localhost:5012/api';
const origRequireLogin = config.requireLogin;
config.requireLogin = false;

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, json: ct.includes('json') ? await res.json() : null };
};
const tag = Math.random().toString(36).slice(2, 7);
const signup = async (label) => {
  const r = await call('POST', '/auth/register', { body: { name: `Tester ${label}`, email: `${label}_${tag}@example.com`, password: 'secret12' } });
  assert.equal(r.status, 201, `register ${label}`);
  return { token: r.json.token, id: r.json.user.id, username: r.json.user.username, email: `${label}_${tag}@example.com` };
};

try {
  const [A, B] = await Promise.all(['a', 'b'].map(signup));
  assert.match(A.username, /^[a-z][a-z0-9_]{2,19}$/, 'signup assigns a default username');

  // ---------- profile edit + username uniqueness ----------
  const me = await call('GET', '/profile/me', { token: A.token });
  assert.equal(me.json.profile.email, A.email);
  assert.equal(me.json.profile.password, undefined);
  const upd = await call('PATCH', '/profile/me', { token: A.token, body: { name: 'Aarav', bio: 'Tamil music lover 🎵', location: 'Chennai', genres: ['Melody'], language: 'ta', username: 'Aarav_Music' } });
  assert.equal(upd.status, 200);
  assert.equal(upd.json.profile.username, 'aarav_music');
  assert.equal((await call('PATCH', '/profile/me', { token: B.token, body: { username: 'AARAV_music' } })).status, 409, 'usernames are unique case-insensitively');
  assert.equal((await call('PATCH', '/profile/me', { token: B.token, body: { username: 'admin' } })).status, 400);
  assert.equal((await call('PATCH', '/profile/me', { token: A.token, body: { username: 'aarav_music', name: 'Aarav K' } })).status, 200, 'keeping your own username is fine');
  assert.equal((await call('PATCH', '/profile/me', { token: A.token, body: { bio: 'x'.repeat(151) } })).status, 400);
  assert.equal((await call('PATCH', '/profile/me', { token: A.token, body: { role: 'admin' } })).status, 400, 'role cannot be self-assigned');
  assert.equal((await call('PATCH', '/profile/me', { token: A.token, body: { email: 'x@y.z' } })).status, 400);
  assert.equal((await call('PATCH', '/profile/me', { token: A.token, body: { bio: 'you fucking idiot' } })).status, 422);
  assert.equal((await call('GET', '/profile/username-available?u=aarav_music', { token: B.token })).json.available, false);
  assert.equal((await call('GET', '/profile/username-available?u=free_name_1', { token: B.token })).json.available, true);
  assert.equal((await call('GET', '/profile/me')).status, 401);
  console.log('✓ profile edit: validation, unique usernames (case-insensitive), no privilege/email changes, filtered text');

  // ---------- avatar ----------
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
  assert.equal((await call('PATCH', '/profile/me', { token: A.token, body: { avatar: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' } })).status, 400);
  const av = await call('PATCH', '/profile/me', { token: A.token, body: { avatar: `data:image/png;base64,${png.toString('base64')}` } });
  assert.equal(av.status, 200);
  assert.match(av.json.profile.avatarUrl, /^\/users\/aarav_music\/avatar\?v=\d+$/);
  const img = await fetch(`http://localhost:5012/api${av.json.profile.avatarUrl}`);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await call('GET', '/users/nobody_here_1/avatar')).status, 404);
  console.log('✓ avatar: validated, served from its own cached URL');

  // ---------- public profile + privacy ----------
  const pub = await call('GET', '/users/aarav_music');
  assert.equal(pub.status, 200);
  assert.equal(pub.json.profile.email, undefined, 'public profile never exposes email');
  assert.equal(JSON.stringify(pub.json).includes(A.email), false);
  assert.equal(pub.json.profile.bio, 'Tamil music lover 🎵');
  assert.equal((await call('GET', '/users/AARAV_MUSIC')).status, 200, 'username lookup is case-insensitive');
  assert.equal((await call('GET', '/users/does_not_exist')).status, 404);

  // playlists: private hidden from others, public shown
  const pl1 = await call('POST', '/playlists', { token: A.token, body: { name: 'Secret mix' } });
  const pl2 = await call('POST', '/playlists', { token: A.token, body: { name: 'Public mix', isPublic: true } });
  assert.equal(pl1.json.playlist.isPublic, false, 'playlists are private by default');
  const othersView = await call('GET', '/users/aarav_music/playlists', { token: B.token });
  assert.deepEqual(othersView.json.items.map((p) => p.name), ['Public mix']);
  const ownView = await call('GET', '/users/aarav_music/playlists', { token: A.token });
  assert.equal(ownView.json.items.length, 2);
  assert.equal((await call('GET', `/playlists/${pl1.json.playlist.id}`, { token: B.token })).status, 404);

  // history is private unless opted in
  await db.song.upsert({ where: { id: 'h1' }, create: { id: 'h1', title: 'History song', artist: 'Tester' }, update: {} });
  await db.listeningHistory.create({ data: { userId: A.id, songId: 'h1' } });
  assert.equal((await call('GET', '/users/aarav_music/history', { token: B.token })).status, 403);
  assert.equal((await call('GET', '/users/aarav_music/history', { token: A.token })).status, 200);
  await call('PATCH', '/profile/me', { token: A.token, body: { showHistory: true } });
  assert.equal((await call('GET', '/users/aarav_music/history', { token: B.token })).status, 200);

  // fully private profile
  await call('PATCH', '/profile/me', { token: A.token, body: { isPublicProfile: false } });
  const priv = await call('GET', '/users/aarav_music', { token: B.token });
  assert.equal(priv.json.profile.isPrivate, true);
  assert.equal(priv.json.profile.bio, undefined);
  for (const t of ['liked', 'playlists', 'history']) {
    assert.equal((await call('GET', `/users/aarav_music/${t}`, { token: B.token })).status, 403, t);
  }
  await call('PATCH', '/profile/me', { token: A.token, body: { isPublicProfile: true } });
  console.log('✓ privacy: no email, private playlists hidden, history opt-in, private profiles locked, 404 for unknown');

  // ---------- follows ----------
  assert.equal((await call('POST', '/users/aarav_music/follow', { token: A.token })).status, 400, 'cannot follow yourself');
  assert.equal((await call('POST', '/users/aarav_music/follow')).status, 401);
  const f1 = await call('POST', '/users/aarav_music/follow', { token: B.token });
  assert.equal(f1.json.followers, 1);
  assert.equal((await call('POST', '/users/aarav_music/follow', { token: B.token })).json.followers, 1, 'idempotent');
  assert.equal((await call('GET', '/users/aarav_music', { token: B.token })).json.profile.isFollowing, true);
  const fl = await call('GET', '/users/aarav_music/followers', { token: A.token });
  assert.deepEqual(fl.json.items.map((u) => u.id), [B.id]);
  assert.equal(fl.json.items[0].email, undefined);
  assert.equal((await call('GET', `/users/${B.username}/following`)).json.total, 1);
  assert.equal((await call('DELETE', '/users/aarav_music/follow', { token: B.token })).json.followers, 0);
  await call('POST', '/users/aarav_music/follow', { token: B.token });
  console.log('✓ follow/unfollow: idempotent, counts, lists, no self-follow');

  // ---------- account deletion ----------
  assert.equal((await call('DELETE', '/profile/me', { token: A.token, body: { password: 'wrong-password' } })).status, 403);
  assert.equal((await call('GET', '/profile/me', { token: A.token })).status, 200, 'wrong password deletes nothing');
  assert.equal((await call('DELETE', '/profile/me', { token: A.token, body: { password: 'secret12' } })).status, 200);
  assert.equal((await call('GET', '/users/aarav_music')).status, 404);
  assert.equal((await call('GET', '/profile/me', { token: A.token })).status, 401, 'token stops working');
  assert.equal((await call('GET', '/users/' + B.username, {})).json.profile.stats.following, 0, 'follows to the deleted user are removed');
  console.log('✓ account deletion needs the password and removes follows and playlists');
} finally {
  config.requireLogin = origRequireLogin;
  server.close();
}
