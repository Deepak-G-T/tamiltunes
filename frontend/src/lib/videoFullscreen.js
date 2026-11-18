/**
 * Full screen for the YouTube player: the player's own container goes full screen (YouTube's controls and branding stay visible),
 * the phone turns to landscape where the browser allows it, and portrait returns when full screen ends.
 */
const container = (doc = document) => doc.querySelector('[data-testid=yt-player-container]');

export const isVideoFullscreen = (doc = typeof document === 'undefined' ? null : document) => Boolean(doc?.fullscreenElement);

let listening = false;
const unlockOnExit = () => {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) { try { screen.orientation?.unlock?.(); } catch { /* not supported */ } }
  });
};

/** Resolves to true when the player is now full screen. Never throws. */
export async function enterVideoFullscreen() {
  const el = container();
  if (!el?.requestFullscreen) return false;
  unlockOnExit();
  try {
    await el.requestFullscreen({ navigationUI: 'hide' });
    try { await screen.orientation?.lock?.('landscape'); } catch { /* desktop or not allowed: stays as it is */ }
    return true;
  } catch {
    return false;
  }
}

export async function exitVideoFullscreen() {
  if (typeof document === 'undefined' || !document.fullscreenElement) return false;
  try { await document.exitFullscreen(); return true; } catch { return false; }
}
