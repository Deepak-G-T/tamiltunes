import assert from 'node:assert/strict';
import { isCountedPlay, isEarlySkip, decay, eventWeight, scoreEvents } from '../src/services/speedDial/ranking.js';
import { assembleSpeedDial } from '../src/services/speedDial/assemble.js';
import { SPEED_DIAL as C } from '../src/services/speedDial/config.js';

const DAY = 86400e3;
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const ago = (days) => new Date(NOW - days * DAY);
const play = (songId, days, extra = {}) => ({ songId, playedAt: ago(days), listenedSec: 45, durationSec: 200, completed: false, skippedAtSec: null, ...extra });
const many = (songId, n, days, extra) => Array.from({ length: n }, () => play(songId, days, extra));

// ---------- what counts as a play ----------
assert.equal(isCountedPlay({ listenedSec: 29, durationSec: 200 }), false, '29 s of a normal song is not a play');
assert.equal(isCountedPlay({ listenedSec: 30, durationSec: 200 }), true, '30 s is');
assert.equal(isCountedPlay({ listenedSec: 20, durationSec: 40 }), true, 'half of a 40 s song is');
assert.equal(isCountedPlay({ listenedSec: 19, durationSec: 40 }), false);
assert.equal(isCountedPlay({ listenedSec: 5, durationSec: 0 }), false, 'unknown duration: only the 30 s rule applies');
assert.equal(isCountedPlay({ listenedSec: 5, durationSec: 200, completed: true }), true, 'completed always counts');
assert.equal(isCountedPlay({}), false);
assert.equal(isEarlySkip({ listenedSec: 5, durationSec: 200, skippedAtSec: 5 }), true);
assert.equal(isEarlySkip({ listenedSec: 45, durationSec: 200, skippedAtSec: 45 }), false, 'skipping after it counted is not a skip');
console.log('✓ a play counts after 30 s or 50% of the song (or completion)');

// ---------- decay and weights ----------
assert.equal(decay(0), 1);
assert.ok(Math.abs(decay(C.halfLifeDays) - 0.5) < 1e-12);
assert.ok(Math.abs(decay(2 * C.halfLifeDays) - 0.25) < 1e-12);
assert.equal(decay(-3), 1, 'future timestamps do not boost');
assert.equal(eventWeight(play('a', 0)), C.playWeight);
assert.equal(eventWeight(play('a', 0, { completed: true })), C.playWeight + C.completionBonus);
assert.equal(eventWeight({ listenedSec: 4, durationSec: 200, skippedAtSec: 4 }), -C.skipPenalty);
assert.equal(eventWeight({ listenedSec: 10, durationSec: 200 }), 0, 'neither counted nor skipped: ignored');
console.log('✓ decay halves every half-life; completion adds, early skips subtract');

// ---------- ranking ----------
// the brief's example: 20 plays last week beat 30 plays a year ago
let r = scoreEvents([...many('recent', 20, 6), ...many('ancient', 30, 365)], NOW);
assert.deepEqual(r.map((x) => x.songId), ['recent'], 'plays older than the 90-day window are ignored entirely');
// inside the window, recency still wins over raw count
r = scoreEvents([...many('fresh', 8, 2), ...many('stale', 20, 80)], NOW);
assert.deepEqual(r.map((x) => x.songId), ['fresh', 'stale']);
assert.ok(r[0].score > r[1].score);
assert.equal(r[1].plays, 20, 'playCount is the raw number of counted plays');
// completion beats a bare play; a skip subtracts
r = scoreEvents([play('done', 1, { completed: true }), play('bare', 1)], NOW);
assert.equal(r[0].songId, 'done');
r = scoreEvents([...many('liked', 3, 1), ...many('liked', 2, 1, { listenedSec: 4, skippedAtSec: 4 })], NOW);
assert.ok(Math.abs(r[0].score - (3 - 2 * C.skipPenalty) * decay(1)) < 1e-5, 'skips reduce the score');
assert.equal(r[0].plays, 3);
// songs that were only skipped never appear; uncounted plays are ignored
r = scoreEvents([play('skipped', 1, { listenedSec: 3, skippedAtSec: 3 }), play('short', 1, { listenedSec: 10 })], NOW);
assert.deepEqual(r, []);
// ties: most recent first, then id: stable
r = scoreEvents([play('b', 1), play('a', 1)], NOW);
assert.deepEqual(r.map((x) => x.songId), ['a', 'b']);
// future events are ignored
assert.deepEqual(scoreEvents([play('f', -3)], NOW), []);
// a long half-life changes the answer (weights are tunable)
const slow = { ...C, halfLifeDays: 1000 };
assert.deepEqual(scoreEvents([...many('fresh', 8, 2), ...many('stale', 20, 80)], NOW, slow).map((x) => x.songId), ['stale', 'fresh']);
console.log('✓ ranking: recency decay, 90-day window, completion bonus, skip penalty, ties, tunable half-life');

// ---------- assembling the grid ----------
const S = (id, extra = {}) => ({ id, title: `Song ${id}`, artist: `Artist ${id}`, image: `i/${id}.jpg`, streamUrl: `s/${id}.mp4`, ...extra });
const songs = (...ids) => new Map(ids.map((id) => [id, S(id)]));
const sc = (id, score, plays = 3) => ({ songId: id, score, plays });
const ov = (songId, extra) => ({ songId, slotPosition: null, isPinned: false, isHidden: false, updatedAt: new Date(NOW), ...extra });
const ids = (items) => items.map((i) => i.id);

// ranked by score, then suggestions fill the rest
let items = assembleSpeedDial({ scores: [sc('a', 5), sc('b', 3), sc('c', 1)], overrides: [], songs: songs('a', 'b', 'c'), suggestions: ['s1', 's2', 's3', 's4', 's5', 's6', 's7'].map((id) => S(id)) });
assert.equal(items.length, 9);
assert.deepEqual(ids(items).slice(0, 3), ['a', 'b', 'c']);
assert.deepEqual(items.map((i) => i.source), ['played', 'played', 'played', ...Array(6).fill('suggested')]);
assert.deepEqual(items.map((i) => i.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
assert.deepEqual(items.filter((i) => i.hot).map((i) => i.id), ['a', 'b', 'c'], 'flame on the top 3 played songs');
assert.ok(items.slice(3).every((i) => !i.hot && i.playCount === 0));
// new user: nothing played, still a full grid of suggestions
items = assembleSpeedDial({ scores: [], overrides: [], songs: new Map(), suggestions: ['s1', 's2', 's3'].map((id) => S(id)) });
assert.deepEqual(ids(items), ['s1', 's2', 's3']);
assert.ok(items.every((i) => i.source === 'suggested'));
// never more than 9, suggestions never duplicate played songs
items = assembleSpeedDial({ scores: [sc('a', 5)], overrides: [], songs: songs('a'), suggestions: ['a', ...Array.from({ length: 20 }, (_, i) => `s${i}`)].map((id) => S(id)) });
assert.equal(items.length, 9);
assert.equal(ids(items).filter((i) => i === 'a').length, 1);
// songs below the minimum score are not "most played" yet
items = assembleSpeedDial({ scores: [sc('weak', 0.05)], overrides: [], songs: songs('weak'), suggestions: [S('s1')] });
assert.deepEqual(ids(items), ['s1']);

// pins hold their slot and are never displaced by ranking
items = assembleSpeedDial({ scores: [sc('a', 5), sc('b', 4), sc('c', 3), sc('d', 2)], overrides: [ov('d', { isPinned: true, slotPosition: 0 }), ov('a', { isPinned: true, slotPosition: 2 })], songs: songs('a', 'b', 'c', 'd') });
assert.deepEqual(ids(items), ['d', 'b', 'a', 'c']);
assert.deepEqual(items.map((i) => i.pinned), [true, false, true, false]);
// a pinned song that was never played (or is a suggestion) is allowed
items = assembleSpeedDial({ scores: [sc('a', 5)], overrides: [ov('x', { isPinned: true, slotPosition: 1 })], songs: songs('a', 'x') });
assert.deepEqual(ids(items), ['a', 'x']);
// two pins on the same slot: the newer keeps it, the other takes the next free slot
items = assembleSpeedDial({ scores: [], overrides: [ov('p', { isPinned: true, slotPosition: 0, updatedAt: new Date(NOW - 1000) }), ov('q', { isPinned: true, slotPosition: 0, updatedAt: new Date(NOW) })], songs: songs('p', 'q') });
assert.deepEqual(ids(items), ['q', 'p']);
// out-of-range slot is clamped; gaps are closed
items = assembleSpeedDial({ scores: [sc('a', 5)], overrides: [ov('z', { isPinned: true, slotPosition: 99 })], songs: songs('a', 'z') });
assert.deepEqual(ids(items), ['a', 'z']);
// hidden songs disappear from ranking, pins and suggestions
items = assembleSpeedDial({ scores: [sc('a', 5), sc('b', 4)], overrides: [ov('a', { isHidden: true }), ov('s1', { isHidden: true })], songs: songs('a', 'b'), suggestions: [S('s1'), S('s2')] });
assert.deepEqual(ids(items), ['b', 's2']);
// hiding wins over pinning
items = assembleSpeedDial({ scores: [sc('a', 5)], overrides: [ov('a', { isPinned: true, isHidden: true, slotPosition: 0 })], songs: songs('a') });
assert.deepEqual(ids(items), []);
// songs we have no details for cannot be shown
assert.deepEqual(ids(assembleSpeedDial({ scores: [sc('ghost', 9)], overrides: [], songs: new Map() })), []);
console.log('✓ assembly: ranked fill, suggestions for new users, pins keep slots, hidden songs vanish, collisions, max 9');
