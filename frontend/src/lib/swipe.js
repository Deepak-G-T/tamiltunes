import { useEffect, useRef } from 'react';

// Swipe gesture helpers. The classifier is pure (unit tested); useSwipe wires it to touch events.

/**
 * Classify a finished touch as a swipe. Returns 'left' | 'right' | 'up' | 'down' | null.
 * Needs enough distance, a clearly dominant axis, and a quick-enough gesture (so slow drags and taps do nothing).
 */
export const classifySwipe = ({ dx, dy, dt }, { minDistance = 56, dominance = 1.6, maxDuration = 900 } = {}) => {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (dt > maxDuration) return null;
  if (ax < minDistance && ay < minDistance) return null;
  if (ax >= ay * dominance && ax >= minDistance) return dx < 0 ? 'left' : 'right';
  if (ay >= ax * dominance && ay >= minDistance) return dy < 0 ? 'up' : 'down';
  return null; // diagonal: ambiguous, ignore
};

/**
 * Pure tracker (state lives in the closure, so it survives re-renders when kept in a ref). `getHandlers` returns the
 * latest { onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown }. Only the first finger counts, and a gesture that starts
 * on an input[type=range] is ignored so sliders never change the song.
 */
export const createSwipeTracker = (getHandlers, options) => {
  let start = null;

  const onTouchStart = (e) => {
    if (e.touches && e.touches.length > 1) {
      start = null;
      return;
    }
    if (e.target?.closest?.('input[type="range"]')) {
      start = null;
      return;
    }
    const t = e.touches?.[0];
    start = t ? { x: t.clientX, y: t.clientY, time: Date.now() } : null;
  };

  const onTouchEnd = (e) => {
    if (!start) return;
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dir = classifySwipe({ dx: t.clientX - start.x, dy: t.clientY - start.y, dt: Date.now() - start.time }, options);
    start = null;
    const h = getHandlers() || {};
    if (dir === 'left') h.onSwipeLeft?.();
    else if (dir === 'right') h.onSwipeRight?.();
    else if (dir === 'up') h.onSwipeUp?.();
    else if (dir === 'down') h.onSwipeDown?.();
  };

  const onTouchCancel = () => {
    start = null;
  };

  return { onTouchStart, onTouchEnd, onTouchCancel };
};

/** React hook: stable handlers (the gesture state is not lost when the component re-renders mid-swipe). */
export const useSwipe = (handlers, options) => {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });
  const trackerRef = useRef(null);
  if (!trackerRef.current) trackerRef.current = createSwipeTracker(() => handlersRef.current, options);
  return trackerRef.current;
};
