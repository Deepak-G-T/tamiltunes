/**
 * Builds the home page sections from candidate pools. Pure (no network, no database): easy to test.
 *
 * Sections are filled in priority order from ONE shared "already shown" set, so a song appears once on the page.
 * Each section keeps variety (at most 2 songs per movie, 3 per artist), is shuffled with a seeded weighted random
 * (stable for a person for a day), pushes down songs played 3+ times this week and lifts songs never played.
 * A section that cannot reach MIN_ITEMS unique songs is hidden instead of repeating songs.
 */
import { createSeen, canonMovie, primaryArtist } from './normalize.js';
import { collapseDuplicates } from '../related/identity.js';
import { rngFrom, weightedOrder } from './seed.js';

export const MIN_ITEMS = 8;
export const MAX_ITEMS = 12;
export const MAX_PER_MOVIE = 2;
export const MAX_PER_ARTIST = 3;
export const ROTATION_PLAYS = 3; // played this many times this week: belongs in Speed Dial, not in discovery shelves

/** Weight of a candidate: ranked earlier = heavier; unplayed boosted; played 3+ times this week pushed down. */
export function candidateWeight(index, total, weekPlays = 0) {
  const rank = 1 - index / Math.max(total, 1); // 1 (top) .. ~0
  let w = 0.25 + rank;
  if (weekPlays === 0) w *= 1.5;
  else if (weekPlays >= ROTATION_PLAYS) w *= 0.15;
  return w;
}

/** Pick songs from `candidates` honouring the caps, in weighted random order. Does not touch `seen`. */
export function pickSection(candidates, { seen, rng, weekPlays = new Map(), max = MAX_ITEMS, caps = true }) {
  const local = createSeen(); // also keeps look-alikes inside this section apart
  const pool = collapseDuplicates(candidates.filter((s) => s?.id && !seen.has(s))); // one copy per song: the original release, not a compilation
  const ordered = weightedOrder(pool.map((song, i) => ({ item: song, weight: candidateWeight(i, pool.length, weekPlays.get(song.id) || 0) })), rng);
  const perMovie = new Map();
  const perArtist = new Map();
  const picked = [];
  for (const song of ordered) {
    if (picked.length >= max) break;
    if (local.has(song)) continue;
    const movie = canonMovie(song);
    const artist = primaryArtist(song);
    if (caps) {
      if (movie && (perMovie.get(movie) || 0) >= MAX_PER_MOVIE) continue;
      if (artist && (perArtist.get(artist) || 0) >= MAX_PER_ARTIST) continue;
    }
    local.add(song);
    picked.push(song);
    if (movie) perMovie.set(movie, (perMovie.get(movie) || 0) + 1);
    if (artist) perArtist.set(artist, (perArtist.get(artist) || 0) + 1);
  }
  return picked;
}

/**
 * @param {{ id: string, title: string, kind?: string, pool: object[], min?: number, max?: number, caps?: boolean }[]} plan  in priority order
 * @param {{ exclude?: object[], seed: string, weekPlays?: Map<string, number>, hero?: boolean }} opts
 * @returns {{ hero: object | null, sections: { id: string, title: string, kind: string, items: object[] }[], hidden: string[] }}
 */
export function assembleHome(plan, { exclude = [], seed, weekPlays = new Map(), hero = true }) {
  const seen = createSeen(exclude); // Speed Dial songs (and anything else already on the page) never appear again
  const sections = [];
  const hidden = [];
  let heroSong = null;

  for (const spec of plan) {
    const rng = rngFrom(`${seed}:${spec.id}`); // each section has its own stream: changing one never reshuffles another
    if (spec.kind && spec.kind !== 'songs') { // artist / album cards: not songs, nothing to repeat
      if (spec.pool?.length) sections.push({ id: spec.id, title: spec.title, kind: spec.kind, items: spec.pool });
      else hidden.push(spec.id);
      continue;
    }
    if (hero && !heroSong && spec.heroFrom) {
      heroSong = pickSection(spec.pool, { seen, rng: rngFrom(`${seed}:hero`), weekPlays, max: 1, caps: false })[0] || null;
      if (heroSong) seen.add(heroSong);
    }
    const min = spec.min ?? MIN_ITEMS;
    const items = pickSection(spec.pool || [], { seen, rng, weekPlays, max: spec.max ?? MAX_ITEMS, caps: spec.caps !== false });
    if (items.length < min) { hidden.push(spec.id); continue; } // hide rather than repeat or show a thin shelf
    for (const s of items) seen.add(s);
    sections.push({ id: spec.id, title: spec.title, ...(spec.subtitle ? { subtitle: spec.subtitle } : {}), kind: 'songs', items });
  }
  return { hero: heroSong, sections, hidden };
}
