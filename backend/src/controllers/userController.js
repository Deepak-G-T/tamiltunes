import { getStore } from '../community/store/index.js';
import { normalizeUsername } from '../community/username.js';
import { presentPublicProfile, presentAuthor, presentComment, parsePaging } from '../community/presenters.js';
import { db } from '../prisma/client.js';

const fail = (res, status, message) => res.status(status).json({ success: false, message });

/** Resolve :username → user, or send 404. Returns null when a response was sent. */
async function resolveUser(req, res) {
  const user = await getStore().getUserByUsername(normalizeUsername(req.params.username));
  if (!user) { fail(res, 404, 'User not found'); return null; }
  return user;
}

const isSelf = (req, user) => req.user?.id === user.id;
/** Tab content is visible to the owner, or to anyone when the profile is public. */
const canViewTabs = (req, user) => isSelf(req, user) || user.isPublicProfile !== false;

export const getPublicProfile = async (req, res, next) => {
  try {
    const store = getStore();
    const user = await resolveUser(req, res);
    if (!user) return;
    const stats = await store.userStats(user.id);
    if (!isSelf(req, user) && user.isPublicProfile === false) {
      // Playlist/like/comment counts are hidden on private profiles
      stats.playlists = stats.favorites = stats.comments = 0;
    } else {
      stats.playlists = await db.playlist.count({ where: { userId: user.id, ...(isSelf(req, user) ? {} : { isPublic: true }) } });
    }
    const isFollowing = req.user ? await store.isFollowing(req.user.id, user.id) : false;
    res.json({ success: true, profile: presentPublicProfile(user, stats, { isFollowing }), isSelf: isSelf(req, user) });
  } catch (err) { next(err); }
};

export const getAvatar = async (req, res, next) => {
  try {
    const user = await getStore().getUserByUsername(normalizeUsername(req.params.username));
    if (!user?.avatar) return res.status(404).end();
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(user.avatar);
    if (!m) return res.status(404).end();
    res.set({
      'Content-Type': m[1],
      'Cache-Control': 'public, max-age=86400', // URL carries ?v=<avatarUpdatedAt>, so changes bust the cache
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    res.send(Buffer.from(m[2], 'base64'));
  } catch (err) { next(err); }
};

const tab = (loader) => async (req, res, next) => {
  try {
    const user = await resolveUser(req, res);
    if (!user) return;
    if (!canViewTabs(req, user)) return fail(res, 403, 'This profile is private');
    const paging = parsePaging(req.query);
    const { items, total } = await loader({ req, user, ...paging, store: getStore() });
    res.json({ success: true, items, total, limit: paging.limit, offset: paging.offset, hasMore: paging.offset + items.length < total });
  } catch (err) { next(err); }
};

const songOf = (s) => (s ? { id: s.id, title: s.title, artist: s.artist, album: s.album ?? null, image: s.image ?? null, duration: s.duration ?? 0, streamUrl: s.streamUrl ?? null } : null);

export const getLiked = tab(async ({ user, limit, offset }) => {
  const [rows, total] = await Promise.all([
    db.favorite.findMany({ where: { userId: user.id }, include: { song: true }, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
    db.favorite.count({ where: { userId: user.id } }),
  ]);
  return { items: rows.map((r) => songOf(r.song)).filter(Boolean), total };
});

export const getPlaylistsTab = tab(async ({ req, user, limit, offset }) => {
  const where = { userId: user.id, ...(isSelf(req, user) ? {} : { isPublic: true }) };
  const [rows, total] = await Promise.all([
    db.playlist.findMany({ where, include: { songs: { include: { song: true } } }, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
    db.playlist.count({ where }),
  ]);
  return {
    items: rows.map((p) => ({
      id: p.id, name: p.name, description: p.description ?? null, isPublic: Boolean(p.isPublic),
      songCount: p.songs?.length ?? 0, cover: songOf(p.songs?.[0]?.song)?.image ?? null, createdAt: p.createdAt,
    })),
    total,
  };
});

export const getHistoryTab = async (req, res, next) => {
  try {
    const user = await resolveUser(req, res);
    if (!user) return;
    // Listening history is private unless its owner opted in
    if (!isSelf(req, user) && !(user.isPublicProfile !== false && user.showHistory)) {
      return fail(res, 403, 'Listening history is private');
    }
    const { limit, offset } = parsePaging(req.query);
    const [rows, total] = await Promise.all([
      db.listeningHistory.findMany({ where: { userId: user.id }, include: { song: true }, orderBy: { playedAt: 'desc' }, take: limit, skip: offset }),
      db.listeningHistory.count({ where: { userId: user.id } }),
    ]);
    const items = rows.map((r) => ({ ...songOf(r.song), playedAt: r.playedAt })).filter((s) => s.id);
    res.json({ success: true, items, total, limit, offset, hasMore: offset + items.length < total });
  } catch (err) { next(err); }
};

export const getCommentsTab = tab(async ({ user, limit, offset, store, req }) => {
  const { items, total } = await store.listUserComments(user.id, { limit, offset });
  const liked = await store.likedSet(req.user?.id, items.map((c) => c.id));
  return { items: items.map((c) => presentComment(c, { liked })), total };
});

const people = (direction) => tab(async ({ user, limit, offset, store, req }) => {
  const { items, total } = await store.listFollows(user.id, direction, { limit, offset });
  const mine = req.user ? await Promise.all(items.map((u) => store.isFollowing(req.user.id, u.id))) : [];
  return { items: items.map((u, i) => ({ ...presentAuthor(u), isFollowing: Boolean(mine[i]) })), total };
});
export const getFollowers = people('followers');
export const getFollowing = people('following');

export const followUser = async (req, res, next) => {
  try {
    const user = await resolveUser(req, res);
    if (!user) return;
    if (user.id === req.user.id) return fail(res, 400, 'You cannot follow yourself');
    const store = getStore();
    await store.follow(req.user.id, user.id);
    res.json({ success: true, isFollowing: true, followers: (await store.userStats(user.id)).followers });
  } catch (err) { next(err); }
};

export const unfollowUser = async (req, res, next) => {
  try {
    const user = await resolveUser(req, res);
    if (!user) return;
    const store = getStore();
    await store.unfollow(req.user.id, user.id);
    res.json({ success: true, isFollowing: false, followers: (await store.userStats(user.id)).followers });
  } catch (err) { next(err); }
};
