import assert from 'node:assert/strict';
import { initDb, db, usingPostgres } from '../src/prisma/client.js';
import { getSignalsStore } from '../src/services/related/signalsStore.js';
import { getHomeSignals } from '../src/services/homeFeed/signals.js';

await initDb();
const tag = Math.random().toString(36).slice(2, 7);
const mkUser = async (n) => db.user.create({ data: { email: `hs_${n}_${tag}@example.com`, password: 'x', name: `HS ${n}`, username: `hs${n}${tag}` } });
const A = await mkUser('a');
const B = await mkUser('b');
const song = (id, artist) => db.song.upsert({ where: { id: `${id}${tag}` }, create: { id: `${id}${tag}`, title: `Song ${id}`, artist, duration: 200, isPlayable: true, streamUrl: `https://s/${id}.mp4` }, update: {} });
for (const [id, artist] of [['x1', 'Anirudh Ravichander'], ['x2', 'Anirudh Ravichander'], ['x3', 'Sid Sriram'], ['x4', 'Yuvan Shankar Raja']]) await song(id, artist);
const play = (user, id, n, completed = true) => Promise.all(Array.from({ length: n }, () => getSignalsStore().recordPlayEvent({ userId: user.id, songId: `${id}${tag}`, completed, skippedAtSec: completed ? null : 3, source: 'test' })));
await play(A, 'x1', 4);   // A plays x1 four times
await play(A, 'x3', 1);
await play(A, 'x2', 2, false); // early skips do not count
await play(B, 'x1', 2);
await play(B, 'x4', 3);

const sig = getHomeSignals();
const week = await sig.weekPlays(A.id);
assert.equal(week.get(`x1${tag}`), 4, 'counted plays in the last 7 days');
assert.equal(week.get(`x3${tag}`), 1);
assert.equal(week.has(`x2${tag}`), false, 'skipped songs do not count as played');
assert.equal((await sig.weekPlays(B.id)).get(`x1${tag}`), 2, 'each person has their own counts');

const artists = await sig.topArtists(A.id, 3);
assert.deepEqual(artists.slice(0, 2), ['Anirudh Ravichander', 'Sid Sriram'], 'top artists follow what the person plays most');
assert.deepEqual(await sig.topArtists('nobody-' + tag, 3), []);

const trending = await sig.globalTrending(50);
const mine = trending.filter((t) => t.song.id.endsWith(tag));
assert.equal(mine[0].song.id, `x1${tag}`, 'most played across everyone first');
assert.equal(mine[0].plays, 6);
assert.ok(mine.find((t) => t.song.id === `x4${tag}`).plays === 3);
assert.ok(mine.every((t) => t.song.title && t.song.streamUrl), 'songs come back in the shape the providers use');
assert.equal(mine.some((t) => t.song.id === `x2${tag}`), false, 'skipped plays do not make a song trend');

// recent songs: from listening history
await db.listeningHistory.create({ data: { userId: A.id, songId: `x3${tag}` } });
await db.listeningHistory.create({ data: { userId: A.id, songId: `x1${tag}` } });
await db.listeningHistory.create({ data: { userId: A.id, songId: `x3${tag}` } });
const recent = await sig.recentSongs(A.id, 10);
assert.deepEqual(recent.map((s) => s.id).filter((id) => id.endsWith(tag)), [`x3${tag}`, `x1${tag}`], 'newest first, each song once');
assert.deepEqual(await sig.recentSongs('nobody-' + tag, 10), []);
console.log(`✓ home signals (${usingPostgres() ? 'PostgreSQL' : 'memory'}): week plays, top artists, global trending, recent songs`);
process.exit(0);
