/**
 * In-memory implementation of the community store (dev + tests, never production).
 * Mirrors prismaStore.js method for method; see store/index.js for the contract.
 */
import { db } from '../../prisma/client.js';

const USER_DEFAULTS = {
  username: null, bio: null, location: null, avatar: null, avatarUpdatedAt: null, genres: [], favoriteArtists: [],
  language: null, isPublicProfile: true, showHistory: false, role: 'user',
};

export function createMemoryStore() {
  const follows = new Map(); // `${followerId}:${followedId}` -> createdAt
  const users = () => db.users; // Map exposed by the in-memory db
  const withDefaults = (u) => (u ? { ...USER_DEFAULTS, ...u } : null);
  const author = (id) => withDefaults(users().get(id));
  const cmpDesc = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

  return {
    kind: 'memory',

    // ---- users ----
    async getUser(id) { return author(id); },
    async getUserByUsername(username) {
      for (const u of users().values()) if (u.username === username) return withDefaults(u);
      return null;
    },
    async isUsernameTaken(username, exceptId) {
      for (const u of users().values()) if (u.username === username && u.id !== exceptId) return true;
      return false;
    },
    async updateUser(id, data) {
      const u = users().get(id);
      if (!u) return null;
      const next = { ...u, ...data, updatedAt: new Date() };
      users().set(id, next);
      return withDefaults(next);
    },
    async deleteUser(id) {
      users().delete(id);
      for (const k of [...follows.keys()]) if (k.startsWith(`${id}:`) || k.endsWith(`:${id}`)) follows.delete(k);
      for (const [pid, p] of db.playlists.entries()) if (p.userId === id) await db.playlist.delete({ where: { id: pid } });
      for (const [k, f] of db.favorites.entries()) if (f.userId === id) db.favorites.delete(k);
      await db.listeningHistory.deleteMany({ where: { userId: id } });
    },
    async userStats(id) {
      return {
        favorites: await db.favorite.count({ where: { userId: id } }),
        playlists: await db.playlist.count({ where: { userId: id } }),
        followers: [...follows.keys()].filter((k) => k.endsWith(`:${id}`)).length,
        following: [...follows.keys()].filter((k) => k.startsWith(`${id}:`)).length,
      };
    },

    // ---- follows ----
    async follow(followerId, followedId) {
      const k = `${followerId}:${followedId}`;
      if (follows.has(k)) return false;
      follows.set(k, new Date());
      return true;
    },
    async unfollow(followerId, followedId) { return follows.delete(`${followerId}:${followedId}`); },
    async isFollowing(followerId, followedId) { return follows.has(`${followerId}:${followedId}`); },
    async listFollows(userId, direction, { limit, offset }) {
      const rows = [...follows.entries()]
        .filter(([k]) => (direction === 'followers' ? k.endsWith(`:${userId}`) : k.startsWith(`${userId}:`)))
        .sort((a, b) => cmpDesc(a[1].getTime(), b[1].getTime()));
      const ids = rows.map(([k]) => (direction === 'followers' ? k.split(':')[0] : k.split(':')[1]));
      return { items: ids.slice(offset, offset + limit).map(author).filter(Boolean), total: ids.length };
    },
  };
}
