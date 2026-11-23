/** Shapes returned to clients. Whitelists only: never spread a DB row (it holds the password hash). */

export const avatarUrl = (u) =>
  u?.avatarUpdatedAt && u.username ? `/users/${encodeURIComponent(u.username)}/avatar?v=${new Date(u.avatarUpdatedAt).getTime()}` : null;

export const presentAuthor = (u) =>
  u ? { id: u.id, username: u.username, name: u.name, role: u.role || 'user', avatarUrl: avatarUrl(u) }
    : { id: null, username: null, name: 'Deleted user', role: 'user', avatarUrl: null };

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
