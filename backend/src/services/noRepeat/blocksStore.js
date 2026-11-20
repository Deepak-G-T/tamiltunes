/**
 * "Don't recommend this": songs a listener blocked, one row per canonical song (variantKey: the song and its versions). Two implementations
 * (Prisma/PostgreSQL and in-memory for dev + tests):  list(userId) -> rows, add(userId, song) -> row, remove(userId, songId) -> boolean, count(userId)
 * A row keeps a small snapshot of the song (title, artist, album, duration, image) so it can be listed and matched without another lookup.
 */
import { usingPostgres, getPrismaClient } from '../../prisma/client.js';
import { variantKey } from '../related/identity.js';

const snapshot = (s) => ({ title: String(s.title || '').slice(0, 300), artist: String(s.artist || s.singers || '').slice(0, 300) || null, album: s.album ? String(s.album).slice(0, 300) : null, durationSec: Number(s.duration) > 0 ? Math.round(Number(s.duration)) : null, image: s.image ? String(s.image).slice(0, 1000) : null });
const present = (r) => ({ id: r.songId, key: r.key, title: r.title, artist: r.artist, album: r.album, duration: r.durationSec ?? 0, image: r.image, createdAt: r.createdAt });

const memory = new Map(); // userId -> Map(key -> row)
const memoryStore = {
  kind: 'memory',
  async list(userId) { return [...(memory.get(userId)?.values() || [])].sort((a, b) => b.createdAt - a.createdAt).map(present); },
  async count(userId) { return memory.get(userId)?.size || 0; },
  async add(userId, song) {
    const key = variantKey(song);
    if (!memory.has(userId)) memory.set(userId, new Map());
    const row = memory.get(userId).get(key) || { userId, songId: song.id, key, ...snapshot(song), createdAt: new Date() };
    memory.get(userId).set(key, row);
    return present(row);
  },
  async remove(userId, songId) {
    const rows = memory.get(userId);
    if (!rows) return false;
    for (const [k, r] of rows) if (r.songId === songId) { rows.delete(k); return true; }
    return false;
  },
};

const createPrismaStore = (prisma) => ({
  kind: 'prisma',
  async list(userId) { return (await prisma.userSongBlock.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 1000 })).map(present); },
  count: (userId) => prisma.userSongBlock.count({ where: { userId } }),
  async add(userId, song) {
    const key = variantKey(song);
    const data = { songId: song.id, key, ...snapshot(song) };
    return present(await prisma.userSongBlock.upsert({ where: { userId_key: { userId, key } }, create: { userId, ...data }, update: {} }));
  },
  async remove(userId, songId) { return (await prisma.userSongBlock.deleteMany({ where: { userId, songId } })).count > 0; },
});

let prismaStore;
export const getBlocksStore = () => (usingPostgres() ? (prismaStore ??= createPrismaStore(getPrismaClient())) : memoryStore);
export const resetMemoryBlocks = () => memory.clear();
