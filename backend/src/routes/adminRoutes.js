import express from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import * as adminCtrl from '../controllers/adminController.js';

const router = express.Router();

// Apply requireAdmin to ALL admin routes
router.use(requireAdmin);

// 1. Dashboard
router.get('/dashboard', adminCtrl.getDashboardStats);

// 2. Users Management & Export
router.get('/users/export', adminCtrl.exportUsersCsv);
router.get('/users', adminCtrl.listUsers);
router.post('/users/:id/block', adminCtrl.blockUser);
router.post('/users/:id/unblock', adminCtrl.unblockUser);
router.post('/users/:id/force-logout', adminCtrl.forceLogoutUser);
router.post('/users/:id/reset-link', adminCtrl.generateResetLink);
router.post('/users/:id/role', adminCtrl.changeUserRole);
router.delete('/users/:id', adminCtrl.deleteUser);

// 3. Songs Management & Duplicates
router.get('/songs/duplicates', adminCtrl.findDuplicateSongs);
router.post('/songs/merge', adminCtrl.mergeDuplicateSongs);
router.get('/songs', adminCtrl.listSongs);
router.put('/songs/:id', adminCtrl.updateSongMetadata);
router.post('/songs/:id/hide', adminCtrl.toggleHideSong);
router.delete('/songs/:id', adminCtrl.softDeleteSong);

// 4. Home Content & Editorial Playlists
router.get('/home-content', adminCtrl.getHomeContent);
router.put('/home-content', adminCtrl.updateHomeContent);

// 5. Moderation
router.get('/moderation/comments', adminCtrl.listReportedComments);
router.delete('/moderation/comments/:id', adminCtrl.deleteComment);

// 6. Playlists
router.get('/playlists', adminCtrl.listAdminPlaylists);
router.post('/playlists/:id/feature', adminCtrl.toggleFeaturePlaylist);

// 7. Settings
router.get('/settings', adminCtrl.getAppSettings);
router.put('/settings', adminCtrl.updateAppSettings);

// 8. Audit Logs
router.get('/audit-logs', adminCtrl.listAuditLogs);

// 9. Two-Factor Authentication (2FA)
router.post('/2fa/setup', adminCtrl.setup2FA);
router.post('/2fa/verify', adminCtrl.verify2FA);
router.post('/2fa/disable', adminCtrl.disable2FA);

export default router;
