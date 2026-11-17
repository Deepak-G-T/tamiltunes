import { describe, it, expect, vi } from 'vitest';
import { classifySwipe, createSwipeTracker } from './swipe';

describe('classifySwipe', () => {
  it('detects the four directions', () => {
    expect(classifySwipe({ dx: -120, dy: 10, dt: 200 })).toBe('left');
    expect(classifySwipe({ dx: 120, dy: -10, dt: 200 })).toBe('right');
    expect(classifySwipe({ dx: 5, dy: -140, dt: 200 })).toBe('up');
    expect(classifySwipe({ dx: -5, dy: 140, dt: 200 })).toBe('down');
  });
  it('ignores taps and short moves', () => {
    expect(classifySwipe({ dx: 3, dy: 2, dt: 80 })).toBeNull();
    expect(classifySwipe({ dx: 30, dy: 20, dt: 120 })).toBeNull();
  });
  it('ignores slow drags', () => expect(classifySwipe({ dx: 200, dy: 0, dt: 1500 })).toBeNull());
  it('ignores ambiguous diagonals', () => expect(classifySwipe({ dx: 100, dy: 90, dt: 200 })).toBeNull());
  it('respects custom thresholds', () => {
    expect(classifySwipe({ dx: 40, dy: 0, dt: 100 }, { minDistance: 30 })).toBe('right');
    expect(classifySwipe({ dx: 40, dy: 0, dt: 100 })).toBeNull();
  });
});

const touch = (x, y) => ({ clientX: x, clientY: y });
const ev = (x, y, extra = {}) => ({ touches: [touch(x, y)], changedTouches: [touch(x, y)], target: { closest: () => null }, ...extra });

describe('createSwipeTracker', () => {
  it('fires the matching handler after a quick swipe', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeDown = vi.fn();
    const h = createSwipeTracker(() => ({ onSwipeLeft, onSwipeDown }));
    h.onTouchStart(ev(300, 300));
    h.onTouchEnd({ changedTouches: [touch(150, 305)] });
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    h.onTouchStart(ev(200, 100));
    h.onTouchEnd({ changedTouches: [touch(205, 260)] });
    expect(onSwipeDown).toHaveBeenCalledTimes(1);
  });
  it('does nothing for a tap', () => {
    const onSwipeLeft = vi.fn();
    const h = createSwipeTracker(() => ({ onSwipeLeft }));
    h.onTouchStart(ev(100, 100));
    h.onTouchEnd({ changedTouches: [touch(102, 101)] });
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });
  it('uses the LATEST handlers (re-render safe) and cancel resets the gesture', () => {
    const first = vi.fn();
    const second = vi.fn();
    let current = { onSwipeLeft: first };
    const h = createSwipeTracker(() => current);
    h.onTouchStart(ev(300, 300));
    current = { onSwipeLeft: second }; // component re-rendered mid-swipe with new handlers
    h.onTouchEnd({ changedTouches: [touch(120, 300)] });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    h.onTouchStart(ev(300, 300));
    h.onTouchCancel();
    h.onTouchEnd({ changedTouches: [touch(120, 300)] });
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('ignores gestures that start on a range slider and multi-touch', () => {
    const onSwipeRight = vi.fn();
    const h = createSwipeTracker(() => ({ onSwipeRight }));
    h.onTouchStart(ev(50, 50, { target: { closest: (sel) => (sel.includes('range') ? {} : null) } }));
    h.onTouchEnd({ changedTouches: [touch(300, 50)] });
    expect(onSwipeRight).not.toHaveBeenCalled();
    h.onTouchStart({ touches: [touch(50, 50), touch(80, 80)], target: { closest: () => null } });
    h.onTouchEnd({ changedTouches: [touch(300, 50)] });
    expect(onSwipeRight).not.toHaveBeenCalled();
  });
});
