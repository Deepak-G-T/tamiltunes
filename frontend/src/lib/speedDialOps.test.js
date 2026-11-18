import { describe, it, expect } from 'vitest';
import { moveItem, pinItem, unpinItem, removeItem, orderOf, hasNoPlays } from './speedDialOps';

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
