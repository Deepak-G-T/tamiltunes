/**
 * The ONE place that normalises emails and hashes / checks passwords. Signup, login, password reset and the admin scripts all use it,
 * so they can never disagree. The password itself is never trimmed or changed in any way.
 */
import bcrypt from 'bcryptjs';

export const BCRYPT_COST = 12;

/** Trim and lower-case. Used before saving and before every lookup. */
export const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

export const hashPassword = (password) => bcrypt.hash(String(password), BCRYPT_COST);

/** true only for a correct password; a missing or broken hash is simply "no", never an exception. */
export async function verifyPassword(password, hash) {
  if (typeof hash !== 'string' || hash.length === 0) return false;
  try {
    return await bcrypt.compare(String(password), hash);
  } catch {
    return false;
  }
}

let dummyHash;
/** Do the same amount of work for an unknown email as for a known one, so response time does not reveal which emails exist. */
export async function spendTimeLikeAVerify(password) {
  dummyHash ??= await bcrypt.hash('timing-equaliser-not-a-real-password', BCRYPT_COST);
  await bcrypt.compare(String(password), dummyHash);
}

/** Minimum length for a NEW password (signup, reset). Login accepts whatever the account already has. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
