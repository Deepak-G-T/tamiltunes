/**
 * Which video a song gets, before the automatic lookup (services/music/videoLookup.js) is asked:
 *   - an admin-chosen id always wins;
 *   - a video that 2 different logged-in people could not embed is hidden for everyone until an admin restores it.
 * Kept in memory (refreshed every few minutes and right after every change) so song lists never wait on the database.
 */
import { getSongVideoStore } from './store.js';

export const REPORTS_TO_HIDE = 2;
export const REFRESH_MS = 5 * 60 * 1000;
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function createSongVideoService({ store: fixedStore = null, now = () => Date.now(), refreshMs = REFRESH_MS } = {}) {
  // The store is chosen on first use, after the database connection is known (not at import time)
  const storeOf = () => fixedStore || getSongVideoStore();
  let overrides = new Map(); // songId -> { videoId, videoAvailable }
  let loadedAt = 0;
  let loading = null;

  const refresh = async () => {
    if (loading) return loading;
    loading = (async () => {
      try {
        const rows = await storeOf().listOverrides();
        overrides = new Map(rows.map((r) => [r.songId, { videoId: r.videoId ?? null, videoAvailable: r.videoAvailable !== false }]));
        loadedAt = now();
      } catch { /* keep the last good copy; try again on the next request */ } finally { loading = null; }
    })();
    return loading;
  };

  /** Synchronous: { hidden: true }, { videoId }, or null (let the automatic lookup decide). Starts a background refresh when stale. */
  const override = (song) => {
    if (now() - loadedAt > refreshMs) refresh();
    const o = song?.id ? overrides.get(song.id) : null;
    if (!o) return null;
    if (!o.videoAvailable) return { hidden: true };
    return o.videoId ? { videoId: o.videoId } : null;
  };

  return {
    override,
    refresh,
    get store() { return storeOf(); },
    /** A logged-in person's embed failure. Returns { reports, hidden }. */
    async report({ song, userId, videoId, code }) {
      const reports = await storeOf().addReport({ songId: song.id, userId, videoId, code }, song);
      let hidden = false;
      if (reports >= REPORTS_TO_HIDE) { await storeOf().flag(song.id); hidden = true; }
      await refresh();
      return { reports, hidden };
    },
    async setVideo(song, videoId) { const r = await storeOf().setVideo(song.id, videoId, song); await refresh(); return r; },
    async clearVideo(songId) { const r = await storeOf().clearVideo(songId); await refresh(); return r; },
    async restore(songId) { const r = await storeOf().restore(songId); await refresh(); return r; },
  };
}

export const songVideos = createSongVideoService();
