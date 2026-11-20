import { describe, it, expect } from 'vitest';
import { resolveDuration, durationsAgree, remainingSeconds, isNearEnd, pauseKind, stallShouldFinish, errorAction, NEAR_END_SECONDS, STALL_FINISH_MS } from './playbackEnd';

describe('one length per song', () => {
  it('the audio element wins, the catalog only fills in when the element has no length', () => {
    expect(resolveDuration({ audioDuration: 328, catalogDuration: 379 })).toBe(328);
    expect(resolveDuration({ audioDuration: NaN, catalogDuration: 379 })).toBe(379);
    expect(resolveDuration({ audioDuration: Infinity, catalogDuration: 200 })).toBe(200);
    expect(resolveDuration({ audioDuration: 0, catalogDuration: undefined })).toBe(0);
    expect(resolveDuration()).toBe(0);
  });
  it('a catalog length that differs by more than a few seconds is not trusted', () => {
    expect(durationsAgree(328, 330)).toBe(true);
    expect(durationsAgree(328, 379)).toBe(false);
    expect(durationsAgree(328, 0)).toBe(false);
  });
});

describe('near the end', () => {
  it('counts the last 30 seconds of the REAL length (a catalog length that is too long does not matter)', () => {
    expect(remainingSeconds({ currentTime: 313, duration: 328 })).toBe(15);
    expect(isNearEnd({ currentTime: 313, duration: 328 })).toBe(true);
    expect(isNearEnd({ currentTime: 300, duration: 328 })).toBe(true); // 28s remaining (< 30s)
    expect(isNearEnd({ currentTime: 290, duration: 328 })).toBe(false); // 38s remaining (> 30s)
    expect(isNearEnd({ currentTime: 313, duration: 379 })).toBe(false); // the stale catalog length would say "far from the end"
    expect(isNearEnd({ currentTime: 0, duration: 10 })).toBe(false);
    expect(isNearEnd({ currentTime: 100, duration: NaN })).toBe(false);
    expect(NEAR_END_SECONDS).toBe(30);
  });
});

describe('a song whose stream stops early must still advance', () => {
  it("'pause' at the natural end keeps saying playing (the next song decides)", () => {
    expect(pauseKind({ ended: true, userPaused: false, currentTime: 313, duration: 313 })).toBe('finished');
  });
  it('a pause near the end that nobody asked for is suspect (finished if it stays paused)', () => {
    expect(pauseKind({ ended: false, userPaused: false, seeking: false, currentTime: 313, duration: 328 })).toBe('suspect');
  });
  it('the person pausing, or seeking, or pausing in the middle is a normal pause', () => {
    expect(pauseKind({ ended: false, userPaused: true, currentTime: 313, duration: 328 })).toBe('normal');
    expect(pauseKind({ ended: false, userPaused: false, seeking: true, currentTime: 313, duration: 328 })).toBe('normal');
    expect(pauseKind({ ended: false, userPaused: false, currentTime: 100, duration: 328 })).toBe('normal');
  });
  it('stuck buffering near the end for 5 seconds is finished; earlier, or in the middle, is not', () => {
    expect(stallShouldFinish({ stalledForMs: STALL_FINISH_MS, currentTime: 313, duration: 328 })).toBe(true);
    expect(stallShouldFinish({ stalledForMs: 4000, currentTime: 313, duration: 328 })).toBe(false);
    expect(stallShouldFinish({ stalledForMs: 9000, currentTime: 100, duration: 328 })).toBe(false);
  });
});

describe('errors', () => {
  it('an error near the end retries once from the same second, then finishes (advances smoothly)', () => {
    expect(errorAction({ currentTime: 303, duration: 328, midSongErrors: 0 })).toBe('retry');
    expect(errorAction({ currentTime: 303, duration: 328, midSongErrors: 1 })).toBe('finish');
  });
  it('an error in the middle retries once from the same second, then skips', () => {
    expect(errorAction({ currentTime: 100, duration: 328, midSongErrors: 0 })).toBe('retry');
    expect(errorAction({ currentTime: 100, duration: 328, midSongErrors: 1 })).toBe('skip');
  });
  it('an error before the song really started tries the other stream addresses', () => {
    expect(errorAction({ currentTime: 0, duration: NaN })).toBe('candidates');
    expect(errorAction({ currentTime: 2, duration: 328 })).toBe('candidates');
  });
});
