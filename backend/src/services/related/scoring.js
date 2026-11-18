import { WEIGHTS } from './weights.js';
import { composerOf, languageOf, normMovie, singersOf, yearOf } from './text.js';

const eraBonus = (a, b, W) => {
  if (a == null || b == null) return 0;
  const d = Math.abs(a - b);
  if (d <= 1) return W.era.within1;
  if (d <= 3) return W.era.within3;
  if (d <= 7) return W.era.within7;
  if (d <= 12) return W.era.within12;
  return 0;
};

/**
 * Score one candidate against the seed song.
 *
 * @param {object} seed  the song being played
 * @param {object} cand  a candidate song
 * @param {{
 *   coListening?: Map<string, number>, providerRecIds?: Set<string>, shelves?: Map<string, Set<string>>,
 *   liked?: Set<string>, recent?: Set<string>, skipped?: Set<string>
 * }} [ctx] signals gathered outside this pure function
 * @returns {{ score: number, reasons: Record<string, number> }}
 */
export function scoreCandidate(seed, cand, ctx = {}, W = WEIGHTS) {
  const reasons = {};
  const add = (key, value) => {
    if (value) reasons[key] = Math.round(value * 1000) / 1000;
  };

  const seedComposer = composerOf(seed);
  if (seedComposer && seedComposer === composerOf(cand)) add('sameComposer', W.sameComposer);

  const seedSingers = singersOf(seed);
  if (seedSingers.length) {
    const candSingers = new Set(singersOf(cand));
    const shared = seedSingers.filter((n) => candSingers.has(n)).length;
    if (shared) add('sharedSinger', W.sharedSinger * (shared / seedSingers.length));
  }

  const seedMovie = normMovie(seed.movie || seed.album);
  if (seedMovie && seedMovie === normMovie(cand.movie || cand.album)) add('sameMovie', W.sameMovie);

  add('era', eraBonus(yearOf(seed.year), yearOf(cand.year), W));

  const seedLang = languageOf(seed);
  const candLang = languageOf(cand);
  if (seedLang && candLang) add(seedLang === candLang ? 'sameLanguage' : 'differentLanguage', seedLang === candLang ? W.sameLanguage : W.differentLanguage);

  const seedShelves = ctx.shelves?.get(seed.id);
  const candShelves = ctx.shelves?.get(cand.id);
  if (seedShelves && candShelves && [...candShelves].some((s) => seedShelves.has(s))) add('sameShelf', W.sameShelf);

  const co = ctx.coListening?.get(cand.id) || 0;
  if (co > 0) add('coListening', W.coListening * Math.min(1, Math.log(1 + co) / Math.log(1 + W.coListeningSaturation)));

  if (ctx.providerRecIds?.has(cand.id)) add('providerRecommendation', W.providerRecommendation);

  const plays = Number(cand.playCount) || 0;
  if (plays > 0) add('popularity', W.popularity * Math.min(1, Math.log10(1 + plays) / 7));

  if (ctx.liked?.has(cand.id)) add('liked', W.liked);
  if (ctx.recent?.has(cand.id)) add('recentlyPlayed', W.recentlyPlayed);
  if (ctx.skipped?.has(cand.id)) add('skippedRecently', W.skippedRecently);

  const score = Object.values(reasons).reduce((a, b) => a + b, 0);
  return { score: Math.round(score * 1000) / 1000, reasons };
}

/** Score and sort candidates (best first). Ties: more popular first, then id, so results are stable. */
export function rankCandidates(seed, candidates, ctx = {}, W = WEIGHTS) {
  return candidates
    .map((song) => ({ song, ...scoreCandidate(seed, song, ctx, W) }))
    .sort((a, b) => b.score - a.score || (Number(b.song.playCount) || 0) - (Number(a.song.playCount) || 0) || String(a.song.id).localeCompare(String(b.song.id)));
}

const LABELS = [
  ['sameComposer', 'Same music director'],
  ['sameMovie', 'From the same film'],
  ['sharedSinger', 'Same singer'],
  ['coListening', 'Listened together'],
  ['providerRecommendation', 'Recommended for you'],
  ['sameShelf', 'Similar mood'],
  ['era', 'From the same era'],
];

/** Short human label for the strongest reason, for the queue UI ("Same singer"). */
export function whyLabel(reasons) {
  for (const [key, label] of LABELS) if (reasons[key] > 0) return label;
  return 'Popular pick';
}
