import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { homeLimiter } from '../middleware/rateLimiter.js';
import { getHome } from '../controllers/homeController.js';

const router = Router();
router.get('/', homeLimiter, optionalAuth, getHome);
export default router;
