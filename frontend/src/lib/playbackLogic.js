// Pure helpers deciding which engine plays a song and when the Video/Audio toggle is allowed.
// Kept free of React/DOM so the rules are unit-testable.

const YT_URL_RE = /youtube\.com|youtu\.be|youtube-nocookie\.com/;
const YT_ID_RE = /(?:embed\/|v=|vi=|\/v\/|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/;

// YouTube-source song: its only playable thing is the YouTube embed (no separate audio stream).
export const isYouTubeSource = (song) =>
  !!song &&
  (song.source === 'youtube' ||
    song.provider === 'youtube' ||
    (typeof song.streamUrl === 'string' && YT_URL_RE.test(song.streamUrl)));

export const getVideoId = (song) => {
  if (!song) return null;
  if (song.videoId) return song.videoId;
  if (song.youtubeId) return song.youtubeId;
  if (typeof song.streamUrl === 'string') {
    const m = song.streamUrl.match(YT_ID_RE);
    if (m && m[1]) return m[1];
  }
  return null;
};

// A real audio stream exists (JioSaavn/local). YouTube-source songs only have an embed URL.
export const hasAudioStream = (song) =>
  !!song && !isYouTubeSource(song) && !!(song.streamUrl || song.downloadUrl || song.media_url);

// Toggle is offered only when BOTH engines can play this song and the video has not failed.
export const canToggleVideo = (song, unavailable = new Set()) => {
  const id = getVideoId(song);
  return hasAudioStream(song) && !!id && !unavailable.has(id);
};

// Which engine plays: 'audio' (HTML5) or 'youtube' (IFrame). A videoId alone never selects YouTube.
export const engineFor = (song, mode = 'audio', unavailable = new Set()) => {
  if (!song) return 'audio';
  if (isYouTubeSource(song)) return 'youtube';
  if (!hasAudioStream(song)) return getVideoId(song) ? 'youtube' : 'audio';
  return mode === 'video' && canToggleVideo(song, unavailable) ? 'youtube' : 'audio';
};

export const isFatalEmbedError = (code) => code === 101 || code === 150;

// Decide whether a mode switch is allowed. Whether to keep playing is decided by the caller (it continues
// only if the song was playing).
export const planSwitch = ({ song, currentMode, targetMode, unavailable = new Set() }) => {
  if (!song) return { ok: false, reason: 'no-song' };
  if (currentMode === targetMode) return { ok: false, reason: 'same-mode' };
  if (targetMode === 'video' && !canToggleVideo(song, unavailable)) return { ok: false, reason: 'no-video' };
  if (targetMode === 'audio' && !hasAudioStream(song)) return { ok: false, reason: 'no-audio' };
  return { ok: true };
};

// YouTube IFrame error handling: 101/150 mean "embedding disabled by owner".
export const planEmbedError = ({ song, code }) => {
  if (isFatalEmbedError(code) && hasAudioStream(song) && getVideoId(song)) {
    return { action: 'fallback-audio', videoId: getVideoId(song) };
  }
  return { action: 'skip' }; // YouTube-only song or other error codes: keep existing skip-to-next behaviour
};
