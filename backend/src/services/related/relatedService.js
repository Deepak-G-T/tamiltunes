import { LruCacheService } from '../cacheService.js';
import { LIMITS, VARIETY } from './weights.js';
import { composerOf, languageOf, normMovie, primaryArtist, singersOf } from './text.js';
import { rankCandidates, whyLabel } from './scoring.js';
import { diversify } from './diversify.js';
import { createIdentitySet, sameVariant, titleCore, variantCore, compareVersions, clusterSongs } from './identity.js';

const SHELF_KEYS = ['trending', 'latest', 'gana', 'nineties', 'twoThousands', 'melodies', 'love', 'sad', 'folk', 'instrumental'];

/** Run a promise but give up (resolve `fallback`) after `ms`, so one slow source never blocks the response. */
const withTimeout = (promise, ms, fallback) =>
  Promise.race([Promise.resolve(promise).catch(() => fallback), new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);

export class NotFoundError extends Error {
  constructor(message = 'Song not found') {
    super(message);
    this.statusCode = 404;
  }
}

/**
 * Builds "radio" batches: songs related to a seed song, scored, varied and free of repeats.
 *
 * @param {{
 *   manager: { getSong, searchTracks, getRecommendations, getHomeFeed },
 *   signals: { coListening, userSignals, songsByIds, enrichSong },
 *   cache?: LruCacheService, now?: () => number
 * }} deps
 */
export function createRelatedService({ manager, signals, cache = new LruCacheService(200, LIMITS.poolCacheSeconds), now = Date.now }) {
  const songsOnly = (found) => (Array.isArray(found) ? found : found?.songs || []);

  /** Gather and cache candidates (and the non-personal signals) for one seed song. */
  async function buildPool(seedId) {
    const cacheKey = `pool_${seedId}`;
    const cached = cache.get(cacheKey);
    if (cached) return { ...cached, cached: true };

    const seed = await manager.getSong(seedId);
    if (!seed) throw new NotFoundError();

    const singer = singersOf(seed)[0];
    const composer = composerOf(seed);
    const t = LIMITS.sourceTimeoutMs;

    const [recs, sameFilm, sameSinger, sameComposer, co, feed] = await Promise.all([
      withTimeout(manager.getRecommendations(seedId, 30), t, []),
      seed.album ? withTimeout(manager.searchTracks(seed.album, { type: 'songs' }), t, null) : null,
      singer ? withTimeout(manager.searchTracks(singer, { type: 'songs' }), t, null) : null,
      composer ? withTimeout(manager.searchTracks(seed.composer, { type: 'songs' }), t, null) : null,
      withTimeout(signals.coListening(seedId), t, new Map()),
      withTimeout(manager.getHomeFeed(), t, null),
    ]);

    const coSongs = await withTimeout(signals.songsByIds([...co.keys()]), t, []);
    const providerRecIds = new Set((recs || []).map((s) => s.id));

    // Which home-feed shelves each song sits on: a stand-in for genre / mood
    const shelves = new Map();
    const shelfSongs = [];
    for (const key of SHELF_KEYS) {
      for (const s of feed?.[key] || []) {
        if (!s?.id) continue;
        if (!shelves.has(s.id)) shelves.set(s.id, new Set());
        shelves.get(s.id).add(key);
        shelfSongs.push(s);
      }
    }
    if (!shelves.has(seed.id)) {
      // the seed may not be on a shelf by id: borrow shelves from a same-title song
      const twin = shelfSongs.find((s) => s.title === seed.title);
      if (twin) shelves.set(seed.id, shelves.get(twin.id));
    }

    // Merge and collapse duplicates: the same song under another id or singer order, and versions of a song (unplugged, remix ...),
    // are one candidate; the best copy is kept. The seed and its versions are never offered.
    const byId = new Map();
    const accepted = []; // one entry per song (or version of it); the best copy replaces a worse one
    const seedSet = createIdentitySet([seed]);
    const sources = { recommendations: 0, sameFilm: 0, sameSinger: 0, sameComposer: 0, coListening: 0, shelves: 0 };
    const isOriginal = (s) => titleCore(s) === variantCore(s);
    // original over a version first, then the shared rule: original album over a compilation, most played, best source
    const better = (a, b) => (isOriginal(a) !== isOriginal(b) ? isOriginal(a) : compareVersions(a, b) < 0);
    const take = (list, label) => {
      for (const s of list || []) {
        if (!s?.id || !s.title || s.id === seed.id || byId.has(s.id)) continue;
        if (seedSet.hasVariant(s)) continue;
        const twin = accepted.find((o) => sameVariant(o, s));
        if (twin) {
          if (better(s, twin)) { byId.delete(twin.id); byId.set(s.id, s); accepted[accepted.indexOf(twin)] = s; } // keep the best copy
          continue;
        }
        accepted.push(s);
        byId.set(s.id, s);
        sources[label]++;
      }
    };
    take(recs, 'recommendations');
    take(coSongs, 'coListening');
    take(songsOnly(sameFilm).filter((s) => normMovie(s.album) === normMovie(seed.album)), 'sameFilm');
    take(songsOnly(sameSinger), 'sameSinger');
    take(songsOnly(sameComposer), 'sameComposer');

    // Same-language shelf songs are the fallback when everything above is thin
    const seedLang = languageOf(seed);
    take(shelfSongs.filter((s) => !seedLang || !languageOf(s) || languageOf(s) === seedLang), 'shelves');

    const candidates = [...byId.values()].slice(0, LIMITS.candidatePool);
    const pool = { seed, candidates, coListening: co, providerRecIds, shelves, sources };
    cache.set(cacheKey, pool, LIMITS.poolCacheSeconds);
    signals.enrichSong?.(seed)?.catch?.(() => {}); // best effort, never blocks or fails the request
    return { ...pool, cached: false };
  }

  /**
   * @param {string} seedId
   * @param {{ limit?: number, exclude?: string[], userId?: string|null }} [opts]
   * @returns {Promise<{ items: object[], meta: object }>}
   */
  async function getRelated(seedId, { limit = LIMITS.defaultLimit, exclude = [], userId = null } = {}) {
    const n = Math.max(1, Math.min(LIMITS.maxLimit, Number(limit) || LIMITS.defaultLimit));
    const pool = await buildPool(seedId);

    const userCacheKey = userId ? `sig_${userId}` : null;
    let user = userCacheKey ? cache.get(userCacheKey) : null;
    if (userId && !user) {
      user = await withTimeout(signals.userSignals(userId, now()), LIMITS.sourceTimeoutMs, { liked: new Set(), recent: new Set(), skipped: new Set() });
      cache.set(userCacheKey, user, LIMITS.signalCacheSeconds);
    }

    const excluded = new Set([seedId, ...exclude]);
    // Excluded songs also keep out their look-alikes and versions (another id, another singer order, "Unplugged" ...)
    const blocked = createIdentitySet([pool.seed, ...pool.candidates.filter((s) => excluded.has(s.id))]);
    const ctx = { ...pool, liked: user?.liked, recent: user?.recent, skipped: user?.skipped };
    const ranked = rankCandidates(pool.seed, pool.candidates.filter((s) => !excluded.has(s.id) && !blocked.hasVariant(s)), ctx)
      .filter((r) => r.score >= 0); // penalised or wrong-language songs never enter a radio batch

    const picked = diversify(ranked, { limit: n, maxRun: VARIETY.maxRun, discoveryRatio: VARIETY.discoveryRatio });
    const canon = clusterSongs([pool.seed, ...pool.candidates]).canonicalOf;
    const items = picked.map((r) => ({ ...r.song, canonicalId: canon.get(r.song.id) || r.song.id, why: r.discovery ? 'Something different' : whyLabel(r.reasons), radioScore: r.score }));

    return {
      items,
      meta: {
        seedId,
        count: items.length,
        short: items.length < n, // fewer than asked: the catalogue ran dry
        cached: pool.cached,
        candidates: pool.candidates.length,
        sources: pool.sources,
        personalised: Boolean(userId),
      },
    };
  }

  return { getRelated, buildPool };
}
