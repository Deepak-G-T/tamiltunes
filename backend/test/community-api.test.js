import assert from 'node:assert/strict';
import app from '../src/app.js';
import { initDb, db } from '../src/prisma/client.js';
import { getStore } from '../src/community/store/index.js';

await initDb();
const server = app.listen(5012);
const BASE = 'http://localhost:5012/api';

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
const SONG = `song_${tag}`;

try {
  const [A, B, F, E, ART, ADM] = await Promise.all(['a', 'b', 'f', 'e', 'art', 'adm'].map(signup));
  // Roles can only be set in the database (not via the API); works on both Prisma and the in-memory store
  await db.user.update({ where: { id: ART.id }, data: { role: 'artist' } });
  await db.user.update({ where: { id: ADM.id }, data: { role: 'admin' } });
  assert.match(A.username, /^[a-z][a-z0-9_]{2,19}$/, 'signup assigns a default username');

  // ---------- comment CRUD ----------
  assert.equal((await call('POST', `/songs/${SONG}/comments`, { body: { body: 'hi' } })).status, 401);
  const c1 = (await call('POST', `/songs/${SONG}/comments`, { token: A.token, body: { body: '  First!  <b>x</b> ' } }));
  assert.equal(c1.status, 201);
  assert.equal(c1.json.comment.body, 'First! x', 'sanitised');
  assert.equal(c1.json.comment.author.username, A.username);
  assert.equal(JSON.stringify(c1.json).includes('password'), false);
  const c2 = await call('POST', `/songs/${SONG}/comments`, { token: A.token, body: { body: 'that drop at 1:23 🔥 அருமை' } });
  assert.equal(c2.json.comment.timestampSec, 83, 'timestamp auto-detected');
  const c3 = await call('POST', `/songs/${SONG}/comments`, { token: A.token, body: { body: 'to delete' } });
  assert.equal((await call('POST', `/songs/${SONG}/comments`, { token: A.token, body: { body: 'a'.repeat(501) } })).status, 400);

  const edit = await call('PATCH', `/comments/${c1.json.comment.id}`, { token: A.token, body: { body: 'First, edited' } });
  assert.equal(edit.json.comment.body, 'First, edited');
  assert.ok(edit.json.comment.editedAt);
  assert.equal((await call('PATCH', `/comments/${c1.json.comment.id}`, { token: B.token, body: { body: 'hijack' } })).status, 403);
  assert.equal((await call('DELETE', `/comments/${c3.json.comment.id}`, { token: B.token })).status, 403);
  assert.equal((await call('DELETE', `/comments/${c3.json.comment.id}`, { token: A.token })).status, 200);
  assert.equal((await call('DELETE', `/comments/${c3.json.comment.id}`, { token: A.token })).status, 404);
  console.log('✓ comment CRUD: create, sanitise, edit/delete own only, 500-char limit, timestamp detection');

  // ---------- safety filters ----------
  for (const [body, reason] of [['this is shit', 'profanity'], ['ஓத்தா', 'profanity'], ['visit www.spam.com', 'spam']]) {
    const r = await call('POST', `/songs/${SONG}/comments`, { token: F.token, body: { body } });
    assert.equal(r.status, 422, body);
    assert.equal(r.json.reason, reason);
  }
  assert.equal((await call('PATCH', `/comments/${c1.json.comment.id}`, { token: A.token, body: { body: 'f.u.c.k' } })).status, 422, 'edits are filtered too');
  console.log('✓ filter rejects Tamil/English profanity and spam on create and edit');

  // ---------- rate limit: 5 per minute per account ----------
  for (let i = 0; i < 5; i++) {
    assert.equal((await call('POST', `/songs/${SONG}/comments`, { token: E.token, body: { body: `rate ${i}` } })).status, 201);
  }
  const limited = await call('POST', `/songs/${SONG}/comments`, { token: E.token, body: { body: 'rate 6' } });
  assert.equal(limited.status, 429);
  assert.equal((await call('POST', `/songs/${SONG}/comments`, { token: B.token, body: { body: 'other user unaffected' } })).status, 201);
  console.log('✓ rate limit: 6th comment in a minute is 429, other accounts unaffected');

  // ---------- replies (one level) ----------
  const reply = await call('POST', `/songs/${SONG}/comments`, { token: B.token, body: { body: 'agree!', parentId: c1.json.comment.id } });
  assert.equal(reply.status, 201);
  assert.equal((await call('POST', `/songs/${SONG}/comments`, { token: B.token, body: { body: 'nested', parentId: reply.json.comment.id } })).status, 400);
  assert.equal((await call('POST', `/songs/${SONG}/comments`, { token: B.token, body: { body: 'x', parentId: 'nope' } })).status, 404);
  assert.equal((await call('POST', `/songs/other_song/comments`, { token: B.token, body: { body: 'x', parentId: c1.json.comment.id } })).status, 404, 'parent must belong to the same song');
  const replies = await call('GET', `/comments/${c1.json.comment.id}/replies`);
  assert.equal(replies.json.items.length, 1);
  const list0 = await call('GET', `/songs/${SONG}/comments?limit=50`);
  assert.equal(list0.json.items.find((c) => c.id === c1.json.comment.id).replyCount, 1);
  assert.equal(list0.json.items.some((c) => c.parentId), false, 'top-level list excludes replies');
  console.log('✓ replies: one level only, same song, listed separately with replyCount');

  // ---------- likes, artist badge, pin ----------
  const cid = c2.json.comment.id;
  let like = await call('POST', `/comments/${cid}/like`, { token: B.token });
  assert.equal(like.json.comment.likeCount, 1);
  assert.equal(like.json.comment.likedByMe, true);
  like = await call('POST', `/comments/${cid}/like`, { token: B.token });
  assert.equal(like.json.comment.likeCount, 1, 'liking twice is idempotent');
  assert.equal((await call('POST', `/comments/${cid}/like`, { token: ART.token })).json.comment.likedByArtist, true);
  assert.equal((await call('DELETE', `/comments/${cid}/like`, { token: ART.token })).json.comment.likedByArtist, false, 'badge goes when the artist unlikes');
  assert.equal((await call('DELETE', `/comments/${cid}/like`, { token: B.token })).json.comment.likeCount, 0);
  assert.equal((await call('POST', `/comments/${cid}/pin`, { token: B.token })).status, 403, 'regular users cannot pin');
  assert.equal((await call('POST', `/comments/${cid}/pin`, { token: ART.token })).status, 200);
  const pinnedList = await call('GET', `/songs/${SONG}/comments?limit=50`);
  assert.equal(pinnedList.json.pinned.id, cid);
  assert.equal(pinnedList.json.items.some((c) => c.id === cid), false, 'pinned comment is not duplicated in items');
  assert.equal((await call('POST', `/comments/${reply.json.comment.id}/pin`, { token: ADM.token })).status, 400, 'replies cannot be pinned');
  await call('POST', `/comments/${c1.json.comment.id}/pin`, { token: ADM.token });
  assert.equal((await call('GET', `/songs/${SONG}/comments`)).json.pinned.id, c1.json.comment.id, 'only one pinned comment per song');
  console.log('✓ likes (idempotent), artist badge, pin permissions and single pinned comment');

  // ---------- sorting, pagination, polling ----------
  const PSONG = `page_${tag}`;
  const store = getStore();
  const made = [];
  for (let i = 0; i < 5; i++) made.push(await store.createComment({ songId: PSONG, userId: A.id, body: `c${i}` }));
  await store.addLike(made[1].id, A.id); await store.addLike(made[1].id, B.id); await store.addLike(made[3].id, A.id);
  const p1 = await call('GET', `/songs/${PSONG}/comments?limit=2`);
  assert.deepEqual(p1.json.items.map((c) => c.body), ['c4', 'c3']);
  const p2 = await call('GET', `/songs/${PSONG}/comments?limit=2&cursor=${p1.json.nextCursor}`);
  assert.deepEqual(p2.json.items.map((c) => c.body), ['c2', 'c1']);
  const p3 = await call('GET', `/songs/${PSONG}/comments?limit=2&cursor=${p2.json.nextCursor}`);
  assert.deepEqual(p3.json.items.map((c) => c.body), ['c0']);
  assert.equal(p3.json.hasMore, false);
  const top = await call('GET', `/songs/${PSONG}/comments?sort=top&limit=3`);
  assert.deepEqual(top.json.items.map((c) => c.body), ['c1', 'c3', 'c4'], 'top = likes desc, then newest');
  const top2 = await call('GET', `/songs/${PSONG}/comments?sort=top&limit=3&cursor=${top.json.nextCursor}`);
  assert.deepEqual(top2.json.items.map((c) => c.body), ['c2', 'c0']);
  assert.equal((await call('GET', `/songs/${PSONG}/comments?cursor=garbage`)).status, 400);
  const since = new Date(Date.now() - 1000).toISOString();
  await store.createComment({ songId: PSONG, userId: B.id, body: 'fresh' });
  const poll = await call('GET', `/songs/${PSONG}/comments/poll?since=${encodeURIComponent(since)}`);
  assert.ok(poll.json.items.some((c) => c.body === 'fresh'));
  assert.equal((await call('GET', `/songs/${PSONG}/comments/poll?since=${encodeURIComponent(poll.json.serverTime)}`)).json.items.length, 0);
  console.log('✓ newest/top keyset pagination without overlap, bad cursor 400, polling returns only new comments');

  // ---------- reports ----------
  const rep = await call('POST', `/comments/${cid}/report`, { token: B.token, body: { reason: 'abuse' } });
  assert.equal(rep.status, 201);
  assert.equal((await call('POST', `/comments/${cid}/report`, { token: B.token, body: { reason: 'abuse' } })).json.alreadyReported, true);
  assert.equal((await call('POST', `/comments/${cid}/report`, { token: A.token, body: { reason: 'abuse' } })).status, 400, 'cannot report own comment');
  assert.equal((await call('POST', `/comments/${cid}/report`, { token: B.token, body: { reason: 'nonsense' } })).status, 400);
  console.log('✓ reports: once per user, not own, valid reasons only');

  // ---------- profile edit + username uniqueness ----------
  const me = await call('GET', '/profile/me', { token: A.token });
  assert.equal(me.json.profile.email, A.email);
  assert.equal(me.json.profile.password, undefined);
  assert.equal(me.json.profile.stats.comments, 7, 'c1 + c2 + 5 seeded pagination comments (c3 was deleted)');
  const upd = await call('PATCH', '/profile/me', { token: A.token, body: { name: 'Aarav', bio: 'Tamil music lover 🎶', location: 'Chennai', genres: ['Melody'], language: 'ta', username: 'Aarav_Music' } });
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
  const afterList = await call('GET', `/songs/${SONG}/comments?limit=50`);
  assert.equal(afterList.json.items.find((c) => c.author.id === A.id).author.avatarUrl, av.json.profile.avatarUrl, 'comments carry the author avatar url, not the image bytes');
  assert.equal((await call('GET', '/users/nobody_here_1/avatar')).status, 404);
  console.log('✓ avatar: validated, served from its own cached URL, comments reference the URL');

  // ---------- public profile + privacy ----------
  const pub = await call('GET', '/users/aarav_music');
  assert.equal(pub.status, 200);
  assert.equal(pub.json.profile.email, undefined, 'public profile never exposes email');
  assert.equal(JSON.stringify(pub.json).includes(A.email), false);
  assert.equal(pub.json.profile.bio, 'Tamil music lover 🎶');
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
  // listening_history has a foreign key to songs, so the song must exist on real PostgreSQL
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
  for (const t of ['liked', 'playlists', 'history', 'comments']) {
    assert.equal((await call('GET', `/users/aarav_music/${t}`, { token: B.token })).status, 403, t);
  }
  assert.equal((await call('GET', '/users/aarav_music/comments', { token: A.token })).status, 200, 'owner still sees own tabs');
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
  const after = await call('GET', `/songs/${SONG}/comments?limit=50`);
  assert.equal(after.json.items.some((c) => c.author.id === A.id), false, "deleted user's comments are removed");
  assert.equal((await call('GET', `/comments/${c1.json.comment.id}/replies`)).status, 404);
  assert.equal((await call('GET', '/users/' + B.username, {})).json.profile.stats.following, 0, 'follows to the deleted user are removed');
  console.log('✓ account deletion needs the password and removes comments, follows and playlists');
} finally {
  server.close();
}
