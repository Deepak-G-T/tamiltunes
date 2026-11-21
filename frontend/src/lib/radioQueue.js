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

import { createIdentitySet, collapseDuplicates, movieOf, sameSong } from './songIdentity';

export const REFILL_THRESHOLD = 5; // refill when fewer than this many songs remain (the radio keeps the queue well stocked)
export const REFILL_BATCH = 50; // songs requested per refill (the panel then says "Added N similar songs")
export const MAX_ARTIST_RUN = 3;
export const MOVIE_WINDOW = 10; // within any 10 songs of the radio block ...
export const MAX_PER_MOVIE = 2; // ... at most this many from one film or album
export const RECENT_FOR_IDENTITY = 50; // skipped songs kept in the "skipped" list (not a rule)
export const RECENT_TO_SEND = 50; // last-played ids sent with a refill: the server prefers songs outside the last 20 (a soft preference, never a rule)
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
    refill: { pending: false, failures: 0, retryAt: 0, error: false }, // error: the last request failed (the panel offers Retry)
    fallback: [], // songs to queue if the radio returns nothing (e.g. the other Speed Dial tiles)
    stopAfter: false, // "Stop after this song": pause when the current song ends
    skipped: [], // songs skipped this session (most recent last), kept out of autoplay like the played ones
    ended: false, // nothing left to play
    offerRadio: false, // a playlist / album finished: the UI may offer to continue with radio
    exhaustedFor: null, // the id of the playing song when the server said nothing new is left for it (not already queued) even after widening: the panel says "Out of new songs"
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
  return cleanRadioDuplicates({
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
    exhaustedFor: null,
    refill: { pending: false, failures: 0, retryAt: 0 },
  });
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
    state: cleanRadioDuplicates({
      ...next,
      skipped: reason === 'skip' && next.current ? cap([...(next.skipped || []), next.current], RECENT_FOR_IDENTITY) : next.skipped || [],
      history: pushHistory(next.history, next.current),
      played: withPlayed(next.played, first.song.id),
      current: first.song,
      upcoming: rest,
      userCount: first.origin === 'user' ? Math.max(0, next.userCount - 1) : next.userCount,
      ended: false,
      offerRadio: false,
    }),
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
    state: cleanRadioDuplicates({
      ...state,
      current: prev,
      history: state.history.slice(0, -1),
      upcoming: [entry(state.current, 'user'), ...state.upcoming],
      userCount: state.userCount + 1,
      ended: false,
    }),
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
    state: cleanRadioDuplicates({
      ...state,
      history,
      played: withPlayed(state.played, ...skipped.map((e) => e.song.id), target.song.id),
      current: target.song,
      upcoming: state.upcoming.slice(index + 1),
      userCount: Math.max(0, state.userCount - userRemoved),
      ended: false,
      offerRadio: false,
    }),
    song: target.song,
  };
}

// ---------------------------------------------------------------- editing the queue

export const isQueueFull = (state) => state.upcoming.length >= MAX_QUEUE;

/** Index in the upcoming list of a song that is already queued (-1 when it is not). The playing song does not count. */
export const findQueued = (state, songOrId) =>
  typeof songOrId === 'string'
    ? state.upcoming.findIndex((e) => e.song.id === songOrId)
    : state.upcoming.findIndex((e) => sameSong(e.song, songOrId)); // the same song under another id counts as queued

/**
 * Move a queued song (from anywhere in the upcoming list) into the user's queue block, as "Play next" ('next') or
 * "Add to queue" ('end'). Used when the user adds a song that is already queued and chooses to move it.
 */
export function moveToQueue(state, index, where = 'end') {
  if (index < 0 || index >= state.upcoming.length) return state;
  const moved = state.upcoming[index];
  const rest = state.upcoming.filter((_, i) => i !== index);
  const userCount = index < state.userCount ? state.userCount - 1 : state.userCount;
  const at = where === 'next' ? 0 : userCount;
  const upcoming = [...rest.slice(0, at), entry(moved.song, 'user', moved.uid), ...rest.slice(at)];
  return { ...state, upcoming, userCount: userCount + 1 };
}

/** "Add to queue": after the user's other queued songs, before the radio / playlist songs. */
export function addToQueue(state, song) {
  if (!song || isQueueFull(state)) return state;
  const upcoming = [...state.upcoming];
  upcoming.splice(state.userCount, 0, entry(song, 'user'));
  return { ...state, upcoming, userCount: state.userCount + 1 };
}

/** "Play next": at the very front of the queue. */
export function playNext(state, song) {
  if (!song || isQueueFull(state)) return state;
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

/**
 * Remove several queued songs at once (by uid). Returns what was removed (with each song's old position) so the UI can offer Undo.
 * @returns {{ state: QueueState, removed: { index: number, entry: Entry }[] }}
 */
export function removeByUids(state, uids) {
  const drop = new Set(uids);
  const removed = [];
  const upcoming = [];
  let userCount = state.userCount;
  state.upcoming.forEach((e, index) => {
    if (drop.has(e.uid)) {
      removed.push({ index, entry: e });
      if (index < state.userCount) userCount -= 1;
    } else upcoming.push(e);
  });
  if (!removed.length) return { state, removed };
  return { state: { ...state, upcoming, userCount }, removed };
}

/** Undo a removal: put the songs back where they were (the list must not have been reshuffled in between). */
export function restoreRemoved(state, removed) {
  if (!removed?.length) return state;
  const upcoming = [...state.upcoming];
  let userCount = state.userCount;
  for (const { index, entry: e } of [...removed].sort((a, b) => a.index - b.index)) {
    if (upcoming.length >= MAX_QUEUE || upcoming.some((x) => x.uid === e.uid)) continue;
    const at = Math.min(index, upcoming.length);
    upcoming.splice(at, 0, e);
    if (e.origin === 'user' && at <= userCount) userCount += 1;
    else if (e.origin !== 'user' && at < userCount) { // landed inside the user block, so it becomes a user song
      upcoming[at] = { ...e, origin: 'user' };
      userCount += 1;
    }
  }
  return { ...state, upcoming, userCount };
}

/** Move several queued songs into the user's block, keeping their relative order: 'next' = front, 'end' = after the other added songs. */
export function moveManyToQueue(state, uids, where = 'next') {
  const set = new Set(uids);
  const picked = state.upcoming.filter((e) => set.has(e.uid));
  if (!picked.length) return state;
  const rest = state.upcoming.filter((e) => !set.has(e.uid));
  const restUser = state.upcoming.slice(0, state.userCount).filter((e) => !set.has(e.uid)).length;
  const at = where === 'next' ? 0 : restUser;
  const moved = picked.map((e) => entry(e.song, 'user', e.uid));
  return { ...state, upcoming: [...rest.slice(0, at), ...moved, ...rest.slice(at)], userCount: restUser + moved.length };
}

/** "Refresh recommendations": drop the auto-added songs so the radio fetches a new set. Added songs stay. Not for playlists / albums. */
export function clearRadio(state) {
  if (state.mode !== 'radio') return state;
  return { ...state, upcoming: userEntries(state), refill: { pending: false, failures: 0, retryAt: 0 }, ended: false };
}

/** Remove the playing song from the queue and play the next one. The removed song does not go to history. */
export function removeCurrent(state, opts) {
  const r = advance(state, { reason: 'skip', ...opts });
  if (r.status !== 'playing') return r;
  return { ...r, state: { ...r.state, history: r.state.history.slice(0, -1) } };
}

/**
 * Tap a song in the History list: play it now. What was playing goes to history, the queue is left as it is, nothing is lost.
 * `index` is into `state.history` (oldest first).
 */
export function playFromHistory(state, index) {
  if (index < 0 || index >= state.history.length) return { state, song: null };
  const song = state.history[index];
  const rest = state.history.filter((_, i) => i !== index);
  return {
    state: cleanRadioDuplicates({
      ...state,
      history: pushHistory(rest, state.current && state.current.id !== song.id ? state.current : null),
      played: withPlayed(state.played, song.id),
      current: song,
      ended: false,
      offerRadio: false,
    }),
    song,
  };
}

export const setStopAfter = (state, on) => ({ ...state, stopAfter: Boolean(on) });

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
  const fresh = arrangeBatch(state, filterNewSongs(state, state.fallback));
  return { ...state, fallback: [], upcoming: [...state.upcoming, ...fresh.map((s) => entry(s, 'radio'))], ended: fresh.length ? false : state.ended };
}

// ---------------------------------------------------------------- no repeats (same song, versions of it)

const radioSongs = (state) => state.upcoming.filter((e) => e.origin !== 'user').map((e) => e.song);

/**
 * Keep only songs the queue does not hold yet (THE no-repeat rule; play history is not consulted):
 *   - not the playing song, or a version of it (unplugged, remix ...)
 *   - not the same song as anything queued (yours or the radio's), whatever its id, cover or spelling (canonical matching, songIdentity.js)
 *   - one copy of each song inside the batch: the best version (original release over a compilation)
 * A song played yesterday, or a minute ago, may come back. Manual "Add to queue" does not use this: what you add yourself always wins.
 */
export function filterNewSongs(state, items) {
  const queued = createIdentitySet([state.current, ...state.upcoming.map((e) => e.song)].filter(Boolean));
  const playing = createIdentitySet(state.current ? [state.current] : []);
  const out = [];
  for (const song of collapseDuplicates((items || []).filter((x) => x?.id))) {
    if (queued.has(song) || playing.hasVariant(song)) continue;
    queued.add(song);
    out.push(song);
  }
  return out;
}

/** Final order of a batch: artists spread out, and at most 2 songs per film or album within any 10 songs of the radio block. */
export function arrangeBatch(state, fresh) {
  const tail = [state.current, ...state.upcoming.map((e) => e.song)].filter(Boolean);
  const radio = radioSongs(state);
  const out = [];
  for (const song of spreadByArtist(tail, fresh)) {
    const movie = movieOf(song);
    const window = [...radio, ...out].slice(-(MOVIE_WINDOW - 1));
    if (movie && window.filter((x) => movieOf(x) === movie).length >= MAX_PER_MOVIE) continue;
    const key = artistKey(song);
    const seq = [...tail, ...out];
    let run = 0;
    for (let i = seq.length - 1; i >= 0 && key && artistKey(seq[i]) === key; i--) run++;
    if (key && run >= MAX_ARTIST_RUN) continue;
    out.push(song);
  }
  return out;
}

/**
 * Remove duplicates inside the whole queue (keep the first). A radio (autoplay) row goes when it is the same song as the playing song or as a row
 * before it, or a version of the PLAYING song. Songs you added yourself, and playlist / album rows, are never touched.
 * Run after every refill, when a queue is loaded, and whenever the playing song changes.
 */
export function cleanRadioDuplicates(state) {
  if (!state.upcoming.some((e) => e.origin === 'radio')) return state;
  const seen = createIdentitySet(state.current ? [state.current] : []);
  const playing = createIdentitySet(state.current ? [state.current] : []);
  const upcoming = [];
  for (const e of state.upcoming) {
    if (e.origin === 'radio' && (seen.has(e.song) || playing.hasVariant(e.song))) continue;
    seen.add(e.song);
    upcoming.push(e);
  }
  return upcoming.length === state.upcoming.length ? state : { ...state, upcoming };
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

// ---------------------------------------------------------------- Retry and refresh

const retryNow = (refill) => ({ ...refill, pending: false, failures: 0, retryAt: 0, error: false });
/** "Retry" on the banner ("Couldn't load more songs"): forget the back-off and ask again now. */
export const retryRefill = (state) => ({ ...state, exhaustedFor: null, refill: retryNow(state.refill) });
/** "Refresh recommendations": drops duplicate autoplay rows and asks for fresh ones. Songs you added stay. */
export const refreshRecommendations = (state) => {
  const cleaned = cleanRadioDuplicates(state);
  return { ...cleaned, exhaustedFor: null, refill: retryNow(cleaned.refill) };
};
/** Is the playing song's radio out of new songs (nothing left that is not already queued)? */
export const isExhausted = (state) => Boolean(state.current) && state.exhaustedFor === state.current.id;
/** Did the last request for more songs fail (and nothing is loading)? */
export const refillFailedBanner = (state) => Boolean(state.refill?.error) && !state.refill.pending && state.mode === 'radio' && state.upcoming.length < REFILL_THRESHOLD;

// ---------------------------------------------------------------- radio refill

/** True when the radio should fetch more songs (silently, in the background). */
export function needsRefill(state, { threshold = REFILL_THRESHOLD, now = Date.now() } = {}) {
  return (
    state.mode === 'radio' &&
    state.autoplay &&
    Boolean(state.current) &&
    !state.refill.pending &&
    !isExhausted(state) &&
    state.upcoming.length < threshold &&
    now >= state.refill.retryAt
  );
}

/** The artist a song counts as for "not too many in a row": the first name in its artist field, lower-cased. */
export const artistKey = (song) => String(song?.artist || song?.singers || '').split(/[,&]/)[0].normalize('NFC').trim().toLowerCase();

/**
 * Order `fresh` songs so that no more than `maxRun` in a row share an artist, counting the songs already queued before them
 * (`tail`: what plays right before the new songs). Keeps the incoming order as much as possible; if only one artist is left it
 * simply carries on (it never drops songs).
 */
export function spreadByArtist(tail, fresh, maxRun = MAX_ARTIST_RUN) {
  const pool = [...fresh];
  const keys = pool.map(artistKey);
  const out = [];
  let run = 0;
  let last = null;
  for (const s of tail.slice(-maxRun)) { const k = artistKey(s); run = k === last ? run + 1 : 1; last = k; }
  const allowed = (k) => !(last && k === last && run >= maxRun);
  while (pool.length) {
    let i = keys.findIndex(allowed); // the incoming order, unless an artist would run too long
    if (i < 0) i = 0; // only one artist is left: carry on, nothing is dropped
    // Look ahead: when one artist has more songs than the other artists can separate, use it now instead of leaving it for the end
    const counts = new Map();
    for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1);
    const [bigKey, bigCount] = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
    if (keys[i] !== bigKey && bigCount > maxRun * (pool.length - bigCount)) {
      const j = keys.findIndex((k) => k === bigKey && allowed(k));
      if (j >= 0) i = j;
    }
    const [song] = pool.splice(i, 1);
    const [k] = keys.splice(i, 1);
    run = k === last ? run + 1 : 1;
    last = k;
    out.push(song);
  }
  return out;
}

/**
 * Mark a refill as in flight and describe the request: seed = the playing song, exclude = what is already queued (the playing song and what is next),
 * limit = a big batch (50), recent = the last songs played, newest first (only a soft preference on the server: it skips the last 20 while enough songs remain).
 */
export function startRefill(state, { limit = REFILL_BATCH } = {}) {
  const exclude = unique([state.current?.id, ...state.upcoming.map((e) => e.song.id)].filter(Boolean)).slice(0, MAX_EXCLUDE);
  const recent = unique([...state.history].reverse().map((s) => s?.id).filter(Boolean)).slice(0, RECENT_TO_SEND);
  return {
    state: { ...state, refill: { ...state.refill, pending: true } },
    request: { seedId: state.current?.id ?? null, exclude, limit, ...(recent.length ? { recent } : {}) },
  };
}

/**
 * Add fetched songs to the radio queue, then check the whole queue for duplicates (keep the first).
 * A batch with nothing new counts as a failure so we back off instead of asking again immediately; only when the SERVER says nothing is left that is
 * not already queued ("exhausted") does the panel say "Out of new songs".
 */
export function applyRefill(state, items, { now = Date.now(), meta = null } = {}) {
  // Checked against the queue as it is NOW (this runs in the state updater), so songs added or played while the request was running are respected
  const fresh = arrangeBatch(state, filterNewSongs(state, items));
  if (!fresh.length) {
    const failed = refillFailed(state, { now });
    return meta?.exhausted ? { ...failed, exhaustedFor: state.current?.id ?? null } : failed;
  }
  return cleanRadioDuplicates({ ...state, upcoming: [...state.upcoming, ...fresh.map((song) => entry(song, 'radio'))], refill: { pending: false, failures: 0, retryAt: 0, error: false }, ended: false, exhaustedFor: null });
}

export const REFILL_BACKOFF_MS = (failures) => Math.min(30000, 1000 * 2 ** Math.max(0, failures - 1));

/** The fetch failed (or returned nothing new): stop asking for a while, longer after each failure (1s ... 30s). `error` = the request itself failed. */
export function refillFailed(state, { now = Date.now(), error = false } = {}) {
  const failures = state.refill.failures + 1;
  return { ...state, refill: { pending: false, failures, retryAt: now + REFILL_BACKOFF_MS(failures), error } };
}

/**
 * Fetch more related songs if the radio is running low.
 * @param {{ get: () => QueueState, update: (fn: (s: QueueState) => QueueState) => void,
 *   fetchRelated: (req: { seedId: string, exclude: string[], limit: number, recent?: string[] }) => Promise<Song[]>, now?: () => number }} io
 * @returns {Promise<boolean>} true when songs were added
 */
export async function runRefill({ get, update, fetchRelated, now = Date.now, onAdded }) {
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
      const next = applyRefill(s, items, { now: now(), meta: items?.meta });
      added = next.upcoming.length - s.upcoming.length;
      return added ? next : applyFallback(next); // the radio had nothing new: play on through the fallback songs
    });
    if (added > 0) onAdded?.(added);
    return added > 0;
  } catch {
    update((s) => applyFallback(refillFailed(s, { now: now(), error: true })));
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
  const { heard: _heard, allowRepeats: _allow, exhausted: _ex, wideNext: _wide, ...clean } = snap || {}; // fields of the first no-repeat version: ignored
  return cleanRadioDuplicates(createQueueState({ ...clean, upcoming, userCount, history: [], exhaustedFor: null }));
};

/** Index of a queue slot by uid (-1 when it is not in the upcoming list). */
export const indexOfUid = (state, uid) => state.upcoming.findIndex((e) => e.uid === uid);
