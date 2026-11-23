/**
 * When may the website switch itself to a new version? Reloading stops the music and drops what the person is doing, so:
 *   - never while a song is playing;
 *   - only when the page was opened a moment ago (nothing started yet) or is hidden (the person left the tab or the app);
 *   - at most once every 2 minutes (a broken update must not reload in a loop).
 * Pure function: the caller passes the facts, so it is tested without a browser.
 */
export const JUST_OPENED_MS = 20 * 1000;
export const MIN_GAP_MS = 2 * 60 * 1000;

export function shouldAutoApply({ pending, isPlaying, pageAgeMs, hidden, lastAutoAt = 0, now = Date.now() }) {
  if (!pending || isPlaying) return false;
  if (lastAutoAt && now - lastAutoAt < MIN_GAP_MS) return false;
  return hidden === true || (Number.isFinite(pageAgeMs) && pageAgeMs <= JUST_OPENED_MS);
}

const KEY = 'tamiltunes_auto_update_at';
export const readLastAuto = (storage) => { try { const n = Number(storage?.getItem(KEY)); return Number.isFinite(n) ? n : 0; } catch { return 0; } };
export const writeLastAuto = (storage, at = Date.now()) => { try { storage?.setItem(KEY, String(at)); } catch { /* blocked storage: the 2-minute guard just does not remember */ } };
