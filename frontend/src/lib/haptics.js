// Tiny haptic tap on supported phones (Android Chrome). Silent no-op elsewhere or with reduced motion.
export const haptic = (ms = 10) => {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
};
