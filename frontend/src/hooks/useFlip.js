import { useLayoutEffect, useRef } from 'react';

/**
 * Smooth list motion (FLIP): when rows move because something was added, removed or reordered, each row slides from where it
 * was to where it is now (200 ms, ease-out) instead of jumping. Returns what moved above the viewport so the caller can keep
 * the scroll position steady. Does nothing while `enabled` is false (dragging, very long lists) or with reduced motion.
 * @param {React.RefObject<HTMLElement>} scrollRef  the scrolling list
 * @param {unknown} signature  changes whenever the rows change
 * @param {{ enabled?: boolean, onRemovedAbove?: (px: number) => void }} opts
 */
export function useFlip(scrollRef, signature, { enabled = true, onRemovedAbove } = {}) {
  const previous = useRef(new Map()); // uid -> top, measured inside the scroll area (so scrolling itself does not count as movement)

  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const base = root.getBoundingClientRect().top - root.scrollTop;
    const now = new Map();
    root.querySelectorAll('[data-queue-row]').forEach((el) => now.set(el.dataset.uid, { el, top: el.getBoundingClientRect().top - base }));

    // rows that disappeared from above the visible part: the list got shorter above the viewport
    // (only when enabled: in a windowed long list rows also leave the page just by scrolling, which is not a removal)
    let removedAbove = 0;
    if (enabled) {
      for (const [uid, top] of previous.current) {
        if (!now.has(uid) && top + 60 <= root.scrollTop) removedAbove += 60;
      }
    }
    if (removedAbove && onRemovedAbove) onRemovedAbove(removedAbove);

    if (enabled && !reduce) {
      for (const [uid, { el, top }] of now) {
        const before = previous.current.get(uid);
        if (before === undefined) continue; // a new row has its own fade-in
        const dy = before - top;
        if (Math.abs(dy) > 1 && Math.abs(dy) < 600) {
          el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
        }
      }
    }
    previous.current = new Map([...now].map(([uid, { top }]) => [uid, top]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
