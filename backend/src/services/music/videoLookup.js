import { LruCacheService } from '../cacheService.js';
import { config as defaultConfig } from '../../config/env.js';
import { CURATED_VIDEOS } from './curatedVideos.js';

const DAY_SECONDS = 24 * 60 * 60;
const ERROR_TTL_SECONDS = 10 * 60; // transient failures are cached briefly, not for a day
const SEARCH_COST = 100; // quota units: search.list
const VIDEOS_COST = 1; // quota units: videos.list
const API_BASE = 'https://www.googleapis.com/youtube/v3';
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export const normalizeTitle = (t) =>
  (t || '')
    .toLowerCase()
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ') // drop (Leo), (From "Leo"), [..]
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const artistText = (song) => `${song.artist || ''} ${song.singers || ''}`.toLowerCase();

const songKey = (song) => `${normalizeTitle(song.title)}|${normalizeTitle((song.artist || song.singers || '').split(',')[0])}`;

/**
 * Factory so tests can inject fetch / config / cache / clock.
 * Resolution order: curated map -> 24h cache -> (optional) YouTube Data API.
 */
export const createVideoLookup = ({
  fetchImpl = (...a) => fetch(...a),
  cfg = defaultConfig,
  cache = new LruCacheService(2000, DAY_SECONDS),
  now = () => Date.now(),
  curated = CURATED_VIDEOS,
  maxQueue = 20
} = {}) => {
  const inflight = new Map();
  const queue = [];
  let draining = false;
  const budget = { day: '', used: 0 };
  const stats = { apiLookups: 0, apiCalls: 0, skippedNoBudget: 0 };

  const apiEnabled = () => !!cfg.youtubeApiKey && (cfg.videoChannelAllowlist || []).length > 0;

  const day = () => new Date(now()).toISOString().slice(0, 10);
  const spend = (units) => {
    if (budget.day !== day()) { budget.day = day(); budget.used = 0; }
    if (budget.used + units > cfg.youtubeDailyBudget) return false;
    budget.used += units;
    return true;
  };

  const curatedMatch = (song) => {
    if (!song) return null;
    const t = normalizeTitle(song.title);
    const art = artistText(song);
    return (
      curated.find((e) => !e.candidate && (
        (e.songId && e.songId === song.id) ||
        (e.titles.includes(t) && e.artistHints.some((h) => art.includes(h)))
      )) || null
    );
  };

  /** Synchronous: curated map and cache only. Never touches the network. */
  const peek = (song) => {
    if (!song || !song.title) return undefined;
    const c = curatedMatch(song);
    if (c) return c.videoId;
    const hit = cache.get(`video_${songKey(song)}`);
    return hit ? hit.videoId : undefined; // undefined = unknown, null = known none
  };

  const apiSearch = async (song) => {
    const q = `${song.title} ${(song.artist || song.singers || '').split(',')[0]}`.trim();
    const call = async (path, params) => {
      const url = new URL(`${API_BASE}/${path}`);
      for (const [k, v] of Object.entries({ ...params, key: cfg.youtubeApiKey })) url.searchParams.set(k, v);
      stats.apiCalls++;
      const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(5000) });
      // never log the URL: it contains the API key
      if (!res.ok) throw new Error(`YouTube API HTTP ${res.status}`);
      return res.json();
    };

    const search = await call('search', {
      part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '5', q
    });
    const ids = (search.items || []).map((i) => i?.id?.videoId).filter((id) => VIDEO_ID_RE.test(id || ''));
    if (ids.length === 0) return null;

    const details = await call('videos', { part: 'status,snippet', id: ids.join(',') });
    const allow = new Set(cfg.videoChannelAllowlist);
    const byId = new Map((details.items || []).map((v) => [v.id, v]));
    for (const id of ids) {
      const v = byId.get(id);
      if (!v) continue;
      if (v.status?.embeddable !== true) continue;
      if (v.status?.privacyStatus && v.status.privacyStatus !== 'public') continue;
      if (!allow.has(v.snippet?.channelId)) continue; // official channels only, matched by id
      return id;
    }
    return null;
  };

  /** Async lookup with cache; the only code path that may call the API. */
  const lookup = async (song) => {
    if (!song || !song.title) return null;
    const c = curatedMatch(song);
    if (c) return c.videoId;

    const key = `video_${songKey(song)}`;
    const hit = cache.get(key);
    if (hit) return hit.videoId;

    if (!apiEnabled()) return null; // no key or empty allow-list: fail closed, no network, no cache write

    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      if (!spend(SEARCH_COST + VIDEOS_COST)) {
        stats.skippedNoBudget++;
        return null; // over daily budget: do not cache, retry tomorrow
      }
      stats.apiLookups++;
      try {
        const videoId = await apiSearch(song);
        cache.set(key, { videoId }, DAY_SECONDS); // includes "no video found"
        return videoId;
      } catch (err) {
        console.warn('Video lookup failed:', err.message);
        cache.set(key, { videoId: null }, ERROR_TTL_SECONDS);
        return null;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  };

  const drain = async () => {
    if (draining) return;
    draining = true;
    while (queue.length) {
      const s = queue.shift();
      try { await lookup(s); } catch { /* lookup never throws, defensive */ }
    }
    draining = false;
  };

  /** Fire-and-forget: queue uncached songs for a throttled background lookup. */
  const enqueue = (song) => {
    if (!apiEnabled() || queue.length >= maxQueue) return;
    const key = songKey(song);
    if (inflight.has(`video_${key}`) || queue.some((q) => songKey(q) === key)) return;
    queue.push(song);
    setImmediate(drain);
  };

  /**
   * Adds { videoId } to songs where known, from curated map / cache only (no network).
   * Unknown songs are queued for background lookup. Songs with their own videoId are untouched.
   * Returns new objects only for changed songs; inputs are never mutated (they may be cached).
   */
  const attach = (songs) =>
    (songs || []).map((s) => {
      if (!s || s.videoId) return s;
      const id = peek(s);
      if (id) return { ...s, videoId: id };
      if (id === undefined) enqueue(s);
      return s;
    });

  /** Awaited variant for the single-song route. */
  const attachOne = async (song) => {
    if (!song || song.videoId) return song;
    const id = await lookup(song);
    return id ? { ...song, videoId: id } : song;
  };

  return { peek, lookup, attach, attachOne, stats, _budget: budget, _cache: cache, apiEnabled };
};

export const videoLookup = createVideoLookup();
