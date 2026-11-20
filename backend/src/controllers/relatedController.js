import { z } from 'zod';
import { musicService } from '../services/music/providerManager.js';
import { videoLookup } from '../services/music/videoLookup.js';
import { createRelatedService } from '../services/related/relatedService.js';
import { getSignalsStore } from '../services/related/signalsStore.js';
import { LIMITS } from '../services/related/weights.js';
import { loadMemory } from '../services/noRepeat/memory.js';
import { getBlocksStore } from '../services/noRepeat/blocksStore.js';
import { getQueueStore } from '../services/queueState/store.js';
import { NO_REPEAT } from '../services/noRepeat/config.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(LIMITS.maxLimit).default(LIMITS.defaultLimit),
  exclude: z.string().max(8000).optional(),
  // no-repeat controls (docs/NO_REPEAT.md): allowRepeats = the listener agreed to repeats; wide = "play something different"; context = where the radio came from
  allowRepeats: z.enum(['0', '1', 'true', 'false']).optional(),
  wide: z.enum(['0', '1', 'true', 'false']).optional(),
  context: z.enum(['radio', 'taste', 'liked']).default('radio'),
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
  // what this listener has already heard (saved session memory, last 200 plays, cool-downs, blocks): read per request from whichever database is live
  loadMemory: (opts) => loadMemory({ ...opts, signals: getSignalsStore(), queueStore: getQueueStore(), blocksStore: getBlocksStore() }),
});

export const getRelatedSongs = async (req, res, next) => {
  try {
    const q = querySchema.safeParse(req.query);
    if (!q.success) return res.status(400).json({ success: false, message: 'Invalid query' });
    const exclude = (q.data.exclude || '').split(',').map((s) => s.trim()).filter((s) => s && s.length <= 100).slice(0, NO_REPEAT.maxExclude);

    const { items, meta } = await service.getRelated(req.params.id, {
      limit: q.data.limit, exclude, userId: req.user?.id ?? null,
      allowRepeats: flag(q.data.allowRepeats), wide: flag(q.data.wide), context: q.data.context,
    });
    // videoId from the curated map / cache only (no network), like search and home
    const withVideo = videoLookup.attach(items.map(({ why, radioScore, ...song }) => song));
    const merged = withVideo.map((song, i) => ({ ...song, why: items[i].why, ...(items[i].repeat ? { repeat: true } : {}) }));
    res.json({ success: true, items: merged, meta });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ success: false, message: 'Song not found' });
    next(err);
  }
};
