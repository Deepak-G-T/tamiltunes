/**
 * PostgreSQL (Prisma) implementation of the community store.
 * All queries are parameterised by Prisma. NOTE: UNTESTED against a real database
 * until TEST_DATABASE_URL is provided (see CLAUDE.md known open items).
 */
const AUTHOR_SELECT = {
  id: true, username: true, name: true, role: true, avatarUpdatedAt: true,
  isPublicProfile: true, showHistory: true, bio: true, location: true, createdAt: true,
};
const COMMENT_INCLUDE = { user: { select: AUTHOR_SELECT } };

export function createPrismaStore(prisma) {
  const keyWhere = (sort, cursor) => {
    if (!cursor) return {};
    if (sort === 'top') {
      const [likeCount, ms, id] = cursor;
      const createdAt = new Date(ms);
      return { OR: [{ likeCount: { lt: likeCount } }, { likeCount, createdAt: { lt: createdAt } }, { likeCount, createdAt, id: { lt: id } }] };
    }
    const [ms, id] = cursor;
    const createdAt = new Date(ms);
    return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
  };
  const keyOf = (c, sort) => (sort === 'top' ? [c.likeCount, c.createdAt.getTime(), c.id] : [c.createdAt.getTime(), c.id]);

  return {
    kind: 'prisma',

    // ---- users ----
    getUser: (id) => prisma.user.findUnique({ where: { id } }),
    getUserByUsername: (username) => prisma.user.findUnique({ where: { username } }),
    async isUsernameTaken(username, exceptId) {
      const u = await prisma.user.findUnique({ where: { username }, select: { id: true } });
      return Boolean(u && u.id !== exceptId);
    },
    updateUser: (id, data) => prisma.user.update({ where: { id }, data }),
    async deleteUser(id) { await prisma.user.delete({ where: { id } }); }, // FKs cascade
    async userStats(id) {
      const [favorites, playlists, comments, followers, following] = await Promise.all([
        prisma.favorite.count({ where: { userId: id } }),
        prisma.playlist.count({ where: { userId: id } }),
        prisma.comment.count({ where: { userId: id } }),
        prisma.follow.count({ where: { followedId: id } }),
        prisma.follow.count({ where: { followerId: id } }),
      ]);
      return { favorites, playlists, comments, followers, following };
    },

    // ---- comments ----
    createComment: ({ songId, userId, parentId = null, body, timestampSec = null }) =>
      prisma.comment.create({ data: { songId, userId, parentId, body, timestampSec }, include: COMMENT_INCLUDE }),
    getComment: (id) => prisma.comment.findUnique({ where: { id }, include: COMMENT_INCLUDE }),
    updateComment: (id, data) => prisma.comment.update({ where: { id }, data, include: COMMENT_INCLUDE }),
    async deleteComment(id) { await prisma.comment.delete({ where: { id } }); }, // replies cascade
    async listComments({ songId, parentId = null, sort = 'newest', limit, cursor, excludePinned = true }) {
      const replies = Boolean(parentId);
      const s = replies ? 'newest' : sort;
      const where = { songId, parentId: replies ? parentId : null, ...(excludePinned && !replies ? { isPinned: false } : {}) };
      let keyed = {};
      if (cursor) {
        if (replies) {
          const [ms, id] = cursor; const createdAt = new Date(ms);
          keyed = { OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: id } }] };
        } else keyed = keyWhere(s, cursor);
      }
      const orderBy = replies
        ? [{ createdAt: 'asc' }, { id: 'asc' }]
        : s === 'top' ? [{ likeCount: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] : [{ createdAt: 'desc' }, { id: 'desc' }];
      const rows = await prisma.comment.findMany({ where: { AND: [where, keyed] }, orderBy, take: limit + 1, include: COMMENT_INCLUDE });
      const items = rows.slice(0, limit);
      const last = items[items.length - 1];
      return { items, nextKey: rows.length > limit && last ? keyOf(last, s) : null };
    },
    listSince: ({ songId, since, limit }) =>
      prisma.comment.findMany({ where: { songId, createdAt: { gt: since } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit, include: COMMENT_INCLUDE }),
    getPinned: (songId) => prisma.comment.findFirst({ where: { songId, parentId: null, isPinned: true }, include: COMMENT_INCLUDE }),
    async setPinned(songId, id) {
      await prisma.$transaction([
        prisma.comment.updateMany({ where: { songId, isPinned: true }, data: { isPinned: false } }),
        ...(id ? [prisma.comment.update({ where: { id }, data: { isPinned: true } })] : []),
      ]);
    },
    async countReplies(ids) {
      const m = new Map(ids.map((i) => [i, 0]));
      if (!ids.length) return m;
      const rows = await prisma.comment.groupBy({ by: ['parentId'], where: { parentId: { in: ids } }, _count: { _all: true } });
      for (const r of rows) m.set(r.parentId, r._count._all);
      return m;
    },
    async likedSet(userId, ids) {
      if (!userId || !ids.length) return new Set();
      const rows = await prisma.commentLike.findMany({ where: { userId, commentId: { in: ids } }, select: { commentId: true } });
      return new Set(rows.map((r) => r.commentId));
    },
    async addLike(commentId, userId) {
      const r = await prisma.commentLike.createMany({ data: [{ commentId, userId }], skipDuplicates: true });
      if (r.count) await prisma.comment.update({ where: { id: commentId }, data: { likeCount: { increment: 1 } } });
      return r.count > 0;
    },
    async removeLike(commentId, userId) {
      const r = await prisma.commentLike.deleteMany({ where: { commentId, userId } });
      if (r.count) {
        await prisma.$executeRaw`UPDATE "comments" SET "likeCount" = GREATEST("likeCount" - 1, 0) WHERE "id" = ${commentId}`;
      }
      return r.count > 0;
    },
    async hasArtistLike(commentId) {
      return (await prisma.commentLike.count({ where: { commentId, user: { role: 'artist' } } })) > 0;
    },
    async addReport(commentId, reporterId, reason) {
      const r = await prisma.report.createMany({ data: [{ commentId, reporterId, reason }], skipDuplicates: true });
      return r.count > 0;
    },
    async listUserComments(userId, { limit, offset }) {
      const [items, total] = await Promise.all([
        prisma.comment.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit, skip: offset, include: COMMENT_INCLUDE }),
        prisma.comment.count({ where: { userId } }),
      ]);
      return { items, total };
    },

    // ---- follows ----
    async follow(followerId, followedId) {
      const r = await prisma.follow.createMany({ data: [{ followerId, followedId }], skipDuplicates: true });
      return r.count > 0;
    },
    async unfollow(followerId, followedId) {
      return (await prisma.follow.deleteMany({ where: { followerId, followedId } })).count > 0;
    },
    async isFollowing(followerId, followedId) {
      return Boolean(await prisma.follow.findUnique({ where: { followerId_followedId: { followerId, followedId } } }));
    },
    async listFollows(userId, direction, { limit, offset }) {
      const where = direction === 'followers' ? { followedId: userId } : { followerId: userId };
      const rel = direction === 'followers' ? 'follower' : 'followed';
      const [rows, total] = await Promise.all([
        prisma.follow.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset, include: { [rel]: { select: AUTHOR_SELECT } } }),
        prisma.follow.count({ where }),
      ]);
      return { items: rows.map((r) => r[rel]), total };
    },
  };
}
