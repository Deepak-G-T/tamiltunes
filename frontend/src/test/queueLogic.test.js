import { describe, it, expect } from 'vitest';
import {
  getNextTrackIndex,
  getPreviousTrackAction,
  reorderQueue,
  calculateNewQueueIndexAfterRemoval
} from '../utils/queueLogic.js';

describe('Pure Queue Logic Tests', () => {
  describe('getNextTrackIndex', () => {
    it('returns -1 for empty queue', () => {
      expect(getNextTrackIndex(0, 0)).toBe(-1);
    });

    it('advances sequentially in normal mode', () => {
      expect(getNextTrackIndex(0, 5)).toBe(1);
      expect(getNextTrackIndex(1, 5)).toBe(2);
      expect(getNextTrackIndex(3, 5)).toBe(4);
    });

    it('stops at end of queue when repeatMode is off', () => {
      expect(getNextTrackIndex(4, 5, { repeatMode: 'off' })).toBe(-1);
    });

    it('wraps to 0 at end of queue when repeatMode is all', () => {
      expect(getNextTrackIndex(4, 5, { repeatMode: 'all' })).toBe(0);
    });

    it('returns same index when repeatMode is one', () => {
      expect(getNextTrackIndex(2, 5, { repeatMode: 'one' })).toBe(2);
    });

    it('picks a different valid index when isShuffle is true', () => {
      // Mock randomFn returning index 0
      const next = getNextTrackIndex(0, 5, { isShuffle: true, randomFn: () => 0.0 });
      expect(next).not.toBe(0);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(5);
    });

    it('handles single item queue in shuffle', () => {
      expect(getNextTrackIndex(0, 1, { isShuffle: true })).toBe(0);
    });
  });

  describe('getPreviousTrackAction', () => {
    it('restarts track if currentTime exceeds threshold (default 3s)', () => {
      const res = getPreviousTrackAction(2, 5, 5);
      expect(res).toEqual({ action: 'restart', index: 2 });
    });

    it('goes to previous track if currentTime <= threshold', () => {
      const res = getPreviousTrackAction(2, 5, 1.5);
      expect(res).toEqual({ action: 'prev', index: 1 });
    });

    it('wraps to end of queue when at index 0 and currentTime <= threshold', () => {
      const res = getPreviousTrackAction(0, 5, 0.5);
      expect(res).toEqual({ action: 'prev', index: 4 });
    });

    it('handles empty queue', () => {
      const res = getPreviousTrackAction(0, 0, 0);
      expect(res).toEqual({ action: 'none', index: -1 });
    });
  });

  describe('reorderQueue', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

    it('moves an item forward in queue', () => {
      const reordered = reorderQueue(list, 0, 2);
      expect(reordered.map((s) => s.id)).toEqual(['b', 'c', 'a', 'd']);
    });

    it('moves an item backward in queue', () => {
      const reordered = reorderQueue(list, 3, 1);
      expect(reordered.map((s) => s.id)).toEqual(['a', 'd', 'b', 'c']);
    });

    it('returns unmodified clone if indices are out of bounds', () => {
      expect(reorderQueue(list, -1, 2)).toEqual(list);
      expect(reorderQueue(list, 0, 10)).toEqual(list);
    });
  });

  describe('calculateNewQueueIndexAfterRemoval', () => {
    it('returns -1 if queue is now empty', () => {
      expect(calculateNewQueueIndexAfterRemoval(0, 0, 0)).toBe(-1);
    });

    it('decrements currentIndex if removed item was before current', () => {
      expect(calculateNewQueueIndexAfterRemoval(1, 3, 4)).toBe(2);
    });

    it('keeps currentIndex if removed item was after current', () => {
      expect(calculateNewQueueIndexAfterRemoval(4, 2, 4)).toBe(2);
    });

    it('clamps to valid index if removed item was current and at end', () => {
      expect(calculateNewQueueIndexAfterRemoval(3, 3, 3)).toBe(2);
    });
  });
});
