import assert from 'node:assert/strict';
import { createVideoLookup } from '../src/services/music/videoLookup.js';

// ---- 1. the lookup asks the database overrides first (admin choice wins, a flagged video is hidden)
{
  const overrides = new Map([['s_admin', { videoId: 'ADMINvid001' }], ['s_hidden', { hidden: true }]]);
  const vl = createVideoLookup({ cfg: { youtubeApiKey: '', videoChannelAllowlist: [] }, curated: [], getOverride: (s) => overrides.get(s.id) || null });
  assert.equal(vl.peek({ id: 's_admin', title: 'Any' }), 'ADMINvid001', 'an admin-chosen id wins');
  assert.equal(vl.peek({ id: 's_hidden', title: 'Any' }), null, 'a flagged song has no video');
  assert.equal(await vl.lookup({ id: 's_admin', title: 'Any' }), 'ADMINvid001');
  assert.equal(await vl.lookup({ id: 's_hidden', title: 'Any' }), null);
  const [a, h, keep, yt] = vl.attach([{ id: 's_admin', title: 'A' }, { id: 's_hidden', title: 'H', videoId: 'OLDvideo001' }, { id: 'x', title: 'X', videoId: 'KEEPvideo01' }, { id: 's_hidden', title: 'Y', videoId: 'YTonly00001', source: 'youtube' }]);
  assert.equal(a.videoId, 'ADMINvid001');
  assert.equal(h.videoId, undefined, 'a flagged video is taken off a song that carried it');
  assert.equal(keep.videoId, 'KEEPvideo01');
  assert.equal(yt.videoId, 'YTonly00001', 'a YouTube-only song keeps its video (it has nothing else)');
  assert.equal((await vl.attachOne({ id: 's_hidden', title: 'H', videoId: 'OLDvideo001' })).videoId, undefined);
  console.log('✓ song videos: admin choice wins, flagged videos are hidden, YouTube-only songs are left alone');
}

// ---- 2. "check embeddable" uses oEmbed (no key), and never needs the frontend
{
  const answers = { ok123456789: 200, off12345678: 401, gone1234567: 404 };
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); const id = new URL(new URL(url).searchParams.get('url')).searchParams.get('v'); const status = answers[id] ?? 500; return { status, ok: status === 200, json: async () => ({ title: 'Video title', author_name: 'Official Channel' }) }; };
  const vl = createVideoLookup({ fetchImpl, cfg: { youtubeApiKey: '', videoChannelAllowlist: [] }, curated: [] });
  assert.deepEqual(await vl.checkVideo('ok123456789'), { videoId: 'ok123456789', embeddable: true, reason: null, title: 'Video title', channel: 'Official Channel', source: 'oembed', regionRestriction: null });
  assert.equal((await vl.checkVideo('off12345678')).reason, 'embedding-disabled');
  assert.equal((await vl.checkVideo('gone1234567')).reason, 'not-found-or-private');
  assert.equal((await vl.checkVideo('bad id')).reason, 'invalid-id');
  assert.ok(calls.every((u) => u.startsWith('https://www.youtube.com/oembed?')) && !calls.some((u) => u.includes('key=')), 'no API key without configuration');
  console.log('✓ song videos: check embeddable (oEmbed: embeddable / embedding off / removed / invalid id)');
}

// ---- 3. the API: reports (signed in, the served video only, 2 different people hide it), admin endpoints (role admin only)
const { default: app } = await import('../src/app.js');
const { initDb, db, usingPostgres, getPrismaClient } = await import('../src/prisma/client.js');
const { musicService } = await import('../src/services/music/providerManager.js');
const { songVideos } = await import('../src/services/songVideos/service.js');
const { videoLookup } = await import('../src/services/music/videoLookup.js');
await initDb();
musicService.setProvider('mock');
const server = app.listen(5021);
const BASE = 'http://localhost:5021/api';
const tag = Math.random().toString(36).slice(2, 7);
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
};
const signup = async (label) => {
  const r = await call('POST', '/auth/register', { body: { name: `Video ${label}`, email: `v_${label}_${tag}@example.com`, password: 'secret12' } });
  assert.equal(r.status, 201);
  return r.json;
};
const makeAdmin = async (id) => (usingPostgres() ? getPrismaClient().user.update({ where: { id }, data: { role: 'admin' } }) : Object.assign(db.users.get(id), { role: 'admin' }));
const songId = `vs_${tag}`;
const VID = 'AbCdEfGhIj1';
await db.song.upsert({ where: { id: songId }, create: { id: songId, title: `Video Song ${tag}`, artist: 'Tester', duration: 200, isPlayable: true, streamUrl: 'https://s/x.mp4' }, update: {} });

try {
  const [A, B, C, ADM] = await Promise.all(['a', 'b', 'c', 'adm'].map(signup));
  await makeAdmin(ADM.user.id);
  // a fresh login so the token carries no stale role (role is read from the database on every request anyway)

  // admin endpoints: not for guests or normal users
  assert.equal((await call('GET', '/admin/videos/flagged')).status, 401);
  assert.equal((await call('GET', '/admin/videos/flagged', { token: A.token })).status, 403);
  assert.equal((await call('PUT', `/admin/videos/${songId}`, { token: A.token, body: { videoId: VID } })).status, 403);

  // admin chooses a video: every list now offers it
  assert.equal((await call('PUT', `/admin/videos/${songId}`, { token: ADM.token, body: { videoId: 'not valid' } })).status, 400);
  const set = await call('PUT', `/admin/videos/${songId}`, { token: ADM.token, body: { videoId: VID } });
  assert.equal(set.status, 200, JSON.stringify(set.json));
  assert.equal(set.json.item.videoId, VID);
  assert.equal(videoLookup.attach([{ id: songId, title: 'whatever' }])[0].videoId, VID, 'the admin choice is served');
  const listed = await call('GET', '/admin/videos/songs?limit=100', { token: ADM.token });
  assert.ok(listed.json.items.some((i) => i.songId === songId && i.servedVideoId === VID && i.source === 'admin'));
  console.log('✓ song videos API: admin only (401 guest, 403 user), admin sets a video id, it is served everywhere');

  // reports: signed in only, validated, only for the video we serve, one per person
  assert.equal((await call('POST', `/songs/${songId}/video-report`, { body: { videoId: VID, code: 150 } })).status, 401, 'guests cannot report');
  assert.equal((await call('POST', `/songs/${songId}/video-report`, { token: A.token, body: { videoId: 'x' } })).status, 400);
  assert.equal((await call('POST', `/songs/${songId}/video-report`, { token: A.token, body: { videoId: VID, code: 150, extra: 1 } })).status, 400, 'no unknown fields');
  assert.equal((await call('POST', `/songs/${songId}/video-report`, { token: A.token, body: { videoId: 'ZZZZZZZZZZZ' } })).status, 409, 'a made-up video id does not count');
  assert.equal((await call('POST', '/songs/does-not-exist-anywhere/video-report', { token: A.token, body: { videoId: VID } })).status, 404);
  let r = await call('POST', `/songs/${songId}/video-report`, { token: A.token, body: { videoId: VID, code: 150 } });
  assert.deepEqual([r.status, r.json.reports, r.json.hidden], [200, 1, false]);
  r = await call('POST', `/songs/${songId}/video-report`, { token: A.token, body: { videoId: VID, code: 150 } });
  assert.deepEqual([r.json.reports, r.json.hidden], [1, false], 'the same person twice is still one report');
  assert.equal(videoLookup.attach([{ id: songId, title: 'x' }])[0].videoId, VID, 'one report does not hide it for everyone');
  r = await call('POST', `/songs/${songId}/video-report`, { token: B.token, body: { videoId: VID, code: 101 } });
  assert.deepEqual([r.json.reports, r.json.hidden], [2, true], 'two different people hide it');
  assert.equal(videoLookup.attach([{ id: songId, title: 'x' }])[0].videoId, undefined, 'hidden for everyone');
  assert.equal((await call('POST', `/songs/${songId}/video-report`, { token: C.token, body: { videoId: VID } })).status, 409, 'nothing more to report once hidden');
  const flagged = await call('GET', '/admin/videos/flagged', { token: ADM.token });
  const f = flagged.json.items.find((i) => i.songId === songId);
  assert.ok(f && f.videoAvailable === false && f.reports === 2 && f.reportCodes.sort().join() === '101,150', JSON.stringify(f));
  console.log('✓ song videos API: reports are signed-in only, validated, per person, for the served video; 2 people hide it; admin sees why');

  // admin restores it
  const restored = await call('POST', `/admin/videos/${songId}/restore`, { token: ADM.token });
  assert.equal(restored.status, 200);
  assert.equal(videoLookup.attach([{ id: songId, title: 'x' }])[0].videoId, VID, 'restored');
  assert.equal((await call('GET', '/admin/videos/flagged', { token: ADM.token })).json.items.some((i) => i.songId === songId), false);
  r = await call('POST', `/songs/${songId}/video-report`, { token: A.token, body: { videoId: VID } });
  assert.equal(r.json.reports, 1, 'a restore forgets the old reports');
  // removing the admin choice hands the song back to the automatic lookup
  assert.equal((await call('DELETE', `/admin/videos/${songId}`, { token: ADM.token })).status, 200);
  assert.notEqual(videoLookup.attach([{ id: songId, title: `Video Song ${tag}` }])[0].videoId, VID);
  assert.equal((await call('DELETE', '/admin/videos/nope_never_saved', { token: ADM.token })).status, 404);
  assert.equal((await call('GET', '/admin/videos/check/bad', { token: ADM.token })).status, 400);
  console.log('✓ song videos API: restore clears the flag and the reports; removing the choice returns the song to the automatic lookup');
  await songVideos.refresh();
} finally {
  server.close();
}
process.exit(0);
