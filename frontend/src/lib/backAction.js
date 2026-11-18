/**
 * What the Android Back button does, in this order:
 *   1. a menu or dialog that is open on top (song menu, "Add to playlist", ...) closes first;
 *   2. then the full-screen player closes;
 *   3. then the queue panel closes;
 *   4. then the app goes back one page;
 *   5. and only when there is nowhere to go back to, the app exits.
 * @returns {'close-overlay' | 'close-player' | 'close-queue' | 'back' | 'exit'}
 */
export function decideBack({ overlayOpen = false, fullScreen = false, queueOpen = false, canGoBack = false } = {}) {
  if (overlayOpen) return 'close-overlay';
  if (fullScreen) return 'close-player';
  if (queueOpen) return 'close-queue';
  return canGoBack ? 'back' : 'exit';
}

/** The topmost open menu or dialog in the page, or null. Both close on Escape, so Back simply sends them one. */
export const topOverlay = (doc = document) => {
  const all = [...doc.querySelectorAll('[role="menu"], [role="dialog"]')];
  return all.length ? all[all.length - 1] : null;
};
