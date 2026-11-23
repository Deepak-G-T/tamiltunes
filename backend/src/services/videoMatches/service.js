/**
 * What the batch matcher found, kept in memory (refreshed every few minutes) so song lists never wait on the database.
 * match(key) is synchronous: { videoId } (a found official video), { videoId: null } (looked and found none, recent), or undefined (unknown).
 * "No video found" is only trusted for NONE_TTL_DAYS, then the song is looked up again.
 */
import { getVideoMatchStore } from './store.js';

export const REFRESH_MS = 10 * 60 * 1000;
export const NONE_TTL_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

export function createVideoMatchService({ store: fixedStore = null, now = () => Date.now(), refreshMs = REFRESH_MS } = {}) {
  const storeOf = () => fixedStore || getVideoMatchStore();
  let matches = new Map(); // songKey -> { videoId, checkedAt }
  let loadedAt = 0;
  let loading = null;

  const refresh = async () => {
    if (loading) return loading;
    loading = (async () => {
      try {
        const rows = await storeOf().list();
        matches = new Map(rows.map((r) => [r.songKey, { videoId: r.videoId ?? null, checkedAt: new Date(r.checkedAt).getTime() }]));
        loadedAt = now();
      } catch { /* keep the last good copy; try again on the next request */ } finally { loading = null; }
    })();
    return loading;
  };

  const match = (key) => {
    if (now() - loadedAt > refreshMs && !loading) refresh();
    const m = key ? matches.get(key) : null;
    if (!m) return undefined;
    if (m.videoId) return { videoId: m.videoId };
    return now() - m.checkedAt < NONE_TTL_DAYS * DAY ? { videoId: null } : undefined;
  };

  return { match, refresh, get store() { return storeOf(); } };
}

export const videoMatches = createVideoMatchService();
