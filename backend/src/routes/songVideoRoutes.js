import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOwnerAdmin } from '../middleware/requireOwnerAdmin.js';
import { videoReportLimiter } from '../middleware/rateLimiter.js';
import { reportVideo, listSongs, listFlagged, checkVideo, setVideo, clearVideo, restoreVideo } from '../controllers/songVideoController.js';

/** Mounted at /api: the report route for signed-in listeners. */
export const songVideoRoutes = express.Router();
songVideoRoutes.post('/songs/:id/video-report', requireAuth, videoReportLimiter, reportVideo);

/**
 * Mounted at /api/admin/videos. Fail closed: 403 for everyone unless the account has role "admin" in the database AND its user id is listed in
 * ADMIN_VIDEO_USER_IDS on the server (see middleware/requireOwnerAdmin.js). When PR #31's admin check (2FA included) lands, switch to it.
 */
export const adminVideoRoutes = express.Router();
adminVideoRoutes.use(requireAuth, requireOwnerAdmin('ADMIN_VIDEO_USER_IDS'));
adminVideoRoutes.get('/songs', listSongs);
adminVideoRoutes.get('/flagged', listFlagged);
adminVideoRoutes.get('/check/:videoId', checkVideo);
adminVideoRoutes.put('/:songId', setVideo);
adminVideoRoutes.delete('/:songId', clearVideo);
adminVideoRoutes.post('/:songId/restore', restoreVideo);
