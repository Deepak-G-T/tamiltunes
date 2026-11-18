/**
 * What the home page knows about listening. One contract, two implementations (Prisma/PostgreSQL and in-memory for dev + tests).
 *   weekPlays(userId, now)         Map(songId -> counted plays in the last 7 days)
 *   topArtists(userId, limit, now) artist names from this person's most played songs (last 90 days)
 *   globalTrending(limit, now)     [{ song, plays }] most played songs across everyone (last 14 days)
 *   recentSongs(userId, limit)     the person's latest distinct songs, newest first
 * "Counted play" = completed, or at least 30 s listened (the same rule as Speed Dial).
 */
import { db, usingPostgres, getPrismaClient } from '../../prisma/client.js';
import { memoryEvents } from '../related/signalsStore.js';

const DAY = 86400e3;
export const WINDOWS = { weekDays: 7, tasteDays: 90, trendingDays: 14 };
const COUNTED = [{ completed: true }, { listenedSec: { gte: 30 } }];
const isCounted = (e) => e.completed || (e.listenedSec ?? 0) >= 30;

/** A song row from the database in the same shape the music providers use. */
export const toFeedSong = (s) => s && ({
  id: s.id,
  title: s.title,
  artist: s.artist,
  singers: Array.isArray(s.singers) && s.singers.length ? s.singers.join(', ') : s.artist,
  album: s.album ?? s.movie ?? null,
  year: s.year != null ? String(s.year) : undefined,
  duration: s.duration || 0,
  image: s.image ?? null,
  streamUrl: s.streamUrl ?? null,
  source: 'audio',
});

const artistNames = (songs, counts, limit) => {
  const score = new Map();
  for (const s of songs) {
    const plays = counts.get(s.id) || 1;
    const names = String(s.artist || '').split(/[,&]/).map((x) => x.trim()).filter(Boolean);
    for (const n of names.slice(0, 2)) score.set(n, (score.get(n) || 0) + plays);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([n]) => n);
};

export function createMemorySignals() {
  const counted = (userId, since) => memoryEvents.filter((e) => (userId == null || e.userId === userId) && new Date(e.playedAt).getTime() >= since && isCounted(e));
  const tally = (events) => events.reduce((m, e) => m.set(e.songId, (m.get(e.songId) || 0) + 1), new Map());
  return {
    kind: 'memory',
    async weekPlays(userId, now = Date.now()) { return tally(counted(userId, now - WINDOWS.weekDays * DAY)); },
    async topArtists(userId, limit = 3, now = Date.now()) {
      const counts = tally(counted(userId, now - WINDOWS.tasteDays * DAY));
      return artistNames([...counts.keys()].map((id) => toFeedSong(db.songs.get(id))).filter(Boolean), counts, limit);
    },
    async globalTrending(limit = 30, now = Date.now()) {
      const counts = tally(counted(null, now - WINDOWS.trendingDays * DAY));
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
        .map(([id, plays]) => ({ song: toFeedSong(db.songs.get(id)), plays })).filter((x) => x.song);
    },
    async recentSongs(userId, limit = 30) {
      const seen = new Set();
      const out = [];
      for (const h of [...db._historyItems].filter((x) => x.userId === userId).sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt))) {
        const s = toFeedSong(db.songs.get(h.songId));
        if (s && !seen.has(s.id)) { seen.add(s.id); out.push(s); }
        if (out.length >= limit) break;
      }
      return out;
    },
  };
}

export function createPrismaSignals(prisma) {
  const since = (days, now) => new Date(now - days * DAY);
  const songsByIds = async (ids) => (ids.length ? prisma.song.findMany({ where: { id: { in: ids } } }) : []);
  return {
    kind: 'prisma',
    async weekPlays(userId, now = Date.now()) {
      const rows = await prisma.playEvent.groupBy({ by: ['songId'], where: { userId, playedAt: { gte: since(WINDOWS.weekDays, now) }, OR: COUNTED }, _count: { _all: true } });
      return new Map(rows.map((r) => [r.songId, r._count._all]));
    },
    async topArtists(userId, limit = 3, now = Date.now()) {
      const rows = await prisma.playEvent.groupBy({ by: ['songId'], where: { userId, playedAt: { gte: since(WINDOWS.tasteDays, now) }, OR: COUNTED }, _count: { _all: true }, orderBy: { _count: { songId: 'desc' } }, take: 60 });
      const counts = new Map(rows.map((r) => [r.songId, r._count._all]));
      return artistNames((await songsByIds([...counts.keys()])).map(toFeedSong), counts, limit);
    },
    async globalTrending(limit = 30, now = Date.now()) {
      const rows = await prisma.playEvent.groupBy({ by: ['songId'], where: { playedAt: { gte: since(WINDOWS.trendingDays, now) }, OR: COUNTED }, _count: { _all: true }, orderBy: { _count: { songId: 'desc' } }, take: limit }); // uses the playedAt index
      const byId = new Map((await songsByIds(rows.map((r) => r.songId))).map((s) => [s.id, s]));
      return rows.map((r) => ({ song: toFeedSong(byId.get(r.songId)), plays: r._count._all })).filter((x) => x.song);
    },
    async recentSongs(userId, limit = 30) {
      const rows = await prisma.listeningHistory.findMany({ where: { userId }, orderBy: { playedAt: 'desc' }, take: limit * 3, include: { song: true } });
      const seen = new Set();
      const out = [];
      for (const r of rows) {
        const s = toFeedSong(r.song);
        if (s && !seen.has(s.id)) { seen.add(s.id); out.push(s); }
        if (out.length >= limit) break;
      }
      return out;
    },
  };
}

let prismaSignals;
let memorySignals;
export const getHomeSignals = () => (usingPostgres() ? (prismaSignals ??= createPrismaSignals(getPrismaClient())) : (memorySignals ??= createMemorySignals()));
