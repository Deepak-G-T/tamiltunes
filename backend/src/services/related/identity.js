/**
 * "Is this the same song?" for the radio queue. The same song comes back under different ids, covers and singer order, and
 * versions of one song (unplugged, remix, reprise ...) must not fill a radio block either. Two levels:
 *   songFingerprint  the same song (a re-upload, a duplicate id, the singers listed in another order)
 *   variantKey       the same song OR one of its versions (unplugged, acoustic, remix, reprise, lofi, slowed, reverb, instrumental, karaoke, cover, male/female version, 8D)
 * Level 3 (isSameSong) is fuzzy: spelling variants of a Tanglish title ("Annul Maelae" / "Annul Melae"), the same recording on a
 * compilation album, a missing film name. It needs a matching duration (within 2 s), a shared artist or music director and a
 * title that sounds the same, and an equal ISRC / track id / audio hash settles it at once.
 * A copy of this file lives in backend/src/services/related/identity.js (the server collapses duplicates with the same rules);
 * both are tested with the same examples.
 */

const VERSION_WORDS = ['male version', 'female version', 'slowed and reverb', 'unplugged', 'acoustic', 'remixed', 'remix', 'reprise', 'lofi', 'lo fi', 'slowed', 'reverb', 'instrumental', 'karaoke', 'cover', '8d', 'version'];
const VERSION_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${VERSION_WORDS.map((w) => w.replace(/ /g, '\\s+')).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
const BRACKETS = /[(\[{][^)\]}]*[)\]}]/g;

const base = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\u2019\u2018`\u00b4]/g, "'").replace(/lo-fi/g, 'lofi');
const squash = (s) => s.replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').replace(/\s+/g, ' ').trim();

/** The title with bracketed text and "- From ..." removed, but bracketed VERSION words kept ("(Unplugged)" still makes it a different version). */
export function titleCore(song) {
  let t = base(song?.title).replace(/\s[-\u2013\u2014]\s*from\b.*$/, ' ');
  t = t.replace(BRACKETS, (group) => ` ${(group.match(VERSION_RE) || []).join(' ')} `);
  return squash(t);
}

/** The same title also without version words. */
export const variantCore = (song) => squash(titleCore(song).replace(VERSION_RE, ' '));

export const movieOf = (song) => squash(base(song?.album ?? song?.movie ?? '').replace(BRACKETS, ' ').replace(/original motion picture soundtrack|original soundtrack|motion picture|soundtrack|\bost\b/g, ' '));

const singerList = (song) => {
  const raw = Array.isArray(song?.singers) ? song.singers.join(',') : String(song?.singers || song?.artist || '');
  return [...new Set(raw.split(/,|&|\/|;|\bfeat\.?\b|\bft\.?\b|\band\b|\bwith\b/i).map((x) => squash(base(x))).filter(Boolean))].sort();
};
/** The first artist, for "not too many in a row". */
export const primaryArtist = (song) => singerList(song)[0] || '';

/** Same song: same cleaned title, singers sorted so their order does not matter. */
export const songFingerprint = (song) => `${titleCore(song)}|${singerList(song).join(',')}`;
/** Same song or a version of it. */
export const variantKey = (song) => `${variantCore(song)}|${singerList(song).join(',')}`;


// ---------------------------------------------------------------- fuzzy identity (phonetic Tanglish titles)

const TAMIL_CONSONANTS = { '\u0b95': 'k', '\u0b99': 'ng', '\u0b9a': 'ch', '\u0b9c': 'j', '\u0b9e': 'nj', '\u0b9f': 't', '\u0ba3': 'n', '\u0ba4': 'th', '\u0ba8': 'n', '\u0baa': 'p', '\u0bae': 'm', '\u0baf': 'y', '\u0bb0': 'r', '\u0bb2': 'l', '\u0bb5': 'v', '\u0bb4': 'zh', '\u0bb3': 'l', '\u0bb1': 'r', '\u0ba9': 'n', '\u0bb7': 'sh', '\u0bb8': 's', '\u0bb9': 'h' };
const TAMIL_VOWELS = { '\u0b85': 'a', '\u0b86': 'aa', '\u0b87': 'i', '\u0b88': 'ee', '\u0b89': 'u', '\u0b8a': 'oo', '\u0b8e': 'e', '\u0b8f': 'ae', '\u0b90': 'ai', '\u0b92': 'o', '\u0b93': 'oo', '\u0b94': 'au' };
const TAMIL_SIGNS = { '\u0bbe': 'aa', '\u0bbf': 'i', '\u0bc0': 'ee', '\u0bc1': 'u', '\u0bc2': 'oo', '\u0bc6': 'e', '\u0bc7': 'ae', '\u0bc8': 'ai', '\u0bca': 'o', '\u0bcb': 'oo', '\u0bcc': 'au' };
const VIRAMA = '\u0bcd';

/** Tamil script to Latin letters ("\u0b95\u0bbe\u0ba4\u0bb2\u0bcd" -> "kaathal"); anything else is returned as it is. */
export function transliterateTamil(text) {
  const chars = [...String(text ?? '')];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (TAMIL_CONSONANTS[c]) {
      const n = chars[i + 1];
      if (n === VIRAMA) { out += TAMIL_CONSONANTS[c]; i++; } else if (TAMIL_SIGNS[n]) { out += TAMIL_CONSONANTS[c] + TAMIL_SIGNS[n]; i++; } else out += `${TAMIL_CONSONANTS[c]}a`;
    } else if (TAMIL_VOWELS[c]) out += TAMIL_VOWELS[c];
    else if (c === '\u0b83') out += 'h';
    else out += c;
  }
  return out;
}

/**
 * How a title SOUNDS in Tanglish: the spelling variants collapse (ae/ai/e -> e, aa -> a, ee/ii -> i, oo/uu -> u, th/dh -> t,
 * zh -> l, w -> v, h after a consonant dropped, doubled letters single).  "Annul Maelae" and "Annul Melae" both give "anul mele".
 */
export function phoneticText(text) {
  let t = transliterateTamil(base(text));
  t = t.replace(/[^a-z0-9\s]+/g, ' ');
  t = t.replace(/[td]h/g, 't').replace(/zh/g, 'l').replace(/w/g, 'v').replace(/ph/g, 'p');
  t = t.replace(/(?<=[bcdfgjklmnpqrstvxyz])h/g, ''); // th dh kh gh bh sh ch -> t d k g b s c
  t = t.replace(/(?<=[bcdfgjklmnpqrstvxz])y\b/g, 'i'); // Thalapathy / Thalapathi
  t = t.replace(/ae|ai|ay|ei/g, 'e').replace(/aa/g, 'a').replace(/ee|ii|ea/g, 'i').replace(/oo|uu|ou/g, 'u');
  t = t.replace(/([a-z0-9])\1+/g, '$1');
  return t.replace(/\s+/g, ' ').trim();
}

const wordsOf = (t) => t.split(' ').filter(Boolean);
/** The consonant skeleton, the last resort comparison ("anul mele" -> "anl ml"). */
const skeleton = (phon) => wordsOf(phon).map((w) => w[0] + w.slice(1).replace(/[aeiou]/g, '')).join(' ');

const VERSION_ONLY = new RegExp(VERSION_RE.source, 'gu');
const versionTokens = (song) => [...new Set((titleCore(song).match(VERSION_ONLY) || []).map((v) => v.replace(/\s+/g, ' ').replace(/^remixed$/, 'remix')))].sort().join(',');

const cache = new WeakMap();
const memo = (song) => {
  if (!song || typeof song !== 'object') return null;
  let m = cache.get(song);
  if (!m || m.title !== song.title) {
    const core = variantCore(song);
    const phon = phoneticText(core);
    m = { title: song.title, core, phon, skel: skeleton(phon), versions: versionTokens(song) };
    cache.set(song, m);
  }
  return m;
};
/** The phonetic form of the title without version words, for blocking and reports. */
export const phoneticTitle = (song) => memo(song)?.phon ?? '';

export function levenshteinRatio(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

export function jaroWinkler(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false);
  const bm = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j <= Math.min(b.length - 1, i + range); j++) {
      if (!bm[j] && a[i] === b[j]) { am[i] = bm[j] = true; matches++; break; }
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let p = 0;
  while (p < 4 && a[p] && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}

/** 0..1 how alike two titles sound: the better of Jaro-Winkler and the Levenshtein ratio, with the consonant skeleton as a fallback. */
export function titleSimilarity(a, b) {
  const x = memo(a);
  const y = memo(b);
  if (!x || !y || !x.phon || !y.phon) return 0;
  if (x.versions !== y.versions) return 0; // an unplugged / remix / reprise is never the same recording
  if ((x.phon.match(/\d+/g) || []).join() !== (y.phon.match(/\d+/g) || []).join()) return 0; // Part 1 / Part 2
  if (x.phon === y.phon) return 1;
  const direct = Math.min(jaroWinkler(x.phon, y.phon), levenshteinRatio(x.phon, y.phon));
  const fallback = x.skel.replace(/ /g, '').length >= 4 && x.skel === y.skel ? 0.9 : 0;
  return Math.min(1, Math.max(direct, fallback));
}

export const SAME_TITLE = 0.85;
export const SAME_TITLE_STRICT = 0.95; // a missing duration or artist leaves less evidence, so the title must be closer
export const DURATION_TOLERANCE = 2; // seconds

const artistKeys = (song) => {
  const raw = [
    ...(Array.isArray(song?.singers) ? song.singers : [song?.singers]),
    song?.artist,
    ...(Array.isArray(song?.composer) ? song.composer : [song?.composer]),
  ].filter(Boolean).join(',');
  return new Set(raw.split(/,|&|\/|;|\bfeat\.?\b|\bft\.?\b|\band\b|\bwith\b/i).map((x) => squash(base(x)).replace(/[^\p{L}\p{N}\p{M}]/gu, '')).filter((k) => k.length > 0 && k !== 'tamilartist' && k !== 'various' && k !== 'variousartists'));
};
// "Anirudh" and "Anirudh Ravichander", "A.R. Rahman" and "Rahman": one name inside the other (5+ letters) is the same person
const sameName = (x, y) => x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)));
const shareArtist = (a, b) => { const ka = artistKeys(a); const kb = artistKeys(b); for (const x of ka) for (const y of kb) if (sameName(x, y)) return true; return false; };
const hasArtist = (s) => artistKeys(s).size > 0;
// a duration the provider guessed (durationEstimated) is as good as missing
const seconds = (s) => { const d = Number(s?.duration); return Number.isFinite(d) && d > 0 && !s?.durationEstimated ? d : 0; };

/** The strong keys: equal ISRC, source track id or audio hash mean the same recording whatever the title says. */
export const strongKeys = (song) => [song?.isrc && `isrc:${String(song.isrc).replace(/[\s-]/g, '').toUpperCase()}`, song?.sourceTrackId && `src:${song.sourceTrackId}`, song?.audioHash && `hash:${song.audioHash}`].filter(Boolean);
const sameStrongKey = (a, b) => { const k = strongKeys(b); return strongKeys(a).some((x) => k.includes(x)); };

/**
 * The same song, even with a different id, spelling or album: an equal strong key, or ALL of: durations within 2 s (a missing
 * duration needs a closer title), a shared artist or music director, a title that sounds alike (>= 0.85) with the same version words.
 */
export function isSameSong(a, b) {
  if (!a || !b) return false;
  if (a.id && a.id === b.id) return true;
  if (sameStrongKey(a, b)) return true;
  const sim = titleSimilarity(a, b);
  if (sim < SAME_TITLE) return false;
  const da = seconds(a);
  const db = seconds(b);
  const durationKnown = da > 0 && db > 0;
  if (durationKnown && Math.abs(da - db) > DURATION_TOLERANCE) return false;
  const artistKnown = hasArtist(a) && hasArtist(b);
  if (artistKnown && !shareArtist(a, b)) return false;
  if (!durationKnown) { // no length to compare: two different films are two different songs, unless one is just a compilation
    const ma = movieOf(a);
    const mb = movieOf(b);
    if (ma && mb && ma !== mb && !isCompilation(a) && !isCompilation(b)) return false;
  }
  return durationKnown && artistKnown ? true : sim >= SAME_TITLE_STRICT;
}

export const sameSong = isSameSong;

/** The same song or one of its versions (another duration is fine): the same sounding title once version words are removed, and a shared artist. */
export function sameVariant(a, b) {
  if (isSameSong(a, b)) return true;
  const x = memo(a);
  const y = memo(b);
  if (!x?.phon || !y?.phon) return false;
  const sim = x.phon === y.phon ? 1 : Math.min(jaroWinkler(x.phon, y.phon), levenshteinRatio(x.phon, y.phon));
  if (sim < 0.92) return false;
  return hasArtist(a) && hasArtist(b) ? shareArtist(a, b) : sim === 1;
}

// ---------------------------------------------------------------- versions: which copy to show

const COMPILATION_RE = /\b(?:romantic hits|konjam paatu|pov|best of|jukebox|mashup|top\s*\d+|hits|playlist|collection|greatest|chartbusters?|non[- ]?stop|radio mix)\b/;
/** Compilation or playlist-style albums ("Romantic Hits", "Best of ...", "Jukebox") are the low-priority copy of a song. */
export const isCompilation = (song) => COMPILATION_RE.test(base(song?.album ?? song?.movie ?? ''));

const quality = (s) => (s.isPlayable === false ? 0 : 1) + (s.streamUrl ? 1 : 0) + (/320|high|hq/i.test(String(s.quality || s.streamUrl || '')) ? 0.5 : 0);
/** Negative when `a` is the better copy to show: original release over a compilation, then plays, then source quality, then completeness. */
export function compareVersions(a, b) {
  const ca = isCompilation(a);
  const cb = isCompilation(b);
  if (ca !== cb) return ca ? 1 : -1;
  const pa = Number(a.playCount) || 0;
  const pb = Number(b.playCount) || 0;
  if (pa !== pb) return pb - pa;
  if (quality(a) !== quality(b)) return quality(b) - quality(a);
  const comp = (s) => [s.image, s.album, s.year, s.streamUrl, s.duration].filter(Boolean).length;
  if (comp(a) !== comp(b)) return comp(b) - comp(a);
  return String(a.id).localeCompare(String(b.id)); // stable
}
export const pickBest = (songs) => [...songs].sort(compareVersions)[0] || null;

// ---------------------------------------------------------------- canonical grouping

/**
 * Cluster songs that are the same song (union-find over isSameSong). Each group's canonicalId is the id of its best version, so a
 * duplicate counts as the same song for every "no repeat" rule. Report/ingest tools can store it as songs.canonical_id.
 * @returns {{ groups: {canonicalId: string, best: object, songs: object[]}[], canonicalOf: Map<string,string> }}
 */
export function clusterSongs(songs) {
  const list = (songs || []).filter((s) => s && s.id);
  const parent = list.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const byDur = new Map();
  list.forEach((s, i) => {
    const d = Math.round(seconds(s));
    const near = [];
    if (d) { for (let k = d - 3; k <= d + 3; k++) near.push(...(byDur.get(k) || [])); near.push(...(byDur.get(0) || [])); } else for (const arr of byDur.values()) near.push(...arr);
    for (const j of near) if (find(i) !== find(j) && isSameSong(list[j], s)) parent[find(i)] = find(j);
    if (!byDur.has(d)) byDur.set(d, []);
    byDur.get(d).push(i);
  });
  const buckets = new Map();
  list.forEach((s, i) => { const r = find(i); if (!buckets.has(r)) buckets.set(r, []); buckets.get(r).push(s); });
  const groups = [];
  const canonicalOf = new Map();
  for (const members of buckets.values()) {
    const best = pickBest(members);
    groups.push({ canonicalId: best.id, best, songs: members });
    for (const m of members) canonicalOf.set(m.id, best.id);
  }
  return { groups, canonicalOf };
}

/** Keep one copy of each song (the best version), in the order the songs first appear. */
export function collapseDuplicates(songs) {
  const { groups, canonicalOf } = clusterSongs(songs);
  const best = new Map(groups.map((g) => [g.canonicalId, g.best]));
  const done = new Set();
  const out = [];
  for (const s of songs || []) {
    const c = s && canonicalOf.get(s.id);
    if (!c || done.has(c)) continue;
    done.add(c);
    out.push(best.get(c));
  }
  return out;
}

/** A growing group of songs: `has` finds the same song, `hasVariant` also finds its versions. */
export function createIdentitySet(initial = []) {
  const ids = new Set();
  const keys = new Set();
  const byDur = new Map();
  const all = [];
  const nearDur = (song) => {
    const d = Math.round(seconds(song));
    if (!d) return all;
    const out = [...(byDur.get(0) || [])];
    for (let k = d - 3; k <= d + 3; k++) out.push(...(byDur.get(k) || []));
    return out;
  };
  const api = {
    add(song) {
      if (!song) return api;
      if (song.id) ids.add(song.id);
      strongKeys(song).forEach((k) => keys.add(k));
      const d = Math.round(seconds(song));
      if (!byDur.has(d)) byDur.set(d, []);
      byDur.get(d).push(song);
      all.push(song);
      return api;
    },
    has: (song) => Boolean(song) && ((song.id && ids.has(song.id)) || strongKeys(song).some((k) => keys.has(k)) || nearDur(song).some((o) => isSameSong(song, o))),
    hasVariant: (song) => Boolean(song) && (api.has(song) || all.some((o) => sameVariant(song, o))),
  };
  for (const s of initial) api.add(s);
  return api;
}

/** Collapse duplicates (best version kept) and tag every song with its canonicalId. */
export function withCanonical(songs) {
  const { canonicalOf } = clusterSongs(songs);
  return collapseDuplicates(songs).map((s) => ({ ...s, canonicalId: canonicalOf.get(s.id) || s.id }));
}
