// A small seeded random generator: the same seed always gives the same sequence, so a person's home page
// keeps its order for the whole day (refresh, Back button) and looks fresh tomorrow.

/** Turn text into a 32-bit number (xmur3). */
export function hashSeed(text) {
  let h = 1779033703 ^ String(text).length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32: returns a function that gives numbers in [0, 1). */
export function rngFrom(seedText) {
  let a = hashSeed(seedText);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The day used in the seed (UTC), e.g. "2026-11-18". */
export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/**
 * Weighted random order without replacement (Efraimidis-Spirakis): heavier items tend to come first, but not always.
 * @param {{ item: any, weight: number }[]} entries
 */
export function weightedOrder(entries, rng) {
  return entries
    .map((e) => ({ e, k: Math.pow(Math.max(rng(), 1e-12), 1 / Math.max(e.weight, 1e-6)) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.e.item);
}
