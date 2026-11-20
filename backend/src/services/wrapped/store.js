// Reads a year of play events for Wrapped. Memory store (tests, development) and Prisma store (production).
import { db, usingPostgres, getPrismaClient } from '../../prisma/client.js';
import { memoryEvents } from '../related/signalsStore.js';

const MAX_EVENTS = 100000; // a very heavy listener plays about 15,000 songs a year; this is a safety cap

export function createMemoryWrappedStore() {
  return {
    kind: 'memory',
    async yearEvents(userId, from, to) {
      const events = memoryEvents.filter((e) => e.userId === userId && new Date(e.playedAt) >= from && new Date(e.playedAt) < to).slice(0, MAX_EVENTS);
      const songs = new Map();
      for (const e of events) { const s = db.songs.get(e.songId); if (s) songs.set(e.songId, s); }
      return { events, songs };
    },
  };
}

export function createPrismaWrappedStore(prisma) {
  return {
    kind: 'prisma',
    async yearEvents(userId, from, to) {
      const events = await prisma.playEvent.findMany({
        where: { userId, playedAt: { gte: from, lt: to } },
        select: { songId: true, playedAt: true, completed: true, listenedSec: true, durationSec: true },
        orderBy: { playedAt: 'asc' }, take: MAX_EVENTS,
      });
      const ids = [...new Set(events.map((e) => e.songId))];
      const songs = new Map();
      for (let i = 0; i < ids.length; i += 1000) {
        for (const s of await prisma.song.findMany({ where: { id: { in: ids.slice(i, i + 1000) } } })) songs.set(s.id, s);
      }
      return { events, songs };
    },
  };
}

let store = null;
export function getWrappedStore() {
  if (store) return store;
  store = usingPostgres() ? createPrismaWrappedStore(getPrismaClient()) : createMemoryWrappedStore();
  return store;
}
