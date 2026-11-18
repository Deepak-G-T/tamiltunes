import { Router } from 'express';
import {
  register,
  login,
  getMe,
  registerSchema,
  loginSchema
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { forgotPassword, resetPassword, forgotSchema, resetSchema } from '../controllers/passwordResetController.js';
import { loginEmailLimiter, loginIpLimiter, registerEmailLimiter, registerIpLimiter, forgotEmailLimiter, forgotIpLimiter, resetIpLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register', registerIpLimiter, validateBody(registerSchema), registerEmailLimiter, register);
router.post('/login', loginIpLimiter, validateBody(loginSchema), loginEmailLimiter, login);
router.post('/forgot-password', forgotIpLimiter, validateBody(forgotSchema), forgotEmailLimiter, forgotPassword);
router.post('/reset-password', resetIpLimiter, validateBody(resetSchema), resetPassword);
router.get('/me', requireAuth, getMe);

export default router;
