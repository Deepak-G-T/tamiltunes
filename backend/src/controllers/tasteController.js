import { z } from 'zod';
import { getTasteStore } from '../services/taste/store.js';
import { ARTIST_OPTIONS, COMPOSER_OPTIONS, ERA_OPTIONS, TASTE_LIMITS, eraIds } from '../services/taste/options.js';
import { clearHomeCache } from '../services/homeFeed/homeFeedService.js';

// Someone with this much listening already has a real taste: do not interrupt them (they can still open the picker from Settings)
export const ONBOARDING_SKIP_PLAYS = 20;

const pickFrom = (allowed, max) => z.array(z.string().min(1).max(60)).max(max).refine((list) => list.every((v) => allowed.includes(v)), 'Unknown choice').refine((list) => new Set(list).size === list.length, 'Duplicate choice');

export const tasteSchema = z.object({
  artists: pickFrom(ARTIST_OPTIONS, TASTE_LIMITS.artists).default([]),
  composers: pickFrom(COMPOSER_OPTIONS, TASTE_LIMITS.composers).default([]),
  eras: pickFrom(eraIds(), TASTE_LIMITS.eras).default([]),
  skipped: z.boolean().optional(),
}).strict();

/** GET /api/me/taste: the saved picks, the choices to show, and whether to show the picker now. */
export async function getTaste(req, res, next) {
  try {
    const store = getTasteStore();
    const taste = await store.get(req.user.id);
    const shouldOnboard = !taste && (await store.playCount(req.user.id)) < ONBOARDING_SKIP_PLAYS;
    res.json({ success: true, taste, shouldOnboard, options: { artists: ARTIST_OPTIONS, composers: COMPOSER_OPTIONS, eras: ERA_OPTIONS, limits: TASTE_LIMITS } });
  } catch (err) { next(err); }
}

/** PUT /api/me/taste: save the picks ("Skip for now" saves nothing but remembers not to ask again). */
export async function putTaste(req, res, next) {
  try {
    const { artists, composers, eras, skipped } = req.body;
    const empty = !artists.length && !composers.length && !eras.length;
    const taste = await getTasteStore().put(req.user.id, { artists, composers, eras, skipped: skipped ?? empty });
    clearHomeCache(); // the next Home draw uses the new picks
    res.json({ success: true, taste });
  } catch (err) { next(err); }
}

/** DELETE /api/me/taste: forget the picks (and ask again next time). */
export async function deleteTaste(req, res, next) {
  try {
    await getTasteStore().remove(req.user.id);
    clearHomeCache();
    res.json({ success: true });
  } catch (err) { next(err); }
}
