/**
 * "Is this the same song?" for the radio queue. The same song comes back under different ids, covers and singer order, and
 * versions of one song (unplugged, remix, reprise ...) must not fill a radio block either. Two levels:
 *   songFingerprint  the same song (a re-upload, a duplicate id, the singers listed in another order)
 *   variantKey       the same song OR one of its versions (unplugged, acoustic, remix, reprise, lofi, slowed, reverb, instrumental, karaoke, cover, male/female version, 8D)
 * A copy of this file lives in backend/src/services/related/identity.js (the server collapses duplicates with the same rules);
 * both are tested with the same examples.
 */

const VERSION_WORDS = ['male version', 'female version', 'slowed and reverb', 'unplugged', 'acoustic', 'remixed', 'remix', 'reprise', 'lofi', 'lo fi', 'slowed', 'reverb', 'instrumental', 'karaoke', 'cover', '8d', 'version'];
const VERSION_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${VERSION_WORDS.map((w) => w.replace(/ /g, '\\s+')).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
const BRACKETS = /[(\[{][^)\]}]*[)\]}]/g;

const base = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[’‘`´]/g, "'").replace(/lo-fi/g, 'lofi');
const squash = (s) => s.replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').replace(/\s+/g, ' ').trim();

/** The title with bracketed text and "- From ..." removed, but bracketed VERSION words kept ("(Unplugged)" still makes it a different version). */
export function titleCore(song) {
  let t = base(song?.title).replace(/\s[-–—]\s*from\b.*$/, ' ');
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

const compatible = (a, b) => {
  const ma = movieOf(a);
  const mb = movieOf(b);
  if (!ma || !mb || ma === mb) return true;
  const sa = singerList(a);
  const sb = singerList(b);
  return !sa.length || !sb.length || sa.some((x) => sb.includes(x)); // another film, but the same singers: a compilation of the same song
};

export function sameSong(a, b) {
  if (!a || !b) return false;
  if (a.id && a.id === b.id) return true;
  const ta = titleCore(a);
  return Boolean(ta) && ta === titleCore(b) && compatible(a, b);
}

export function sameVariant(a, b) {
  if (sameSong(a, b)) return true;
  const va = variantCore(a);
  return Boolean(va) && va === variantCore(b) && compatible(a, b);
}

/** A growing group of songs: `has` finds the same song, `hasVariant` also finds its versions. */
export function createIdentitySet(initial = []) {
  const ids = new Set();
  const byTitle = new Map();
  const byVariant = new Map();
  const push = (map, key, song) => { if (!map.has(key)) map.set(key, []); map.get(key).push(song); };
  const api = {
    add(song) {
      if (!song) return api;
      if (song.id) ids.add(song.id);
      push(byTitle, titleCore(song), song);
      push(byVariant, variantCore(song), song);
      return api;
    },
    has: (song) => Boolean(song) && ((song.id && ids.has(song.id)) || (byTitle.get(titleCore(song)) || []).some((o) => sameSong(song, o))),
    hasVariant: (song) => Boolean(song) && (api.has(song) || (byVariant.get(variantCore(song)) || []).some((o) => sameVariant(song, o))),
  };
  for (const s of initial) api.add(s);
  return api;
}
