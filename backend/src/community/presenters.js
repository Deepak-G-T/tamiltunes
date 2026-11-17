/** Shapes returned to clients. Whitelists only: never spread a DB row (it holds the password hash). */

export const encodeCursor = (key) => (key ? Buffer.from(JSON.stringify(key)).toString('base64url') : null);

export const decodeCursor = (raw) => {
  if (!raw) return null;
  try {
    const key = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const ok = Array.isArray(key) && key.length >= 2 && key.length <= 3 &&
      key.every((v) => typeof v === 'number' || (typeof v === 'string' && v.length < 100));
    return ok ? key : undefined; // undefined = malformed
  } catch {
    return undefined;
  }
};

export const avatarUrl = (u) =>
  u?.avatarUpdatedAt && u.username ? `/users/${encodeURIComponent(u.username)}/avatar?v=${new Date(u.avatarUpdatedAt).getTime()}` : null;

export const presentAuthor = (u) =>
  u ? { id: u.id, username: u.username, name: u.name, role: u.role || 'user', avatarUrl: avatarUrl(u) }
    : { id: null, username: null, name: 'Deleted user', role: 'user', avatarUrl: null };

export const presentComment = (c, { liked = new Set(), replyCounts = new Map() } = {}) => ({
  id: c.id,
  songId: c.songId,
  parentId: c.parentId ?? null,
  body: c.body,
  timestampSec: c.timestampSec ?? null,
  isPinned: Boolean(c.isPinned),
  likeCount: c.likeCount,
  likedByMe: liked.has(c.id),
  likedByArtist: Boolean(c.likedByArtist),
  replyCount: replyCounts.get(c.id) ?? 0,
  editedAt: c.editedAt ?? null,
  createdAt: c.createdAt,
  author: presentAuthor(c.user),
});

const baseProfile = (u) => ({
  id: u.id,
  username: u.username,
  name: u.name,
  role: u.role || 'user',
  avatarUrl: avatarUrl(u),
  joinedAt: u.createdAt,
});

/** The signed-in user's own profile: includes email and settings. */
export const presentOwnProfile = (u, stats) => ({
  ...baseProfile(u),
  email: u.email,
  bio: u.bio ?? null,
  location: u.location ?? null,
  genres: u.genres ?? [],
  favoriteArtists: u.favoriteArtists ?? [],
  language: u.language ?? null,
  isPublicProfile: u.isPublicProfile !== false,
  showHistory: Boolean(u.showHistory),
  stats,
});

/** What anyone else may see. Never includes email. Private profiles expose identity only. */
export const presentPublicProfile = (u, stats, { isFollowing = false } = {}) => {
  const isPrivate = u.isPublicProfile === false;
  return {
    ...baseProfile(u),
    isPrivate,
    isFollowing,
    ...(isPrivate
      ? { stats: { followers: stats.followers, following: stats.following } }
      : {
          bio: u.bio ?? null,
          location: u.location ?? null,
          genres: u.genres ?? [],
          favoriteArtists: u.favoriteArtists ?? [],
          language: u.language ?? null,
          showHistory: Boolean(u.showHistory),
          stats,
        }),
  };
};

export const parsePaging = (query, { max = 50, def = 20 } = {}) => ({
  limit: Math.min(Math.max(parseInt(query.limit, 10) || def, 1), max),
  offset: Math.max(parseInt(query.offset, 10) || 0, 0),
});
