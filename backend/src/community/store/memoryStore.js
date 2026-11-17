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
  const comments = new Map();
  const likes = new Set(); // `${commentId}:${userId}`
  const follows = new Map(); // `${followerId}:${followedId}` -> createdAt
  const reports = new Map(); // `${commentId}:${reporterId}` -> report
  let seq = 0;

  const users = () => db.users; // Map exposed by the in-memory db
  const withDefaults = (u) => (u ? { ...USER_DEFAULTS, ...u } : null);
  const author = (id) => withDefaults(users().get(id));
  const nextId = (p) => `${p}_${String(++seq).padStart(8, '0')}_${Math.random().toString(36).slice(2, 6)}`;
  const withUser = (c) => (c ? { ...c, user: author(c.userId) } : null);
  const cmpDesc = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

  // Newest: (createdAt, id) desc. Top: (likeCount, createdAt, id) desc. Replies: (createdAt, id) asc.
  const keyOf = (c, sort) =>
    sort === 'top' ? [c.likeCount, c.createdAt.getTime(), c.id] : [c.createdAt.getTime(), c.id];
  const cmpKeys = (a, b) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
  };

  const removeCommentTree = (id) => {
    for (const c of [...comments.values()]) if (c.parentId === id) removeCommentTree(c.id);
    comments.delete(id);
    for (const k of [...likes]) if (k.startsWith(`${id}:`)) likes.delete(k);
    for (const k of [...reports.keys()]) if (k.startsWith(`${id}:`)) reports.delete(k);
  };

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
      for (const c of [...comments.values()]) if (c.userId === id) removeCommentTree(c.id);
      for (const k of [...likes]) if (k.endsWith(`:${id}`)) {
        likes.delete(k);
        const c = comments.get(k.split(':')[0]);
        if (c) c.likeCount = Math.max(0, c.likeCount - 1);
      }
      for (const k of [...follows.keys()]) if (k.startsWith(`${id}:`) || k.endsWith(`:${id}`)) follows.delete(k);
      for (const k of [...reports.keys()]) if (k.endsWith(`:${id}`)) reports.delete(k);
      for (const [pid, p] of db.playlists.entries()) if (p.userId === id) await db.playlist.delete({ where: { id: pid } });
      for (const [k, f] of db.favorites.entries()) if (f.userId === id) db.favorites.delete(k);
      await db.listeningHistory.deleteMany({ where: { userId: id } });
    },
    async userStats(id) {
      return {
        favorites: await db.favorite.count({ where: { userId: id } }),
        playlists: await db.playlist.count({ where: { userId: id } }),
        comments: [...comments.values()].filter((c) => c.userId === id).length,
        followers: [...follows.keys()].filter((k) => k.endsWith(`:${id}`)).length,
        following: [...follows.keys()].filter((k) => k.startsWith(`${id}:`)).length,
      };
    },

    // ---- comments ----
    async createComment({ songId, userId, parentId = null, body, timestampSec = null }) {
      const c = {
        id: nextId('cmt'), songId, userId, parentId, body, timestampSec, isPinned: false,
        likeCount: 0, likedByArtist: false, editedAt: null, createdAt: new Date(),
      };
      comments.set(c.id, c);
      return withUser(c);
    },
    async getComment(id) { return withUser(comments.get(id)); },
    async updateComment(id, data) {
      const c = comments.get(id);
      if (!c) return null;
      Object.assign(c, data);
      return withUser(c);
    },
    async deleteComment(id) { removeCommentTree(id); },
    async listComments({ songId, parentId = null, sort = 'newest', limit, cursor, excludePinned = true }) {
      const order = parentId ? 'asc' : sort;
      let list = [...comments.values()].filter(
        (c) => c.songId === songId && (c.parentId ?? null) === parentId && !(excludePinned && !parentId && c.isPinned),
      );
      const key = (c) => keyOf(c, parentId ? 'newest' : sort);
      list.sort((a, b) => (order === 'asc' ? cmpKeys(key(a), key(b)) : cmpKeys(key(b), key(a))));
      if (cursor) {
        list = list.filter((c) => (order === 'asc' ? cmpKeys(key(c), cursor) > 0 : cmpKeys(key(c), cursor) < 0));
      }
      const page = list.slice(0, limit + 1);
      const hasMore = page.length > limit;
      const items = page.slice(0, limit);
      const last = items[items.length - 1];
      return { items: items.map(withUser), nextKey: hasMore && last ? key(last) : null };
    },
    async listSince({ songId, since, limit }) {
      return [...comments.values()]
        .filter((c) => c.songId === songId && c.createdAt > since)
        .sort((a, b) => cmpKeys(keyOf(a, 'newest'), keyOf(b, 'newest')))
        .slice(0, limit)
        .map(withUser);
    },
    async getPinned(songId) {
      return withUser([...comments.values()].find((c) => c.songId === songId && !c.parentId && c.isPinned));
    },
    async setPinned(songId, id) {
      for (const c of comments.values()) if (c.songId === songId && c.isPinned) c.isPinned = false;
      if (id) comments.get(id).isPinned = true;
    },
    async countReplies(ids) {
      const m = new Map(ids.map((i) => [i, 0]));
      for (const c of comments.values()) if (c.parentId && m.has(c.parentId)) m.set(c.parentId, m.get(c.parentId) + 1);
      return m;
    },
    async likedSet(userId, ids) {
      return new Set(ids.filter((id) => likes.has(`${id}:${userId}`)));
    },
    async addLike(commentId, userId) {
      const k = `${commentId}:${userId}`;
      if (likes.has(k)) return false;
      likes.add(k);
      comments.get(commentId).likeCount += 1;
      return true;
    },
    async removeLike(commentId, userId) {
      const k = `${commentId}:${userId}`;
      if (!likes.has(k)) return false;
      likes.delete(k);
      const c = comments.get(commentId);
      c.likeCount = Math.max(0, c.likeCount - 1);
      return true;
    },
    async hasArtistLike(commentId) {
      for (const k of likes) {
        const [cid, uid] = k.split(':');
        if (cid === commentId && author(uid)?.role === 'artist') return true;
      }
      return false;
    },
    async addReport(commentId, reporterId, reason) {
      const k = `${commentId}:${reporterId}`;
      if (reports.has(k)) return false;
      reports.set(k, { commentId, reporterId, reason, createdAt: new Date() });
      return true;
    },
    async listUserComments(userId, { limit, offset }) {
      const all = [...comments.values()].filter((c) => c.userId === userId).sort((a, b) => cmpKeys(keyOf(b, 'newest'), keyOf(a, 'newest')));
      return { items: all.slice(offset, offset + limit).map(withUser), total: all.length };
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
