import { useEffect, useRef } from 'react';
import { useAudio } from '../../context/AudioContext';
import { isNativeApp } from '../../lib/platform';
import { controlsOptions, actionForEvent, shouldShowControls } from '../../lib/nativeMedia';

/**
 * Android only (renders nothing): the media notification with the cover, play / pause / previous / next and a seek bar, run by a foreground
 * service so the music keeps playing with the screen locked. Mirrors the player; notification buttons call the player's own functions.
 * Songs on the YouTube engine get no notification (YouTube's player stops when the screen locks).
 */
const NativeMediaControls = () => {
  const audio = useAudio();
  const latest = useRef(audio);
  latest.current = audio;
  const plugin = useRef(null);
  const created = useRef(false);
  const native = isNativeApp();
  const song = audio.currentSong;
  const show = shouldShowControls({ native, song, engine: audio.activeEngine });
  const durationKnown = audio.duration > 0;

  const load = async () => {
    if (!plugin.current) plugin.current = (await import('capacitor-music-controls-plugin')).CapacitorMusicControls;
    return plugin.current;
  };

  // The notification for the current song (made again once the length is known, so the seek bar has an end)
  useEffect(() => {
    if (!native) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const controls = await load();
        if (cancelled) return;
        if (show) {
          const a = latest.current;
          await controls.create(controlsOptions(a.currentSong, { isPlaying: a.isPlaying, duration: a.duration, currentTime: a.currentTime }));
          created.current = true;
        } else if (created.current) {
          created.current = false;
          await controls.destroy();
        }
      } catch { /* the notification is a bonus: playback itself does not depend on it */ }
    })();
    return () => { cancelled = true; };
  }, [native, show, song?.id, durationKnown]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play / pause state, and a position refresh every 10 s (the system moves the bar on by itself in between)
  useEffect(() => {
    if (!native || !show) return undefined;
    const push = async () => {
      if (!created.current) return;
      try { (await load()).updateElapsed({ isPlaying: latest.current.isPlaying, elapsed: Math.round(latest.current.currentTime) }); } catch { /* ignore */ }
    };
    push();
    const t = audio.isPlaying ? setInterval(push, 10000) : null;
    return () => { if (t) clearInterval(t); };
  }, [native, show, audio.isPlaying, song?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Buttons on the notification, the headset and the lock screen (Android delivers them as a document event)
  useEffect(() => {
    if (!native) return undefined;
    const onEvent = (e) => {
      const act = actionForEvent({ message: e.message, position: e.position });
      const a = latest.current;
      if (!act) return;
      if (act.type === 'play') a.resume();
      else if (act.type === 'pause') a.pause();
      else if (act.type === 'next') a.nextTrack();
      else if (act.type === 'previous') a.previousTrack();
      else if (act.type === 'seek') a.seek(act.position);
    };
    document.addEventListener('controlsNotification', onEvent);
    return () => document.removeEventListener('controlsNotification', onEvent);
  }, [native]);

  // Gone for good with the app
  useEffect(() => () => { if (created.current && plugin.current) plugin.current.destroy().catch(() => {}); }, []);

  return null;
};

export default NativeMediaControls;
