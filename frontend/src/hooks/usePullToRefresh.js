import { useEffect, useRef, useState } from 'react';

export const PULL_THRESHOLD = 70; // px of pull that starts a refresh
export const PULL_MAX = 110;

/**
 * Pull down at the top of the page to refresh (touch screens). Works on the nearest scrolling <main> of `ref`; only starts when the
 * page is scrolled to the very top and the finger moves mostly downwards, so normal scrolling and horizontal shelves are not touched.
 * @returns {{ pull: number, armed: boolean }}  how far the page is pulled (px) and whether letting go will refresh
 */
export function usePullToRefresh(ref, onRefresh, { enabled = true } = {}) {
  const [pull, setPull] = useState(0);
  const start = useRef(null);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    const root = ref.current?.closest('main') || null;
    if (!enabled || !root) return undefined;
    const down = (e) => { start.current = root.scrollTop <= 0 && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; };
    const move = (e) => {
      const s = start.current;
      if (!s) return;
      const dy = e.touches[0].clientY - s.y;
      const dx = e.touches[0].clientX - s.x;
      if (dy <= 0 || Math.abs(dx) > dy || root.scrollTop > 0) { start.current = null; setPull(0); return; }
      setPull(Math.min(PULL_MAX, dy * 0.5)); // the page resists a little
    };
    const end = () => {
      if (start.current && pullRef.current >= PULL_THRESHOLD * 0.5) cb.current?.();
      start.current = null;
      setPull(0);
    };
    root.addEventListener('touchstart', down, { passive: true });
    root.addEventListener('touchmove', move, { passive: true });
    root.addEventListener('touchend', end);
    root.addEventListener('touchcancel', end);
    return () => { root.removeEventListener('touchstart', down); root.removeEventListener('touchmove', move); root.removeEventListener('touchend', end); root.removeEventListener('touchcancel', end); };
  }, [ref, enabled]);

  const pullRef = useRef(0);
  pullRef.current = pull;
  return { pull, armed: pull >= PULL_THRESHOLD * 0.5 };
}
