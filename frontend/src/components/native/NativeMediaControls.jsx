import { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Preferences } from '@capacitor/preferences';
import { useAudio } from '../../context/AudioContext';
import { isNativeApp } from '../../lib/platform';
import { controlsOptions, actionForEvent, shouldShowControls } from '../../lib/nativeMedia';
import { NOTIFICATION_WAIT_MS, DEBOUNCE_PAUSE_MS } from '../../lib/playbackEnd';

const PREF_PROMPT_SHOWN = 'music_notification_prompt_shown';
const PREF_HINT_SHOWN = 'music_notification_denied_hint_shown';

/**
 * Android only: the media notification with the cover, play / pause / previous / next and a seek bar, run by a foreground
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
  // The notification shows the real length (the audio element's). It is made again when that length changes, so it always matches the app.
  const durationSec = Math.round(audio.duration > 0 ? audio.duration : 0);

  // Notification permission UI state
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [showDeniedHint, setShowDeniedHint] = useState(false);
  const [devToast, setDevToast] = useState('');
  const checkedPermission = useRef(false);

  const ensure = useCallback(async () => {
    if (!plugin.current) {
      const mod = await import('capacitor-music-controls-plugin');
      plugin.current = mod.CapacitorMusicControls;
    }
  }, []);

  // Check and prompt for notification permission on first playback
  useEffect(() => {
    if (!native || !show || checkedPermission.current) return;
    checkedPermission.current = true;

    (async () => {
      try {
        const { value: promptShown } = await Preferences.get({ key: PREF_PROMPT_SHOWN });
        if (promptShown === 'true') return;

        await ensure();
        const controls = plugin.current;
        if (typeof controls?.checkPermissions === 'function') {
          const status = await controls.checkPermissions();
          if (status?.notifications === 'granted') {
            await Preferences.set({ key: PREF_PROMPT_SHOWN, value: 'true' });
            return;
          }
        }
        setShowPermissionPrompt(true);
      } catch (err) {
        console.warn('[NativeMediaControls] Permission check warning:', err?.message || err);
      }
    })();
  }, [native, show, audio.isPlaying, ensure]);

  const handleAllowNotifications = async () => {
    setShowPermissionPrompt(false);
    try {
      await Preferences.set({ key: PREF_PROMPT_SHOWN, value: 'true' });
      await ensure();
      const controls = plugin.current;
      let granted = false;
      if (typeof controls?.requestPermissions === 'function') {
        const res = await controls.requestPermissions({ permissions: ['notifications'] });
        granted = res?.notifications === 'granted';
      }

      if (!granted) {
        const { value: hintShown } = await Preferences.get({ key: PREF_HINT_SHOWN });
        if (hintShown !== 'true') {
          setShowDeniedHint(true);
          await Preferences.set({ key: PREF_HINT_SHOWN, value: 'true' });
        }
      }
    } catch (err) {
      console.warn('[NativeMediaControls] Request permission warning:', err?.message || err);
    }
  };

  const handleDismissPrompt = async () => {
    setShowPermissionPrompt(false);
    try {
      await Preferences.set({ key: PREF_PROMPT_SHOWN, value: 'true' });
    } catch { /* ignore */ }
  };

  const handleOpenSettings = async () => {
    setShowDeniedHint(false);
    try {
      await ensure();
      const controls = plugin.current;
      if (typeof controls?.openNotificationSettings === 'function') {
        await controls.openNotificationSettings();
      }
    } catch (err) {
      console.warn('[NativeMediaControls] Open settings error:', err?.message || err);
    }
  };

  // The notification for the current song. For a new song it waits (up to 3 s) for the real length, so it is made once with the right length and
  // not first with the previous song's; it is made again if the length changes (a stream shorter or longer than its header said).
  useEffect(() => {
    if (!native) return undefined;
    let cancelled = false;
    let timer = null;
    const run = async () => {
      try {
        await ensure();
        const controls = plugin.current;
        if (cancelled || !controls) return;
        if (show) {
          const a = latest.current;
          await controls.create(controlsOptions(a.currentSong, { isPlaying: a.isPlaying, duration: a.duration, currentTime: a.currentTime }));
          created.current = true;
        } else if (created.current) {
          created.current = false;
          await controls.destroy();
        }
      } catch (err) {
        console.warn('[NativeMediaControls] Failed to update media controls:', err?.message || err);
        if (import.meta.env.DEV) {
          setDevToast(`[Dev] MediaControls: ${err?.message || 'Update failed'}`);
          setTimeout(() => setDevToast(''), 4000);
        }
      }
    };
    if (show && !(durationSec > 0)) timer = setTimeout(run, NOTIFICATION_WAIT_MS);
    else run();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [native, show, song?.id, durationSec, ensure]);

  // Play / pause state, and a position refresh every 10 s (the system moves the bar on by itself in between).
  // Debounce rule: pauses from track transitions or stream handovers are held for 8 s so the foreground service and
  // wake lock are not dropped. User pauses (button, lock-screen pause, headset unplug, audio focus loss) are forwarded immediately.
  const pauseDebounceRef = useRef(null);
  useEffect(() => {
    if (!native || !show) return undefined;
    const push = async (overridePlaying) => {
      if (!created.current) return;
      try {
        await ensure();
        const controls = plugin.current;
        if (controls) {
          const isPlaying = overridePlaying !== undefined ? overridePlaying : latest.current.isPlaying;
          await controls.updateElapsed({ isPlaying, elapsed: Math.round(latest.current.currentTime) });
        }
      } catch (err) {
        console.warn('[NativeMediaControls] Failed to update elapsed:', err?.message || err);
      }
    };

    if (audio.isPlaying) {
      if (pauseDebounceRef.current) {
        clearTimeout(pauseDebounceRef.current);
        pauseDebounceRef.current = null;
      }
      push(true);
    } else {
      if (audio.isUserPaused?.()) {
        if (pauseDebounceRef.current) {
          clearTimeout(pauseDebounceRef.current);
          pauseDebounceRef.current = null;
        }
        push(false);
      } else {
        if (!pauseDebounceRef.current) {
          pauseDebounceRef.current = setTimeout(() => {
            pauseDebounceRef.current = null;
            push(false);
          }, DEBOUNCE_PAUSE_MS);
        }
      }
    }

    const t = audio.isPlaying ? setInterval(() => push(), 10000) : null;
    return () => { if (t) clearInterval(t); };
  }, [native, show, audio.isPlaying, song?.id, ensure]);

  // Track transition events for native handover
  useEffect(() => {
    if (!native) return undefined;
    const onStart = async (e) => {
      await ensure();
      plugin.current?.startTrackTransition?.({ repeatOne: e.detail?.repeatOne, timeoutMs: DEBOUNCE_PAUSE_MS }).catch(() => {});
    };
    const onEnd = async () => {
      await ensure();
      plugin.current?.endTrackTransition?.().catch(() => {});
    };
    window.addEventListener('tamiltunes:track-transition-start', onStart);
    window.addEventListener('tamiltunes:track-transition-end', onEnd);
    return () => {
      window.removeEventListener('tamiltunes:track-transition-start', onStart);
      window.removeEventListener('tamiltunes:track-transition-end', onEnd);
    };
  }, [native, ensure]);

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

  // Clean shutdown when component unmounts or app closes
  useEffect(() => () => {
    if (created.current && plugin.current) {
      plugin.current.destroy().catch(() => {});
    }
  }, []);

  if (!native) return null;

  return (
    <>
      {/* Dev-only warning toast */}
      {devToast && (
        <div role="status" className="fixed top-4 right-4 z-50 px-3 py-2 rounded-lg bg-amber-500/90 text-black text-xs font-semibold shadow-lg">
          {devToast}
        </div>
      )}

      {/* In-app permission prompt on first play */}
      {showPermissionPrompt && (
        <div
          role="dialog"
          aria-label="Notification permission"
          className="fixed bottom-24 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 p-4 rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl space-y-3 animate-in fade-in slide-in-from-bottom duration-200"
        >
          <div className="flex items-start gap-3">
            <Bell className="w-5 h-5 text-brand-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Control music from lock screen</p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Allow notifications to control music and see what is playing when your screen is locked.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleDismissPrompt}
              className="press px-3 py-1.5 rounded-full text-xs font-semibold text-zinc-400 hover:text-white"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={handleAllowNotifications}
              className="press px-4 py-1.5 rounded-full bg-brand-500 hover:bg-brand-400 text-xs font-bold text-black"
            >
              Allow
            </button>
          </div>
        </div>
      )}

      {/* One-time hint if permission was denied */}
      {showDeniedHint && (
        <div
          role="status"
          className="fixed bottom-24 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 p-4 rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl space-y-3 animate-in fade-in slide-in-from-bottom duration-200"
        >
          <div className="flex items-start gap-3">
            <BellOff className="w-5 h-5 text-zinc-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Notifications are turned off</p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Audio will keep playing, but lock-screen controls are unavailable without notification permission.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowDeniedHint(false)}
              className="press px-3 py-1.5 rounded-full text-xs font-semibold text-zinc-400 hover:text-white"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={handleOpenSettings}
              className="press px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
            >
              Open settings
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default NativeMediaControls;
