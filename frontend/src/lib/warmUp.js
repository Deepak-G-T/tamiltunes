// Wake the server while the person is still looking at the screen. Render's free plan sleeps after 15 minutes and takes about 30 s to wake;
// a silent ping to /health (which never touches the database) at app start and when the app comes back to the front starts that wake-up early,
// so by the time they tap Sign in or Play the server is often ready. Never shows anything, never throws, never more than once every 4 minutes.
import { API_BASE_URL } from '../config/app';

export const WARM_EVERY_MS = 4 * 60 * 1000; // Render's idle limit is 15 minutes: a 4 minute gap is plenty
export const WARM_TIMEOUT_MS = 70 * 1000;   // a cold start can take 30 to 60 seconds

let lastWarm = 0;
export const resetWarmUpForTests = () => { lastWarm = 0; };

export const healthUrl = (base = API_BASE_URL) => `${String(base).replace(/\/+$/, '')}/health`;

/** @returns {Promise<boolean>} true when a ping was sent (false when skipped or failed) */
export async function warmUpServer({ fetchFn = globalThis.fetch, now = Date.now(), base = API_BASE_URL } = {}) {
  try {
    if (typeof fetchFn !== 'function' || now - lastWarm < WARM_EVERY_MS) return false;
    lastWarm = now;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), WARM_TIMEOUT_MS) : null;
    try {
      await fetchFn(healthUrl(base), { method: 'GET', cache: 'no-store', credentials: 'omit', ...(ctl ? { signal: ctl.signal } : {}) });
      return true;
    } finally { if (timer) clearTimeout(timer); }
  } catch { return false; } // offline, blocked or slow: the normal requests handle it
}

/** Ping now, and again whenever the app returns to the front after being away. Returns a function that stops listening. */
export function startWarmUp(doc = typeof document === 'undefined' ? null : document) {
  warmUpServer();
  if (!doc?.addEventListener) return () => {};
  const onShow = () => { if (doc.visibilityState === 'visible') warmUpServer(); };
  doc.addEventListener('visibilitychange', onShow);
  return () => doc.removeEventListener('visibilitychange', onShow);
}
