/**
 * Decides when a play "counts" for Speed Dial and what to report. Pure: feed it playback ticks, get events back.
 *
 * A play counts after 30 s of real listening or half the song (whichever is first), or when it plays to the end.
 * Listening time is accumulated from playback, so seeking forward does not count. One report is sent when the play
 * counts; a second one when it completes. A song left before it counted is reported as an early skip (if it played
 * at least 2 s). Mirrors the server rule in backend/src/services/speedDial/ranking.js (the server re-checks it).
 */

export const COUNT_AFTER_SECONDS = 30;
export const COUNT_AFTER_FRACTION = 0.5;
export const MIN_SKIP_SECONDS = 2;
const MAX_TICK_GAP = 3; // seconds of playback between two ticks that we still treat as continuous listening
const END_MARGIN = 3; // within this many seconds of the end counts as "played to the end"

export const isCounted = ({ listened, duration, completed = false }) =>
  completed || listened >= COUNT_AFTER_SECONDS || (duration > 0 && listened >= COUNT_AFTER_FRACTION * duration);

const defaultMakeId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

export const createTracker = () => null; // "nothing playing yet"

const songMeta = (song) => ({
  songId: song.id,
  title: song.title,
  artist: song.artist || song.singers,
  album: song.album,
  image: song.image,
  duration: Math.round(song.duration) || undefined,
  streamUrl: song.streamUrl,
});

const begin = (song, makeId, tick) => ({
  song, playId: makeId(), listened: 0, counted: false, sentCounted: false, duration: tick.duration || song.duration || 0,
  lastTime: tick.currentTime, lastWall: tick.now, nearEnd: false,
});

/** Events that end a play (completion, or an early skip). */
function finish(t) {
  if (!t) return [];
  const base = { ...songMeta(t.song), playId: t.playId, listenedSec: Math.round(t.listened), durationSec: Math.round(t.duration) || undefined };
  if (t.nearEnd) return [{ ...base, completed: true }]; // played to the end: always counts (also if it was never reported)
  if (!t.counted && t.listened >= MIN_SKIP_SECONDS) return [{ ...base, skippedAtSec: Math.round(t.listened) }];
  return [];
}

/**
 * One playback tick.
 * @param {object|null} state result of the previous call (or createTracker())
 * @param {{ song: object|null, currentTime: number, duration: number, isPlaying: boolean, now?: number }} tick
 * @returns {{ state: object|null, events: object[] }}
 */
export function onTick(state, tick, { makeId = defaultMakeId } = {}) {
  const now = tick.now ?? Date.now();
  const t = { ...tick, now };
  const events = [];
  let s = state;

  // song changed (or stopped): close the previous play
  if (s && (!t.song || t.song.id !== s.song.id)) {
    events.push(...finish(s));
    s = null;
  }
  if (!t.song) return { state: null, events };
  if (!s) s = begin(t.song, makeId, t);

  // same song restarted from the top after reaching the end (repeat one): that was a completed play, start another
  if (s.nearEnd && t.currentTime < s.lastTime - 10) {
    events.push(...finish(s));
    s = begin(t.song, makeId, t);
  }

  if (t.duration > 0) s = { ...s, duration: t.duration };
  const dCur = t.currentTime - s.lastTime;
  const dWall = (now - s.lastWall) / 1000;
  let listened = s.listened;
  if (t.isPlaying && dCur > 0 && dCur <= MAX_TICK_GAP) listened += Math.min(dCur, dWall + 0.25); // seeks and pauses add nothing
  const nearEnd = s.nearEnd || (s.duration > 0 && t.currentTime >= s.duration - END_MARGIN && listened >= MIN_SKIP_SECONDS);

  s = { ...s, listened, lastTime: t.currentTime, lastWall: now, nearEnd };
  const counted = isCounted({ listened: s.listened, duration: s.duration });
  s = { ...s, counted };

  if (counted && !s.sentCounted) {
    events.push({ ...songMeta(s.song), playId: s.playId, listenedSec: Math.round(s.listened), durationSec: Math.round(s.duration) || undefined });
    s = { ...s, sentCounted: true };
  }
  return { state: s, events };
}

/** The page is closing or the user signed out: report what we know about the current play. */
export function onLeave(state) {
  return { state: null, events: finish(state) };
}
