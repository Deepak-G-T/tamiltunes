/** Pure helpers for the Android media notification (capacitor-music-controls-plugin). */

/** What the notification shows. `cover` is the song's picture (an https address; the plugin downloads it). */
export function controlsOptions(song, { isPlaying = false, duration = 0, currentTime = 0 } = {}) {
  const artist = song?.artist || song?.singers || 'TamilTunes';
  return {
    track: song?.title || '',
    artist,
    album: song?.album || 'TamilTunes',
    cover: song?.image || '',
    hasPrev: true,
    hasNext: true,
    hasClose: false,
    notificationIcon: 'ic_notification', // android/app/src/main/res/drawable/ic_notification.xml (the logo's note)
    dismissable: false, // a playing song keeps its notification; it goes away when playback stops or the app is closed
    isPlaying: Boolean(isPlaying),
    duration: duration > 0 ? Math.round(duration) : 0,
    elapsed: Math.max(0, Math.round(currentTime)),
    hasScrubbing: duration > 0,
    ticker: `Now playing "${song?.title || ''}"`,
  };
}

/** Which player action a notification / headset event means (or null to ignore it). */
export function actionForEvent(event) {
  switch (event?.message) {
    case 'music-controls-play': return { type: 'play' };
    case 'music-controls-pause':
    case 'music-controls-headset-unplugged': return { type: 'pause' }; // pull the headphones out: stop the music
    case 'music-controls-next': return { type: 'next' };
    case 'music-controls-previous': return { type: 'previous' };
    case 'music-controls-seek-to': return Number.isFinite(Number(event.position)) ? { type: 'seek', position: Math.max(0, Number(event.position)) } : null;
    default: return null; // destroy, media-button, plugged ...: nothing to do
  }
}

/** The notification is only for songs the audio engine plays: YouTube's player stops when the screen locks, so it gets no controls. */
export const shouldShowControls = ({ native, song, engine }) => Boolean(native && song && engine !== 'youtube');
