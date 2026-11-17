/**
 * Thin typed wrappers over the REST API for comments, profiles and follows.
 * Every function resolves with the response body's data or rejects with an Error carrying `.message`
 * (server message when available) and `.status`.
 *
 * @typedef {{ id: string|null, username: string|null, name: string, role: string, avatarUrl: string|null }} Author
 * @typedef {{ id: string, songId: string, parentId: string|null, body: string, timestampSec: number|null,
 *   isPinned: boolean, likeCount: number, likedByMe: boolean, likedByArtist: boolean, replyCount: number,
 *   editedAt: string|null, createdAt: string, author: Author }} Comment
 */
import api from '../services/api';

const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

/** Absolute URL for an avatar path returned by the API ("/users/x/avatar?v=1"). */
export const avatarSrc = (path) => (path ? `${BASE}${path}` : null);

export function apiError(err, fallback = 'Something went wrong. Please try again.') {
  const e = new Error(err?.response?.data?.message || (err?.code === 'ECONNABORTED' ? 'The server took too long to respond.' : fallback));
  e.status = err?.response?.status;
  e.field = err?.response?.data?.field;
  e.reason = err?.response?.data?.reason;
  return e;
}

const run = async (promise, fallback) => {
  try {
    return (await promise).data;
  } catch (err) {
    throw apiError(err, fallback);
  }
};

const enc = encodeURIComponent;

export const commentsApi = {
  list: (songId, { sort = 'newest', cursor, limit = 20 } = {}) =>
    run(api.get(`/songs/${enc(songId)}/comments`, { params: { sort, limit, ...(cursor ? { cursor } : {}) } }), 'Could not load comments.'),
  poll: (songId, since) => run(api.get(`/songs/${enc(songId)}/comments/poll`, { params: { since } })),
  replies: (id, { cursor, limit = 20 } = {}) =>
    run(api.get(`/comments/${enc(id)}/replies`, { params: { limit, ...(cursor ? { cursor } : {}) } }), 'Could not load replies.'),
  create: (songId, body, { parentId, timestampSec } = {}) =>
    run(api.post(`/songs/${enc(songId)}/comments`, { body, ...(parentId ? { parentId } : {}), ...(timestampSec != null ? { timestampSec } : {}) }), 'Could not post your comment.'),
  edit: (id, body) => run(api.patch(`/comments/${enc(id)}`, { body }), 'Could not save your edit.'),
  remove: (id) => run(api.delete(`/comments/${enc(id)}`), 'Could not delete that comment.'),
  like: (id) => run(api.post(`/comments/${enc(id)}/like`)),
  unlike: (id) => run(api.delete(`/comments/${enc(id)}/like`)),
  pin: (id) => run(api.post(`/comments/${enc(id)}/pin`), 'Could not pin that comment.'),
  unpin: (id) => run(api.delete(`/comments/${enc(id)}/pin`)),
  report: (id, reason) => run(api.post(`/comments/${enc(id)}/report`, { reason }), 'Could not send your report.'),
};

export const profileApi = {
  me: () => run(api.get('/profile/me'), 'Could not load your profile.'),
  update: (patch) => run(api.patch('/profile/me', patch), 'Could not save your changes.'),
  usernameAvailable: (u) => run(api.get('/profile/username-available', { params: { u } })),
  deleteAccount: (password) => run(api.delete('/profile/me', { data: { password } }), 'Could not delete your account.'),
};

export const usersApi = {
  get: (username) => run(api.get(`/users/${enc(username)}`), 'Could not load this profile.'),
  tab: (username, tab, { limit = 20, offset = 0 } = {}) =>
    run(api.get(`/users/${enc(username)}/${tab}`, { params: { limit, offset } }), 'Could not load this list.'),
  follow: (username) => run(api.post(`/users/${enc(username)}/follow`)),
  unfollow: (username) => run(api.delete(`/users/${enc(username)}/follow`)),
};

export const playlistsApi = {
  create: (body) => run(api.post('/playlists', body), 'Could not create the playlist.'),
  update: (id, body) => run(api.put(`/playlists/${enc(id)}`, body), 'Could not update the playlist.'),
  remove: (id) => run(api.delete(`/playlists/${enc(id)}`), 'Could not delete the playlist.'),
};

export const historyApi = { clear: () => run(api.delete('/history'), 'Could not clear your history.') };
