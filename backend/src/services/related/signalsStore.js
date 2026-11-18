/**
 * Behaviour signals for the related-songs ranking. One contract, two implementations:
 * Prisma/PostgreSQL (production, parameterised SQL) and in-memory (dev + tests).
 * The Prisma half has no integration coverage until TEST_DATABASE_URL is used (see CLAUDE.md).
 */
import { db, usingPostgres, getPrismaClient } from '../../prisma/client.js';
import { USER_WINDOWS } from './weights.js';

// ---- play events (memory only; production uses the play_events table) ----
const memoryEvents = [];

export function createMemorySignals() {
  return {
    kind: 'memory',

    /** Songs that share playlists with, or are heard by the same people as, the seed. Map(songId -> count). */
    async coListening(seedId, limit = 60) {
      const counts = new Map();
      const bump = (id) => counts.set(id, (counts.get(id) || 0) + 1);

      const byPlaylist = new Map();
      for (const ps of db.playlistSongs.values()) {
        if (!byPlaylist.has(ps.playlistId)) byPlaylist.set(ps.playlistId, new Set());
        byPlaylist.get(ps.playlistId).add(ps.songId);
      }
      for (const songs of byPlaylist.values()) if (songs.has(seedId)) for (const id of songs) if (id !== seedId) bump(id);

      const listeners = new Set(db._historyItems.filter((h) => h.songId === seedId).map((h) => h.userId));
      const perSong = new Map();
      for (const h of db._historyItems) {
        if (h.songId === seedId || !listeners.has(h.userId)) continue;
        if (!perSong.has(h.songId)) perSong.set(h.songId, new Set());
        perSong.get(h.songId).add(h.userId);
      }
      for (const [id, users] of perSong) counts.set(id, (counts.get(id) || 0) + users.size);

      return new Map([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit));
    },

    async userSignals(userId, now = Date.now()) {
      const recentSince = now - USER_WINDOWS.recentHours * 3600e3;
      const skipSince = now - USER_WINDOWS.skipDays * 86400e3;
      const liked = new Set([...db.favorites.values()].filter((f) => f.userId === userId).map((f) => f.songId));
      const recent = new Set(
        db._historyItems.filter((h) => h.userId === userId && new Date(h.playedAt).getTime() >= recentSince).map((h) => h.songId)
      );
      const skipped = new Set();
      for (const e of memoryEvents) {
        if (e.userId !== userId) continue;
        const t = new Date(e.playedAt).getTime();
        if (t >= recentSince) recent.add(e.songId);
        if (t >= skipSince && e.skippedAtSec != null && e.skippedAtSec < USER_WINDOWS.skipEarlySeconds) skipped.add(e.songId);
      }
      return { liked, recent, skipped };
    },

    async songsByIds(ids) {
      return ids.map((id) => db.songs.get(id)).filter(Boolean).map((s) => ({ ...s }));
    },

    async enrichSong() {
      /* the in-memory store keeps whatever it was given */
    },

    async recordPlayEvent(event) {
      memoryEvents.push({ playedAt: new Date(), completed: false, skippedAtSec: null, source: null, ...event });
    },
  };
}

export function createPrismaSignals(prisma) {
  return {
    kind: 'prisma',

    async coListening(seedId, limit = 60) {
      const [playlistRows, listenerRows] = await Promise.all([
        prisma.$queryRaw`
          SELECT other."songId" AS "songId", COUNT(*)::int AS n
          FROM playlist_songs seed
          JOIN playlist_songs other ON other."playlistId" = seed."playlistId" AND other."songId" <> seed."songId"
          WHERE seed."songId" = ${seedId}
          GROUP BY other."songId" ORDER BY n DESC LIMIT ${limit}`,
        prisma.$queryRaw`
          SELECT other."songId" AS "songId", COUNT(DISTINCT other."userId")::int AS n
          FROM listening_history seed
          JOIN listening_history other ON other."userId" = seed."userId" AND other."songId" <> seed."songId"
          WHERE seed."songId" = ${seedId}
          GROUP BY other."songId" ORDER BY n DESC LIMIT ${limit}`,
      ]);
      const counts = new Map();
      for (const r of [...playlistRows, ...listenerRows]) counts.set(r.songId, (counts.get(r.songId) || 0) + Number(r.n));
      return new Map([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit));
    },

    async userSignals(userId, now = Date.now()) {
      const recentSince = new Date(now - USER_WINDOWS.recentHours * 3600e3);
      const skipSince = new Date(now - USER_WINDOWS.skipDays * 86400e3);
      const [likes, history, events] = await Promise.all([
        prisma.favorite.findMany({ where: { userId }, select: { songId: true }, take: 2000 }),
        prisma.listeningHistory.findMany({ where: { userId, playedAt: { gte: recentSince } }, select: { songId: true }, take: 500 }),
        prisma.playEvent.findMany({ where: { userId, playedAt: { gte: skipSince } }, select: { songId: true, playedAt: true, skippedAtSec: true }, take: 1000 }),
      ]);
      const liked = new Set(likes.map((f) => f.songId));
      const recent = new Set(history.map((h) => h.songId));
      const skipped = new Set();
      for (const e of events) {
        if (e.playedAt >= recentSince) recent.add(e.songId);
        if (e.skippedAtSec != null && e.skippedAtSec < USER_WINDOWS.skipEarlySeconds) skipped.add(e.songId);
      }
      return { liked, recent, skipped };
    },

    songsByIds: (ids) => (ids.length ? prisma.song.findMany({ where: { id: { in: ids } } }) : []),

    /** Fill metadata on a song row that already exists (never creates rows). */
    async enrichSong(song) {
      const data = {};
      if (song.composer) data.composer = String(song.composer).slice(0, 200);
      if (song.singers) data.singers = String(song.singers).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
      if (song.album) data.movie = String(song.album).slice(0, 200);
      const y = parseInt(song.year, 10);
      if (Number.isInteger(y) && y > 1900 && y < 2100) data.year = y;
      if (song.language) data.language = String(song.language).toLowerCase().slice(0, 30);
      if (Object.keys(data).length) await prisma.song.updateMany({ where: { id: song.id }, data });
    },

    recordPlayEvent: (e) => prisma.playEvent.create({ data: { userId: e.userId, songId: e.songId, completed: Boolean(e.completed), skippedAtSec: e.skippedAtSec ?? null, source: e.source ?? null } }),
  };
}

let prismaSignals;
let memorySignals;
export const getSignalsStore = () =>
  usingPostgres() ? (prismaSignals ??= createPrismaSignals(getPrismaClient())) : (memorySignals ??= createMemorySignals());
