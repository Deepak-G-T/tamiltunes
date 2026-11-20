/**
 * Saved play queue, one row per user. Contract (two implementations: Prisma/PostgreSQL and in-memory for dev + tests):
 *   get(userId) -> row | null
 *   put(userId, state) -> row        replaces the whole row (last write wins)
 *   remove(userId)
 * A row: { items:[{id,o}], currentIndex, positionSec, shuffle, repeat, autoplay, mode, sourceLabel, deviceId, updatedAt, heard:[{k,id}], allowRepeats }
 * `heard` is the session memory of the no-repeat rules (songs played, skipped or queued; k = variantKey), shared by every device of the account.
 */
import { usingPostgres, getPrismaClient } from '../../prisma/client.js';

const memory = new Map();

const memoryStore = {
  kind: 'memory',
  async get(userId) { const r = memory.get(userId); return r ? { ...r } : null; },
  async put(userId, state) {
    const row = { ...state, updatedAt: new Date() };
    memory.set(userId, row);
    return { ...row };
  },
  async remove(userId) { memory.delete(userId); },
};

const toRow = (r) => (r ? {
  items: r.items, currentIndex: r.currentIndex, positionSec: r.positionSec, shuffle: r.shuffle, repeat: r.repeat,
  autoplay: r.autoplay, mode: r.mode, sourceLabel: r.sourceLabel, deviceId: r.deviceId, updatedAt: r.updatedAt,
  heard: Array.isArray(r.heard) ? r.heard : [], allowRepeats: Boolean(r.allowRepeats),
} : null);

const createPrismaStore = (prisma) => ({
  kind: 'prisma',
  async get(userId) { return toRow(await prisma.queueState.findUnique({ where: { userId } })); },
  async put(userId, state) {
    const data = { ...state, updatedAt: new Date() };
    return toRow(await prisma.queueState.upsert({ where: { userId }, create: { userId, ...data }, update: data }));
  },
  async remove(userId) { await prisma.queueState.deleteMany({ where: { userId } }); },
});

let prismaStore;
export const getQueueStore = () => (usingPostgres() ? (prismaStore ??= createPrismaStore(getPrismaClient())) : memoryStore);
export const resetMemoryQueues = () => memory.clear();
