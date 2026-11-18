import { VARIETY } from './weights.js';
import { normMovie, primaryArtist } from './text.js';

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
export function diversify(ranked, { limit, maxRun = VARIETY.maxRun, discoveryRatio = VARIETY.discoveryRatio, similarMinScore = VARIETY.similarMinScore }) {
  const seen = new Set();
  const unique = ranked.filter((r) => (seen.has(r.song.id) ? false : (seen.add(r.song.id), true)));

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

  // Break up long runs of the same artist / album by pulling the next acceptable song forward
  const out = [];
  const rest = [...arranged];
  const breaksRun = (item) => {
    if (out.length < maxRun) return false;
    const tail = out.slice(-maxRun);
    const a = artistKey(item);
    const b = albumKey(item);
    return (a && tail.every((t) => artistKey(t) === a)) || (b && tail.every((t) => albumKey(t) === b));
  };
  while (rest.length) {
    const idx = rest.findIndex((item) => !breaksRun(item));
    out.push(...rest.splice(idx === -1 ? 0 : idx, 1)); // nothing acceptable left: keep order
  }
  return out;
}
