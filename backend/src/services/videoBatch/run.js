/**
 * Batch video matcher: walks a list of songs (most played first), finds the official video for each (curated map, channel index, then a
 * budgeted per-song search) and records what it found. Pure logic: the lookup, the store and the log are injected, so it is tested with fakes.
 * It only ever writes video_matches rows (and only with apply = true). It never touches an admin choice, never deletes, never stores media.
 */
import { songKey } from '../music/videoLookup.js';

const SAMPLE = 30;
const CHUNK = 100;

export async function runBatch({ songs, lookup, store = null, existing = new Map(), apply = false, retryNone = false, allowSearch = true, noneTtlMs = 14 * 24 * 3600 * 1000, now = () => Date.now(), log = () => {} }) {
  const counts = { songs: 0, duplicates: 0, alreadyFound: 0, alreadyNone: 0, admin: 0, curated: 0, hidden: 0, index: 0, search: 0, none: 0, deferred: 0, errors: 0, off: 0 };
  const rows = [];
  const unmatched = [];
  const seen = new Set();
  for (const song of songs) {
    if (!song?.title) continue;
    counts.songs++;
    const key = songKey(song);
    if (!key || key === '|') continue;
    if (seen.has(key)) { counts.duplicates++; continue; }
    seen.add(key);
    const prior = existing.get(key);
    if (prior) {
      const fresh = prior.videoId ? true : now() - new Date(prior.checkedAt).getTime() < noneTtlMs && !retryNone;
      if (fresh) { counts[prior.videoId ? 'alreadyFound' : 'alreadyNone']++; continue; }
    }
    const r = await lookup.batchResolve(song, { allowSearch });
    if (r.via === 'admin') counts.admin++;
    else if (r.via === 'curated') counts.curated++;
    else if (r.via === 'hidden') counts.hidden++;
    else if (r.via === 'off') { counts.off++; break; }
    else if (r.via === 'no-budget') counts.deferred++;
    else if (r.via === 'error') counts.errors++;
    else if (r.via === 'index' || r.via === 'search' || r.via === 'none') {
      counts[r.via]++;
      rows.push({ songKey: key, videoId: r.videoId || null, title: song.title, artist: song.artist || song.singers || '', source: r.via });
      if (r.via === 'none' && unmatched.length < SAMPLE) unmatched.push(`${song.title} - ${(song.artist || song.singers || '').split(',')[0]}`);
      log(`${r.via.padEnd(6)} ${song.title}${r.videoId ? ` -> ${r.videoId}` : ''}`);
    }
  }
  let written = 0;
  if (apply && store) for (let i = 0; i < rows.length; i += CHUNK) written += await store.upsertMany(rows.slice(i, i + CHUNK));
  const found = counts.index + counts.search + counts.curated + counts.admin + counts.alreadyFound;
  return { counts, rows, unmatched, written, applied: apply, found };
}
