import { Router } from 'express';
import {
  register,
  login,
  getMe,
  registerSchema,
  loginSchema,
  googleLogin,
  googleLoginSchema,
  requirePasswordAuth
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { forgotPassword, resetPassword, forgotSchema, resetSchema } from '../controllers/passwordResetController.js';
import { googleLoginLimiter, loginEmailLimiter, loginIpLimiter, registerEmailLimiter, registerIpLimiter, forgotEmailLimiter, forgotIpLimiter, resetIpLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/google', googleLoginLimiter, validateBody(googleLoginSchema), googleLogin);
// Email + password: only outside production (see requirePasswordAuth); in production these answer 404 "Sign in with Google"
router.post('/register', requirePasswordAuth, registerIpLimiter, validateBody(registerSchema), registerEmailLimiter, register);
router.post('/login', requirePasswordAuth, loginIpLimiter, validateBody(loginSchema), loginEmailLimiter, login);
router.post('/forgot-password', requirePasswordAuth, forgotIpLimiter, validateBody(forgotSchema), forgotEmailLimiter, forgotPassword);
router.post('/reset-password', requirePasswordAuth, resetIpLimiter, validateBody(resetSchema), resetPassword);
router.get('/me', requireAuth, getMe);

export default router;
