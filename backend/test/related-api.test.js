import assert from 'node:assert/strict';
import app from '../src/app.js';
import { initDb } from '../src/prisma/client.js';
import { musicService } from '../src/services/music/providerManager.js';
import { musicCache } from '../src/services/cacheService.js';

await initDb();
musicService.setProvider('mock'); // offline curated catalogue: fast and deterministic
musicCache.clear();
const server = app.listen(5013);
const BASE = 'http://localhost:5013/api';
const get = async (path, token) => {
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, json: await res.json() };
};

try {
  // seed: "Badass (Leo)": other songs from Leo / Anirudh should come first
  const r = await get('/songs/tt_trending_1/related?limit=10');
  assert.equal(r.status, 200);
  assert.equal(r.json.success, true);
  assert.ok(r.json.items.length >= 5 && r.json.items.length <= 10, `got ${r.json.items.length}`);
  const ids = r.json.items.map((s) => s.id);
  assert.ok(!ids.includes('tt_trending_1'), 'the seed is not in its own radio');
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
  assert.ok(r.json.items.slice(0, 4).some((s) => /leo/i.test(s.album)), 'songs from the same film rank near the top');
  assert.ok(r.json.items.every((s) => s.title && s.why), 'every item carries a reason label');
  assert.equal(r.json.meta.seedId, 'tt_trending_1');
  assert.equal(r.json.meta.personalised, false);
  for (const s of r.json.items) { assert.equal(s.radioScore, undefined, 'internal score is not exposed'); }

  // "never repeat a song already played": the client sends what it has played
  const ex = ids.slice(0, 3).join(',');
  const r2 = await get(`/songs/tt_trending_1/related?limit=10&exclude=${ex}`);
  assert.ok(!r2.json.items.some((s) => ids.slice(0, 3).includes(s.id)), 'excluded ids never come back');
  assert.equal(r2.json.meta.cached, true, 'second request reuses the cached candidate pool');

  // validation and errors
  assert.equal((await get('/songs/tt_trending_1/related?limit=0')).status, 400);
  assert.equal((await get('/songs/tt_trending_1/related?limit=999')).status, 400);
  assert.equal((await get('/songs/does_not_exist_zz/related')).status, 404);

  // default limit
  const d = await get('/songs/tt_trending_2/related');
  assert.equal(d.status, 200);
  assert.ok(d.json.items.length <= 20);

  // works for signed-in users too (personalised flag)
  const reg = await fetch(`${BASE}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Radio Tester', email: `radio_${Date.now()}@example.com`, password: 'secret12' }) }).then((x) => x.json());
  const p = await get('/songs/tt_trending_1/related?limit=5', reg.token);
  assert.equal(p.status, 200);
  assert.equal(p.json.meta.personalised, true);
  console.log('✓ GET /api/songs/:id/related: same-film songs first, no seed, no duplicates, exclude honoured, cached, validated, 404, personalised');
} finally {
  server.close();
}
