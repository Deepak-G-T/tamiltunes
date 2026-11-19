/**
 * Videos that failed to embed for THIS person (error 2 / 100 / 101 / 150: bad id, removed, embedding off, region block). Hidden for them
 * for 7 days, kept in this browser only, so one region block does not keep breaking the app for them. (The server hides a video for
 * everyone only after 2 signed-in people report it; see backend/src/services/songVideos.)
 */
export const HIDE_KEY = 'tamiltunes_video_hidden_v1';
export const HIDE_DAYS = 7;
const MAX = 300;

const read = (storage) => {
  try {
    const v = JSON.parse(storage?.getItem(HIDE_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
};

/** The video ids hidden for this person right now (expired ones are dropped). */
export function loadHidden(storage, now = Date.now()) {
  return Object.entries(read(storage)).filter(([id, at]) => /^[A-Za-z0-9_-]{11}$/.test(id) && Number(at) > now - HIDE_DAYS * 86400e3).map(([id]) => id);
}

export function rememberHidden(storage, videoId, now = Date.now()) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(String(videoId || ''))) return;
  const keep = Object.fromEntries(Object.entries(read(storage)).filter(([, at]) => Number(at) > now - HIDE_DAYS * 86400e3));
  keep[videoId] = now;
  const trimmed = Object.fromEntries(Object.entries(keep).sort((a, b) => b[1] - a[1]).slice(0, MAX));
  try { storage?.setItem(HIDE_KEY, JSON.stringify(trimmed)); } catch { /* storage full or blocked: hidden for this session only */ }
}
