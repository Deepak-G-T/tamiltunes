import { SPEED_DIAL } from './config.js';
import { clusterSongs, createIdentitySet } from '../related/identity.js';

const songView = (song) => ({
  id: song.id,
  title: song.title,
  artist: song.artist || song.singers || 'Tamil Artist',
  album: song.album ?? null,
  image: song.image ?? null,
  duration: song.duration ?? 0,
  streamUrl: song.streamUrl ?? null,
  ...(song.videoId ? { videoId: song.videoId } : {}),
});

/**
 * Build the Speed Dial grid.
 *  1. hidden songs are removed everywhere
 *  2. pinned songs take their slot (two pins on one slot: the newer one keeps it, the other moves to the next free slot)
 *  3. empty slots are filled by rank (most played first), then by suggested popular songs
 *  4. gaps are closed, so the list is dense and in grid order
 *
 * @param {{
 *   scores: { songId: string, score: number, plays: number }[],
 *   overrides: { songId: string, slotPosition: number|null, isPinned: boolean, isHidden: boolean, updatedAt?: Date }[],
 *   songs: Map<string, object>,       // metadata for songs we know (played or pinned)
 *   suggestions?: object[],           // popular songs to fill with (full song objects)
 * }} input
 */
export function assembleSpeedDial(input, cfg = SPEED_DIAL) {
  const { songs } = input;
  // The same song under another id (spelling, album, compilation) is ONE tile: plays add up, the best version is shown,
  // and hiding or pinning any copy applies to the whole song.
  const { canonicalOf } = clusterSongs([...songs.values()]);
  const canon = (id) => canonicalOf.get(id) || id;
  const mergedScores = new Map();
  for (const s of input.scores) {
    const id = canon(s.songId);
    const row = mergedScores.get(id);
    if (!row) mergedScores.set(id, { ...s, songId: id });
    else { row.score += s.score; row.plays += s.plays; if (s.lastPlayedAt && (!row.lastPlayedAt || s.lastPlayedAt > row.lastPlayedAt)) row.lastPlayedAt = s.lastPlayedAt; }
  }
  const scores = [...mergedScores.values()].sort((a, b) => b.score - a.score || String(a.songId).localeCompare(String(b.songId)));
  const byOverride = new Map();
  for (const o of input.overrides) {
    const id = canon(o.songId);
    const prev = byOverride.get(id);
    if (!prev) byOverride.set(id, { ...o, songId: id });
    else byOverride.set(id, { ...(new Date(o.updatedAt || 0) >= new Date(prev.updatedAt || 0) ? o : prev), songId: id, isHidden: prev.isHidden || o.isHidden });
  }
  const overrides = [...byOverride.values()];
  const suggestionSeen = createIdentitySet([...songs.values()]); // suggestions that duplicate a played song are dropped
  const suggestions = (input.suggestions || []).filter((x) => x?.id && !suggestionSeen.has(x));
  const n = cfg.slots;
  const hidden = new Set(overrides.filter((o) => o.isHidden).map((o) => o.songId));
  const scoreOf = new Map(scores.map((s) => [s.songId, s]));

  const slots = Array(n).fill(null);
  const placed = new Set();
  const put = (songId, wanted) => {
    let i = Math.min(Math.max(Number.isInteger(wanted) ? wanted : 0, 0), n - 1);
    for (let k = 0; k < n; k++) {
      const idx = (i + k) % n;
      if (!slots[idx]) {
        slots[idx] = songId;
        placed.add(songId);
        return;
      }
    }
  };

  const pins = overrides
    .filter((o) => o.isPinned && !o.isHidden && songs.has(o.songId))
    .sort((a, b) => (a.slotPosition ?? 0) - (b.slotPosition ?? 0) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  for (const p of pins) put(p.songId, p.slotPosition ?? 0);

  const ranked = scores.filter((s) => !hidden.has(s.songId) && !placed.has(s.songId) && songs.has(s.songId) && s.score >= cfg.minScore);
  const queue = [...ranked.map((r) => ({ kind: 'played', songId: r.songId }))];
  const seen = new Set([...placed, ...hidden, ...ranked.map((r) => r.songId)]);
  for (const s of suggestions) {
    if (!s?.id || seen.has(s.id)) continue;
    seen.add(s.id);
    queue.push({ kind: 'suggested', song: s });
  }

  const meta = new Map(); // songId -> { source, song }
  for (const id of placed) meta.set(id, { source: scoreOf.has(id) ? 'played' : 'pinned', song: songs.get(id) });
  for (let i = 0; i < n && queue.length; i++) {
    if (slots[i]) continue;
    const next = queue.shift();
    if (next.kind === 'played') {
      slots[i] = next.songId;
      meta.set(next.songId, { source: 'played', song: songs.get(next.songId) });
    } else {
      slots[i] = next.song.id;
      meta.set(next.song.id, { source: 'suggested', song: next.song });
    }
  }

  const items = slots.filter(Boolean).map((id, i) => {
    const m = meta.get(id);
    const sc = scoreOf.get(id);
    return {
      ...songView(m.song),
      rank: i + 1,
      playCount: sc?.plays ?? 0,
      pinned: pins.some((p) => p.songId === id),
      source: m.source === 'suggested' ? 'suggested' : 'played',
      hot: false,
    };
  });
  // The flame goes to the three most-played songs the user really played
  items
    .filter((it) => it.source === 'played' && it.playCount > 0)
    .sort((a, b) => (scoreOf.get(b.id)?.score ?? 0) - (scoreOf.get(a.id)?.score ?? 0))
    .slice(0, 3)
    .forEach((it) => { it.hot = true; });
  return items;
}
