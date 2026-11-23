import assert from 'node:assert/strict';

// Who can call /api/admin/videos/*? Nobody, unless the account has role "admin" in the database AND its user id is in the server setting
// ADMIN_VIDEO_USER_IDS. Checked for every admin route, every kind of caller, and that a role cannot be given through the API.
const { default: app } = await import('../src/app.js');
const { initDb, db, usingPostgres, getPrismaClient } = await import('../src/prisma/client.js');
await initDb();
const server = app.listen(5022);
const BASE = 'http://localhost:5022/api';
const tag = Math.random().toString(36).slice(2, 7);
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};
const signup = async (label, extra = {}) => {
  const r = await call('POST', '/auth/register', { body: { name: `Access ${label}`, email: `acc_${label}_${tag}@example.com`, password: 'secret12', ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json;
};
const setRole = async (id, role) => (usingPostgres() ? getPrismaClient().user.update({ where: { id }, data: { role } }) : Object.assign(db.users.get(id), { role }));
// a missing role means "user", exactly as middleware/auth.js reads it
const roleOf = async (id) => (usingPostgres() ? (await getPrismaClient().user.findUnique({ where: { id } })).role : db.users.get(id).role) || 'user';
const songId = `acc_${tag}`;
await db.song.upsert({ where: { id: songId }, create: { id: songId, title: `Access ${tag}`, artist: 'Tester', duration: 200, isPlayable: true, streamUrl: 'https://s/x.mp4' }, update: {} });

// every admin route the branch adds
const ROUTES = [
  ['GET', '/admin/videos/songs'],
  ['GET', '/admin/videos/flagged'],
  ['GET', '/admin/videos/check/AbCdEfGhIj1'],
  ['GET', `/admin/videos/${songId}`],
  ['PUT', `/admin/videos/${songId}`, { videoId: 'AbCdEfGhIj1' }],
  ['DELETE', `/admin/videos/${songId}`],
  ['POST', `/admin/videos/${songId}/restore`],
];
const denied = (r) => r.status === 401 || r.status === 403;

try {
  const [NORMAL, ADMIN_NOT_LISTED, ADMIN_LISTED, LISTED_NOT_ADMIN] = await Promise.all(['normal', 'admin_unlisted', 'admin_listed', 'listed_user'].map((l) => signup(l)));
  await setRole(ADMIN_NOT_LISTED.user.id, 'admin');
  await setRole(ADMIN_LISTED.user.id, 'admin');

  // 1. the setting is empty: 403 for everybody, admins included
  delete process.env.ADMIN_VIDEO_USER_IDS;
  for (const [method, path, body] of ROUTES) {
    assert.equal((await call(method, path, { body })).status, 401, `${method} ${path}: logged out`);
    for (const [who, u] of [['normal user', NORMAL], ['admin with no setting', ADMIN_LISTED], ['other admin', ADMIN_NOT_LISTED]]) {
      assert.equal((await call(method, path, { token: u.token, body })).status, 403, `${method} ${path}: ${who} with the setting empty`);
    }
  }
  console.log('✓ admin videos: with ADMIN_VIDEO_USER_IDS empty, 401 for a guest and 403 for everyone else, admins included (all 6 routes)');

  // 2. the setting names one account
  process.env.ADMIN_VIDEO_USER_IDS = ` , ${ADMIN_LISTED.user.id} ,  `; // spaces and empty entries are ignored
  for (const [method, path, body] of ROUTES) {
    assert.equal((await call(method, path, { body })).status, 401, `${method} ${path}: logged out`);
    assert.equal((await call(method, path, { token: NORMAL.token, body })).status, 403, `${method} ${path}: normal user`);
    assert.equal((await call(method, path, { token: ADMIN_NOT_LISTED.token, body })).status, 403, `${method} ${path}: admin role but not on the list`);
    assert.equal((await call(method, path, { token: LISTED_NOT_ADMIN.token, body })).status, 403, `${method} ${path}: not an admin`);
  }
  // being on the list is not enough without the role in the database, and the role alone is not enough without the list
  process.env.ADMIN_VIDEO_USER_IDS = LISTED_NOT_ADMIN.user.id;
  assert.equal((await call('GET', '/admin/videos/flagged', { token: LISTED_NOT_ADMIN.token })).status, 403, 'listed but role is "user"');
  process.env.ADMIN_VIDEO_USER_IDS = ADMIN_LISTED.user.id;
  for (const [method, path, body] of ROUTES) {
    const r = await call(method, path, { token: ADMIN_LISTED.token, body });
    assert.ok(!denied(r), `${method} ${path}: the listed admin gets through (got ${r.status})`);
  }
  assert.equal((await call('PUT', `/admin/videos/${songId}`, { token: ADMIN_LISTED.token, body: { videoId: 'AbCdEfGhIj1' } })).status, 200);
  // the admin screen reads one song's state: chosen by the admin, then removed again
  const one = await call('GET', `/admin/videos/${songId}`, { token: ADMIN_LISTED.token });
  assert.equal(one.status, 200);
  assert.equal(one.json.item.chosenVideoId, 'AbCdEfGhIj1');
  assert.equal(one.json.item.source, 'admin');
  assert.equal(one.json.item.servedVideoId, 'AbCdEfGhIj1');
  assert.equal((await call('GET', '/admin/videos/no%20such%20song!', { token: ADMIN_LISTED.token })).status, 400, 'a bad id is refused');
  assert.equal((await call('GET', '/admin/videos/zzz_missing_song', { token: ADMIN_LISTED.token })).status, 404, 'an unknown song is 404');
  assert.equal((await call('DELETE', `/admin/videos/${songId}`, { token: ADMIN_LISTED.token })).status, 200);
  const cleared = await call('GET', `/admin/videos/${songId}`, { token: ADMIN_LISTED.token });
  assert.equal(cleared.json.item.chosenVideoId, null);
  assert.notEqual(cleared.json.item.source, 'admin');
  assert.equal((await call('PUT', `/admin/videos/${songId}`, { token: ADMIN_LISTED.token, body: { videoId: 'AbCdEfGhIj1' } })).status, 200);
  console.log('✓ admin videos: only an account with role admin in the database AND its id in ADMIN_VIDEO_USER_IDS gets through');

  // 3. the role is read from the database on every request: demoting takes effect at once
  await setRole(ADMIN_LISTED.user.id, 'user');
  assert.equal((await call('GET', '/admin/videos/flagged', { token: ADMIN_LISTED.token })).status, 403, 'a demoted admin is locked out with the same token');
  await setRole(ADMIN_LISTED.user.id, 'admin');
  console.log('✓ admin videos: the role is read from the database each time (a demoted admin is locked out at once)');

  // 4. nobody can give themselves a role through the API
  const sneaky = await signup('sneaky', { role: 'admin', isAdmin: true });
  assert.equal(await roleOf(sneaky.user.id), 'user', 'register ignores a role in the body');
  const patch = await call('PATCH', '/profile/me', { token: sneaky.token, body: { role: 'admin' } });
  assert.equal(patch.status, 400, 'the profile update is strict: an unknown field such as role is refused');
  assert.match(JSON.stringify(patch.json), /Unrecognized key.*role/);
  assert.equal((await call('PUT', '/profile/me', { token: sneaky.token, body: { role: 'admin' } })).status, 404, 'there is no other way to write a profile');
  assert.equal(await roleOf(sneaky.user.id), 'user', 'still a normal user after trying to change the role');
  process.env.ADMIN_VIDEO_USER_IDS = sneaky.user.id;
  assert.equal((await call('GET', '/admin/videos/flagged', { token: sneaky.token })).status, 403, 'even listed, a normal user cannot get in');
  console.log('✓ admin videos: a role cannot be given through register or the profile update');

  // 5. the report route is for any signed-in listener, not only admins
  assert.equal((await call('POST', `/songs/${songId}/video-report`, { body: { videoId: 'AbCdEfGhIj1' } })).status, 401);
  assert.notEqual((await call('POST', `/songs/${songId}/video-report`, { token: NORMAL.token, body: { videoId: 'AbCdEfGhIj1' } })).status, 403);
  console.log('✓ admin videos: the report route stays open to signed-in listeners, closed to guests');
} finally {
  delete process.env.ADMIN_VIDEO_USER_IDS;
  server.close();
}
process.exit(0);
