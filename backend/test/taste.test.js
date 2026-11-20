import assert from 'node:assert/strict';
import app from '../src/app.js';
import { initDb, db } from '../src/prisma/client.js';
import { config } from '../src/config/env.js';
import { musicService } from '../src/services/music/providerManager.js';
import { mixSeeds, eraPlan, buildHome, clearHomeCache, planMixes } from '../src/services/homeFeed/homeFeedService.js';
import { ARTIST_OPTIONS, COMPOSER_OPTIONS, ERA_OPTIONS, TASTE_LIMITS } from '../src/services/taste/options.js';
import { ONBOARDING_SKIP_PLAYS } from '../src/controllers/tasteController.js';
import { getTasteStore } from '../src/services/taste/store.js';
import { getSignalsStore } from '../src/services/related/signalsStore.js';

// ---------------------------------------------------------------- 1. seeds and shelf order (pure)
{
  const taste = { artists: ['Sid Sriram', 'Shreya Ghoshal', 'Karthik'], composers: ['Ilaiyaraaja', 'A. R. Rahman'], eras: ['90s'] };
  assert.deepEqual(mixSeeds({ played: [], taste }), ['Sid Sriram', 'Ilaiyaraaja', 'Shreya Ghoshal', 'A. R. Rahman', 'Karthik'], 'artists and music directors in turn');
  assert.deepEqual(mixSeeds({ played: ['Anirudh Ravichander', 'Dhanush'], taste }).slice(0, 2), ['Anirudh Ravichander', 'Dhanush'], 'what they really play comes first');
  assert.equal(mixSeeds({ played: Array.from({ length: 8 }, (_, i) => `P${i}`), taste }).length, 6, 'real listening fills all six seeds: the picks step aside');
  assert.ok(!mixSeeds({ played: Array.from({ length: 6 }, (_, i) => `P${i}`), taste }).includes('Sid Sriram'));
  assert.deepEqual(mixSeeds({ played: ['sid sriram'], taste }).filter((n) => /sid sriram/i.test(n)), ['sid sriram'], 'no duplicates, whatever the capitals');
  assert.deepEqual(mixSeeds({ played: [], taste: null, hints: ['Hint A'] }), ['Hint A'], 'a guest keeps working as before');
  assert.deepEqual(mixSeeds({}), []);
  assert.equal(planMixes(mixSeeds({ played: [], taste })).length, 3);

  const plan = ['continue', 'daily-mix-1', 'videos', 'trending', 'new', 'nineties', 'aughts', 'artists', 'albums'].map((id) => ({ id }));
  assert.deepEqual(eraPlan(plan, ['90s']).map((s) => s.id), ['continue', 'daily-mix-1', 'videos', 'nineties', 'trending', 'new', 'aughts', 'artists', 'albums'], 'a picked era moves up, before Trending');
  assert.deepEqual(eraPlan(plan, ['2000s', '90s']).map((s) => s.id).slice(3, 6), ['nineties', 'aughts', 'trending'], 'several eras keep the page order');
  assert.deepEqual(eraPlan(plan, ['2010s', 'before-1990']), plan, 'an era with no shelf changes nothing');
  assert.deepEqual(eraPlan(plan, []), plan);
  assert.equal(eraPlan(plan, ['90s']).length, plan.length, 'nothing added or removed');
  console.log('✓ taste: Daily Mix seeds (real plays first, then picks in turn, no duplicates) and era shelves move up');
}

// ---------------------------------------------------------------- 2. the choices are a fixed list
{
  assert.ok(ARTIST_OPTIONS.length >= 20 && COMPOSER_OPTIONS.length >= 12 && ERA_OPTIONS.length === 5);
  assert.equal(new Set(ARTIST_OPTIONS).size, ARTIST_OPTIONS.length);
  assert.equal(new Set(COMPOSER_OPTIONS).size, COMPOSER_OPTIONS.length);
  assert.ok([...ARTIST_OPTIONS, ...COMPOSER_OPTIONS].every((n) => /^[\x20-\x7E]+$/.test(n)), 'English letters only (the English-only source test)');
  console.log('✓ taste: a fixed list of artists, music directors and eras');
}

// ---------------------------------------------------------------- 3. the endpoint (memory store, and PostgreSQL when TEST_DATABASE_URL is set)
await initDb();
musicService.setProvider('mock');
config.requireLogin = true;
const server = app.listen(5047);
const BASE = 'http://localhost:5047/api';
const call = async (method, path, { token, body } = {}) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json() };
};
const tag = Math.random().toString(36).slice(2, 7);
const signup = async (label) => { const r = await call('POST', '/auth/register', { body: { name: `Taste ${label}`, email: `taste.${label}.${tag}@example.com`, password: 'password-12345' } }); assert.equal(r.status, 201); const me = await call('GET', '/auth/me', { token: r.json.token }); return { token: r.json.token, id: me.json.user.id }; };
try {
  const a = await signup('a'); const b = await signup('b'); const heavy = await signup('heavy');
  assert.equal((await call('GET', '/me/taste')).status, 401, 'private: sign in required');
  assert.equal((await call('PUT', '/me/taste', { body: { artists: [] } })).status, 401);

  const first = await call('GET', '/me/taste', { token: a.token });
  assert.equal(first.status, 200);
  assert.equal(first.json.taste, null);
  assert.equal(first.json.shouldOnboard, true, 'a new account is asked once');
  assert.deepEqual(first.json.options.artists, ARTIST_OPTIONS);
  assert.deepEqual(first.json.options.limits, TASTE_LIMITS);
  assert.equal(first.json.options.eras.length, 5);

  // validation: only the fixed list, no extras, no duplicates, limits
  const put = (body, token = a.token) => call('PUT', '/me/taste', { token, body });
  assert.equal((await put({ artists: ['Not A Real Singer'] })).status, 400, 'unknown name');
  assert.equal((await put({ artists: [ARTIST_OPTIONS[0], ARTIST_OPTIONS[0]] })).status, 400, 'duplicate');
  assert.equal((await put({ artists: ARTIST_OPTIONS.slice(0, TASTE_LIMITS.artists + 1) })).status, 400, 'too many artists');
  assert.equal((await put({ composers: COMPOSER_OPTIONS.slice(0, TASTE_LIMITS.composers + 1) })).status, 400, 'too many music directors');
  assert.equal((await put({ eras: ['1850s'] })).status, 400, 'unknown era');
  assert.equal((await put({ artists: [ARTIST_OPTIONS[0]], isAdmin: true })).status, 400, 'no extra fields');
  assert.equal((await put({ artists: 'Sid Sriram' })).status, 400);
  assert.equal((await put({ artists: [`<script>alert(1)</script>`] })).status, 400, 'free text never gets in');
  assert.equal((await call('GET', '/me/taste', { token: a.token })).json.taste, null, 'bad requests saved nothing');

  // save, read back, no longer asked
  const saved = await put({ artists: ['Sid Sriram', 'Chinmayi', 'Karthik'], composers: ['Ilaiyaraaja', 'Anirudh Ravichander'], eras: ['90s', '2010s'] });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json.taste.artists, ['Sid Sriram', 'Chinmayi', 'Karthik']);
  const again = await call('GET', '/me/taste', { token: a.token });
  assert.deepEqual(again.json.taste.eras, ['90s', '2010s']);
  assert.equal(again.json.taste.skipped, false);
  assert.equal(again.json.shouldOnboard, false);
  assert.ok(!JSON.stringify(again.json).includes(a.id) && !JSON.stringify(again.json).includes('@example.com'), 'no id or email in the answer');

  // one person never sees another's picks
  const other = await call('GET', '/me/taste', { token: b.token });
  assert.equal(other.json.taste, null);
  assert.equal(other.json.shouldOnboard, true);

  // "Skip for now": an empty save remembers not to ask again
  const skipped = await put({}, b.token);
  assert.equal(skipped.status, 200);
  assert.equal(skipped.json.taste.skipped, true);
  assert.equal((await call('GET', '/me/taste', { token: b.token })).json.shouldOnboard, false);

  // change your mind: saving again replaces everything
  const changed = await put({ artists: ['Shreya Ghoshal'], composers: [], eras: [] });
  assert.deepEqual((await call('GET', '/me/taste', { token: a.token })).json.taste.artists, ['Shreya Ghoshal']);
  assert.equal(changed.json.taste.skipped, false, 'a real save is not a skip');

  // forget: asked again next time
  assert.equal((await call('DELETE', '/me/taste', { token: a.token })).status, 200);
  assert.equal((await call('GET', '/me/taste', { token: a.token })).json.shouldOnboard, true);

  // someone who already listens a lot is not interrupted (they can still open the picker from Settings)
  const signals = getSignalsStore();
  await db.song.upsert({ where: { id: `tz${tag}` }, create: { id: `tz${tag}`, title: 'Taste Song', artist: 'T', duration: 200, streamUrl: 'https://s/x.mp4', isPlayable: true }, update: {} });
  for (let i = 0; i < ONBOARDING_SKIP_PLAYS; i++) await signals.recordPlayEvent({ userId: heavy.id, songId: `tz${tag}`, completed: true, listenedSec: 200, durationSec: 200, source: 'radio', playedAt: new Date(Date.now() - i * 60e3) });
  const h = await call('GET', '/me/taste', { token: heavy.token });
  assert.equal(h.json.taste, null);
  assert.equal(h.json.shouldOnboard, false, 'a regular listener is not interrupted');

  // ---------------------------------------------------------------- 4. the picks shape Home on day one
  clearHomeCache();
  const noPicks = await buildHome({ userId: a.id, visit: 'v1' });
  const noPickIds = [...noPicks.sections.map((s) => s.id), ...noPicks.hidden];
  assert.ok(noPickIds.includes('made-for-you') && !noPickIds.includes('daily-mix-1'), 'no picks and no plays: the generic shelf');
  await put({ artists: ['Sid Sriram', 'Chinmayi', 'Karthik', 'Shreya Ghoshal'], composers: ['Ilaiyaraaja', 'A. R. Rahman'], eras: ['90s'] });
  const withPicks = await buildHome({ userId: a.id, visit: 'v2' });
  const ids = [...withPicks.sections.map((s) => s.id), ...withPicks.hidden];
  assert.ok(ids.includes('daily-mix-1') && ids.includes('daily-mix-2') && ids.includes('daily-mix-3'), 'three Daily Mixes from the picks on day one');
  assert.ok(!ids.includes('made-for-you'));
  const order = withPicks.sections.map((s) => s.id);
  if (order.includes('nineties') && order.includes('trending')) assert.ok(order.indexOf('nineties') < order.indexOf('trending'), 'the picked era comes before Trending');
  console.log('✓ taste API: private, fixed list only, validated, replace/skip/forget, regular listeners not interrupted; picks give a new account Daily Mixes on day one');
} finally {
  server.close();
}
process.exit(0);
