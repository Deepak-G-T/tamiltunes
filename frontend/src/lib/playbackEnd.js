/**
 * When is a song finished, and which length is the real one? Pure rules used by AudioContext (tests: playbackEnd.test.js).
 * Why: a stream can end before the length the catalog or the file header promised (a cut file, a dropped connection near the end). Waiting only
 * for the audio element's 'ended' event then leaves the player paused at 5:13 / 5:28 and the next song never starts.
 */
export const NEAR_END_SECONDS = 20;        // a stop this close to the end counts as "the song is finished"
export const STALL_FINISH_MS = 5000;       // stuck buffering this long, near the end: finished
export const PAUSE_FINISH_MS = 1500;       // paused by something other than the person, near the end, and it stays paused: finished
export const TRANSITION_WATCHDOG_MS = 15000; // between two songs the player keeps saying "playing" for at most this long
export const NOTIFICATION_WAIT_MS = 3000;  // wait this long for the real length before showing the notification without it
export const DURATION_TOLERANCE_SECONDS = 3;
const MIN_PLAYED_SECONDS = 3;              // an error before this is a stream that never started (try the other addresses)

export const isUsableDuration = (d) => Number.isFinite(d) && d > 0;

/** The ONE length of a song: the audio element's real duration once known, the catalog's only when the element has none. Never both. */
export function resolveDuration({ audioDuration, catalogDuration } = {}) {
  if (isUsableDuration(audioDuration)) return audioDuration;
  return isUsableDuration(catalogDuration) ? catalogDuration : 0;
}

/** True when the catalog and the real length agree to within a few seconds (otherwise the catalog is ignored). */
export const durationsAgree = (a, b, tolerance = DURATION_TOLERANCE_SECONDS) => isUsableDuration(a) && isUsableDuration(b) && Math.abs(a - b) <= tolerance;

export const remainingSeconds = ({ currentTime, duration } = {}) => (isUsableDuration(duration) && Number.isFinite(currentTime) ? duration - currentTime : Infinity);
export const isNearEnd = (p, within = NEAR_END_SECONDS) => (p?.currentTime > 0) && remainingSeconds(p) <= within;

/**
 * What a 'pause' event means.
 *  'finished' the element reached its end (an 'ended' event follows at once): keep saying "playing", the next song decides
 *  'suspect'  paused by something else (not the person, not a seek) close to the end: if it stays paused, treat the song as finished
 *  'normal'   a real pause
 */
export function pauseKind({ ended, userPaused, seeking, currentTime, duration } = {}) {
  if (ended) return 'finished';
  if (userPaused || seeking) return 'normal';
  return isNearEnd({ currentTime, duration }) ? 'suspect' : 'normal';
}

/** Stuck buffering near the end for long enough: the rest of the song is not coming. */
export const stallShouldFinish = ({ stalledForMs, currentTime, duration }) => stalledForMs >= STALL_FINISH_MS && isNearEnd({ currentTime, duration });

/**
 * What to do on an audio 'error'.
 *  'candidates' the song never really started: try the other stream addresses (the old behaviour)
 *  'finish'     near the end: the song is finished, go to the next one
 *  'retry'      in the middle, first time: load the same stream again and continue from the same second
 *  'skip'       in the middle, again: give up on this song (toast), go to the next one
 */
export function errorAction({ currentTime, duration, midSongErrors = 0 } = {}) {
  if (!(currentTime > MIN_PLAYED_SECONDS)) return 'candidates';
  if (isNearEnd({ currentTime, duration })) return 'finish';
  return midSongErrors < 1 ? 'retry' : 'skip';
}
