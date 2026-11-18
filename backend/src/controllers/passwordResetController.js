import { z } from 'zod';
import { createEmailSender } from '../services/auth/email.js';
import { requestReset, useReset, RESET_INVALID } from '../services/auth/passwordReset.js';
import { normalizeEmail, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from '../services/auth/credentials.js';
import { generateToken, presentUser } from './authController.js';

export const forgotSchema = z.object({ email: z.string().transform(normalizeEmail).pipe(z.email('Invalid email address')) }).strict();
export const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`).max(MAX_PASSWORD_LENGTH, 'Password is too long'),
}).strict();

// The same answer whether or not the email has an account
export const FORGOT_ANSWER = { success: true, message: 'If an account exists, we sent a link' };

let sender = createEmailSender();
export const setEmailSender = (s) => { sender = s; }; // tests
const pending = new Set();
/** Tests wait for the work that runs after the answer was sent. */
export const flushResetJobs = () => Promise.allSettled([...pending]);

export const forgotPassword = (req, res) => {
  // Answer first and do the work afterwards, so the response time does not show whether the account exists
  res.json(FORGOT_ANSWER);
  const job = requestReset({ email: req.body.email, sender })
    .catch((err) => console.warn('Password reset request failed:', err.message)) // never the token, the email text or a key
    .finally(() => pending.delete(job));
  pending.add(job);
};

export const resetPassword = async (req, res, next) => {
  try {
    const user = await useReset({ token: req.body.token, newPassword: req.body.password });
    if (!user) return res.status(400).json(RESET_INVALID);
    res.json({ success: true, token: generateToken(user.id), user: presentUser(user) }); // signed in with the new password
  } catch (err) { next(err); }
};
