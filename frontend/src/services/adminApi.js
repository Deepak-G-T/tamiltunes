import api from './api';

export const adminApi = {
  // Dashboard
  getDashboard: () => api.get('/admin/dashboard').then((r) => r.data),

  // Users
  getUsers: (params) => api.get('/admin/users', { params }).then((r) => r.data),
  exportUsersCsv: () => api.get('/admin/users/export', { responseType: 'blob' }).then((r) => r.data),
  blockUser: (id) => api.post(`/admin/users/${id}/block`).then((r) => r.data),
  unblockUser: (id) => api.post(`/admin/users/${id}/unblock`).then((r) => r.data),
  forceLogoutUser: (id) => api.post(`/admin/users/${id}/force-logout`).then((r) => r.data),
  changeUserRole: (id, { role, confirm }) => api.post(`/admin/users/${id}/role`, { role, confirm }).then((r) => r.data),
  // removes the account and everything of theirs; the typed email must match
  deleteUser: (id, confirmEmail) => api.delete(`/admin/users/${id}`, { data: { confirmEmail } }).then((r) => r.data),

  // Songs
  getSongs: (params) => api.get('/admin/songs', { params }).then((r) => r.data),
  updateSong: (id, data) => api.put(`/admin/songs/${id}`, data).then((r) => r.data),
  toggleHideSong: (id) => api.post(`/admin/songs/${id}/hide`).then((r) => r.data),
  deleteSong: (id) => api.delete(`/admin/songs/${id}`).then((r) => r.data),
  getDuplicates: () => api.get('/admin/songs/duplicates').then((r) => r.data),
  mergeSongs: ({ sourceSongId, targetSongId, confirm }) => api.post('/admin/songs/merge', { sourceSongId, targetSongId, confirm }).then((r) => r.data),

  // Video for one song (admin only, and the account id must be in ADMIN_VIDEO_USER_IDS on the server)
  videoGet: (songId) => api.get(`/admin/videos/${encodeURIComponent(songId)}`).then((r) => r.data),
  videoCheck: (videoId) => api.get(`/admin/videos/check/${encodeURIComponent(videoId)}`).then((r) => r.data),
  videoSet: (songId, videoId) => api.put(`/admin/videos/${encodeURIComponent(songId)}`, { videoId }).then((r) => r.data),
  videoClear: (songId) => api.delete(`/admin/videos/${encodeURIComponent(songId)}`).then((r) => r.data),
  videoRestore: (songId) => api.post(`/admin/videos/${encodeURIComponent(songId)}/restore`).then((r) => r.data),

  // Home Content
  getHomeContent: () => api.get('/admin/home-content').then((r) => r.data),
  updateHomeContent: (data) => api.put('/admin/home-content', data).then((r) => r.data),

  // Moderation
  // Playlists
  getPlaylists: () => api.get('/admin/playlists').then((r) => r.data),
  toggleFeaturePlaylist: (id) => api.post(`/admin/playlists/${id}/feature`).then((r) => r.data),

  // Settings
  getSettings: () => api.get('/admin/settings').then((r) => r.data),
  updateSettings: (data) => api.put('/admin/settings', data).then((r) => r.data),

  // Audit Logs
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }).then((r) => r.data),
};

export default adminApi;
