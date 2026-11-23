/**
 * PostgreSQL (Prisma) implementation of the community store.
 * All queries are parameterised by Prisma. NOTE: UNTESTED against a real database
 * until TEST_DATABASE_URL is provided (see CLAUDE.md known open items).
 */
const AUTHOR_SELECT = {
  id: true, username: true, name: true, role: true, avatarUpdatedAt: true,
  isPublicProfile: true, showHistory: true, bio: true, location: true, createdAt: true,
};

export function createPrismaStore(prisma) {
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
      const [favorites, playlists, followers, following] = await Promise.all([
        prisma.favorite.count({ where: { userId: id } }),
        prisma.playlist.count({ where: { userId: id } }),
        prisma.follow.count({ followedId: id }),
        prisma.follow.count({ followerId: id }),
      ]);
      return { favorites, playlists, followers, following };
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
