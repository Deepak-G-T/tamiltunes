import { isSameSong, createIdentitySet } from '../related/identity.js';
/**
 * "Is this the same song?" for the home page. The same song often comes back under different ids: a remaster, a duplicate
 * upload, or a title like `Vaathi Coming (From "Master")`. Titles are cleaned, then compared together with the movie
 * and the singers, so two real songs that merely share a title (from different films) stay separate.
 */
const NOISE = /\b(remastered|remaster|re-?mastered|original motion picture soundtrack|motion picture soundtrack|original soundtrack|soundtrack|ost|original score|video song|full video|lyric(?:al)? video|official video|audio song|full song|hd|4k|from|version)\b/g;

const clean = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ') // anything in brackets: "(From "Master")", "[Remastered]"
    .replace(/["“”'‘’`]/g, '')
    .replace(NOISE, ' ')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Movie name from the album field ("Leo (Original Motion Picture Soundtrack)" -> "leo"). */
export const canonMovie = (song) => clean(song?.album ?? song?.movie ?? '');

/** The title, also dropping a trailing `- From "Movie"` part. */
export const canonTitle = (song) => clean(String(song?.title ?? '').replace(/\s[-–—]\s*from\b.*$/i, ''));

export const singersOf = (song) =>
  new Set(String(song?.singers ?? song?.artist ?? '').split(/[,&]|\band\b/i).map((s) => clean(s)).filter(Boolean));

/** First artist, used for the per-artist cap. */
export const primaryArtist = (song) => [...singersOf(song)][0] || '';

/**
 * Two songs are the same song when they sound alike (phonetic Tanglish title, same version words), have the same length (within 2 s),
 * and share an artist or music director; an equal ISRC / track id also counts. See related/identity.js (same rules as the web app).
 */
export const sameSong = isSameSong;

/** A growing set of songs already on the page. `has` treats look-alikes (any id, spelling or album) as the same song. */
export function createSeen(initial = []) {
  const set = createIdentitySet(initial);
  const ids = new Set();
  const api = {
    add(song) { if (song) { if (song.id) ids.add(song.id); set.add(song); } return api; },
    has: (song) => set.has(song),
    get size() { return ids.size; },
  };
  for (const s of initial) if (s?.id) ids.add(s.id);
  return api;
}
