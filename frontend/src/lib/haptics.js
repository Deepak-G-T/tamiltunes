import { isNativeApp } from './platform';

// A tiny tap on phones. In the native app it uses the Capacitor Haptics plugin (the WebView has no navigator.vibrate on every device);
// in Chrome on Android it uses navigator.vibrate. Silent no-op elsewhere or with reduced motion.
export const haptic = (ms = 10) => {
  try {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (isNativeApp()) {
      import('@capacitor/haptics').then(({ Haptics }) => Haptics.vibrate({ duration: ms })).catch(() => { /* no vibrator */ });
      return;
    }
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
};
