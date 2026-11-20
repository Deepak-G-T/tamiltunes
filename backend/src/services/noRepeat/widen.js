/**
 * When fewer than NO_REPEAT.minFreshCandidates fresh songs are left, search wider instead of reusing old songs. One step at a time, in this order
 * (NO_REPEAT.widenSteps): same music director, same era, same language, trending in the language. Each step only ADDS candidates; the caller filters them
 * with the same no-repeat rules and stops as soon as enough fresh songs exist.
 */
import { composerOf, languageOf } from '../related/text.js';

const ERA_SHELVES = (year) => (year && year < 2000 ? ['nineties', 'melodies'] : year && year < 2010 ? ['twoThousands', 'melodies'] : ['latest', 'trending']);
const songsOnly = (found) => (Array.isArray(found) ? found : found?.songs || []);
const sameLanguage = (seed, s) => { const a = languageOf(seed); const b = languageOf(s); return !a || !b || a === b; };

/**
 * @param {'composer'|'era'|'language'|'trending'} step
 * @param {{ seed: object, manager: { searchTracks: Function }, feed: object|null, withTimeout: Function, timeoutMs: number }} ctx
 * @returns {Promise<object[]>}
 */
export async function widenCandidates(step, { seed, manager, feed, withTimeout, timeoutMs }) {
  const shelf = (keys) => keys.flatMap((k) => feed?.[k] || []).filter((s) => s?.id && sameLanguage(seed, s));
  if (step === 'composer') {
    const composer = composerOf(seed);
    if (!composer) return [];
    const [a, b] = await Promise.all([
      withTimeout(manager.searchTracks(composer, { type: 'songs' }), timeoutMs, null),
      withTimeout(manager.searchTracks(`${composer} hits`, { type: 'songs' }), timeoutMs, null),
    ]);
    return [...songsOnly(a), ...songsOnly(b)].filter((s) => s?.id && sameLanguage(seed, s));
  }
  if (step === 'era') {
    const year = parseInt(seed.year, 10);
    return shelf(ERA_SHELVES(Number.isInteger(year) ? year : 0));
  }
  if (step === 'language') return shelf(['trending', 'latest', 'gana', 'nineties', 'twoThousands', 'melodies', 'love', 'sad', 'folk', 'instrumental']);
  if (step === 'trending') return shelf(['trending']);
  return [];
}
