/**
 * Play counts for logged-out listeners, kept in localStorage and imported into the account on sign-in.
 * Pure functions over a `storage` object (anything with getItem / setItem / removeItem) so they are easy to test.
 */
export const GUEST_KEY = 'tamiltunes_guest_plays';
export const MAX_GUEST_SONGS = 50;
const HALF_LIFE_DAYS = 14; // same recency decay as the server ranking
const DAY = 86400e3;

const meta = (song) => ({
  id: song.id,
  title: song.title,
  artist: song.artist || song.singers || 'Tamil Artist',
  album: song.album ?? null,
  image: song.image ?? null,
  duration: Math.round(song.duration) || 0,
  streamUrl: song.streamUrl ?? null,
});

export function loadGuestPlays(storage) {
  try {
    const data = JSON.parse(storage.getItem(GUEST_KEY) || '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

const save = (storage, data) => {
  try {
    storage.setItem(GUEST_KEY, JSON.stringify(data));
  } catch {
    /* storage full or blocked: the Speed Dial just starts empty next time */
  }
};

/** Count one real play (call it when the play counts, not on every click). */
export function recordGuestPlay(storage, song, now = Date.now()) {
  if (!song?.id) return;
  const data = loadGuestPlays(storage);
  const prev = data[song.id];
  data[song.id] = { song: meta(song), count: (prev?.count || 0) + 1, lastAt: now };
  const keep = Object.entries(data).sort((a, b) => b[1].lastAt - a[1].lastAt).slice(0, MAX_GUEST_SONGS); // forget the stalest
  save(storage, Object.fromEntries(keep));
}

/** Most-played songs: count x recency decay, best first. */
export function topGuestSongs(storage, n = 9, now = Date.now()) {
  return Object.values(loadGuestPlays(storage))
    .map((g) => ({ ...g, score: g.count * 0.5 ** (Math.max(0, now - g.lastAt) / DAY / HALF_LIFE_DAYS) }))
    .filter((g) => g.score >= 0.2)
    .sort((a, b) => b.score - a.score || b.lastAt - a.lastAt)
    .slice(0, n);
}

/** Payload for POST /api/me/speed-dial/import. */
export function exportGuestPlays(storage) {
  return Object.values(loadGuestPlays(storage))
    .slice(0, MAX_GUEST_SONGS)
    .map((g) => ({ song: { ...g.song, album: g.song.album ?? undefined, image: g.song.image ?? undefined, streamUrl: undefined }, count: Math.min(g.count, 1000), lastAt: new Date(g.lastAt).toISOString() }));
}

export const clearGuestPlays = (storage) => {
  try {
    storage.removeItem(GUEST_KEY);
  } catch {
    /* ignore */
  }
};

/**
 * After sign-in: send the guest's counts to the account, then forget them. If the request fails the counts stay,
 * so the next sign-in tries again (the server ignores duplicates).
 * @returns {Promise<boolean>} true when something was imported
 */
export async function migrateGuestPlays(storage, importPlays) {
  const plays = exportGuestPlays(storage);
  if (!plays.length) return false;
  try {
    await importPlays(plays);
    clearGuestPlays(storage);
    return true;
  } catch {
    return false;
  }
}
