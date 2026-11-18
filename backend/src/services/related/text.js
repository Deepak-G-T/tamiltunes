/** Small text helpers for comparing song metadata (names, films, years). */

/** Lower-case, strip accents and punctuation, collapse spaces. Keeps Tamil letters. */
export const norm = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "A, B & C feat. D" -> ["a", "b", "c", "d"] (normalised, de-duplicated). */
export function splitNames(value) {
  const raw = Array.isArray(value) ? value.join(',') : String(value ?? '');
  const parts = raw.split(/,|&|\/|;|\bfeat\.?\b|\bft\.?\b|\band\b|\bwith\b/i).map(norm).filter(Boolean);
  return [...new Set(parts)];
}

/** Film / album name without "(From ...)", "Original Motion Picture Soundtrack" and similar noise. */
export function normMovie(value) {
  return norm(
    String(value ?? '')
      .replace(/[\(\[][^\)\]]*[\)\]]/g, ' ')
      .replace(/original motion picture soundtrack|original soundtrack|motion picture|soundtrack|\bost\b|\btamil\b|\bsongs?\b/gi, ' ')
  );
}

export const yearOf = (value) => {
  const m = /\d{4}/.exec(String(value ?? ''));
  return m ? Number(m[0]) : null;
};

export const singersOf = (song) => splitNames(song?.singers?.length ? song.singers : song?.artist);
export const composerOf = (song) => norm(song?.composer || song?.musicDirector || '');
export const primaryArtist = (song) => singersOf(song)[0] || '';
export const languageOf = (song) => norm(song?.language || '') || null;
