// The first-login picks. Memory store (tests, development) and Prisma store (production).
import { usingPostgres, getPrismaClient } from '../../prisma/client.js';
import { memoryEvents } from '../related/signalsStore.js';

const present = (row) => row && ({ artists: [...row.artists], composers: [...row.composers], eras: [...row.eras], skipped: Boolean(row.skipped), updatedAt: row.updatedAt });

export function createMemoryTasteStore() {
  const rows = new Map();
  return {
    kind: 'memory',
    async get(userId) { return present(rows.get(userId)) || null; },
    async put(userId, { artists, composers, eras, skipped }) {
      rows.set(userId, { artists, composers, eras, skipped: Boolean(skipped), updatedAt: new Date() });
      return present(rows.get(userId));
    },
    async remove(userId) { return rows.delete(userId); },
    async playCount(userId) { return memoryEvents.filter((e) => e.userId === userId).length; },
    reset() { rows.clear(); },
  };
}

export function createPrismaTasteStore(prisma) {
  return {
    kind: 'prisma',
    async get(userId) { return present(await prisma.userTaste.findUnique({ where: { userId } })); },
    async put(userId, { artists, composers, eras, skipped }) {
      const data = { artists, composers, eras, skipped: Boolean(skipped) };
      return present(await prisma.userTaste.upsert({ where: { userId }, create: { userId, ...data }, update: data }));
    },
    async remove(userId) { return (await prisma.userTaste.deleteMany({ where: { userId } })).count > 0; },
    async playCount(userId) { return prisma.playEvent.count({ where: { userId } }); },
  };
}

let store = null;
export function getTasteStore() {
  if (store) return store;
  store = usingPostgres() ? createPrismaTasteStore(getPrismaClient()) : createMemoryTasteStore();
  return store;
}
export const resetTasteStoreForTests = () => { if (store?.kind === 'memory') store.reset(); };
