/**
 * What makes the home page different each time. A "visit" token is made on every app open and every refresh: the server turns it
 * into a new mix. The songs shown last time are remembered here (localStorage) and sent back as `avoid`, so the next mix starts
 * with songs you did not just see. Pure functions over a `storage` object so they are easy to test.
 */
export const SHOWN_KEY = 'tamiltunes_home_shown_v1';
export const MAX_SHOWN = 80;

/** A short random token: letters and digits only (the server accepts up to 24 of them). */
export const newVisit = (rng = Math.random) => Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rng() * 36)]).join('');

export function readShown(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(SHOWN_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string' && /^[\w.:\-~]{1,128}$/.test(x)).slice(0, MAX_SHOWN) : [];
  } catch {
    return [];
  }
}

export function writeShown(storage, ids) {
  try {
    const clean = [...new Set((ids || []).filter(Boolean))].slice(0, MAX_SHOWN);
    if (clean.length) storage?.setItem(SHOWN_KEY, JSON.stringify(clean));
  } catch {
    /* storage full or blocked: the next mix just does not avoid the last one */
  }
}
