/**
 * Queue engine for "radio" playback (Spotify-style autoplay). Pure and immutable: every function takes a state and
 * returns a new one, so it is easy to test and to drive from React (reducer / ref) or from the network layer.
 *
 * Model
 *   current   the song playing now
 *   upcoming  songs still to play, in order. The first `userCount` entries are USER-ADDED ("Next in queue", they take
 *             priority); the rest come from the SOURCE: the radio (related songs) or a playlist / album.
 *   history   songs already played (most recent last), used by "previous"
 *   played    ids played this session: radio never suggests them again
 *   mode      'radio' (fills itself forever) | 'context' (follows a playlist / album order, then offers radio)
 *
 * @typedef {{ id: string, title?: string }} Song
 * @typedef {{ uid: string, song: Song, origin: 'user' | 'radio' | 'context' }} Entry   (uid is unique per queue slot, so the same song can be queued twice)
 * @typedef {ReturnType<typeof createQueueState>} QueueState
 */

export const REFILL_THRESHOLD = 3; // refill when fewer than this many songs remain
export const REFILL_BATCH = 20; // songs requested per refill
export const MAX_HISTORY = 50; // songs kept in the History tab
export const MAX_QUEUE = 500; // songs allowed in the upcoming list
export const MAX_PLAYED = 500;
export const MAX_EXCLUDE = 200; // the related-songs endpoint accepts at most this many excluded ids

const cap = (list, max) => (list.length > max ? list.slice(list.length - max) : list);
const unique = (list) => [...new Set(list)];

export function createQueueState(overrides = {}) {
  return {
    current: null,
    upcoming: [],
    userCount: 0,
    history: [],
    played: [],
    mode: 'radio',
    context: null, // { type: 'playlist' | 'album' | ..., id, label, songs } in original order
    autoplay: true,
    shuffle: false,
    repeat: 'off', // 'off' | 'all' | 'one'
    refill: { pending: false, failures: 0, retryAt: 0 },
    fallback: [], // songs to queue if the radio returns nothing (e.g. the other Speed Dial tiles)
    ended: false, // nothing left to play
    offerRadio: false, // a playlist / album finished: the UI may offer to continue with radio
    ...overrides,
  };
}

const sourceOrigin = (state) => (state.mode === 'context' ? 'context' : 'radio');
let uidSeq = 0;
/** A fresh id for one queue slot. Unique per slot, not per song. */
export const newUid = () => `qi_${Date.now().toString(36)}${(++uidSeq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const entry = (song, origin, uid) => ({ uid: uid || newUid(), song, origin });
const withPlayed = (played, ...ids) => cap(unique([...played, ...ids.filter(Boolean)]), MAX_PLAYED);
const pushHistory = (history, song) => (song ? cap([...history, song], MAX_HISTORY) : history);

/** Fisher-Yates shuffle (returns a new array). `rng` is injectable for tests. */
export function shuffled(list, rng = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const userEntries = (state) => state.upcoming.slice(0, state.userCount);
const sourceEntries = (state) => state.upcoming.slice(state.userCount);

// ---------------------------------------------------------------- starting playback

/**
 * The user played a song from search (or a Speed Dial tile): it starts now and radio fills the queue after it.
 * User-added songs are kept. `fallback` songs are queued if the radio returns nothing.
 */
export function playFromSearch(state, song, { fallback = [] } = {}) {
  if (!song) return state;
  return {
    ...state,
    history: pushHistory(state.history, state.current && state.current.id !== song.id ? state.current : null),
    played: withPlayed(state.played, song.id),
    current: song,
    upcoming: userEntries(state),
    mode: 'radio',
    context: null,
    fallback: fallback.filter((s) => s?.id && s.id !== song.id),
    ended: false,
    offerRadio: false,
    refill: { pending: false, failures: 0, retryAt: 0 },
  };
}

/**
 * The user played from a playlist or album: follow ITS order (shuffled if shuffle is on), not the radio.
 * @param {QueueState} state
 * @param {{ songs: Song[], index?: number, type?: string, id?: string, label?: string, rng?: () => number }} opts
 */
export function playFromContext(state, { songs, index = 0, type = 'playlist', id = null, label = '', rng = Math.random }) {
  if (!Array.isArray(songs) || !songs.length) return state;
  const i = Math.min(Math.max(index, 0), songs.length - 1);
  const song = songs[i];
  const rest = state.shuffle ? shuffled(songs.filter((_, k) => k !== i), rng) : songs.slice(i + 1);
  // Songs before the chosen one sit in history (not "played"), so Previous walks back through the list like a player does
  let history = pushHistory(state.history, state.current && state.current.id !== song.id ? state.current : null);
  if (!state.shuffle) for (const s of songs.slice(0, i)) history = pushHistory(history, s);
  return {
    ...state,
    history,
    fallback: [],
    played: withPlayed(state.played, song.id),
    current: song,
    upcoming: [...userEntries(state), ...rest.map((s) => entry(s, 'context'))],
    mode: 'context',
    context: { type, id, label, songs },
    ended: false,
    offerRadio: false,
    refill: { pending: false, failures: 0, retryAt: 0 },
  };
}

/** After a playlist / album ended (or any time): carry on with radio seeded from the current song. */
export function switchToRadio(state) {
  return {
    ...state,
    mode: 'radio',
    context: null,
    upcoming: userEntries(state),
    fallback: [],
    ended: false,
    offerRadio: false,
    refill: { pending: false, failures: 0, retryAt: 0 },
  };
}

// ---------------------------------------------------------------- moving through the queue

/**
 * Move to the next song.
 *  reason 'ended' with repeat 'one' replays the current song; a manual skip always moves on.
 * @returns {{ state: QueueState, song: Song | null, status: 'playing' | 'repeat-one' | 'waiting' | 'ended' }}
 *   'waiting': radio queue is empty; refill it (see needsRefill / startRefill) and call advance again.
 */
export function advance(state, { reason = 'skip', rng = Math.random } = {}) {
  if (reason === 'ended' && state.repeat === 'one' && state.current) {
    return { state, song: state.current, status: 'repeat-one' };
  }

  let next = state;
  if (!next.upcoming.length && next.mode === 'context' && next.repeat === 'all' && next.context?.songs?.length) {
    // playlist / album loops: queue the whole list again
    const songs = next.shuffle ? shuffled(next.context.songs, rng) : next.context.songs;
    next = { ...next, upcoming: songs.map((s) => entry(s, 'context')), userCount: 0 };
  }

  if (!next.upcoming.length) {
    if (next.mode === 'radio' && next.autoplay && next.current) return { state, song: null, status: 'waiting' };
    return {
      state: { ...state, ended: true, offerRadio: next.mode === 'context' && Boolean(next.current) },
      song: null,
      status: 'ended',
    };
  }

  const [first, ...rest] = next.upcoming;
  return {
    state: {
      ...next,
      history: pushHistory(next.history, next.current),
      played: withPlayed(next.played, first.song.id),
      current: first.song,
      upcoming: rest,
      userCount: first.origin === 'user' ? Math.max(0, next.userCount - 1) : next.userCount,
      ended: false,
      offerRadio: false,
    },
    song: first.song,
    status: 'playing',
  };
}

/**
 * Previous song: restarts the current one if it has played for a few seconds, otherwise goes back through history.
 * The song you leave is put back at the front of the queue, so "previous, then next" returns to it.
 */
export function previous(state, { currentTime = 0, restartThreshold = 3 } = {}) {
  if (!state.current) return { state, song: null, status: 'none' };
  if (currentTime > restartThreshold || !state.history.length) return { state, song: state.current, status: 'restart' };
  const prev = state.history[state.history.length - 1];
  return {
    state: {
      ...state,
      current: prev,
      history: state.history.slice(0, -1),
      upcoming: [entry(state.current, 'user'), ...state.upcoming],
      userCount: state.userCount + 1,
      ended: false,
    },
    song: prev,
    status: 'playing',
  };
}

/** Tap a song in the queue: play it now. Songs skipped over move into history and count as played. */
export function jumpTo(state, index) {
  if (index < 0 || index >= state.upcoming.length) return { state, song: null };
  const skipped = state.upcoming.slice(0, index);
  const target = state.upcoming[index];
  const userRemoved = state.upcoming.slice(0, index + 1).filter((e) => e.origin === 'user').length;
  let history = pushHistory(state.history, state.current);
  for (const e of skipped) history = pushHistory(history, e.song);
  return {
    state: {
      ...state,
      history,
      played: withPlayed(state.played, ...skipped.map((e) => e.song.id), target.song.id),
      current: target.song,
      upcoming: state.upcoming.slice(index + 1),
      userCount: Math.max(0, state.userCount - userRemoved),
      ended: false,
      offerRadio: false,
    },
    song: target.song,
  };
}

// ---------------------------------------------------------------- editing the queue

/** "Add to queue": after the user's other queued songs, before the radio / playlist songs. */
export function addToQueue(state, song) {
  if (!song) return state;
  const upcoming = [...state.upcoming];
  upcoming.splice(state.userCount, 0, entry(song, 'user'));
  return { ...state, upcoming, userCount: state.userCount + 1 };
}

/** "Play next": at the very front of the queue. */
export function playNext(state, song) {
  if (!song) return state;
  return { ...state, upcoming: [entry(song, 'user'), ...state.upcoming], userCount: state.userCount + 1 };
}

export function removeFromUpcoming(state, index) {
  if (index < 0 || index >= state.upcoming.length) return state;
  return {
    ...state,
    upcoming: state.upcoming.filter((_, i) => i !== index),
    userCount: index < state.userCount ? state.userCount - 1 : state.userCount,
  };
}

/**
 * Drag to reorder. Keeps the invariant "user-added songs come first": a song dropped into the user section becomes
 * user-added, one dragged out of it joins the radio / playlist section.
 */
export function reorderUpcoming(state, from, to) {
  const n = state.upcoming.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return state;
  const list = [...state.upcoming];
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);

  let userCount = state.userCount;
  if (from < userCount && to >= userCount) userCount -= 1; // left the user section
  else if (from >= userCount && to < userCount) userCount += 1; // dropped into it

  const origin = sourceOrigin(state);
  return { ...state, userCount, upcoming: list.map((e, i) => entry(e.song, i < userCount ? 'user' : origin, e.uid)) };
}

export function clearUserQueue(state) {
  return { ...state, upcoming: sourceEntries(state), userCount: 0 };
}

/** Remove a song from the history list (index into `history`). */
export function removeFromHistory(state, index) {
  if (index < 0 || index >= state.history.length) return state;
  return { ...state, history: state.history.filter((_, i) => i !== index) };
}

/**
 * Queue the fallback songs (songs the radio could not replace), skipping anything already played or queued.
 * Used when the related-songs request fails or returns nothing, so playback still carries on.
 */
export function applyFallback(state) {
  if (!state.fallback.length) return state;
  const known = new Set([state.current?.id, ...state.played, ...state.upcoming.map((e) => e.song.id)].filter(Boolean));
  const fresh = state.fallback.filter((s) => s?.id && !known.has(s.id)).map((s) => entry(s, 'radio'));
  return { ...state, fallback: [], upcoming: [...state.upcoming, ...fresh], ended: fresh.length ? false : state.ended };
}

/**
 * One flat list for views that show "the whole queue": already-played songs, the current one, then what is coming.
 * `queueIndex` points at the current song (-1 when nothing plays).
 */
export function toFlatQueue(state) {
  if (!state.current) return { queue: [], queueIndex: -1 };
  return { queue: [...state.history, state.current, ...state.upcoming.map((e) => e.song)], queueIndex: state.history.length };
}

// ---------------------------------------------------------------- settings

/** Shuffle reorders the REMAINING playlist / album songs; turning it off restores their original order. */
export function setShuffle(state, on, { rng = Math.random } = {}) {
  if (state.shuffle === on) return state;
  if (state.mode !== 'context' || !state.context) return { ...state, shuffle: on }; // radio order is already algorithmic
  const remaining = sourceEntries(state).map((e) => e.song);
  let ordered;
  if (on) ordered = shuffled(remaining, rng);
  else {
    const ids = new Set(remaining.map((s) => s.id));
    ordered = state.context.songs.filter((s) => ids.has(s.id));
  }
  return { ...state, shuffle: on, upcoming: [...userEntries(state), ...ordered.map((s) => entry(s, 'context'))] };
}

export const setRepeat = (state, repeat) => (['off', 'all', 'one'].includes(repeat) ? { ...state, repeat } : state);
export const nextRepeat = (repeat) => (repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off');
export const setAutoplay = (state, on) => ({ ...state, autoplay: Boolean(on) });

// ---------------------------------------------------------------- radio refill

/** True when the radio should fetch more songs (silently, in the background). */
export function needsRefill(state, { threshold = REFILL_THRESHOLD, now = Date.now() } = {}) {
  return (
    state.mode === 'radio' &&
    state.autoplay &&
    Boolean(state.current) &&
    !state.refill.pending &&
    state.upcoming.length < threshold &&
    now >= state.refill.retryAt
  );
}

/** Mark a refill as in flight and describe the request: seed = what is playing, exclude = everything already played. */
export function startRefill(state, { limit = REFILL_BATCH } = {}) {
  const exclude = unique([
    state.current?.id,
    ...state.upcoming.map((e) => e.song.id),
    ...[...state.played].reverse(), // newest first, so the cap keeps the most recent plays
  ].filter(Boolean)).slice(0, MAX_EXCLUDE);
  return {
    state: { ...state, refill: { ...state.refill, pending: true } },
    request: { seedId: state.current?.id ?? null, exclude, limit },
  };
}

/**
 * Add fetched songs to the radio queue, skipping anything already played, queued or playing.
 * A batch with nothing new counts as a failure so we back off instead of asking again immediately.
 */
export function applyRefill(state, items, { now = Date.now() } = {}) {
  const known = new Set([state.current?.id, ...state.played, ...state.upcoming.map((e) => e.song.id)].filter(Boolean));
  const fresh = [];
  for (const song of items || []) {
    if (song?.id && !known.has(song.id)) {
      known.add(song.id);
      fresh.push(entry(song, 'radio'));
    }
  }
  if (!fresh.length) return refillFailed(state, { now });
  return { ...state, upcoming: [...state.upcoming, ...fresh], refill: { pending: false, failures: 0, retryAt: 0 }, ended: false };
}

export const REFILL_BACKOFF_MS = (failures) => Math.min(30000, 1000 * 2 ** Math.max(0, failures - 1));

/** The fetch failed (or returned nothing new): stop asking for a while, longer after each failure (1s ... 30s). */
export function refillFailed(state, { now = Date.now() } = {}) {
  const failures = state.refill.failures + 1;
  return { ...state, refill: { pending: false, failures, retryAt: now + REFILL_BACKOFF_MS(failures) } };
}

/**
 * Fetch more related songs if the radio is running low.
 * @param {{ get: () => QueueState, update: (fn: (s: QueueState) => QueueState) => void,
 *   fetchRelated: (req: { seedId: string, exclude: string[], limit: number }) => Promise<Song[]>, now?: () => number }} io
 * @returns {Promise<boolean>} true when songs were added
 */
export async function runRefill({ get, update, fetchRelated, now = Date.now }) {
  if (!needsRefill(get(), { now: now() })) return false;
  let request;
  update((s) => {
    const started = startRefill(s);
    request = started.request;
    return started.state;
  });
  try {
    const items = await fetchRelated(request);
    let added = 0;
    update((s) => {
      const next = applyRefill(s, items, { now: now() });
      added = next.upcoming.length - s.upcoming.length;
      return added ? next : applyFallback(next); // the radio had nothing new: play on through the fallback songs
    });
    return added > 0;
  } catch {
    update((s) => applyFallback(refillFailed(s, { now: now() })));
    return false;
  }
}

// ---------------------------------------------------------------- views

/** What the queue panel shows: Now playing, Next in queue (user-added), then Next from radio / playlist. */
export function getSections(state) {
  const source = sourceEntries(state).map((e) => e.song);
  return {
    nowPlaying: state.current,
    nextInQueue: userEntries(state).map((e) => e.song),
    nextInQueueEntries: userEntries(state),
    nextFrom: {
      entries: sourceEntries(state),
      kind: state.mode,
      label: state.mode === 'context' ? (state.context?.label ? `Next from ${state.context.label}` : 'Next in this list') : 'Next from radio',
      items: source,
    },
  };
}

/** The next song that will play (for the "Up next" card and for preloading), without changing anything. */
export const peekNext = (state) => (state.upcoming[0] ? state.upcoming[0].song : state.mode === 'context' && state.repeat === 'all' ? state.context?.songs?.[0] ?? null : null);

/** Small serialisable snapshot (for resuming on another device later). */
export function toSnapshot(state) {
  return {
    current: state.current,
    upcoming: state.upcoming,
    userCount: state.userCount,
    played: state.played.slice(-MAX_EXCLUDE),
    mode: state.mode,
    context: state.context ? { ...state.context, songs: state.context.songs.slice(0, 200) } : null,
    autoplay: state.autoplay,
    shuffle: state.shuffle,
    repeat: state.repeat,
  };
}

/**
 * Give every entry a unique uid. Snapshots saved before uids existed have none, and a hand-edited or corrupted snapshot
 * may repeat one: both are repaired here, so the rest of the engine can rely on "uid is unique".
 */
export function normalizeEntries(upcoming, userCount = 0) {
  const seen = new Set();
  const list = (Array.isArray(upcoming) ? upcoming : [])
    .filter((e) => e && e.song && e.song.id)
    .slice(0, MAX_QUEUE)
    .map((e) => {
      const uid = typeof e.uid === 'string' && e.uid && !seen.has(e.uid) ? e.uid : newUid();
      seen.add(uid);
      return { uid, song: e.song, origin: ['user', 'radio', 'context'].includes(e.origin) ? e.origin : 'radio' };
    });
  return { upcoming: list, userCount: Math.max(0, Math.min(userCount, list.length)) };
}

export const fromSnapshot = (snap) => {
  const { upcoming, userCount } = normalizeEntries(snap?.upcoming, snap?.userCount ?? 0);
  return createQueueState({ ...snap, upcoming, userCount, history: [] });
};

/** Index of a queue slot by uid (-1 when it is not in the upcoming list). */
export const indexOfUid = (state, uid) => state.upcoming.findIndex((e) => e.uid === uid);
