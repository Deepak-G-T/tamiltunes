import { z } from 'zod';
import { getWrappedStore } from '../services/wrapped/store.js';
import { buildWrapped, WRAPPED } from '../services/wrapped/build.js';

const FIRST_YEAR = 2025; // the app did not exist before
const cache = new Map(); // `${userId}|${year}|${tz}` -> { at, value }: a year of history is a heavy query, and the answer only changes as songs are played
const TTL_MS = 5 * 60000;
const MAX_CACHE = 500;

const querySchema = z.object({
  year: z.coerce.number().int().min(FIRST_YEAR).max(2100).optional(),
  tz: z.coerce.number().int().min(-840).max(840).optional(), // the phone's offset from UTC in minutes (India = 330)
});

export const clearWrappedCache = () => cache.clear();

/** The year runs from 1 Jan 00:00 to 1 Jan next year in the person's own time zone. */
export const yearBounds = (year, tzMinutes) => [new Date(Date.UTC(year, 0, 1) - tzMinutes * 60000), new Date(Date.UTC(year + 1, 0, 1) - tzMinutes * 60000)];

export async function getWrapped(req, res, next) {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Invalid year or time zone.' });
    const tz = parsed.data.tz ?? WRAPPED.defaultTzMinutes;
    const now = new Date(Date.now() + tz * 60000);
    const thisYear = now.getUTCFullYear();
    const year = parsed.data.year ?? thisYear;
    if (year > thisYear) return res.status(400).json({ success: false, message: 'That year has not started.' });
    const key = `${req.user.id}|${year}|${tz}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return res.json({ success: true, wrapped: hit.value });
    const [from, to] = yearBounds(year, tz);
    const { events, songs } = await getWrappedStore().yearEvents(req.user.id, from, to);
    const value = buildWrapped(events, songs, { year, tzMinutes: tz });
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), value });
    res.json({ success: true, wrapped: value });
  } catch (err) { next(err); }
}
