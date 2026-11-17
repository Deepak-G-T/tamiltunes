import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { commentLimiter, reportLimiter } from '../middleware/rateLimiter.js';
import { commentCreateSchema, commentEditSchema, reportSchema } from '../community/schemas.js';
import {
  listComments, pollComments, listReplies, createComment, editComment, deleteComment,
  likeComment, unlikeComment, pinComment, unpinComment, reportComment,
} from '../controllers/commentController.js';

const router = Router();

// Per song
router.get('/songs/:songId/comments', optionalAuth, listComments);
router.get('/songs/:songId/comments/poll', optionalAuth, pollComments);
router.post('/songs/:songId/comments', requireAuth, commentLimiter, validateBody(commentCreateSchema), createComment);

// Per comment
router.get('/comments/:id/replies', optionalAuth, listReplies);
router.patch('/comments/:id', requireAuth, validateBody(commentEditSchema), editComment);
router.delete('/comments/:id', requireAuth, deleteComment);
router.post('/comments/:id/like', requireAuth, likeComment);
router.delete('/comments/:id/like', requireAuth, unlikeComment);
router.post('/comments/:id/pin', requireAuth, pinComment);
router.delete('/comments/:id/pin', requireAuth, unpinComment);
router.post('/comments/:id/report', requireAuth, reportLimiter, validateBody(reportSchema), reportComment);

export default router;
