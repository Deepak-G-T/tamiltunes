import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { usernameCheckLimiter } from '../middleware/rateLimiter.js';
import { profileUpdateSchema, deleteAccountSchema } from '../community/schemas.js';
import { getMyProfile, updateMyProfile, checkUsername, deleteMyAccount } from '../controllers/profileController.js';

const router = Router();
router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, validateBody(profileUpdateSchema), updateMyProfile);
router.delete('/me', requireAuth, validateBody(deleteAccountSchema), deleteMyAccount);
router.get('/username-available', requireAuth, usernameCheckLimiter, checkUsername);
export default router;
