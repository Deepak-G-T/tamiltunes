/**
 * "Recent videos" mode of the batch matcher: start from the newest official uploads of the allow-listed channels, work out which song each one is
 * (title and film), look that song up in the music catalogue, and remember "this catalogue song -> this official video" in video_matches.
 * Pure logic: the catalogue search is injected, so it is tested with fakes. Writes only with apply = true; never overwrites a found video.
 */
import { normalizeTitle, titleCandidates, songKey } from '../music/videoLookup.js';

// "Hukum - Video Song | Jailer | Rajinikanth", "Naa Ready (Official Video) | Leo", "Ennodu Nee Irundhaal Video Song | I"
const VIDEO_WORDS_RE = /\s*[-–—:|(\[]?\s*(?:full\s+|official\s+)*(?:music\s+)?video(?:\s+song)?\b.*$/i;
const CREDIT_RE = /\b(official|music|audio|lyric|lyrical|promo|teaser|trailer|songs?|video|tamil|hd|4k|full|jukebox|feat|ft)\b/i;

/** { title, film } from an upload title, or null when it does not look like "<song> ... | <film>". */
export const parseUploadTitle = (raw) => {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const parts = text.split('|').map((p) => p.trim()).filter(Boolean);
  let head = parts[0];
  let film = '';
  const cleaned = head.replace(VIDEO_WORDS_RE, '').replace(/[\s\-–—:]+$/g, '').trim();
  if (VIDEO_WORDS_RE.test(head) && !cleaned) return null; // nothing left but the words "Video Song"
  if (cleaned && cleaned !== head) head = cleaned;
  else if (!VIDEO_WORDS_RE.test(parts[0]) && parts.length < 2) return null; // no "video song" marker and no film part: too vague
  if (parts[1] && !CREDIT_RE.test(parts[1]) && parts[1].length <= 60) film = parts[1];
  // "Film - Song Video Song" is rare; "Song - Subtitle" keeps only the main part for matching (titleCandidates handles both)
  head = head.replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ').trim();
  if (normalizeTitle(head).length < 3) return null;
  return { title: head, film };
};

const same = (a, b) => a && b && a === b;
const words = (t) => t.split(' ').filter(Boolean).length;
// The film part of an upload title is often an actor or a singer ("... | Dhanush | ..."), so a one-word film must equal the album exactly:
// "Dhanush" must not match the compilation "Best Of Dhanush". A longer name may sit inside the album ("Vaaranam Aayiram Original Soundtrack").
const filmMatches = (album, film) => same(album, film) || (Math.min(words(album), words(film)) >= 2 && (album.includes(film) || film.includes(album)));

/** The catalogue song that is this upload's song: same title (or main part) and, when the upload names a film, the same film. null if unsure. */
export const pickCatalogSong = (songs, parsed) => {
  if (!parsed) return null;
  const wanted = new Set(titleCandidates(parsed.title));
  const film = normalizeTitle(parsed.film);
  const hits = [];
  for (const s of songs || []) {
    if (!s?.title) continue;
    const mine = titleCandidates(s.title);
    if (!mine.some((c) => wanted.has(c))) continue;
    const album = normalizeTitle(s.album || s.movie);
    const filmOk = film && album && filmMatches(album, film);
    hits.push({ s, filmOk });
  }
  if (film) {
    const ok = hits.filter((h) => h.filmOk);
    return ok.length ? ok[0].s : null; // the upload names a film: the catalogue song must be from it
  }
  return hits.length === 1 ? hits[0].s : null; // no film in the upload: only an unambiguous title match counts
};

export async function runRecent({ uploads, search, store = null, existing = new Map(), apply = false, delayMs = 0, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} }) {
  const counts = { uploads: 0, unparsed: 0, notInCatalogue: 0, matched: 0, alreadyKnown: 0, searchErrors: 0 };
  const rows = [];
  const missing = [];
  const seenKeys = new Set();
  for (const up of uploads) {
    counts.uploads++;
    const parsed = parseUploadTitle(up.title);
    if (!parsed) { counts.unparsed++; continue; }
    let songs = [];
    try {
      songs = await search(`${parsed.title} ${parsed.film}`.trim());
    } catch { counts.searchErrors++; continue; }
    if (delayMs) await sleep(delayMs);
    const song = pickCatalogSong(songs, parsed);
    if (!song) { counts.notInCatalogue++; if (missing.length < 30) missing.push(`${parsed.title}${parsed.film ? ` (${parsed.film})` : ''}`); continue; }
    const key = songKey(song);
    if (!key || key === '|' || seenKeys.has(key)) continue;
    seenKeys.add(key);
    if (existing.get(key)?.videoId) { counts.alreadyKnown++; continue; } // a found video is never overwritten
    counts.matched++;
    rows.push({ songKey: key, videoId: up.videoId, title: song.title, artist: song.artist || song.singers || '', source: 'index' });
    log(`match  ${song.title} (${song.album || '?'}) -> ${up.videoId}   [${up.title}]`);
  }
  let written = 0;
  if (apply && store) for (let i = 0; i < rows.length; i += 100) written += await store.upsertMany(rows.slice(i, i + 100));
  return { counts, rows, missing, written, applied: apply };
}
