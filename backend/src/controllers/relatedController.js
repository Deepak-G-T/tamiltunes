import { z } from 'zod';
import { musicService } from '../services/music/providerManager.js';
import { videoLookup } from '../services/music/videoLookup.js';
import { createRelatedService } from '../services/related/relatedService.js';
import { getSignalsStore } from '../services/related/signalsStore.js';
import { LIMITS } from '../services/related/weights.js';
import { loadMemory } from '../services/noRepeat/memory.js';
import { getBlocksStore } from '../services/noRepeat/blocksStore.js';
import { NO_REPEAT } from '../services/noRepeat/config.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(LIMITS.maxLimit).default(LIMITS.defaultLimit),
  exclude: z.string().max(8000).optional(), // ids already in the queue (the playing song, what is next)
  recent: z.string().max(3000).optional(),  // the last songs played, newest first: the one soft preference (docs/NO_REPEAT.md)
  wide: z.enum(['0', '1', 'true', 'false']).optional(), // search wider (same language, trending) even when enough songs remain
});
const flag = (v) => v === '1' || v === 'true';

// Resolved on every call so it follows the live database connection (Prisma vs in-memory),
// which is not known yet when this module loads.
const signals = {
  coListening: (...a) => getSignalsStore().coListening(...a),
  userSignals: (...a) => getSignalsStore().userSignals(...a),
  songsByIds: (...a) => getSignalsStore().songsByIds(...a),
  enrichSong: (...a) => getSignalsStore().enrichSong(...a),
};

// One shared service so the candidate pool cache is shared across requests
const service = createRelatedService({
  manager: musicService,
  signals,
  // the only listener memory: songs they chose "Don't recommend this" for, read per request from whichever database is live
  loadMemory: (opts) => loadMemory({ ...opts, blocksStore: getBlocksStore() }),
});

export const getRelatedSongs = async (req, res, next) => {
  try {
    const q = querySchema.safeParse(req.query);
    if (!q.success) return res.status(400).json({ success: false, message: 'Invalid query' });
    const ids = (text, max) => (text || '').split(',').map((s) => s.trim()).filter((s) => s && s.length <= 100).slice(0, max);
    const exclude = ids(q.data.exclude, NO_REPEAT.maxExclude);
    const recent = ids(q.data.recent, NO_REPEAT.maxRecent);

    const { items, meta } = await service.getRelated(req.params.id, {
      limit: q.data.limit, exclude, recent, userId: req.user?.id ?? null, wide: flag(q.data.wide),
    });
    // videoId from the curated map / cache only (no network), like search and home
    const withVideo = videoLookup.attach(items.map(({ why, radioScore, ...song }) => song));
    const merged = withVideo.map((song, i) => ({ ...song, why: items[i].why }));
    res.json({ success: true, items: merged, meta });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ success: false, message: 'Song not found' });
    next(err);
  }
};
