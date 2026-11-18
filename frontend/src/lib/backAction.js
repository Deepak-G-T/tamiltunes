/**
 * What the Android Back button does, in this order:
 *   0. a video in full screen leaves full screen first;
 *   1. a menu or dialog that is open on top (song menu, "Add to playlist", ...) closes next;
 *   2. then the full-screen player closes;
 *   3. then the queue panel closes;
 *   4. then the app goes back one page;
 *   5. and only when there is nowhere to go back to, the app exits.
 * @returns {'exit-fullscreen' | 'close-overlay' | 'close-player' | 'close-queue' | 'back' | 'exit'}
 */
export function decideBack({ videoFullscreen = false, overlayOpen = false, fullScreen = false, queueOpen = false, canGoBack = false } = {}) {
  if (videoFullscreen) return 'exit-fullscreen';
  if (overlayOpen) return 'close-overlay';
  if (fullScreen) return 'close-player';
  if (queueOpen) return 'close-queue';
  return canGoBack ? 'back' : 'exit';
}

/**
 * The topmost open menu or dialog in the page, or null. Both close on Escape, so Back simply sends them one.
 * A menu that stands on its own (the queue row menu) is on top of everything; a menu INSIDE a dialog (the song menu sheet) is not the target:
 * the dialog is, because the sheet ignores Escape aimed at a menu inside it.
 */
export const topOverlay = (doc = document) => {
  const standalone = [...doc.querySelectorAll('[role="menu"]')].filter((m) => !m.closest?.('[role="dialog"]'));
  if (standalone.length) return standalone[standalone.length - 1];
  const dialogs = [...doc.querySelectorAll('[role="dialog"]')];
  return dialogs.length ? dialogs[dialogs.length - 1] : null;
};
