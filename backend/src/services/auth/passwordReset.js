/**
 * Forgot password: ask for a link, then use it once. Pure service (stores and email are passed in), so it is easy to test.
 */
import { getStore } from '../../community/store/index.js';
import { db } from '../../prisma/client.js';
import { hashPassword, normalizeEmail } from './credentials.js';
import { resetEmail, resetLink } from './email.js';
import { newToken, hashToken, getResetStore } from './resetStore.js';

export const RESET_TTL_MS = 30 * 60 * 1000; // a link works for 30 minutes
export const RESET_INVALID = { success: false, code: 'RESET_INVALID', message: 'This reset link is invalid or has expired. Please request a new one.' };

/**
 * Create a link for this email and send it. Does nothing (quietly) when there is no such account: the caller answers
 * the same thing either way. A new request closes every older unused link of that account.
 */
export async function requestReset({ email, sender, store = getResetStore(), now = Date.now(), env = process.env }) {
  const user = await db.user.findUnique({ where: { email: normalizeEmail(email) } });
  if (!user) return { sent: false };
  const token = newToken();
  await store.invalidateOpen(user.id, new Date(now));
  await store.create({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(now + RESET_TTL_MS) });
  await sender.send({ to: user.email, ...resetEmail({ link: resetLink(token, env), minutes: RESET_TTL_MS / 60000 }) });
  return { sent: true, userId: user.id };
}

/**
 * Use a link once: sets the new password, closes the link and every other open link, and marks "password changed now" so
 * sign-in tokens issued earlier stop working. Returns the user, or null when the link is unknown, used or expired.
 */
export async function useReset({ token, newPassword, store = getResetStore(), now = Date.now() }) {
  const row = await store.findByHash(hashToken(token));
  if (!row || row.usedAt || new Date(row.expiresAt).getTime() <= now) return null;
  if (!(await store.markUsed(row.id, new Date(now)))) return null; // someone else used it a moment ago
  const users = getStore();
  const user = await users.updateUser(row.userId, { password: await hashPassword(newPassword), passwordChangedAt: new Date(now) });
  if (!user) return null;
  await store.invalidateOpen(row.userId, new Date(now));
  return user;
}
