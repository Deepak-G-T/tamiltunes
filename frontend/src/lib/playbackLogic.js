// Pure helpers deciding which engine plays a song and when the Video/Audio toggle is allowed.
// Kept free of React/DOM so the rules are unit-testable.

export const getVideoId = (song) => (song && (song.videoId || song.youtubeId)) || null;

// A real audio stream exists (JioSaavn/local). YouTube-source songs only have an embed URL.
export const hasAudioStream = (song) =>
  !!song && song.source !== 'youtube' && !!(song.streamUrl || song.downloadUrl || song.media_url);

// Toggle is offered only when BOTH engines can play this song and the video has not failed.
export const canToggleVideo = (song, unavailable = new Set()) => {
  const id = getVideoId(song);
  return hasAudioStream(song) && !!id && !unavailable.has(id);
};

// Which engine plays: 'audio' (HTML5) or 'youtube' (IFrame). A videoId alone never selects YouTube.
export const engineFor = (song, mode = 'audio', unavailable = new Set()) => {
  if (!song) return 'audio';
  if (song.source === 'youtube') return 'youtube';
  if (!hasAudioStream(song)) return getVideoId(song) ? 'youtube' : 'audio';
  return mode === 'video' && canToggleVideo(song, unavailable) ? 'youtube' : 'audio';
};

export const isFatalEmbedError = (code) => code === 101 || code === 150;

// Decide whether a mode switch is allowed. A switch never autoplays (caller must wait for a tap).
export const planSwitch = ({ song, currentMode, targetMode, unavailable = new Set() }) => {
  if (!song) return { ok: false, reason: 'no-song' };
  if (currentMode === targetMode) return { ok: false, reason: 'same-mode' };
  if (targetMode === 'video' && !canToggleVideo(song, unavailable)) return { ok: false, reason: 'no-video' };
  if (targetMode === 'audio' && !hasAudioStream(song)) return { ok: false, reason: 'no-audio' };
  return { ok: true, autoplay: false };
};

// YouTube IFrame error handling: 101/150 mean "embedding disabled by owner".
export const planEmbedError = ({ song, code }) => {
  if (isFatalEmbedError(code) && hasAudioStream(song) && getVideoId(song)) {
    return { action: 'fallback-audio', videoId: getVideoId(song) };
  }
  return { action: 'skip' }; // YouTube-only song or other error codes: keep existing skip-to-next behaviour
};
