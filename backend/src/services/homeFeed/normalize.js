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
 * Two songs are the same when the cleaned titles match AND the movies agree (or one side has no movie)
 * AND the singers overlap (or one side has no singers).
 */
export function sameSong(a, b) {
  if (!a || !b) return false;
  if (a.id && a.id === b.id) return true;
  const ta = canonTitle(a);
  if (!ta || ta !== canonTitle(b)) return false;
  const ma = canonMovie(a);
  const mb = canonMovie(b);
  if (ma && mb && ma !== mb) return false;
  const sa = singersOf(a);
  const sb = singersOf(b);
  if (sa.size && sb.size && ![...sa].some((x) => sb.has(x) || [...sb].some((y) => x.includes(y) || y.includes(x)))) return false;
  return true;
}

/** A growing set of songs already on the page. `has` treats look-alikes as the same song. */
export function createSeen(initial = []) {
  const byTitle = new Map();
  const ids = new Set();
  const api = {
    add(song) {
      if (!song) return api;
      if (song.id) ids.add(song.id);
      const t = canonTitle(song);
      if (!byTitle.has(t)) byTitle.set(t, []);
      byTitle.get(t).push(song);
      return api;
    },
    has(song) {
      if (!song) return false;
      if (song.id && ids.has(song.id)) return true;
      return (byTitle.get(canonTitle(song)) || []).some((other) => sameSong(song, other));
    },
    get size() { return ids.size; },
  };
  for (const s of initial) api.add(s);
  return api;
}
