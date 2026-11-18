import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { videoReportLimiter } from '../middleware/rateLimiter.js';
import { reportVideo, listSongs, listFlagged, checkVideo, setVideo, clearVideo, restoreVideo } from '../controllers/songVideoController.js';

/** Mounted at /api: the report route for signed-in listeners. */
export const songVideoRoutes = express.Router();
songVideoRoutes.post('/songs/:id/video-report', requireAuth, videoReportLimiter, reportVideo);

/** Mounted at /api/admin/videos: admin only. (When the admin panel from PR #31 lands, put these behind its admin check, 2FA included.) */
export const adminVideoRoutes = express.Router();
adminVideoRoutes.use(requireAuth, requireRole('admin'));
adminVideoRoutes.get('/songs', listSongs);
adminVideoRoutes.get('/flagged', listFlagged);
adminVideoRoutes.get('/check/:videoId', checkVideo);
adminVideoRoutes.put('/:songId', setVideo);
adminVideoRoutes.delete('/:songId', clearVideo);
adminVideoRoutes.post('/:songId/restore', restoreVideo);
