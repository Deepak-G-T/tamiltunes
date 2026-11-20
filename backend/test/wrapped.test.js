import assert from 'node:assert/strict';
import app from '../src/app.js';
import { initDb, db } from '../src/prisma/client.js';
import { config } from '../src/config/env.js';
import { musicService } from '../src/services/music/providerManager.js';
import { buildWrapped, secondsListened, longestStreak, timeOfDay, WRAPPED } from '../src/services/wrapped/build.js';
import { yearBounds, clearWrappedCache } from '../src/controllers/wrappedController.js';
import { getSignalsStore } from '../src/services/related/signalsStore.js';

// ---------------------------------------------------------------- 1. the numbers (pure)
const S = (id, title, artist, extra = {}) => ({ id, title, artist, album: extra.album ?? `Film ${id}`, duration: 240, year: 2015, ...extra });
const songs = new Map([
  ['a1', S('a1', 'Pavazha Malli', 'Sid Sriram', { album: 'Single', year: 1995, composer: 'Ilaiyaraaja' })],
  ['a2', S('a2', 'Pavazha Malli (Unplugged)', 'Sid Sriram', { album: 'Unplugged', year: 1995, composer: 'Ilaiyaraaja' })], // a version of the same song
  ['b1', S('b1', 'Kannana Kanne', 'D. Imman, Sid Sriram', { album: 'Viswasam', year: 2019, composer: 'D. Imman' })],
  ['c1', S('c1', 'Vaathi Coming', 'Anirudh Ravichander', { album: 'Master', year: 2021, composer: 'Anirudh' })],
]);
const tz = 330; // India
// 2026-03-01 .. in IST: build events at local IST times
const at = (day, hh, mm = 0) => Date.UTC(2026, 2, day, hh, mm) - tz * 60000; // local IST clock time -> UTC
const ev = (songId, when, over = {}) => ({ songId, playedAt: when, completed: true, listenedSec: 240, durationSec: 240, ...over });
const events = [];
for (let d = 1; d <= 6; d++) events.push(ev('a1', at(d, 23, 10)), ev('a2', at(d, 23, 40)));   // 12 plays of Pavazha Malli (+ its version) late at night, six days in a row
for (let d = 1; d <= 3; d++) events.push(ev('b1', at(d, 8, 0)), ev('c1', at(d, 9, 0)));         // 6 more in the morning
events.push(ev('b1', at(9, 8, 0), { completed: false, listenedSec: 12 }));                      // skipped after 12 s: NOT counted
events.push(ev('c1', at(9, 9, 0), { completed: false, listenedSec: 45, durationSec: 240 }));    // left after 45 s: counted
events.push(ev('ghost', at(9, 10, 0)));                                                         // a song that no longer exists: ignored
events.push(ev('c1', at(9, 11, 0)), ev('c1', at(9, 12, 0)));                                     // two more

{
  const w = buildWrapped(events, songs, { year: 2026, tzMinutes: tz });
  assert.equal(w.ready, true);
  assert.equal(w.totals.plays, 12 + 6 + 1 + 2, 'counted plays: finished or 30 s+; the 12 s skip and the missing song are out');
  assert.equal(w.topSongs[0].title, 'Pavazha Malli', 'a song and its unplugged version count as one song');
  assert.equal(w.topSongs[0].plays, 12);
  assert.equal(w.topSongs[1].id, 'c1');
  assert.equal(w.topSongs[1].plays, 3 + 3);
  assert.equal(w.totals.distinctSongs, 3, 'the same song under another id is one song');
  assert.equal(w.topArtists[0].name, 'Sid Sriram');
  assert.equal(w.topArtists[0].plays, 12 + 3, 'a duet counts for both singers: Sid Sriram in 12 + 3 plays');
  assert.ok(w.topArtists.some((a) => a.name === 'D. Imman'));
  assert.equal(w.totals.distinctArtists, 3);
  assert.deepEqual(w.topFilms.map((f) => [f.name, f.plays]), [['Single', 6], ['Unplugged', 6], ['Master', 6], ['Viswasam', 3]], 'films are counted per film; a tie goes to the film with more minutes listened (the unplugged version is on its own album)');
  assert.equal(w.topComposers[0].name, 'Ilaiyaraaja');
  assert.deepEqual(w.topEra, { label: '90s', share: 57 }, '12 of 21 plays are from the 90s');
  assert.equal(w.totals.activeDays, 7, 'days 1-6 and 9');
  assert.equal(w.totals.longestStreak, 6);
  assert.equal(w.timeOfDay.part, 'night');
  assert.equal(w.timeOfDay.label, 'Night owl');
  assert.equal(w.firstSong.date, '2026-03-01');
  assert.equal(w.totals.minutes, Math.round((12 * 240 + 3 * 240 + 3 * 240 + 45 + 2 * 240) / 60 + 0), 'minutes are really listened seconds, not the song lengths');
  assert.equal(w.year, 2026);
  console.log('✓ wrapped numbers: counted plays only, versions merged, duets count for both singers, minutes from listened seconds, streak and time of day');
}

// ---------------------------------------------------------------- 2. not enough listening, caps, helpers
{
  const few = buildWrapped(events.slice(0, 5), songs, { year: 2026, tzMinutes: tz });
  assert.equal(few.ready, false);
  assert.deepEqual([few.topSongs, few.topArtists, few.topFilms], [[], [], []], 'nothing is named below the minimum');
  assert.equal(few.totals.plays, 5);
  const empty = buildWrapped([], new Map(), { year: 2026 });
  assert.equal(empty.ready, false);
  assert.equal(empty.totals.minutes, 0);
  assert.equal(empty.timeOfDay, null);
  assert.equal(secondsListened({ completed: true, listenedSec: 5000, durationSec: 200 }), 220, 'never more than 1.1 x the song (a paused tab)');
  assert.equal(secondsListened({ completed: true }, { duration: 180 }), 180);
  assert.equal(secondsListened({ completed: false, listenedSec: 20 }), 20);
  assert.equal(longestStreak(new Set([1, 2, 3, 7, 8, 20])), 3);
  assert.equal(longestStreak(new Set()), 0);
  assert.deepEqual([timeOfDay(4), timeOfDay(5), timeOfDay(12), timeOfDay(17), timeOfDay(22), timeOfDay(0)], ['night', 'morning', 'afternoon', 'evening', 'night', 'night']);
  assert.equal(WRAPPED.minPlays, 20);
  console.log('✓ wrapped: nothing is named below 20 plays, an empty year is safe, a paused tab cannot inflate minutes');
}

// ---------------------------------------------------------------- 3. the year follows the person's own time zone
{
  const [from, to] = yearBounds(2026, 330);
  assert.equal(from.toISOString(), '2025-12-31T18:30:00.000Z', '1 January 2026 starts at 18:30 UTC the evening before, in India');
  assert.equal(to.toISOString(), '2026-12-31T18:30:00.000Z');
  const [utcFrom] = yearBounds(2026, 0);
  assert.equal(utcFrom.toISOString(), '2026-01-01T00:00:00.000Z');
  console.log('✓ wrapped: the year starts and ends at the person\'s local midnight');
}

// ---------------------------------------------------------------- 4. the endpoint (memory store, and PostgreSQL when TEST_DATABASE_URL is set)
await initDb();
musicService.setProvider('mock');
config.requireLogin = true;
const server = app.listen(5045);
const BASE = 'http://localhost:5045/api';
const call = async (path, token) => { const r = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); return { status: r.status, json: await r.json() }; };
const post = async (path, body) => { const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };
try {
  const tag = Math.random().toString(36).slice(2, 7);
  const reg = await post('/auth/register', { name: 'Wrapped One', email: `wrapped.${tag}@example.com`, password: 'password-12345' });
  assert.equal(reg.status, 201);
  const token = reg.json.token;
  const me = (await call('/auth/me', token)).json.user;
  const other = (await post('/auth/register', { name: 'Wrapped Two', email: `wrapped2.${tag}@example.com`, password: 'password-12345' })).json;

  assert.equal((await call('/me/wrapped')).status, 401, 'private: sign in required');
  assert.equal((await call('/me/wrapped?year=1999', token)).status, 400);
  assert.equal((await call('/me/wrapped?year=abc', token)).status, 400);
  assert.equal((await call('/me/wrapped?tz=99999', token)).status, 400);
  assert.equal((await call('/me/wrapped?year=2099', token)).status, 400, 'a year that has not started');

  const year = new Date().getUTCFullYear();
  const empty = await call(`/me/wrapped?year=${year}`, token);
  assert.equal(empty.status, 200);
  assert.equal(empty.json.wrapped.ready, false);

  // a real listener: 25 finished plays of 5 songs spread over a few days
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const id = `wr${tag}${i}`; ids.push(id);
    await db.song.upsert({ where: { id }, create: { id, title: `Wrapped Song ${i}`, artist: i < 2 ? 'Anirudh Ravichander' : `Singer ${i}`, album: `Wrapped Film ${i}`, duration: 200, streamUrl: `https://s/${id}.mp4`, isPlayable: true, year: 2019, composer: 'Anirudh' }, update: {} });
  }
  const signals = getSignalsStore();
  const base = Date.UTC(year, 0, 5, 14, 0); // 5 January, 19:30 in India
  for (let n = 0; n < 25; n++) await signals.recordPlayEvent({ userId: me.id, songId: ids[n % 5], completed: true, listenedSec: 200, durationSec: 200, source: 'radio', playedAt: new Date(base + n * 3600e3) });
  clearWrappedCache();
  const got = await call(`/me/wrapped?year=${year}&tz=330`, token);
  assert.equal(got.status, 200);
  const w = got.json.wrapped;
  assert.equal(w.ready, true);
  assert.equal(w.totals.plays, 25);
  assert.equal(w.totals.distinctSongs, 5);
  assert.equal(w.topSongs.length, 5);
  assert.equal(w.topSongs[0].plays, 5);
  assert.equal(w.topArtists[0].name, 'Anirudh Ravichander');
  assert.equal(w.topArtists[0].plays, 10);
  assert.equal(w.totals.minutes, Math.round(25 * 200 / 60));
  assert.equal(w.topComposers[0].name, 'Anirudh');
  // nothing about anyone else, and only what is needed leaves the server
  assert.equal((await call(`/me/wrapped?year=${year}`, other.token)).json.wrapped.totals.plays, 0, 'one person never sees another person\'s year');
  const blob = JSON.stringify(got.json);
  assert.ok(!blob.includes(me.id) && !blob.includes('@example.com'), 'no user id or email in the answer');
  // the second request is answered from the cache (a new play does not show for a few minutes)
  await signals.recordPlayEvent({ userId: me.id, songId: ids[0], completed: true, listenedSec: 200, durationSec: 200, source: 'radio', playedAt: new Date(base + 99 * 3600e3) });
  assert.equal((await call(`/me/wrapped?year=${year}&tz=330`, token)).json.wrapped.totals.plays, 25, 'cached for a few minutes');
  clearWrappedCache();
  assert.equal((await call(`/me/wrapped?year=${year}&tz=330`, token)).json.wrapped.totals.plays, 26);
  console.log('✓ wrapped API: private, validated, per person, cached, no ids or emails in the answer');
} finally {
  server.close();
}
process.exit(0);
