import { describe, it, expect } from 'vitest';
import { createTracker, onTick, onLeave, isCounted } from './playTracker';

const song = (id, extra = {}) => ({ id, title: `Song ${id}`, artist: 'Artist', duration: 200, ...extra });
let n = 0;
const makeId = () => `play-${++n}-xxxxxxxx`;

/** Play `seconds` of audio in 0.5 s ticks starting at `from`; returns the events produced. */
function listen(state, s, { from = 0, seconds, duration = 200, isPlaying = true, step = 0.5, wall = 0 } = {}) {
  const events = [];
  let cur = state;
  let t = from;
  for (let i = 0; i <= seconds / step; i++) {
    const r = onTick(cur, { song: s, currentTime: from + i * step, duration, isPlaying, now: wall + i * step * 1000 }, { makeId });
    cur = r.state;
    events.push(...r.events);
    t = from + i * step;
  }
  return { state: cur, events, time: t };
}

describe('what counts as a play', () => {
  it('30 seconds, or half of a short song, or completion', () => {
    expect(isCounted({ listened: 29, duration: 200 })).toBe(false);
    expect(isCounted({ listened: 30, duration: 200 })).toBe(true);
    expect(isCounted({ listened: 20, duration: 40 })).toBe(true);
    expect(isCounted({ listened: 19, duration: 40 })).toBe(false);
    expect(isCounted({ listened: 1, duration: 200, completed: true })).toBe(true);
  });
});

describe('play tracker', () => {
  it('reports nothing before the threshold, then exactly one event when the play counts', () => {
    const s = song('a');
    const early = listen(createTracker(), s, { seconds: 20 });
    expect(early.events).toEqual([]);
    const later = listen(early.state, s, { from: early.time, seconds: 20, wall: 20000 });
    const counted = later.events.filter((e) => !e.completed && e.skippedAtSec == null);
    expect(counted).toHaveLength(1);
    expect(counted[0]).toMatchObject({ songId: 'a', title: 'Song a', listenedSec: 30, durationSec: 200 });
    expect(counted[0].playId).toMatch(/^play-/);
  });

  it('a short song counts at half its length', () => {
    const r = listen(createTracker(), song('short', { duration: 40 }), { seconds: 21, duration: 40 });
    expect(r.events).toHaveLength(1);
    expect(r.events[0].listenedSec).toBe(20);
  });

  it('does not count seeking forward as listening', () => {
    const s = song('b');
    let st = listen(createTracker(), s, { seconds: 5 });
    // jump to 150 s and listen 2 more seconds: only ~7 s of real listening
    const r = listen(st.state, s, { from: 150, seconds: 2, wall: 5000 });
    expect(r.events).toEqual([]);
    expect(r.state.listened).toBeLessThan(10);
  });

  it('does not count paused time', () => {
    const s = song('c');
    let r = listen(createTracker(), s, { seconds: 10 });
    r = listen(r.state, s, { from: r.time, seconds: 60, isPlaying: false, wall: 10000 }); // paused for a minute
    expect(r.events).toEqual([]);
    expect(r.state.listened).toBeLessThan(11);
  });

  it('leaving a song early after at least 2 s is an early skip; a mis-tap is nothing', () => {
    const a = listen(createTracker(), song('a'), { seconds: 6 });
    const next = onTick(a.state, { song: song('b'), currentTime: 0, duration: 200, isPlaying: true, now: 7000 }, { makeId });
    expect(next.events).toHaveLength(1);
    expect(next.events[0]).toMatchObject({ songId: 'a', skippedAtSec: 6 });
    expect(next.events[0].completed).toBeUndefined();

    const tap = listen(createTracker(), song('x'), { seconds: 1 });
    expect(onTick(tap.state, { song: song('y'), currentTime: 0, duration: 200, isPlaying: true, now: 2000 }, { makeId }).events).toEqual([]);
  });

  it('leaving after the play counted is not a skip', () => {
    const a = listen(createTracker(), song('a'), { seconds: 40 });
    expect(a.events).toHaveLength(1); // the counted report
    const next = onTick(a.state, { song: song('b'), currentTime: 0, duration: 200, isPlaying: true, now: 41000 }, { makeId });
    expect(next.events).toEqual([]);
  });

  it('reports completion with the SAME playId when a counted song plays to the end', () => {
    const s = song('a', { duration: 60 });
    let r = listen(createTracker(), s, { seconds: 59, duration: 60 });
    const countedEvent = r.events[0];
    expect(countedEvent.completed).toBeUndefined();
    const end = onTick(r.state, { song: song('b'), currentTime: 0, duration: 200, isPlaying: true, now: 61000 }, { makeId });
    expect(end.events).toHaveLength(1);
    expect(end.events[0]).toMatchObject({ songId: 'a', completed: true, playId: countedEvent.playId });
  });

  it('a very short song counts at half its length, then reports completion with the same play id', () => {
    const s = song('jingle', { duration: 6 });
    const r = listen(createTracker(), s, { seconds: 5.5, duration: 6 });
    expect(r.events).toHaveLength(1); // counted at 3 s (half of 6 s), not at 30 s
    expect(r.events[0].listenedSec).toBe(3);
    const end = onTick(r.state, { song: song('next'), currentTime: 0, duration: 200, isPlaying: true, now: 7000 }, { makeId });
    expect(end.events[0]).toMatchObject({ completed: true, playId: r.events[0].playId });
  });

  it('repeat-one: restarting after the end completes the first play and begins a new one', () => {
    const s = song('loop', { duration: 40 });
    let r = listen(createTracker(), s, { seconds: 39, duration: 40 });
    const firstId = r.events[0].playId;
    const restart = onTick(r.state, { song: s, currentTime: 0.5, duration: 40, isPlaying: true, now: 41000 }, { makeId });
    expect(restart.events).toHaveLength(1);
    expect(restart.events[0]).toMatchObject({ completed: true, playId: firstId });
    expect(restart.state.playId).not.toBe(firstId);
  });

  it('onLeave (page closing) reports the current play', () => {
    const a = listen(createTracker(), song('a'), { seconds: 8 });
    const left = onLeave(a.state);
    expect(left.events[0]).toMatchObject({ songId: 'a', skippedAtSec: 8 });
    expect(left.state).toBeNull();
    expect(onLeave(null).events).toEqual([]);
  });

  it('stopping playback (no song) closes the play', () => {
    const a = listen(createTracker(), song('a'), { seconds: 5 });
    const stop = onTick(a.state, { song: null, currentTime: 0, duration: 0, isPlaying: false, now: 6000 }, { makeId });
    expect(stop.state).toBeNull();
    expect(stop.events[0].skippedAtSec).toBe(5);
  });
});
