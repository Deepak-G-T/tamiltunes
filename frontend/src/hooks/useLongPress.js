import { useCallback, useRef } from 'react';

/**
 * Long-press for touch and pen (and right-click for mouse). Moving more than `tolerance` px cancels it, so
 * scrolling a row of tiles never opens the menu by accident. After a long press the next click is swallowed.
 * @param {(e: Event) => void} onLongPress
 * @param {{ delay?: number, tolerance?: number }} [opts]
 */
export function useLongPress(onLongPress, { delay = 500, tolerance = 10 } = {}) {
  const timer = useRef(null);
  const start = useRef({ x: 0, y: 0 });
  const fired = useRef(false);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const onPointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse') return; // desktop uses the "..." button or right-click
    fired.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    cancel();
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress(e);
    }, delay);
  }, [cancel, delay, onLongPress]);

  const onPointerMove = useCallback((e) => {
    if (!timer.current) return;
    if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > tolerance) cancel();
  }, [cancel, tolerance]);

  const onContextMenu = useCallback((e) => {
    e.preventDefault(); // right-click on desktop, and the native long-press menu on phones
    cancel();
    fired.current = true;
    onLongPress(e);
  }, [cancel, onLongPress]);

  /** Wrap the tile's click handler: ignores the click that follows a long press. */
  const guardClick = useCallback((handler) => (e) => {
    if (fired.current) {
      fired.current = false;
      e.preventDefault();
      return;
    }
    handler(e);
  }, []);

  return { handlers: { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel, onContextMenu }, guardClick };
}
