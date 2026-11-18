/**
 * Video settings, per device (this browser / this phone):
 *   preferVideo  play the video version when a song has one (off by default). Video is only ever shown in Now Playing.
 *   wifiOnly     no video on mobile data (on by default).
 */
export const PREFS_KEY = 'tamiltunes_video_prefs_v1';
export const DEFAULT_PREFS = Object.freeze({ preferVideo: false, wifiOnly: true });
export const PREFS_EVENT = 'tamiltunes:video-prefs';

export function readVideoPrefs(storage) {
  try {
    const v = JSON.parse(storage?.getItem(PREFS_KEY) || '{}');
    return {
      preferVideo: typeof v?.preferVideo === 'boolean' ? v.preferVideo : DEFAULT_PREFS.preferVideo,
      wifiOnly: typeof v?.wifiOnly === 'boolean' ? v.wifiOnly : DEFAULT_PREFS.wifiOnly,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writeVideoPrefs(storage, patch) {
  const next = { ...readVideoPrefs(storage), ...patch };
  try { storage?.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* blocked storage: works until the page reloads */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: next }));
  return next;
}

/** Mobile data? Only Chrome on Android and the Android app can tell; everywhere else the type is unknown and video is allowed. */
export const isCellular = (connectionType) => connectionType === 'cellular';
export const videoBlockedByData = (prefs, connectionType) => Boolean(prefs?.wifiOnly) && isCellular(connectionType);
