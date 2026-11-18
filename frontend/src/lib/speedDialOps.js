/** Pure helpers for editing the Speed Dial grid on screen (optimistic updates before the server confirms). */

const renumber = (items) => items.map((it, i) => ({ ...it, rank: i + 1 }));

/** Drag a tile from one position to another. The moved tile becomes pinned (the server does the same). */
export function moveItem(items, from, to) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, { ...moved, pinned: true });
  return renumber(next);
}

export const pinItem = (items, songId) => items.map((it) => (it.id === songId ? { ...it, pinned: true } : it));
export const unpinItem = (items, songId) => items.map((it) => (it.id === songId ? { ...it, pinned: false } : it));
export const removeItem = (items, songId) => renumber(items.filter((it) => it.id !== songId));

/** The song order to send to the server after a drag. */
export const orderOf = (items) => items.map((it) => it.id);

/** True when nothing in the grid has really been played yet (shows the "play songs..." hint). */
export const hasNoPlays = (items) => !items.some((it) => it.source === 'played' && it.playCount > 0);

/**
 * Logged-out grid: the guest's own top songs first, then trending songs they have not played, up to `slots`.
 * @param {{ song: object, count: number }[]} guestTop
 * @param {object[]} trending
 */
export function guestItems(guestTop, trending, slots = 9) {
  const items = [];
  const seen = new Set();
  guestTop.forEach((g, i) => {
    seen.add(g.song.id);
    items.push({ ...g.song, rank: 0, playCount: g.count, pinned: false, source: 'played', hot: i < 3 });
  });
  for (const s of trending || []) {
    if (items.length >= slots) break;
    if (!s?.id || seen.has(s.id)) continue;
    seen.add(s.id);
    items.push({ ...s, rank: 0, playCount: 0, pinned: false, source: 'suggested', hot: false });
  }
  return renumber(items.slice(0, slots));
}
