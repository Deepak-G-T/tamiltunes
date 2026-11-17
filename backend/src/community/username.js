const RESERVED = new Set([
  'admin', 'administrator', 'root', 'support', 'help', 'api', 'me', 'profile', 'settings', 'login', 'logout',
  'signup', 'register', 'tamiltunes', 'moderator', 'mod', 'system', 'null', 'undefined', 'u', 'search', 'explore',
]);

export const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;

/** Lower-case + trim; callers store and compare this form. */
export const normalizeUsername = (v) => String(v ?? '').trim().toLowerCase().replace(/^@/, '');

/** @returns {{ ok: true, value: string } | { ok: false, message: string }} */
export function validateUsername(input) {
  const value = normalizeUsername(input);
  if (!USERNAME_RE.test(value)) {
    return { ok: false, message: 'Username must be 3-20 characters: letters, numbers or underscore, starting with a letter.' };
  }
  if (RESERVED.has(value)) return { ok: false, message: 'That username is reserved.' };
  return { ok: true, value };
}

/** Suggest a default username from a display name (caller makes it unique). */
export function suggestUsername(name, suffix = '') {
  const base = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12) || 'user';
  const start = /^[a-z]/.test(base) ? base : `u${base}`;
  return `${start}${suffix}`.slice(0, 20);
}
