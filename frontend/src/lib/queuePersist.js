// Saving and restoring the play queue. Pure functions, no network or React: tested in queuePersist.test.js.
// Only song ids are saved. Titles, covers and stream URLs are fetched again on restore, so stale or tampered data is never reused.
import { createQueueState, cleanRadioDuplicates, collectHeard, newUid, MAX_HISTORY, MAX_QUEUE, MAX_HEARD } from './radioQueue';

export const GUEST_QUEUE_KEY = 'tamiltunes_queue_v1';
export const DEVICE_KEY = 'tamiltunes_device';
export const SAVE_DEBOUNCE_MS = 2000;
const ID_OK = /^[\w.:\-~]{1,128}$/;
const ORIGIN_CODE = { user: 'u', radio: 'r', context: 'c' };

/** What gets saved for the current queue state, or null when nothing has played yet. */
export function toSaved(state, { positionSec = 0, deviceId = null } = {}) {
  if (!state?.current || !ID_OK.test(state.current.id)) return null;
  const history = state.history.slice(-MAX_HISTORY).filter((s) => ID_OK.test(s.id));
  const upcoming = state.upcoming.filter((e) => ID_OK.test(e.song.id)).slice(0, MAX_QUEUE);
  const items = [
    ...history.map((s) => ({ id: s.id, o: 'r' })),
    { id: state.current.id, o: state.mode === 'context' ? 'c' : 'r' },
    ...upcoming.map((e) => ({ id: e.song.id, o: ORIGIN_CODE[e.origin] || 'r' })),
  ];
  return {
    items,
    currentIndex: history.length,
    positionSec: Math.max(0, Math.min(86400, Math.floor(Number(positionSec) || 0))),
    shuffle: Boolean(state.shuffle),
    repeat: ['off', 'all', 'one'].includes(state.repeat) ? state.repeat : 'off',
    autoplay: Boolean(state.autoplay),
    mode: state.mode === 'context' ? 'context' : 'radio',
    sourceLabel: state.context?.label ? String(state.context.label).slice(0, 120) : null,
    heard: collectHeard(state).filter((h) => typeof h.k === 'string' && h.k.length <= 300 && (!h.id || ID_OK.test(h.id))).slice(-MAX_HEARD),
    allowRepeats: Boolean(state.allowRepeats),
    deviceId,
  };
}

/** Same queue? (ignores position, so playing a song does not count as a change) */
export const sameQueue = (a, b) => Boolean(a && b) && JSON.stringify([a.items, a.currentIndex, a.shuffle, a.repeat, a.mode]) === JSON.stringify([b.items, b.currentIndex, b.shuffle, b.repeat, b.mode]);

export const savedIds = (saved) => [...new Set((saved?.items || []).map((i) => i.id))];

/**
 * Rebuild a queue from a saved one and the songs that still exist (`songsById`, fetched fresh).
 * Songs that are gone are dropped. If the song that was playing is gone, the next one takes its place from 0:00.
 * @returns {{ state: object, currentSong: object, positionSec: number, dropped: number } | null}  null when nothing is left
 */
export function fromSaved(saved, songsById, { autoplay = true } = {}) {
  if (!saved || !Array.isArray(saved.items) || !saved.items.length) return null;
  const idx = Math.min(Math.max(saved.currentIndex, 0), saved.items.length - 1);
  const known = (it) => Boolean(songsById[it.id]);
  const before = saved.items.slice(0, idx).filter(known).slice(-MAX_HISTORY); // History keeps the last 50
  const after = saved.items.slice(idx + 1).filter(known);
  const cur = saved.items[idx];
  const dropped = saved.items.slice(0, idx).filter((it) => !known(it)).length + saved.items.slice(idx + 1).filter((it) => !known(it)).length + (known(cur) ? 0 : 1);

  let current = known(cur) ? songsById[cur.id] : null;
  const rawPosition = Number(saved.positionSec);
  let positionSec = Number.isFinite(rawPosition) ? Math.max(0, rawPosition) : 0;
  if (!current) {
    positionSec = 0;
    const replacement = after.shift() || before.pop();
    if (!replacement) return null;
    current = songsById[replacement.id];
  }

  // User-added songs must stay a prefix of "upcoming" (the engine relies on it)
  let userCount = 0;
  while (userCount < after.length && after[userCount].o === 'u') userCount++;
  const sourceOrigin = saved.mode === 'context' ? 'context' : 'radio';
  const upcoming = after.map((it, i) => ({ uid: newUid(), song: songsById[it.id], origin: i < userCount ? 'user' : sourceOrigin }));
  const historySongs = before.map((it) => songsById[it.id]);

  // Autoplay rows that repeat the playing song or an earlier row (same song under another id, spelling or album) are dropped; songs you added stay
  const state = cleanRadioDuplicates(createQueueState({
    autoplay,
    current,
    history: historySongs,
    upcoming,
    userCount,
    played: [...new Set([...historySongs.map((s) => s.id), current.id])],
    mode: saved.mode === 'context' ? 'context' : 'radio',
    context: saved.mode === 'context'
      ? { type: 'playlist', id: null, label: saved.sourceLabel || '', songs: [...historySongs, current, ...upcoming.slice(userCount).map((e) => e.song)] }
      : null,
    shuffle: Boolean(saved.shuffle),
    repeat: ['off', 'all', 'one'].includes(saved.repeat) ? saved.repeat : 'off',
    heard: (Array.isArray(saved.heard) ? saved.heard : []).filter((h) => h && typeof h.k === 'string').slice(-MAX_HEARD),
    allowRepeats: Boolean(saved.allowRepeats),
  }));
  return { state, currentSong: current, positionSec, dropped };
}

// ---------------------------------------------------------------- browser storage (guests, and this device's id)

export function readGuestQueue(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(GUEST_QUEUE_KEY) || 'null');
    return saved && Array.isArray(saved.items) && saved.items.length ? saved : null;
  } catch {
    return null;
  }
}
export function writeGuestQueue(storage, saved) {
  try {
    if (saved) storage?.setItem(GUEST_QUEUE_KEY, JSON.stringify({ ...saved, savedAt: Date.now() }));
    else storage?.removeItem(GUEST_QUEUE_KEY);
  } catch { /* storage full or blocked: the queue just will not survive a refresh */ }
}

/** A random id for this browser, so a device can tell its own saves from another device's. */
export function getDeviceId(storage) {
  try {
    let id = storage?.getItem(DEVICE_KEY);
    if (!id || !/^[\w-]{1,64}$/.test(id)) {
      id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      storage?.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `d${Math.random().toString(36).slice(2, 12)}`;
  }
}

// ---------------------------------------------------------------- network resilience

const RETRYABLE_STATUS = new Set([0, 408, 500, 502, 503, 504]);
/** A request that failed because the server was waking up or the network blinked (not a real "no"). */
export const isTransient = (err) => {
  const status = err?.response?.status;
  return status === undefined ? true : RETRYABLE_STATUS.has(status);
};

/**
 * Run `fn`, retrying quietly when the server or network is briefly unavailable (Render or Neon waking from idle).
 * Real errors (401, 400, 429 ...) are thrown straight away. After the last try the error is thrown, and the caller stays silent.
 */
export async function withRetry(fn, { retries = 3, baseMs = 1000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (!isTransient(err) || attempt === retries) throw err;
      await sleep(baseMs * 2 ** attempt);
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------- another device

export const SYNC_CHECK_MIN_MS = 30000; // look at most this often (app open, tab focus): no polling

/**
 * Did another device change the saved queue since this device last saved or loaded it?
 * @param {{ meta: { updatedAt: string, deviceId: string | null } | null, myDeviceId: string, lastSyncAt: string | null }} args
 */
export function shouldAskToContinue({ meta, myDeviceId, lastSyncAt }) {
  if (!meta || !meta.updatedAt) return false;
  if (meta.deviceId && meta.deviceId === myDeviceId) return false; // our own save
  const theirs = Date.parse(meta.updatedAt);
  if (!Number.isFinite(theirs)) return false;
  const seen = lastSyncAt ? Date.parse(lastSyncAt) : 0;
  return theirs > (Number.isFinite(seen) ? seen : 0) + 1000;
}
