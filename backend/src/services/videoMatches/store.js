/**
 * Storage for the batch video matcher's results (table video_matches): song key -> official video id, or "no video found".
 * One contract, two implementations: Prisma/PostgreSQL (production) and in-memory (dev + tests).
 */
import { usingPostgres, getPrismaClient } from '../../prisma/client.js';

const clean = (r) => ({
  songKey: String(r.songKey).slice(0, 400),
  videoId: r.videoId || null,
  title: String(r.title || '').slice(0, 300),
  artist: String(r.artist || '').slice(0, 300),
  source: ['index', 'search', 'none'].includes(r.source) ? r.source : 'none',
});

export function createMemoryStore() {
  const rows = new Map();
  return {
    kind: 'memory',
    async list() { return [...rows.values()]; },
    async upsertMany(items, now = new Date()) {
      for (const it of items) { const c = clean(it); rows.set(c.songKey, { ...c, checkedAt: now }); }
      return items.length;
    },
  };
}

export function createPrismaStore(prisma) {
  return {
    kind: 'prisma',
    async list() {
      return prisma.videoMatch.findMany({ select: { songKey: true, videoId: true, source: true, checkedAt: true }, take: 100000 });
    },
    async upsertMany(items, now = new Date()) {
      let n = 0;
      for (const it of items) {
        const c = clean(it);
        await prisma.videoMatch.upsert({ where: { songKey: c.songKey }, create: { ...c, checkedAt: now }, update: { ...c, checkedAt: now } });
        n++;
      }
      return n;
    },
  };
}

let prismaStore;
let memoryStore;
export const getVideoMatchStore = () => (usingPostgres() ? (prismaStore ??= createPrismaStore(getPrismaClient())) : (memoryStore ??= createMemoryStore()));
