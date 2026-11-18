import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { relatedLimiter } from '../middleware/rateLimiter.js';
import { getRelatedSongs } from '../controllers/relatedController.js';

const router = Router();
router.get('/songs/:id/related', optionalAuth, relatedLimiter, getRelatedSongs);
export default router;
