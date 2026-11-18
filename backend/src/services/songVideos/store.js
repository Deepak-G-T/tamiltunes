/**
 * Song video storage: an admin-chosen YouTube id per song, the "video available" flag and the embed-failure reports.
 * One contract, two implementations: Prisma/PostgreSQL (production) and in-memory (dev + tests).
 * A song row is created from the provider's data when a song that was never saved gets its first video change or report.
 */
import { db, usingPostgres, getPrismaClient } from '../../prisma/client.js';

const songRow = (meta) => ({
  title: String(meta?.title || 'Unknown').slice(0, 300),
  artist: String(meta?.artist || meta?.singers || 'Unknown').slice(0, 300),
  album: meta?.album ? String(meta.album).slice(0, 300) : null,
  duration: Math.max(0, Math.round(Number(meta?.duration) || 0)),
  image: meta?.image || null,
});
const view = (s, reports = []) => s && ({
  songId: s.id, title: s.title, artist: s.artist, album: s.album ?? null, image: s.image ?? null,
  videoId: s.videoId ?? null, videoAvailable: s.videoAvailable !== false, videoFlaggedAt: s.videoFlaggedAt ?? null,
  reports: reports.length, reportCodes: [...new Set(reports.map((r) => r.code).filter((c) => c != null))],
});

export function createMemoryStore() {
  const reports = []; // { songId, userId, videoId, code, createdAt }
  const songs = () => db.songs; // the in-memory db's own Map, shared with the rest of the app
  const ensure = (songId, meta) => {
    if (!songs().has(songId)) songs().set(songId, { id: songId, ...songRow(meta), createdAt: new Date() });
    return songs().get(songId);
  };
  return {
    kind: 'memory',
    async listOverrides() {
      return [...songs().values()].filter((s) => s.videoId || s.videoAvailable === false).map((s) => ({ songId: s.id, videoId: s.videoId ?? null, videoAvailable: s.videoAvailable !== false }));
    },
    async setVideo(songId, videoId, meta) {
      const s = ensure(songId, meta);
      Object.assign(s, { videoId, videoAvailable: true, videoFlaggedAt: null });
      for (let i = reports.length - 1; i >= 0; i--) if (reports[i].songId === songId) reports.splice(i, 1);
      return view(s);
    },
    async clearVideo(songId) {
      const s = songs().get(songId);
      if (!s) return null;
      Object.assign(s, { videoId: null });
      return view(s);
    },
    async restore(songId) {
      const s = songs().get(songId);
      if (!s) return null;
      Object.assign(s, { videoAvailable: true, videoFlaggedAt: null });
      for (let i = reports.length - 1; i >= 0; i--) if (reports[i].songId === songId) reports.splice(i, 1);
      return view(s);
    },
    /** One report per person, song and video. Returns how many different people reported this song's video. */
    async addReport({ songId, userId, videoId, code }, meta) {
      ensure(songId, meta);
      if (!reports.some((r) => r.songId === songId && r.userId === userId && r.videoId === videoId)) reports.push({ songId, userId, videoId, code: code ?? null, createdAt: new Date() });
      return new Set(reports.filter((r) => r.songId === songId && r.videoId === videoId).map((r) => r.userId)).size;
    },
    async flag(songId) {
      const s = songs().get(songId);
      if (s) Object.assign(s, { videoAvailable: false, videoFlaggedAt: new Date() });
      return view(s);
    },
    async listFlagged({ limit = 50, offset = 0 } = {}) {
      return [...songs().values()].filter((s) => s.videoAvailable === false)
        .sort((a, b) => new Date(b.videoFlaggedAt || 0) - new Date(a.videoFlaggedAt || 0))
        .slice(offset, offset + limit).map((s) => view(s, reports.filter((r) => r.songId === s.id)));
    },
    async listSongs({ limit = 50, offset = 0 } = {}) {
      return [...songs().values()].sort((a, b) => String(a.title).localeCompare(String(b.title))).slice(offset, offset + limit).map((s) => view(s));
    },
    async getSong(songId) { return view(songs().get(songId) || null); },
  };
}

export function createPrismaStore(prisma) {
  const ensure = (songId, meta) => prisma.song.upsert({ where: { id: songId }, create: { id: songId, ...songRow(meta) }, update: {} });
  const sel = { id: true, title: true, artist: true, album: true, image: true, videoId: true, videoAvailable: true, videoFlaggedAt: true };
  return {
    kind: 'prisma',
    async listOverrides() {
      const rows = await prisma.song.findMany({ where: { OR: [{ videoId: { not: null } }, { videoAvailable: false }] }, select: { id: true, videoId: true, videoAvailable: true } });
      return rows.map((r) => ({ songId: r.id, videoId: r.videoId, videoAvailable: r.videoAvailable }));
    },
    async setVideo(songId, videoId, meta) {
      await ensure(songId, meta);
      const [s] = await prisma.$transaction([
        prisma.song.update({ where: { id: songId }, data: { videoId, videoAvailable: true, videoFlaggedAt: null }, select: sel }),
        prisma.videoReport.deleteMany({ where: { songId } }),
      ]);
      return view(s);
    },
    async clearVideo(songId) {
      const s = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
      if (!s) return null;
      return view(await prisma.song.update({ where: { id: songId }, data: { videoId: null }, select: sel }));
    },
    async restore(songId) {
      const s = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
      if (!s) return null;
      const [row] = await prisma.$transaction([
        prisma.song.update({ where: { id: songId }, data: { videoAvailable: true, videoFlaggedAt: null }, select: sel }),
        prisma.videoReport.deleteMany({ where: { songId } }),
      ]);
      return view(row);
    },
    async addReport({ songId, userId, videoId, code }, meta) {
      await ensure(songId, meta);
      await prisma.videoReport.upsert({ where: { songId_userId_videoId: { songId, userId, videoId } }, create: { songId, userId, videoId, code: code ?? null }, update: {} });
      const people = await prisma.videoReport.groupBy({ by: ['userId'], where: { songId, videoId } });
      return people.length;
    },
    async flag(songId) {
      return view(await prisma.song.update({ where: { id: songId }, data: { videoAvailable: false, videoFlaggedAt: new Date() }, select: sel }));
    },
    async listFlagged({ limit = 50, offset = 0 } = {}) {
      const rows = await prisma.song.findMany({ where: { videoAvailable: false }, select: { ...sel, videoReports: { select: { code: true } } }, orderBy: { videoFlaggedAt: 'desc' }, take: limit, skip: offset });
      return rows.map((r) => view(r, r.videoReports));
    },
    async listSongs({ limit = 50, offset = 0 } = {}) {
      return (await prisma.song.findMany({ select: sel, orderBy: { title: 'asc' }, take: limit, skip: offset })).map((s) => view(s));
    },
    async getSong(songId) { return view(await prisma.song.findUnique({ where: { id: songId }, select: sel })); },
  };
}

let prismaStore;
let memoryStore;
export const getSongVideoStore = () => (usingPostgres() ? (prismaStore ??= createPrismaStore(getPrismaClient())) : (memoryStore ??= createMemoryStore()));
