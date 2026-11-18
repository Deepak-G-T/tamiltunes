import { describe, it, expect } from 'vitest';
import { moveItem, pinItem, unpinItem, removeItem, orderOf, hasNoPlays } from './speedDialOps';
import { startRadio } from './startRadio';

const item = (id, extra = {}) => ({ id, title: id, rank: 0, pinned: false, source: 'played', playCount: 1, ...extra });
const grid = () => ['a', 'b', 'c', 'd'].map((id, i) => item(id, { rank: i + 1 }));

describe('speed dial grid edits', () => {
  it('moves a tile, pins it and renumbers ranks', () => {
    const next = moveItem(grid(), 3, 0);
    expect(orderOf(next)).toEqual(['d', 'a', 'b', 'c']);
    expect(next.map((i) => i.rank)).toEqual([1, 2, 3, 4]);
    expect(next[0].pinned).toBe(true);
    expect(next[1].pinned).toBe(false);
  });
  it('ignores impossible moves and does not mutate its input', () => {
    const g = Object.freeze(grid());
    expect(moveItem(g, 1, 1)).toBe(g);
    expect(moveItem(g, -1, 2)).toBe(g);
    expect(moveItem(g, 0, 9)).toBe(g);
    expect(() => moveItem(g, 0, 2)).not.toThrow();
  });
  it('pins, unpins and removes', () => {
    expect(pinItem(grid(), 'b')[1].pinned).toBe(true);
    expect(unpinItem(pinItem(grid(), 'b'), 'b')[1].pinned).toBe(false);
    const removed = removeItem(grid(), 'b');
    expect(orderOf(removed)).toEqual(['a', 'c', 'd']);
    expect(removed.map((i) => i.rank)).toEqual([1, 2, 3]);
  });
  it('knows when nothing has been played yet (to show the hint)', () => {
    expect(hasNoPlays([item('s', { source: 'suggested', playCount: 0 })])).toBe(true);
    expect(hasNoPlays(grid())).toBe(false);
    expect(hasNoPlays([])).toBe(true);
  });
});

describe('interim radio on tap', () => {
  const S = (id) => ({ id, title: id });
  const io = (over = {}) => {
    const log = { played: [], queued: [] };
    return { log, io: { playSong: (s, q) => log.played.push([s.id, q.map((x) => x.id)]), addToQueue: (s) => log.queued.push(s.id), fetchRelated: async () => ['r1', 'r2', 'r3'].map(S), ...over } };
  };
  it('plays the song immediately, then queues related songs', async () => {
    const { log, io: i } = io();
    expect(await startRadio(S('seed'), i)).toBe(3);
    expect(log.played).toEqual([['seed', ['seed']]]);
    expect(log.queued).toEqual(['r1', 'r2', 'r3']);
  });
  it('asks for related songs seeded from the tapped song, excluding it', async () => {
    let req;
    const { io: i } = io({ fetchRelated: async (r) => { req = r; return []; } });
    await startRadio(S('seed'), i);
    expect(req).toEqual({ seedId: 'seed', exclude: ['seed'], limit: 20 });
  });
  it('skips songs already queued or equal to the seed', async () => {
    const { log, io: i } = io({ fetchRelated: async () => ['seed', 'r1', 'q1', 'r2'].map(S), queuedIds: () => new Set(['q1']) });
    await startRadio(S('seed'), i);
    expect(log.queued).toEqual(['r1', 'r2']);
  });
  it('falls back to the other tiles when the radio returns nothing or fails', async () => {
    const a = io({ fetchRelated: async () => [] });
    expect(await startRadio(S('seed'), { ...a.io, fallback: ['t1', 'seed', 't2'].map(S) })).toBe(2);
    expect(a.log.queued).toEqual(['t1', 't2']);
    const b = io({ fetchRelated: async () => { throw new Error('offline'); } });
    await startRadio(S('seed'), { ...b.io, fallback: ['t1'].map(S) });
    expect(b.log.queued).toEqual(['t1']);
    const c = io(); // the radio works: the fallback is not used
    await startRadio(S('seed'), { ...c.io, fallback: ['t1'].map(S) });
    expect(c.log.queued).toEqual(['r1', 'r2', 'r3']);
  });
  it('does not pile radio onto a song the user already replaced', async () => {
    const { log, io: i } = io({ isStillPlaying: () => false });
    expect(await startRadio(S('seed'), i)).toBe(0);
    expect(log.played).toHaveLength(1);
    expect(log.queued).toEqual([]);
  });
  it('still plays the song when the radio is unavailable', async () => {
    const { log, io: i } = io({ fetchRelated: async () => { throw new Error('offline'); } });
    expect(await startRadio(S('seed'), i)).toBe(0);
    expect(log.played).toHaveLength(1);
  });
});
