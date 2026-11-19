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
  generateResetLink: (id) => api.post(`/admin/users/${id}/reset-link`).then((r) => r.data),
  changeUserRole: (id, { role, password }) => api.post(`/admin/users/${id}/role`, { role, password }).then((r) => r.data),

  // Songs
  getSongs: (params) => api.get('/admin/songs', { params }).then((r) => r.data),
  updateSong: (id, data) => api.put(`/admin/songs/${id}`, data).then((r) => r.data),
  toggleHideSong: (id) => api.post(`/admin/songs/${id}/hide`).then((r) => r.data),
  deleteSong: (id) => api.delete(`/admin/songs/${id}`).then((r) => r.data),
  getDuplicates: () => api.get('/admin/songs/duplicates').then((r) => r.data),
  mergeSongs: ({ sourceSongId, targetSongId, password }) => api.post('/admin/songs/merge', { sourceSongId, targetSongId, password }).then((r) => r.data),

  // Home Content
  getHomeContent: () => api.get('/admin/home-content').then((r) => r.data),
  updateHomeContent: (data) => api.put('/admin/home-content', data).then((r) => r.data),

  // Moderation
  getReportedComments: () => api.get('/admin/moderation/comments').then((r) => r.data),
  deleteComment: (id) => api.delete(`/admin/moderation/comments/${id}`).then((r) => r.data),

  // Playlists
  getPlaylists: () => api.get('/admin/playlists').then((r) => r.data),
  toggleFeaturePlaylist: (id) => api.post(`/admin/playlists/${id}/feature`).then((r) => r.data),

  // Settings
  getSettings: () => api.get('/admin/settings').then((r) => r.data),
  updateSettings: (data) => api.put('/admin/settings', data).then((r) => r.data),

  // Audit Logs
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }).then((r) => r.data),

  // 2FA
  setup2FA: () => api.post('/admin/2fa/setup').then((r) => r.data),
  verify2FA: ({ token, recoveryCodes }) => api.post('/admin/2fa/verify', { token, recoveryCodes }).then((r) => r.data),
  disable2FA: ({ password }) => api.post('/admin/2fa/disable', { password }).then((r) => r.data),
};

export default adminApi;
