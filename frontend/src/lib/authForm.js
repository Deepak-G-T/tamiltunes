// Small helpers for the sign in / sign up / reset forms. No React, easy to test.
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;
export const EMAIL_KEY = 'tamiltunes_auth_email'; // sessionStorage: the typed email follows you between Sign in, Sign up and Forgot password

export function validateEmail(value) {
  const e = String(value ?? '').trim();
  if (!e) return 'Enter your email';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return 'Enter a valid email, like name@example.com';
  return '';
}

export const validateName = (value) => (String(value ?? '').trim().length < 2 ? 'Enter your name (at least 2 characters)' : '');

/** For a NEW password. (Sign in accepts whatever the account already has.) */
export function validateNewPassword(value) {
  const p = String(value ?? '');
  if (!p) return 'Choose a password';
  if (p.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters`;
  if (p.length > MAX_PASSWORD) return 'That password is too long';
  return '';
}

export const validateConfirm = (password, confirm) => (String(confirm ?? '') !== String(password ?? '') ? 'The two passwords are not the same' : '');

export const validateCurrentPassword = (value) => (String(value ?? '') ? '' : 'Enter your password');

const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop', 'iloveyou', 'abcd1234', '11111111', 'tamiltunes', 'welcome1']);

/** A rough hint, not a promise: length and variety, and a short list of very common passwords. */
export function passwordStrength(value) {
  const p = String(value ?? '');
  if (!p) return { score: 0, label: '', hint: `Use at least ${MIN_PASSWORD} characters` };
  if (p.length < MIN_PASSWORD) return { score: 0, label: 'Too short', hint: `${MIN_PASSWORD - p.length} more character${MIN_PASSWORD - p.length === 1 ? '' : 's'} needed` };
  if (COMMON.has(p.toLowerCase())) return { score: 1, label: 'Weak', hint: 'This is a very common password. Try a phrase only you know.' };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  const points = classes + (p.length >= 12 ? 1 : 0) + (p.length >= 16 ? 1 : 0) + (new Set(p).size >= 6 ? 0 : -1);
  if (points <= 1) return { score: 1, label: 'Weak', hint: 'Add letters in different cases, numbers or a symbol, or make it longer.' };
  if (points === 2) return { score: 2, label: 'Okay', hint: 'A longer password or a symbol makes it stronger.' };
  if (points === 3) return { score: 3, label: 'Good', hint: '' };
  return { score: 4, label: 'Strong', hint: '' };
}

export function rememberEmail(storage, email) {
  try { storage?.setItem(EMAIL_KEY, String(email ?? '')); } catch { /* blocked: the email just is not carried over */ }
}
export function recallEmail(storage) {
  try { return storage?.getItem(EMAIL_KEY) || ''; } catch { return ''; }
}
