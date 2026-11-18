import { getStore } from '../../community/store/index.js';
import { db } from '../../prisma/client.js';
import { hashPassword, normalizeEmail, verifyPassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from './credentials.js';
import { getResetStore } from './resetStore.js';

/**
 * Set a new password for one account (used by the owner's `reset-password` script). Changes ONLY the password hash and the
 * "password changed" time; the account, playlists, favourites and history are not touched. Other sessions end, open reset links close.
 * @returns {{ ok: true, email: string } | { ok: false, reason: 'not-found' | 'too-short' | 'too-long' }}
 */
export async function setPasswordForEmail(email, password) {
  if (String(password).length < MIN_PASSWORD_LENGTH) return { ok: false, reason: 'too-short' };
  if (String(password).length > MAX_PASSWORD_LENGTH) return { ok: false, reason: 'too-long' };
  const user = await db.user.findUnique({ where: { email: normalizeEmail(email) } });
  if (!user) return { ok: false, reason: 'not-found' };
  await getStore().updateUser(user.id, { password: await hashPassword(password), passwordChangedAt: new Date() });
  await getResetStore().invalidateOpen(user.id);
  return { ok: true, email: user.email };
}

/** Read-only: does this password match the account's stored hash? */
export async function passwordMatches(email, password) {
  const user = await db.user.findUnique({ where: { email: normalizeEmail(email) } });
  if (!user) return { found: false, matches: false };
  return { found: true, matches: await verifyPassword(password, user.password) };
}
