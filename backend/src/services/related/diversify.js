import { VARIETY } from './weights.js';
import { normMovie, primaryArtist } from './text.js';

// reasons that are about the song itself, not just "the same person sings it"
const STRONG_REASONS = ['sameComposer', 'sameMovie', 'coListening', 'providerRecommendation', 'sameShelf'];
const singerOnly = (item) => item.reasons?.sharedSinger > 0 && !STRONG_REASONS.some((k) => item.reasons[k] > 0);

const artistKey = (item) => primaryArtist(item.song);
const albumKey = (item) => normMovie(item.song.movie || item.song.album);

/**
 * Turn a ranked list into a varied batch:
 *  - about `discoveryRatio` of the batch is "discovery" (less similar), spread evenly through it
 *  - never more than `maxRun` songs in a row from the same artist or the same album
 *
 * @param {{ song: object, score: number }[]} ranked  best first, penalised songs (score < 0) already removed
 * @param {{ limit: number, maxRun?: number, discoveryRatio?: number, similarMinScore?: number }} opts
 */
export function diversify(ranked, {
  limit, maxRun = VARIETY.maxRun, discoveryRatio = VARIETY.discoveryRatio, similarMinScore = VARIETY.similarMinScore,
  maxPerMovie = VARIETY.maxPerMovie, movieWindow = VARIETY.movieWindow, maxSingerOnlyShare = VARIETY.maxSingerOnlyShare,
}) {
  const seen = new Set();
  let singerOnlyLeft = Math.max(1, Math.ceil(limit * maxSingerOnlyShare));
  const unique = ranked.filter((r) => {
    if (seen.has(r.song.id)) return false;
    if (singerOnly(r)) { if (singerOnlyLeft <= 0) return false; singerOnlyLeft--; } // "same singer" alone does not fill a batch
    seen.add(r.song.id);
    return true;
  });

  const similar = unique.filter((r) => r.score >= similarMinScore);
  // Discovery: decent but less similar picks, most popular first
  const discovery = unique
    .filter((r) => r.score < similarMinScore)
    .sort((a, b) => (Number(b.song.playCount) || 0) - (Number(a.song.playCount) || 0) || b.score - a.score);

  const total = Math.min(limit, unique.length);
  let dCount = Math.min(Math.round(total * discoveryRatio), discovery.length);
  let sCount = Math.min(total - dCount, similar.length);
  dCount = Math.min(total - sCount, discovery.length); // not enough similar songs: fill with discovery
  sCount = Math.min(total - dCount, similar.length);

  const picksSimilar = similar.slice(0, sCount);
  const picksDiscovery = discovery.slice(0, dCount);

  // Evenly spread discovery slots, fill the rest with similar songs in rank order
  const slots = new Set();
  for (let k = 0; k < dCount; k++) slots.add(Math.min(total - 1, Math.floor(((k + 1) * total) / (dCount + 1))));
  const arranged = [];
  let si = 0;
  let di = 0;
  for (let i = 0; i < total; i++) {
    if (slots.has(i) && di < picksDiscovery.length) arranged.push({ ...picksDiscovery[di++], discovery: true });
    else if (si < picksSimilar.length) arranged.push(picksSimilar[si++]);
    else if (di < picksDiscovery.length) arranged.push({ ...picksDiscovery[di++], discovery: true });
  }

  // Break up long runs of the same artist / album by pulling the next acceptable song forward, and keep at most
  // `maxPerMovie` songs from one film within any `movieWindow` songs
  const out = [];
  const breaksRun = (item) => {
    if (out.length < maxRun) return false;
    const tail = out.slice(-maxRun);
    const a = artistKey(item);
    const b = albumKey(item);
    return (a && tail.every((t) => artistKey(t) === a)) || (b && tail.every((t) => albumKey(t) === b));
  };
  const tooManyFromFilm = (item) => {
    const b = albumKey(item);
    return Boolean(b) && out.slice(-(movieWindow - 1)).filter((t) => albumKey(t) === b).length >= maxPerMovie;
  };
  const acceptable = (item) => !breaksRun(item) && !tooManyFromFilm(item);
  const rest = [...arranged];
  while (rest.length) {
    const idx = rest.findIndex(acceptable);
    if (idx === -1) break; // nothing acceptable left: those songs are dropped, never repeated
    out.push(...rest.splice(idx, 1));
  }
  // Dropped songs leave a gap: top the batch up from the remaining ranked songs, under the same rules
  if (out.length < limit) {
    const used = new Set(out.map((o) => o.song.id));
    for (const item of unique) {
      if (out.length >= limit) break;
      if (!used.has(item.song.id) && acceptable(item)) { out.push(item); used.add(item.song.id); }
    }
  }
  return out;
}
