import { z } from 'zod';
import { musicService } from '../services/music/providerManager.js';
import { videoLookup } from '../services/music/videoLookup.js';
import { createRelatedService } from '../services/related/relatedService.js';
import { getSignalsStore } from '../services/related/signalsStore.js';
import { LIMITS } from '../services/related/weights.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(LIMITS.maxLimit).default(LIMITS.defaultLimit),
  exclude: z.string().max(8000).optional(),
});

// Resolved on every call so it follows the live database connection (Prisma vs in-memory),
// which is not known yet when this module loads.
const signals = {
  coListening: (...a) => getSignalsStore().coListening(...a),
  userSignals: (...a) => getSignalsStore().userSignals(...a),
  songsByIds: (...a) => getSignalsStore().songsByIds(...a),
  enrichSong: (...a) => getSignalsStore().enrichSong(...a),
};

// One shared service so the candidate pool cache is shared across requests
const service = createRelatedService({ manager: musicService, signals });

export const getRelatedSongs = async (req, res, next) => {
  try {
    const q = querySchema.safeParse(req.query);
    if (!q.success) return res.status(400).json({ success: false, message: 'Invalid query' });
    const exclude = (q.data.exclude || '').split(',').map((s) => s.trim()).filter((s) => s && s.length <= 100).slice(0, 200);

    const { items, meta } = await service.getRelated(req.params.id, { limit: q.data.limit, exclude, userId: req.user?.id ?? null });
    // videoId from the curated map / cache only (no network), like search and home
    const withVideo = videoLookup.attach(items.map(({ why, radioScore, ...song }) => song));
    const merged = withVideo.map((song, i) => ({ ...song, why: items[i].why }));
    res.json({ success: true, items: merged, meta });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ success: false, message: 'Song not found' });
    next(err);
  }
};
