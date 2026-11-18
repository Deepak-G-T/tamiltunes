import { LruCacheService } from '../cacheService.js';
import { SPEED_DIAL } from './config.js';
import { isCountedPlay } from './ranking.js';
import { assembleSpeedDial } from './assemble.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.statusCode = status;
  }
}

const hasStream = (s) => Boolean(s?.id && s.title && (s.streamUrl || s.videoId));

/**
 * @param {{
 *   store: ReturnType<import('./store.js').getSpeedDialStore>,
 *   songs: { byIds: (ids: string[]) => Promise<object[]>, upsert: (song: object) => Promise<unknown> },
 *   manager: { getHomeFeed: () => Promise<object> },
 *   cache?: LruCacheService, now?: () => number, cfg?: typeof SPEED_DIAL
 * }} deps
 */
export function createSpeedDialService({ store, songs, manager, cache = new LruCacheService(500, SPEED_DIAL.cacheSeconds), now = Date.now, cfg = SPEED_DIAL }) {
  const key = (userId) => `sd_${userId}`;
  const invalidate = (userId) => cache.delete(key(userId));

  /** Popular Tamil songs to fill empty slots: trending first, then melodies, gaana, 90s, 2000s and folk. */
  async function suggestions() {
    try {
      const feed = await manager.getHomeFeed();
      return ['trending', 'melodies', 'gana', 'nineties', 'twoThousands', 'folk'].flatMap((k) => feed?.[k] || []).filter(hasStream);
    } catch {
      return [];
    }
  }

  async function compute(userId) {
    const [scores, overrides, sugg] = await Promise.all([store.scoreSongs(userId, now(), cfg), store.listOverrides(userId), suggestions()]);
    const ids = [...new Set([...scores.map((s) => s.songId), ...overrides.filter((o) => o.isPinned && !o.isHidden).map((o) => o.songId)])];
    const rows = ids.length ? await songs.byIds(ids) : [];
    const map = new Map(rows.map((r) => [r.id, r]));
    return assembleSpeedDial({ scores, overrides, songs: map, suggestions: sugg }, cfg);
  }

  async function get(userId) {
    const hit = cache.get(key(userId));
    if (hit) return { items: hit, cached: true };
    const items = await compute(userId);
    cache.set(key(userId), items, cfg.cacheSeconds);
    return { items, cached: false };
  }

  /**
   * Record one play report. The server applies the rule itself, so a misbehaving client cannot inflate counts:
   * a report below 30 s / 50% is only kept when it is an early skip (>= minSkipSeconds).
   * @returns {Promise<{ recorded: boolean, counted: boolean, reason?: string }>}
   */
  async function recordEvent(userId, e) {
    const counted = isCountedPlay(e, cfg);
    const skipped = !counted && e.skippedAtSec != null;
    if (!counted && !skipped) return { recorded: false, counted: false, reason: 'below-threshold' };
    if (skipped && (e.listenedSec ?? 0) < cfg.minSkipSeconds) return { recorded: false, counted: false, reason: 'too-short' };
    if (counted && e.song) await songs.upsert(e.song); // metadata for the tile; only for real plays
    await store.upsertPlayEvent(userId, { ...e, skippedAtSec: counted ? null : e.skippedAtSec });
    invalidate(userId);
    return { recorded: true, counted };
  }

  async function ensureSong(meta) {
    if (meta?.id && meta.title) await songs.upsert(meta);
  }

  async function currentItem(userId, songId) {
    return (await compute(userId)).find((i) => i.id === songId) || null;
  }

  async function pin(userId, { songId, slot, song }) {
    if (song) await ensureSong({ ...song, id: songId });
    if (!(await songs.byIds([songId])).length) {
      // not in our songs table yet (e.g. a suggested song): take its details from what is on screen
      const shown = await currentItem(userId, songId);
      if (!shown) throw new HttpError(404, 'Song not found');
      await ensureSong(shown);
    }
    const shownCount = (await compute(userId)).filter((i) => i.id !== songId).length;
    const target = Number.isInteger(slot) ? slot : Math.min(shownCount, cfg.slots - 1);
    await store.upsertOverride(userId, songId, { isPinned: true, isHidden: false, slotPosition: Math.min(Math.max(target, 0), cfg.slots - 1) });
    invalidate(userId);
  }

  async function unpin(userId, songId) {
    await store.upsertOverride(userId, songId, { isPinned: false, slotPosition: null });
    invalidate(userId);
  }

  async function hide(userId, songId) {
    await store.upsertOverride(userId, songId, { isHidden: true, isPinned: false, slotPosition: null });
    invalidate(userId);
  }

  /**
   * Save a drag-and-drop result. Dropping a tile pins it at its new slot. With `moved`, that tile is pinned and so are
   * any already-pinned tiles the drop shifted (so they keep their place in the order the user sees); unpinned tiles keep
   * following the ranking. Without `moved`, every tile whose position changed is pinned.
   */
  async function setOrder(userId, order, moved = null) {
    const current = await compute(userId);
    const ids = current.map((i) => i.id);
    const same = order.length === ids.length && new Set(order).size === order.length && order.every((id) => ids.includes(id));
    if (!same) throw new HttpError(400, 'order must list exactly the songs currently shown');
    if (moved && !order.includes(moved)) throw new HttpError(400, 'moved song is not in order');
    const wasPinned = new Set(current.filter((i) => i.pinned).map((i) => i.id));
    const changes = order.map((id, slot) => ({ id, slot })).filter(({ id, slot }) => ids[slot] !== id && (!moved || id === moved || wasPinned.has(id)));
    for (const { id } of changes) await ensureSong(current.find((i) => i.id === id)); // a moved suggestion needs a song row to live in
    await store.upsertOverrides(userId, changes.map(({ id, slot }) => ({ songId: id, patch: { isPinned: true, isHidden: false, slotPosition: slot } })));
    invalidate(userId);
    return changes.length;
  }

  async function reset(userId) {
    await store.clearOverrides(userId);
    invalidate(userId);
  }

  /** A guest signed in: replay their locally counted plays as a few events each. Safe to run twice (stable playIds). */
  async function importGuest(userId, list) {
    let events = 0;
    const t = now();
    for (const g of list.slice(0, cfg.importMaxSongs)) {
      await ensureSong(g.song);
      const when = Math.min(t, Math.max(t - cfg.windowDays * 86400e3, new Date(g.lastAt).getTime() || t));
      for (let k = 0; k < Math.min(g.count, cfg.importMaxPlaysPerSong); k++) {
        await store.upsertPlayEvent(userId, {
          songId: g.song.id, playId: `import:${g.song.id}:${k}`, playedAt: new Date(when), listenedSec: cfg.countedAfterSeconds,
          durationSec: g.song.duration || 0, completed: false, source: 'guest-import',
        });
        events++;
      }
    }
    invalidate(userId);
    return events;
  }

  return { get, compute, recordEvent, pin, unpin, hide, setOrder, reset, importGuest, invalidate };
}
