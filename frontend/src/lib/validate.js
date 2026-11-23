/**
 * Client-side validation. Mirrors backend/src/community/schemas.js so users get instant feedback;
 * the server remains the source of truth.
 */
import { charLength } from './format';

export const BIO_MAX = 150;
export const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;
export const AVATAR_MAX_BYTES = 80 * 1024;
export const AVATAR_UPLOAD_MAX_BYTES = 8 * 1024 * 1024; // raw file picked by the user, before resizing

const RESERVED = new Set(['admin', 'administrator', 'root', 'support', 'help', 'api', 'me', 'profile', 'settings', 'login', 'logout', 'signup', 'register', 'tamiltunes', 'moderator', 'mod', 'system', 'null', 'undefined', 'u', 'search', 'explore']);

export const normalizeUsername = (v) => String(v ?? '').trim().toLowerCase().replace(/^@/, '');

/** @returns {string | null} */
export function usernameError(input) {
  const v = normalizeUsername(input);
  if (!USERNAME_RE.test(v)) return '3-20 characters: letters, numbers or underscore, starting with a letter.';
  if (RESERVED.has(v)) return 'That username is reserved.';
  return null;
}

/** @returns {string | null} */
export function bioError(text) {
  return charLength(String(text ?? '').trim()) > BIO_MAX ? `Bio can be at most ${BIO_MAX} characters.` : null;
}

/** @returns {string | null} */
export function nameError(text) {
  const t = String(text ?? '').trim();
  if (t.length < 2) return 'Name must be at least 2 characters.';
  if (charLength(t) > 50) return 'Name can be at most 50 characters.';
  return null;
}

/** @returns {string | null} */
export function avatarFileError(file) {
  if (!file) return 'Choose an image.';
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return 'Use a PNG, JPEG or WebP image.';
  if (file.size > AVATAR_UPLOAD_MAX_BYTES) return 'That image is too large (max 8 MB).';
  return null;
}
