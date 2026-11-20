import { mediaArtwork } from '../lib/mediaSession';
import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import YouTubePlayer from '../components/player/YouTubePlayer';
import DuplicateQueuePrompt from '../components/player/DuplicateQueuePrompt';
import {
  createQueueState, playFromSearch, playFromContext, switchToRadio, advance, previous, jumpTo,
  addToQueue as queueAdd, playNext as queuePlayNext, removeFromUpcoming, removeFromHistory, reorderUpcoming,
  clearUserQueue, setShuffle as queueSetShuffle, setRepeat as queueSetRepeat, nextRepeat, setAutoplay as queueSetAutoplay,
  needsRefill, runRefill, toFlatQueue, getSections, isQueueFull, findQueued, moveToQueue, indexOfUid, MAX_QUEUE,
  removeByUids, restoreRemoved, moveManyToQueue, clearRadio, removeCurrent, setStopAfter, playFromHistory
} from '../lib/radioQueue';
import { startSleep } from '../lib/sleepTimer';
import { getShownOnHome } from '../lib/shownOnHome';
import { haptic } from '../lib/haptics';
import { peekNext } from '../lib/radioQueue';
import { fetchRelated } from '../lib/radioApi';
import { useAuth } from './AuthContext';
import { loadHidden, rememberHidden } from '../lib/videoHides';
import { readVideoPrefs, writeVideoPrefs, videoBlockedByData, PREFS_EVENT } from '../lib/videoPrefs';
import { useConnectionType } from '../hooks/useConnectionType';
import { youtubeThumb } from '../lib/youtubeThumb';
import { toSaved, fromSaved, sameQueue, savedIds, readGuestQueue, writeGuestQueue, getDeviceId, shouldAskToContinue, SAVE_DEBOUNCE_MS, SYNC_CHECK_MIN_MS } from '../lib/queuePersist';
import { loadServerQueue, loadServerQueueMeta, saveServerQueue, saveServerQueueOnExit, resolveSongIds } from '../lib/queueApi';
import ContinueHerePrompt from '../components/player/ContinueHerePrompt';
import Toast from '../components/common/Toast';
import { getCoverColor, rgbVar } from '../lib/coverColor';
import { engineFor, canToggleVideo, getVideoId, planSwitch, planEmbedError, hasAudioStream } from '../lib/playbackLogic';
import { getToken } from '../lib/tokenStore';
import { resolveDuration, pauseKind, stallShouldFinish, errorAction, PAUSE_FINISH_MS, STALL_FINISH_MS, TRANSITION_WATCHDOG_MS, DEBOUNCE_PAUSE_MS } from '../lib/playbackEnd';

const AudioContext = createContext();
const QUEUE_ACTIONS = ['jumpToUid', 'removeUids', 'moveUidsToQueue', 'reorderByUid', 'clearQueue', 'refreshRecommendations', 'removeCurrentSong', 'playFromHistoryAt', 'saveQueueAsPlaylist', 'toggleStopAfter', 'startSleepTimer', 'cancelSleepTimer', 'setAutoplay', 'continueWithRadio', 'startRadio', 'addToQueue', 'playNext'];
const QueueContext = createContext(null); // the queue panel's own, steadier view of the player (see useQueue)
const AUTOPLAY_KEY = 'tamiltunes_autoplay';
const FADE_IN_SECONDS = 0.6; // soft start / end of each track (HTML5 engine only)
const FADE_OUT_SECONDS = 1.2;

export const AudioProvider = ({ children }) => {
  const audioRef = useRef(new Audio());
  const ytPlayerRef = useRef(null);

  const { isAuthenticated, isLoading: authLoading, user: authUser } = useAuth();
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('tamiltunes_vol');
    return saved !== null ? parseFloat(saved) : 0.8;
  });
  const [isMuted, setIsMuted] = useState(false);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState(null);

  // Playback queue: the radio queue engine (lib/radioQueue.js) is the source of truth. `qsRef` always holds the latest
  // state so several updates in one tick (and async refills) never act on a stale copy.
  const [qs, setQs] = useState(() => {
    let autoplay = true;
    try { autoplay = localStorage.getItem(AUTOPLAY_KEY) !== 'off'; } catch { /* storage blocked */ }
    return createQueueState({ autoplay });
  });
  const qsRef = useRef(qs);
  const updateQs = useCallback((fn) => {
    const next = fn(qsRef.current);
    qsRef.current = next;
    setQs(next);
    return next;
  }, []);
  const { queue, queueIndex } = useMemo(() => toFlatQueue(qs), [qs]); // flat list for views that show the whole queue
  const isShuffle = qs.shuffle;
  const repeatMode = qs.repeat; // 'off' | 'all' | 'one'
  const [refillTick, setRefillTick] = useState(0);

  // Race condition & adaptive streaming refs
  const playPromiseRef = useRef(null);
  const playRequestIdRef = useRef(0);
  // End-of-song bookkeeping (rules in lib/playbackEnd.js)
  const userPausedRef = useRef(false);        // true when the person (or the notification / headset) paused: never treated as "the song ended"
  const isTransitioningRef = useRef(false);   // true while advancing to next track or loading fresh source
  const finishedRequestRef = useRef(-1);      // the play request already advanced, so 'ended' and the fallbacks never advance twice
  const midSongErrorsRef = useRef(0);
  const endTimersRef = useRef({ pause: null, stall: null, transition: null });
  const stallStartRef = useRef(0);
  const finishSongRef = useRef(() => {});
  const goNextRef = useRef(() => {});
  const activeCandidatesRef = useRef([]);
  const candidateIndexRef = useRef(0);
  const currentSongRef = useRef(null);

  // Video/Audio mode (only meaningful for songs that have both an audio stream and a videoId)
  const [playbackMode, setPlaybackModeState] = useState('audio'); // 'audio' | 'video'
  const playbackModeRef = useRef('audio');
  const unavailableVideosRef = useRef(null); // videoIds that failed to embed: this session, plus the last 7 days in this browser
  if (unavailableVideosRef.current === null) unavailableVideosRef.current = new Set(typeof window === 'undefined' ? [] : loadHidden(window.localStorage));
  // Video settings (per device) and the connection type, for "Prefer video" and "Wi-Fi only video"
  const [videoPrefs, setVideoPrefsState] = useState(() => readVideoPrefs(typeof window === 'undefined' ? null : window.localStorage));
  useEffect(() => {
    const on = (e) => setVideoPrefsState(e.detail || readVideoPrefs(window.localStorage));
    window.addEventListener(PREFS_EVENT, on);
    return () => window.removeEventListener(PREFS_EVENT, on);
  }, []);
  const setVideoPrefs = useCallback((patch) => writeVideoPrefs(window.localStorage, patch), []);
  const connectionType = useConnectionType();
  const videoBlocked = videoBlockedByData(videoPrefs, connectionType);
  const videoBlockedRef = useRef(videoBlocked);
  videoBlockedRef.current = videoBlocked;
  const userChoseAudioRef = useRef(null); // the song the person switched to audio themselves: "Prefer video" leaves it alone
  const videoRequestRef = useRef(null); // a song tapped on a video thumbnail: play it as video once Now Playing is open
  const [unavailableVersion, setUnavailableVersion] = useState(0);
  const [toast, setToast] = useState(null);
  const [videoSlots, setVideoSlots] = useState([]); // registered <VideoSlot> elements; last wins
  const [slotRect, setSlotRect] = useState(null);

  // UI states
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [historyRecordedSongId, setHistoryRecordedSongId] = useState(null);

  // Engine is chosen by source + mode, NOT by the mere presence of a videoId: a JioSaavn song that
  // also has a videoId plays through the audio engine until the user switches to Video.
  const isYouTubeSong = useCallback(
    (song) => engineFor(song, playbackModeRef.current, unavailableVideosRef.current) === 'youtube',
    []
  );

  // Helper to extract video ID if missing from song object (videoId, youtubeId or embed URL)
  const getYouTubeVideoId = useCallback((song) => getVideoId(song), []);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    volumeRef.current = volume;
    mutedRef.current = isMuted;
  }, [volume, isMuted]);

  // Page-wide colour wash follows the playing song's artwork (falls back to a stable seed colour)
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    if (!currentSong) {
      root.style.removeProperty('--cover-rgb');
      return undefined;
    }
    let cancelled = false;
    getCoverColor(currentSong.image, currentSong.id).then((rgb) => {
      if (!cancelled) root.style.setProperty('--cover-rgb', rgbVar(rgb));
    });
    return () => {
      cancelled = true;
    };
  }, [currentSong?.id, currentSong?.image]);

  const showToast = useCallback((message, action = null) => setToast({ id: Date.now(), message, action }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- Saved queue: restore on app open (paused), save a moment after every change (guests: browser, signed in: account)
  const restoredRef = useRef(null); // { id, positionSec } while a restored song waits for the first Play
  const deviceIdRef = useRef(null);
  if (!deviceIdRef.current) deviceIdRef.current = getDeviceId(typeof window !== 'undefined' ? window.localStorage : null);
  const currentTimeRef = useRef(0);
  const isAuthRef = useRef(false);
  const queueReadyRef = useRef(false); // nothing is saved until the restore attempt is over, so a saved queue is never overwritten by an empty one
  const lastSavedRef = useRef(null);
  const restoreKeyRef = useRef(null);
  const lastSyncRef = useRef(null); // updatedAt of the server copy this device last saved or loaded
  const lastSyncCheckRef = useRef(0);
  const [syncPrompt, setSyncPrompt] = useState(null);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { isAuthRef.current = isAuthenticated; }, [isAuthenticated]);

  const flushQueueSave = useCallback((onExit = false) => {
    if (!queueReadyRef.current) return;
    const saved = toSaved(qsRef.current, { positionSec: currentTimeRef.current, deviceId: deviceIdRef.current });
    if (!saved) return;
    if (restoredRef.current && qsRef.current.current?.id === restoredRef.current.id) saved.positionSec = restoredRef.current.positionSec;
    const last = lastSavedRef.current;
    if (last && sameQueue(last, saved) && Math.abs(last.positionSec - saved.positionSec) < 5) return; // nothing worth saving
    lastSavedRef.current = saved;
    if (isAuthRef.current) {
      if (onExit) saveServerQueueOnExit(saved);
      else saveServerQueue(saved).then((d) => { if (d?.updatedAt) lastSyncRef.current = d.updatedAt; }).catch((e) => { lastSavedRef.current = null; console.warn('Could not save the queue:', e.message); }); // quiet: the next change tries again
    } else {
      writeGuestQueue(window.localStorage, saved);
    }
  }, []);

  useEffect(() => {
    if (!queueReadyRef.current) return undefined;
    const t = setTimeout(() => flushQueueSave(false), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [qs, isPlaying, flushQueueSave]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushQueueSave(true); };
    const onPageHide = () => flushQueueSave(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onPageHide); };
  }, [flushQueueSave]);

  // Show a restored queue: paused at the saved position, never auto-playing
  const applyRestored = useCallback((restored) => {
    const song = restored.currentSong;
    playRequestIdRef.current += 1; // cancel any in-flight play attempt
    audioRef.current?.pause();
    ytPlayerRef.current?.pause?.();
    updateQs(() => restored.state);
    setCurrentSong(song);
    currentSongRef.current = song;
    setCurrentTime(restored.positionSec);
    setDuration(song.duration || 0);
    setIsPlaying(false);
    restoredRef.current = { id: song.id, positionSec: restored.positionSec };
    lastSavedRef.current = toSaved(restored.state, { positionSec: restored.positionSec, deviceId: deviceIdRef.current });
  }, [updateQs]);

  // Another device changed the queue? Looked at when the tab comes back into view (and at most every 30 s): no polling.
  const checkOtherDevice = useCallback(async () => {
    if (!isAuthRef.current || !queueReadyRef.current) return;
    const now = Date.now();
    if (now - lastSyncCheckRef.current < SYNC_CHECK_MIN_MS) return;
    lastSyncCheckRef.current = now;
    try {
      const meta = await loadServerQueueMeta();
      if (shouldAskToContinue({ meta, myDeviceId: deviceIdRef.current, lastSyncAt: lastSyncRef.current })) setSyncPrompt(meta);
    } catch { /* offline or asleep: ask again next time */ }
  }, []);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') checkOtherDevice(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', checkOtherDevice);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', checkOtherDevice); };
  }, [checkOtherDevice]);

  const resolveSyncPrompt = async (choice) => {
    const meta = syncPrompt;
    setSyncPrompt(null);
    if (!meta) return;
    if (choice !== 'continue') { lastSyncRef.current = meta.updatedAt; return; } // keep this device's queue: our next save replaces theirs
    try {
      const { queue, songs } = await loadServerQueue();
      const restored = queue && fromSaved(queue, songs, { autoplay: qsRef.current.autoplay });
      if (!restored) { showToast('That queue is no longer available.'); return; }
      lastSyncRef.current = queue.updatedAt;
      applyRestored(restored);
      showToast('Queue loaded from your other device. Press play to continue.');
    } catch {
      showToast('Could not load the queue from your other device. Please try again.');
    }
  };

  useEffect(() => {
    if (authLoading) return;
    const key = authUser?.id || 'guest';
    if (restoreKeyRef.current === key) return;
    restoreKeyRef.current = key;
    (async () => {
      try {
        let saved = null;
        let songs = {};
        if (isAuthenticated) {
          try { ({ queue: saved, songs } = await loadServerQueue()); lastSyncRef.current = saved?.updatedAt ?? null; } catch { /* the server is slow or asleep: fall back to this browser's copy, no error shown */ }
        }
        if (!saved) {
          const local = readGuestQueue(window.localStorage);
          if (local) {
            try { songs = await resolveSongIds(savedIds(local)); saved = local; } catch { saved = null; }
          }
        }
        if (!saved || qsRef.current.current || currentSongRef.current) return; // nothing saved, or the user already started something
        const restored = fromSaved(saved, songs, { autoplay: qsRef.current.autoplay });
        if (!restored) return;
        applyRestored(restored);
        if (restored.dropped > 0) showToast(`${restored.dropped} song${restored.dropped === 1 ? '' : 's'} from your saved queue ${restored.dropped === 1 ? 'is' : 'are'} no longer available.`);
      } catch (e) {
        console.warn('Could not restore the queue:', e.message);
      } finally {
        queueReadyRef.current = true;
      }
    })();
  }, [authLoading, authUser?.id, isAuthenticated, updateQs, showToast]);

  const registerVideoSlot = useCallback((el) => {
    setVideoSlots((prev) => [...prev, el]);
    return () => setVideoSlots((prev) => prev.filter((x) => x !== el));
  }, []);
  const videoSlot = videoSlots[videoSlots.length - 1] || null;

  // Pin the YouTube iframe over the active slot while the YouTube engine is in use
  const activeEngine = engineFor(currentSong, playbackMode, unavailableVideosRef.current);
  useEffect(() => {
    if (!videoSlot || activeEngine !== 'youtube') {
      setSlotRect(null);
      return undefined;
    }
    const update = () => {
      const r = videoSlot.getBoundingClientRect();
      setSlotRect((prev) =>
        prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height }
      );
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(videoSlot);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const timer = setInterval(update, 400); // catches layout shifts/animations
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      clearInterval(timer);
    };
  }, [videoSlot, activeEngine]);

  // Build candidate audio URLs for HTML5 engine
  const buildCandidateUrls = (song) => {
    const candidates = [];
    const rawUrl = song.streamUrl || song.downloadUrl || song.media_url;

    if (rawUrl && typeof rawUrl === 'string') {
      candidates.push(rawUrl);

      // If JioSaavn high-res mp4, add alternate bitrates & backend proxy
      if (rawUrl.includes('saavncdn.com')) {
        const url160 = rawUrl.replace(/_320\.mp4$/, '_160.mp4');
        const url96 = rawUrl.replace(/_96\.mp4$/, '_96.mp4');
        if (!candidates.includes(url160)) candidates.push(url160);
        if (!candidates.includes(url96)) candidates.push(url96);

        // Add backend streaming proxy
        candidates.push(`/api/music/stream?url=${encodeURIComponent(rawUrl)}`);
        candidates.push(`/api/music/stream?url=${encodeURIComponent(url160)}`);
      }
    }

    return candidates;
  };

  // Record listening history after 5 seconds of playback
  const checkRecordHistory = useCallback((song, time) => {
    if (time > 5 && song && historyRecordedSongId !== song.id) {
      setHistoryRecordedSongId(song.id);
      const token = getToken();
      if (token) {
        api.post('/history', {
          songId: song.id,
          title: song.title,
          artist: song.artist || song.singers,
          album: song.album,
          image: song.image,
          duration: song.duration,
          streamUrl: song.streamUrl
        }).catch(() => {});
      }
    }
  }, [historyRecordedSongId]);

  // Safely play HTML5 audio guarded against rapid next/prev race conditions
  const safeAudioPlay = async (audio, requestId) => {
    // Never start the audio element while the YouTube engine is the active one (Video mode)
    if (isYouTubeSong(currentSongRef.current)) return;
    try {
      userPausedRef.current = false;
      const playPromise = audio.play();
      playPromiseRef.current = playPromise;
      await playPromise;

      if (requestId === playRequestIdRef.current) {
        isTransitioningRef.current = false;
        setIsPlaying(true);
        setIsBuffering(false);
        setPlaybackError(null);
      }
    } catch (err) {
      if (err.name === 'AbortError' || requestId !== playRequestIdRef.current) {
        // Play was safely aborted by a newer track selection
        return;
      }
      // One retry for background/gesture policy edge cases before skipping
      try {
        const retryPromise = audio.play();
        playPromiseRef.current = retryPromise;
        await retryPromise;
        if (requestId === playRequestIdRef.current) {
          isTransitioningRef.current = false;
          setIsPlaying(true);
          setIsBuffering(false);
          setPlaybackError(null);
        }
      } catch (retryErr) {
        if (requestId !== playRequestIdRef.current) return;
        console.warn('Playback play() retry failed:', retryErr.message);
        showToast(currentSongRef.current?.title ? `Couldn't play "${currentSongRef.current.title}", skipped.` : "Couldn't play that song, skipped.");
        setTimeout(() => nextTrack(), 500);
      }
    }
  };

  // Attempt to refresh expired stream URL by song ID (GET /api/music/song/:id?fresh=1)
  const handleExpiredStream = async (song) => {
    if (!song || song._hasRetriedFreshFetch) {
      setPlaybackError('Stream unavailable or expired. Skipping to next track...');
      showToast(song?.title ? `Couldn't play "${song.title}", skipped.` : "Couldn't play that song, skipped.");
      setTimeout(() => {
        nextTrack();
      }, 1500);
      return;
    }

    song._hasRetriedFreshFetch = true;
    try {
      // Refetch strictly by song ID from /api/music/song/:id with fresh=1 to bypass cache
      const { data } = await api.get(`/music/song/${encodeURIComponent(song.id)}?fresh=1`);
      const refreshedSong = data.data || data;

      if (refreshedSong && refreshedSong.streamUrl && refreshedSong.streamUrl !== song.streamUrl) {
        const audio = audioRef.current;
        song.streamUrl = refreshedSong.streamUrl;
        const candidates = buildCandidateUrls(refreshedSong);
        activeCandidatesRef.current = candidates;
        candidateIndexRef.current = 0;

        const resolvedUrl = new URL(candidates[0], window.location.origin).href;
        audio.src = resolvedUrl;
        audio.load();
        setIsBuffering(true);
        await safeAudioPlay(audio, playRequestIdRef.current);
        return;
      }
    } catch (e) {
      console.warn(`Refetching expired stream for song ID [${song.id}] failed:`, e.message);
    }

    setPlaybackError('Stream expired. Skipping to next track...');
    showToast(song?.title ? `Couldn't play "${song.title}", skipped.` : "Couldn't play that song, skipped.");
    setTimeout(() => {
      nextTrack();
    }, 1500);
  };

  // ---- end of a song -------------------------------------------------------------------------------------------------------------------
  // Between two songs the player keeps saying "playing" (no flash of "paused", and the Android notification and its foreground service are
  // not told to stop right before the next stream must load). A watchdog turns it back to paused if the next song never starts.
  const clearEndTimers = ({ keepTransition = false } = {}) => {
    const t = endTimersRef.current;
    clearTimeout(t.pause); clearTimeout(t.stall);
    if (!keepTransition) { clearTimeout(t.transition); }
  };
  const endTransition = () => { clearTimeout(endTimersRef.current.transition); };
  const beginTransition = () => {
    clearTimeout(endTimersRef.current.transition);
    endTimersRef.current.transition = setTimeout(() => {
      const audio = audioRef.current;
      if (audio && audio.paused && !userPausedRef.current && !isYouTubeSong(currentSongRef.current)) setIsPlaying(false);
    }, TRANSITION_WATCHDOG_MS);
  };
  /** The song is over: 'ended', or the stream stopped / stalled / broke close to the end. Runs once per play request. */
  const finishSong = (reason) => {
    const rid = playRequestIdRef.current;
    if (finishedRequestRef.current === rid) return;
    finishedRequestRef.current = rid;
    isTransitioningRef.current = true;
    clearEndTimers({ keepTransition: true });
    if (reason !== 'ended') console.info(`Song finished early (${reason}); going on to the next one.`);
    beginTransition();
    window.dispatchEvent(new CustomEvent('tamiltunes:track-transition-start', { detail: { repeatOne: qsRef.current?.repeat === 'one' } }));
    goNextRef.current('ended');
  };
  finishSongRef.current = finishSong;

  // Initialize HTML5 audio element events with thorough cleanup
  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = volume;
    window.__tamiltunes_audio = audio;

    const onTimeUpdate = () => {
      if (!isYouTubeSong(currentSongRef.current)) {
        // soft start and end of every track (ignored on iOS, where the volume is read-only)
        const d = audio.duration;
        const t = audio.currentTime;
        if (!mutedRef.current && Number.isFinite(d) && d > FADE_IN_SECONDS + FADE_OUT_SECONDS) {
          let f = 1;
          if (t < FADE_IN_SECONDS) f = Math.min(f, 0.2 + 0.8 * (t / FADE_IN_SECONDS));
          if (d - t < FADE_OUT_SECONDS) f = Math.min(f, Math.max(0, (d - t) / FADE_OUT_SECONDS));
          audio.volume = Math.max(0, Math.min(1, volumeRef.current * f));
        }
        setCurrentTime(audio.currentTime);
        checkRecordHistory(currentSongRef.current, audio.currentTime);
      }
    };

    const syncDuration = () => {
      if (isYouTubeSong(currentSongRef.current)) return;
      setDuration(resolveDuration({ audioDuration: audio.duration, catalogDuration: currentSongRef.current?.duration }));
    };
    const onLoadedMetadata = () => {
      if (!isYouTubeSong(currentSongRef.current)) {
        syncDuration();
        setIsBuffering(false);
      }
    };

    // Buffering near the end for 5 seconds: the rest of the song is not coming, so the song is finished
    const watchStall = () => {
      clearTimeout(endTimersRef.current.stall);
      stallStartRef.current = Date.now();
      const rid = playRequestIdRef.current;
      endTimersRef.current.stall = setTimeout(() => {
        if (rid !== playRequestIdRef.current || audio.ended || audio.readyState >= 3) return;
        if (stallShouldFinish({ stalledForMs: Date.now() - stallStartRef.current, currentTime: audio.currentTime, duration: resolveDuration({ audioDuration: audio.duration, catalogDuration: currentSongRef.current?.duration }) })) finishSongRef.current('stalled-near-end');
      }, STALL_FINISH_MS);
    };

    const onWaiting = () => {
      if (!isYouTubeSong(currentSongRef.current)) { setIsBuffering(true); watchStall(); }
    };

    const onCanPlay = () => {
      if (!isYouTubeSong(currentSongRef.current)) { setIsBuffering(false); clearTimeout(endTimersRef.current.stall); }
    };

    const onPlaying = () => {
      if (isYouTubeSong(currentSongRef.current)) {
        audio.pause(); // never let the audio element play while the YouTube engine is active
        return;
      }
      {
        clearTimeout(endTimersRef.current.stall);
        clearTimeout(endTimersRef.current.pause);
        endTransition(); // the next song is really playing
        isTransitioningRef.current = false;
        setIsPlaying(true);
        setIsBuffering(false);
        setPlaybackError(null);
        window.dispatchEvent(new CustomEvent('tamiltunes:track-transition-end'));
      }
    };

    const onPause = () => {
      if (isYouTubeSong(currentSongRef.current)) return;
      const duration = resolveDuration({ audioDuration: audio.duration, catalogDuration: currentSongRef.current?.duration });
      const kind = pauseKind({ ended: audio.ended, userPaused: userPausedRef.current, seeking: audio.seeking, currentTime: audio.currentTime, duration });
      if (kind === 'finished' || isTransitioningRef.current) {
        // The stream reached its end or is transitioning to the next track: do NOT tell the app or the Android notification "paused"
        // (that demotes the foreground service while the screen is locked, right before the next song must load).
        beginTransition();
        return;
      }
      if (userPausedRef.current) {
        setIsPlaying(false);
        return;
      }
      if (kind === 'suspect') {
        // Paused by something other than the person, close to the end (the connection died, Android took the audio). Still paused soon after = finished.
        const rid = playRequestIdRef.current;
        clearTimeout(endTimersRef.current.pause);
        endTimersRef.current.pause = setTimeout(() => {
          if (rid === playRequestIdRef.current && audio.paused && !audio.ended && !userPausedRef.current) finishSongRef.current('paused-near-end');
        }, PAUSE_FINISH_MS);
      } else {
        setIsPlaying(false);
      }
    };

    const onError = async () => {
      if (isYouTubeSong(currentSongRef.current)) return;
      console.warn('Playback error encountered on source:', audio.src);
      const song = currentSongRef.current;
      const t = audio.currentTime;
      const action = errorAction({ currentTime: t, duration: resolveDuration({ audioDuration: audio.duration, catalogDuration: song?.duration }), midSongErrors: midSongErrorsRef.current });

      if (action === 'finish') { // the stream broke within the last 20 seconds: the song is finished
        setIsBuffering(false);
        finishSongRef.current('error-near-end');
        return;
      }
      if (action === 'retry') { // broke in the middle: load the same stream again and carry on from the same second, once
        midSongErrorsRef.current += 1;
        try {
          const src = audio.currentSrc || audio.src;
          audio.src = src;
          audio.load();
          seekAudioWhenReady(t);
          setIsBuffering(true);
          await safeAudioPlay(audio, playRequestIdRef.current);
          return;
        } catch (err) {
          console.warn('Retrying the stream failed:', err.message);
        }
      }
      if (action === 'retry' || action === 'skip') { // broke in the middle again: give up on this song
        setIsBuffering(false);
        setIsPlaying(false);
        showToast(song?.title ? `Couldn't play "${song.title}", skipped.` : "Couldn't play that song, skipped.");
        clearEndTimers();
        endTransition();
        goNextRef.current('skip');
        return;
      }

      // 'candidates': the song never really started. Try the next audio address (the old behaviour)
      if (candidateIndexRef.current < activeCandidatesRef.current.length - 1) {
        candidateIndexRef.current += 1;
        const nextUrl = activeCandidatesRef.current[candidateIndexRef.current];
        try {
          const resolvedUrl = new URL(nextUrl, window.location.origin).href;
          audio.src = resolvedUrl;
          audio.load();
          setIsBuffering(true);
          await safeAudioPlay(audio, playRequestIdRef.current);
          return;
        } catch (err) {
          console.warn('Fallback stream attempt failed:', err.message);
        }
      }

      setIsBuffering(false);
      setIsPlaying(false);
      if (currentSongRef.current) {
        await handleExpiredStream(currentSongRef.current);
      }
    };

    const onEnded = () => {
      if (!isYouTubeSong(currentSongRef.current)) {
        finishSongRef.current('ended');
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('stalled', onWaiting);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', syncDuration);
      audio.removeEventListener('stalled', onWaiting);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
    };
  }, [isYouTubeSong, checkRecordHistory]);

  // Handle track end


  // Start a song on the right engine (audio element or YouTube). The queue is handled by the engine, not here.
  const startPlayback = async (song) => {
    if (!song) return;

    isTransitioningRef.current = true;
    // Increment request ID to invalidate in-flight play attempts
    const requestId = ++playRequestIdRef.current;
    restoredRef.current = null; // a real play replaces any restored-but-paused song
    userPausedRef.current = false;
    midSongErrorsRef.current = 0;
    clearEndTimers({ keepTransition: true });
    song._hasRetriedFreshFetch = false; // a song that was refreshed once earlier may be refreshed again

    setPlaybackError(null);
    playbackModeRef.current = 'audio'; // every new song starts in audio mode
    setPlaybackModeState('audio');
    setCurrentSong(song);
    currentSongRef.current = song;
    setCurrentTime(0);

    const isYT = isYouTubeSong(song);

    if (isYT) {
      // 1. YouTube IFrame Player engine
      const audio = audioRef.current;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();

      const vid = getYouTubeVideoId(song);
      setDuration(song.duration || 0);
      setIsBuffering(true);
      setIsPlaying(true);

      if (ytPlayerRef.current && vid) {
        ytPlayerRef.current.loadVideo(vid, true);
        ytPlayerRef.current.setVolume(isMuted ? 0 : volume);
      }
    } else {
      // 2. HTML5 Audio engine
      if (ytPlayerRef.current) {
        ytPlayerRef.current.pause();
      }
      setDuration(0); // the real length arrives with loadedmetadata; never show (or send to the notification) the previous song's length

      const audio = audioRef.current;
      const candidates = buildCandidateUrls(song);
      activeCandidatesRef.current = candidates;
      candidateIndexRef.current = 0;

      const initialUrl = candidates[0];
      try {
        const resolvedUrl = new URL(initialUrl, window.location.origin).href;
        if (audio.src !== resolvedUrl) {
          audio.src = resolvedUrl;
          audio.load();
        }
        setIsBuffering(true);
        await safeAudioPlay(audio, requestId);
      } catch (err) {
        console.warn('Primary stream error, trying fallback:', err.message);
        if (requestId !== playRequestIdRef.current) return;

        if (candidates.length > 1) {
          candidateIndexRef.current = 1;
          try {
            const fallbackResolved = new URL(candidates[1], window.location.origin).href;
            audio.src = fallbackResolved;
            audio.load();
            setIsBuffering(true);
            await safeAudioPlay(audio, requestId);
          } catch (e2) {
            if (requestId === playRequestIdRef.current) {
              await handleExpiredStream(song);
            }
          }
        } else {
          await handleExpiredStream(song);
        }
      }
    }
  };

  const getActiveTime = () => {
    if (isYouTubeSong(currentSongRef.current)) return ytPlayerRef.current?.getCurrentTime() || 0;
    return audioRef.current?.currentTime || 0;
  };

  const seekAudioWhenReady = (t) => {
    const audio = audioRef.current;
    const apply = () => {
      try { audio.currentTime = t; } catch (e) { /* ignore */ }
    };
    if (audio.readyState >= 1) apply();
    else audio.addEventListener('loadedmetadata', apply, { once: true });
  };

  // Switch between Audio and Video. Both engines are stopped first, then ONLY the new one is started at the
  // same position, and only if the song was playing (the tap on the toggle is the user action). A paused song
  // stays paused.
  const switchPlaybackMode = (target, { user = false, autoplay = false } = {}) => {
    const song = currentSongRef.current;
    if (target === 'video' && videoBlockedRef.current) {
      showToast('Video is set to Wi-Fi only. You can change this in Video settings.');
      return false;
    }
    if (user) userChoseAudioRef.current = target === 'audio' ? song?.id ?? null : null;
    const plan = planSwitch({
      song,
      currentMode: playbackModeRef.current,
      targetMode: target,
      unavailable: unavailableVideosRef.current
    });
    if (!plan.ok) return false;

    const wasPlaying = isPlayingRef.current || autoplay; // autoplay: a tapped video thumbnail starts playing even if the song had not started yet
    const t = Math.max(0, getActiveTime());
    const requestId = (playRequestIdRef.current += 1); // invalidate any in-flight audio play request
    audioRef.current.pause();
    ytPlayerRef.current?.pause();

    playbackModeRef.current = target;
    setPlaybackModeState(target);
    setIsPlaying(wasPlaying);
    setIsBuffering(wasPlaying);
    setPlaybackError(null);
    setCurrentTime(t);

    if (target === 'video') {
      // autoplay only if it was playing; otherwise just cue at the same position
      ytPlayerRef.current?.loadVideo(getVideoId(song), wasPlaying, t);
      ytPlayerRef.current?.setVolume(isMuted ? 0 : volume);
      setDuration(song.duration || duration || 0);
    } else {
      seekAudioWhenReady(t);
      setDuration(audioRef.current.duration || song.duration || duration || 0);
      if (wasPlaying) {
        safeAudioPlay(audioRef.current, requestId).catch((err) => {
          console.warn('Could not resume audio after switching mode:', err.message);
          setIsPlaying(false);
          setIsBuffering(false);
        });
      }
    }
    return true;
  };

  // Video is shown only in Now Playing: closing it while a video plays switches back to audio at the same spot (never a hidden player).
  // A YouTube-only song has no audio to switch to, so it keeps its small visible player.
  const wasFullScreenRef = useRef(false);
  useEffect(() => {
    if (wasFullScreenRef.current && !isFullScreen && playbackModeRef.current === 'video' && hasAudioStream(currentSongRef.current)) switchPlaybackMode('audio');
    wasFullScreenRef.current = isFullScreen;
  }, [isFullScreen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wi-Fi only: leaving Wi-Fi for mobile data during a video switches to audio at the same spot
  useEffect(() => {
    if (videoBlocked && playbackModeRef.current === 'video' && hasAudioStream(currentSongRef.current)) {
      if (switchPlaybackMode('audio')) showToast('Switched to audio: video is set to Wi-Fi only.'); // switching TO audio is never blocked
    }
  }, [videoBlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefer video: while Now Playing is open, a song that has a video plays it (unless the person picked audio for this song)
  useEffect(() => {
    const song = currentSongRef.current;
    const requested = song && videoRequestRef.current === song.id;
    if (requested && isFullScreen) videoRequestRef.current = null;
    if (!isFullScreen || !(videoPrefs.preferVideo || requested) || !song) return;
    if (videoBlocked) { if (requested) showToast('Video is set to Wi-Fi only. You can change this in Video settings.'); return; }
    if (playbackModeRef.current === 'video' || (!requested && userChoseAudioRef.current === song.id)) return;
    if (!canToggleVideo(song, unavailableVideosRef.current)) return;
    // A tapped video thumbnail always plays (the song may still be starting, so it is not "playing" yet)
    switchPlaybackMode('video', { autoplay: requested });
  }, [isFullScreen, currentSong?.id, videoPrefs.preferVideo, videoBlocked, unavailableVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the screen awake only while a video is actually playing (and let it sleep again as soon as it stops)
  const videoPlaying = activeEngine === 'youtube' && isPlaying;
  useEffect(() => {
    if (!videoPlaying || typeof navigator === 'undefined' || !navigator.wakeLock?.request) return undefined;
    let lock = null;
    let stopped = false;
    const take = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try { lock = await navigator.wakeLock.request('screen'); } catch { /* not allowed (battery saver, no permission): fine */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') take(); }; // the system drops the lock when the page is hidden
    take();
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; document.removeEventListener('visibilitychange', onVisible); lock?.release?.().catch?.(() => {}); };
  }, [videoPlaying]);

  // YouTube pauses when the screen locks or the app goes to the background (by design; no workaround). Coming back, offer audio in one tap.
  const pausedByBackgroundRef = useRef(false);
  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === 'hidden') {
        pausedByBackgroundRef.current = playbackModeRef.current === 'video' && isPlayingRef.current && hasAudioStream(currentSongRef.current);
      } else if (pausedByBackgroundRef.current) {
        pausedByBackgroundRef.current = false;
        if (playbackModeRef.current === 'video') {
          showToast('Video pauses when the screen locks. Switch to Audio for background play.', { label: 'Switch to audio', onClick: () => switchPlaybackMode('audio') });
        }
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleYouTubeError = (event) => {
    const song = currentSongRef.current;
    if (!isYouTubeSong(song)) return;

    const plan = planEmbedError({ song, code: event?.data });
    if (plan.action === 'fallback-audio') {
      // Embedding blocked (101/150): remember it, go back to audio at the same position, tell the user.
      // If it was playing, audio resumes automatically (best effort: a browser may refuse without a tap).
      const wasPlaying = isPlayingRef.current;
      const t = Math.max(0, ytPlayerRef.current?.getCurrentTime() || 0);
      const requestId = (playRequestIdRef.current += 1); // invalidate any in-flight play request
      ytPlayerRef.current?.pause();
      unavailableVideosRef.current.add(plan.videoId);
      rememberHidden(window.localStorage, plan.videoId); // hidden for this person for 7 days
      if (isAuthRef.current) { // signed in: tell the server; after 2 different people it is hidden for everyone until an admin checks it
        api.post(`/songs/${encodeURIComponent(song.id)}/video-report`, { videoId: plan.videoId, code: Number(event?.data) }).catch(() => { /* best effort */ });
      }
      setUnavailableVersion((v) => v + 1);
      playbackModeRef.current = 'audio';
      setPlaybackModeState('audio');
      setIsPlaying(wasPlaying);
      setIsBuffering(wasPlaying);
      setCurrentTime(t);
      seekAudioWhenReady(t);
      showToast('Video isn’t available for this song');
      if (wasPlaying) {
        safeAudioPlay(audioRef.current, requestId).catch(() => {
          setIsPlaying(false);
          setIsBuffering(false);
          showToast('Video isn’t available for this song. Tap play to continue with audio.');
        });
      }
      return;
    }

    // YouTube-only song (or a non-embed error): original behaviour, skip to the next track
    const errCode = event?.data;
    let msg = 'YouTube playback failed. Auto-skipping to next track...';
    if (errCode === 101 || errCode === 150) {
      msg = 'Playback restricted by video owner (Error 101/150). Auto-skipping to next track...';
    } else if (errCode === 100) {
      msg = 'YouTube video not found. Auto-skipping to next track...';
    } else if (errCode === 2) {
      msg = 'Invalid video ID parameter. Auto-skipping to next track...';
    }
    setPlaybackError(msg);
    setTimeout(() => nextTrack(), 1500);
  };

  // A queue restored from a save is shown paused. The first Play starts it at the saved position.
  const startRestored = async () => {
    const r = restoredRef.current;
    if (!r || !currentSongRef.current || r.id !== currentSongRef.current.id) return false;
    const song = currentSongRef.current;
    const at = r.positionSec;
    const started = startPlayback(song); // sets the source synchronously, then waits for playback
    if (at > 1 && !isYouTubeSong(song)) seekAudioWhenReady(at);
    await started;
    return true;
  };

  const togglePlay = async () => {
    if (!currentSong) return;
    if (!isPlaying && (await startRestored())) return;
    const isYT = isYouTubeSong(currentSong);

    if (isYT) {
      if (isPlaying) {
        ytPlayerRef.current?.pause();
        setIsPlaying(false);
      } else {
        ytPlayerRef.current?.play();
        setIsPlaying(true);
      }
    } else {
      const audio = audioRef.current;
      if (isPlaying) {
        userPausedRef.current = true;
        endTransition();
        audio.pause();
        setIsPlaying(false);
      } else {
        const requestId = ++playRequestIdRef.current;
        try {
          setIsBuffering(true);
          await safeAudioPlay(audio, requestId);
        } catch (err) {
          console.error('Failed to resume audio:', err);
          setIsBuffering(false);
        }
      }
    }
  };

  const pause = () => {
    userPausedRef.current = true; // the person (or the notification / headset) paused: never mistaken for "the song ended"
    isTransitioningRef.current = false;
    clearEndTimers();
    window.dispatchEvent(new CustomEvent('tamiltunes:track-transition-end'));
    if (isYouTubeSong(currentSong)) {
      ytPlayerRef.current?.pause();
    } else {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  };

  const pauseRef = useRef(pause);
  pauseRef.current = pause;

  const resume = async () => {
    if (await startRestored()) return;
    if (isYouTubeSong(currentSong)) {
      ytPlayerRef.current?.play();
      setIsPlaying(true);
    } else {
      const requestId = ++playRequestIdRef.current;
      try {
        await safeAudioPlay(audioRef.current, requestId);
      } catch (err) {
        console.error('Resume failed:', err);
      }
    }
  };

  const seek = (timeInSeconds) => {
    if (!isFinite(timeInSeconds)) return;
    const isYT = isYouTubeSong(currentSong);

    if (isYT) {
      ytPlayerRef.current?.seek(timeInSeconds);
      setCurrentTime(timeInSeconds);
    } else {
      if (audioRef.current) {
        audioRef.current.currentTime = timeInSeconds;
        setCurrentTime(timeInSeconds);
      }
    }
  };

  const setVolume = (val) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
    if (ytPlayerRef.current) ytPlayerRef.current.setVolume(clamped);
    localStorage.setItem('tamiltunes_vol', clamped.toString());
    if (clamped > 0 && isMuted) setIsMuted(false);
  };

  const toggleMute = () => {
    if (isMuted) {
      if (audioRef.current) audioRef.current.volume = volume;
      if (ytPlayerRef.current) ytPlayerRef.current.unMute();
      setIsMuted(false);
    } else {
      if (audioRef.current) audioRef.current.volume = 0;
      if (ytPlayerRef.current) ytPlayerRef.current.mute();
      setIsMuted(true);
    }
  };

  const duck = useCallback((ratio = 0.3) => {
    if (audioRef.current && !isMuted) audioRef.current.volume = Math.max(0, Math.min(1, volumeRef.current * ratio));
    if (ytPlayerRef.current && !isMuted) ytPlayerRef.current.setVolume(Math.max(0, Math.min(1, volumeRef.current * ratio)));
  }, [isMuted]);

  const unduck = useCallback(() => {
    if (audioRef.current && !isMuted) audioRef.current.volume = volumeRef.current;
    if (ytPlayerRef.current && !isMuted) ytPlayerRef.current.setVolume(volumeRef.current);
  }, [isMuted]);

  // ---- queue controls (all state changes go through the engine) ----

  /** Play a song. With a list of 2+ songs it follows that list (playlist / album / shelf); otherwise it starts a radio. */
  const playSong = async (song, newQueue = null, opts = {}) => {
    if (!song) return;
    if (Array.isArray(newQueue) && newQueue.length > 1) {
      const index = Math.max(0, newQueue.findIndex((item) => item.id === song.id));
      updateQs((q) => playFromContext(q, { songs: newQueue, index, type: opts.type || 'list', id: opts.id ?? null, label: opts.label || '' }));
    } else {
      updateQs((q) => playFromSearch(q, song, { fallback: opts.fallback || [] }));
    }
    return startPlayback(song);
  };

  /** Play a song and let the radio fill the queue after it. `fallback` songs are queued if the radio has nothing. */
  const startRadio = (song, { fallback = [] } = {}) => playSong(song, null, { fallback });
  /** A video thumbnail was tapped: play the song and show it as video in Now Playing (the embed loads only now). */
  const playAsVideo = (song, list = null) => {
    if (!song) return;
    videoRequestRef.current = song.id;
    if (currentSongRef.current?.id === song.id) setIsFullScreen(true);
    else { playSong(song, list); setIsFullScreen(true); }
  };

  const goNext = async (reason = 'skip') => {
    if (reason === 'ended' && qsRef.current.stopAfter) {
      // "Stop after this song" (or the sleep timer's "end of song"): stay on this song, paused at the start
      updateQs((q) => setStopAfter(q, false));
      setSleepTimer((t) => (t?.id === 'song' ? null : t));
      pause();
      seek(0);
      showToast('Stopped after this song.');
      return;
    }
    let r = advance(qsRef.current, { reason });
    if (r.status === 'repeat-one') {
      seek(0);
      resume();
      return;
    }
    if (r.status === 'waiting') {
      // radio queue ran dry: fetch more, then try again
      await runRefill({ get: () => qsRef.current, update: updateQs, fetchRelated, avoid: getShownOnHome, onAdded: announceAdded });
      r = advance(qsRef.current, { reason });
    }
    if (r.status === 'playing') {
      updateQs(() => r.state);
      return startPlayback(r.song);
    }
    if (r.status === 'ended') {
      updateQs(() => r.state);
      pause();
      if (r.state.offerRadio) {
        showToast('That list has finished.', { label: 'Keep playing similar songs', onClick: () => continueWithRadio() });
      }
      return;
    }
    pause(); // still waiting: the radio could not be reached
    showToast('No more songs to play right now. Check your connection and try again.');
  };
  // Sleep timer: pause after 15 / 30 / 60 minutes, or when this song ends
  const [sleepTimer, setSleepTimer] = useState(null); // { id, endsAt | null }
  const startSleepTimer = (id) => {
    const t = startSleep(id);
    if (!t) return;
    setSleepTimer(t);
    updateQs((q) => setStopAfter(q, id === 'song'));
    showToast(id === 'song' ? 'Music will stop after this song.' : `Sleep timer set for ${id} minutes.`);
  };
  const cancelSleepTimer = () => { setSleepTimer(null); updateQs((q) => setStopAfter(q, false)); showToast('Sleep timer off.'); };
  const toggleStopAfter = () => {
    const on = !qsRef.current.stopAfter;
    updateQs((q) => setStopAfter(q, on));
    if (!on) setSleepTimer((t) => (t?.id === 'song' ? null : t));
    showToast(on ? 'Music will stop after this song.' : 'Will keep playing after this song.');
  };
  useEffect(() => {
    if (!sleepTimer?.endsAt) return undefined;
    const t = setTimeout(() => {
      setSleepTimer(null);
      pauseRef.current();
      showToast('Sleep timer: music stopped.');
    }, Math.max(0, sleepTimer.endsAt - Date.now()));
    return () => clearTimeout(t);
  }, [sleepTimer, showToast]);

  goNextRef.current = goNext;

  const nextTrack = () => goNext('skip');

  const previousTrack = () => {
    const r = previous(qsRef.current, { currentTime, restartThreshold: 3 });
    if (r.status === 'restart') {
      seek(0);
      resume();
      return;
    }
    if (r.status === 'playing') {
      updateQs(() => r.state);
      startPlayback(r.song);
    }
  };

  /** A playlist / album ended: carry on with radio seeded from the last song. */
  const continueWithRadio = async () => {
    updateQs(switchToRadio);
    await goNextRef.current('skip');
  };

  const toggleShuffle = () => updateQs((q) => queueSetShuffle(q, !q.shuffle));
  const toggleRepeat = () => updateQs((q) => queueSetRepeat(q, nextRepeat(q.repeat)));
  const setAutoplay = (on) => {
    try { localStorage.setItem(AUTOPLAY_KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ }
    updateQs((q) => queueSetAutoplay(q, on));
  };

  // Add a song to the user's queue block. A song that is already queued asks first: add it again, or move it.
  const [dupPrompt, setDupPrompt] = useState(null); // { song, where: 'next' | 'end', uid }
  // Autoplay says what it did instead of changing the queue silently
  const announceAdded = (n) => showToast(`Added ${n} similar song${n === 1 ? '' : 's'}.`);

  // Run a change to the upcoming list, show a short message with Undo. Undo only works while nothing else has changed the list.
  const withUndo = (message, change) => {
    const before = qsRef.current;
    const after = updateQs(change);
    if (after === before) return after;
    haptic(10);
    const sameOrder = (a, b) => a.length === b.length && a.every((e, i) => e.uid === b[i].uid);
    showToast(message, {
      label: 'Undo',
      onClick: () => updateQs((q) => (sameOrder(q.upcoming, after.upcoming) ? { ...q, upcoming: before.upcoming, userCount: before.userCount } : q)),
    });
    return after;
  };

  const requestQueueAdd = (song, where) => {
    if (!song) return 'none';
    const q = qsRef.current;
    if (isQueueFull(q)) { showToast(`The queue is full (${MAX_QUEUE} songs). Remove some to add more.`); return 'full'; }
    const at = findQueued(q, song); // the same song under another id or singer order counts as queued
    if (at >= 0) { setDupPrompt({ song, where, uid: q.upcoming[at].uid }); return 'prompt'; }
    withUndo(where === 'next' ? 'Playing next.' : 'Added to queue.', (s) => (where === 'next' ? queuePlayNext(s, song) : queueAdd(s, song)));
    return 'added';
  };
  const addToQueue = (song) => requestQueueAdd(song, 'end');
  const playNext = (song) => requestQueueAdd(song, 'next');
  const resolveDuplicate = (choice) => {
    const p = dupPrompt;
    setDupPrompt(null);
    if (!p || choice === 'cancel') return;
    if (choice === 'again') withUndo(p.where === 'next' ? 'Playing next.' : 'Added to queue.', (s) => (p.where === 'next' ? queuePlayNext(s, p.song) : queueAdd(s, p.song)));
    else withUndo(p.where === 'next' ? 'Moved to play next.' : 'Moved to the end of your queue.', (s) => { const i = indexOfUid(s, p.uid); return i >= 0 ? moveToQueue(s, i, p.where) : s; });
  };
  const clearQueue = () => {
    const before = qsRef.current;
    if (!before.userCount) return;
    updateQs(clearUserQueue);
    showToast(`Cleared ${before.userCount} song${before.userCount === 1 ? '' : 's'} from your queue.`, { label: 'Undo', onClick: () => updateQs((q) => restoreRemoved(q, before.upcoming.slice(0, before.userCount).map((entry, index) => ({ index, entry })))) });
  };

  // ---- Queue v2 actions (by queue slot id, so the same song can be queued twice)
  const undoToast = (message, removed) => showToast(message, { label: 'Undo', onClick: () => updateQs((q) => restoreRemoved(q, removed)) });
  const removeUids = (uids) => {
    const r = removeByUids(qsRef.current, uids);
    if (!r.removed.length) return;
    haptic(12);
    updateQs(() => r.state);
    undoToast(r.removed.length === 1 ? `Removed "${r.removed[0].entry.song.title}".` : `Removed ${r.removed.length} songs.`, r.removed);
  };
  const moveUidsToQueue = (uids, where) => withUndo(uids.length === 1 ? (where === 'next' ? 'Playing next.' : 'Moved to the end of your queue.') : `Moved ${uids.length} songs ${where === 'next' ? 'to play next' : 'to the end of your queue'}.`, (q) => moveManyToQueue(q, uids, where));
  const reorderByUid = (activeUid, overUid) => {
    const title = qsRef.current.upcoming.find((e) => e.uid === activeUid)?.song.title;
    withUndo(`Moved ${title ? `"${title}"` : 'song'}.`, (q) => reorderUpcoming(q, indexOfUid(q, activeUid), indexOfUid(q, overUid)));
  };
  const jumpToUid = (uid) => { const i = indexOfUid(qsRef.current, uid); if (i >= 0) { haptic(10); jumpToUpcoming(i); } };
  const removeCurrentSong = async () => {
    const r = removeCurrent(qsRef.current);
    if (r.status === 'playing') { updateQs(() => r.state); showToast('Removed from the queue.'); return startPlayback(r.song); }
    return goNext('skip');
  };
  const refreshRecommendations = () => { updateQs(clearRadio); setRefillTick((n) => n + 1); };
  const playFromHistoryAt = (i) => { const r = playFromHistory(qsRef.current, i); if (!r.song) return; updateQs(() => r.state); startPlayback(r.song); };
  const saveQueueAsPlaylist = async (name) => {
    const q = qsRef.current;
    const songIds = [q.current?.id, ...q.upcoming.map((e) => e.song.id)].filter(Boolean);
    const { data } = await api.post('/playlists/from-queue', { name, songIds });
    return data;
  }; // clears the songs the user added; the radio / list carries on

  // Index-based helpers for views that list "upcoming" (what the queue panel uses)
  const removeFromUpcomingAt = (i) => updateQs((q) => removeFromUpcoming(q, i));
  const reorderUpcomingAt = (from, to) => updateQs((q) => reorderUpcoming(q, from, to));
  const jumpToUpcoming = (i) => {
    const r = jumpTo(qsRef.current, i);
    if (!r.song) return;
    updateQs(() => r.state);
    startPlayback(r.song);
  };

  // Flat-index helpers kept for older callers (index into the whole `queue` list)
  const moveInQueue = (from, to) => {
    const h = qsRef.current.history.length;
    if (from > h && to > h) updateQs((q) => reorderUpcoming(q, from - h - 1, to - h - 1));
  };
  const removeFromQueue = (index) => {
    const h = qsRef.current.history.length;
    if (index < h) updateQs((q) => removeFromHistory(q, index));
    else if (index === h) goNext('skip');
    else updateQs((q) => removeFromUpcoming(q, index - h - 1));
  };

  // What the queue panel shows. Rebuilt only when the queue changes, so the panel is not redrawn on every tick of the song clock.
  const queueSections = useMemo(() => ({
    ...getSections(qs),
    history: [...qs.history].reverse(), // newest first
    refill: { pending: qs.refill.pending, failed: qs.refill.failures > 0 },
    mode: qs.mode,
    stopAfter: qs.stopAfter,
    full: isQueueFull(qs),
    nextUp: peekNext(qs),
  }), [qs]);

  // The panel gets its own context with stable action functions: it does not re-render when the song position moves.
  const latestActions = useRef({});
  useEffect(() => {
    latestActions.current = {
      jumpToUid, removeUids, moveUidsToQueue, reorderByUid, clearQueue, refreshRecommendations, removeCurrentSong, playFromHistoryAt,
      saveQueueAsPlaylist, toggleStopAfter, startSleepTimer, cancelSleepTimer, setAutoplay, continueWithRadio, startRadio, addToQueue, playNext,
    };
  });
  const stableActions = useMemo(() => Object.fromEntries(QUEUE_ACTIONS.map((name) => [name, (...args) => latestActions.current[name]?.(...args)])), []);
  const queueValue = useMemo(() => ({
    ...stableActions, queueSections, autoplay: qs.autoplay, offerRadio: qs.offerRadio, currentSong, isPlaying, sleepTimer, showToast,
  }), [stableActions, queueSections, qs.autoplay, qs.offerRadio, currentSong, isPlaying, sleepTimer, showToast]);

  // ---- radio refill: keep the queue topped up so the music never stops ----
  useEffect(() => {
    if (needsRefill(qs)) runRefill({ get: () => qsRef.current, update: updateQs, fetchRelated, avoid: getShownOnHome, onAdded: announceAdded });
  }, [qs, refillTick, updateQs]);

  // after a failed refill the engine waits (1 s ... 30 s); wake up when the wait is over
  useEffect(() => {
    const wait = qs.refill.retryAt - Date.now();
    if (wait <= 0 || qs.mode !== 'radio' || !qs.autoplay || !qs.current) return undefined;
    const t = setTimeout(() => setRefillTick((n) => n + 1), wait + 50);
    return () => clearTimeout(t);
  }, [qs.refill.retryAt, qs.mode, qs.autoplay, qs.current]);

  // ---- preload the next track so the switch has no gap (only the next one, only for audio songs) ----
  const preloadRef = useRef(null);
  const nextUpId = qs.upcoming[0]?.song?.id;
  useEffect(() => {
    const next = qs.upcoming[0]?.song;
    if (!next || !currentSong || engineFor(next, 'audio', unavailableVideosRef.current) === 'youtube') return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        let url = buildCandidateUrls(next)[0];
        // If streamUrl is not a full URL or needs fresh resolution, pre-resolve ahead of time
        if (!url || !url.startsWith('http')) {
          try {
            const res = await api.get(`/music/song/${next.id}?fresh=1`);
            if (!cancelled && res.data?.success && res.data?.song?.streamUrl) {
              next.streamUrl = res.data.song.streamUrl;
              url = buildCandidateUrls(next)[0];
            }
          } catch { /* best effort */ }
        }
        if (url && !cancelled) {
          const resolvedUrl = new URL(url, window.location.origin).href;
          // Warm TCP/TLS handshake and first chunk in browser socket pool / HTTP cache
          fetch(resolvedUrl, { headers: { Range: 'bytes=0-65535' } }).catch(() => {});
          const el = preloadRef.current ?? (preloadRef.current = new Audio());
          el.preload = 'auto';
          el.src = resolvedUrl;
        }
      } catch { /* preloading is best effort */ }
    }, 2000); // 2s after the current song has settled
    return () => { cancelled = true; clearTimeout(t); };
  }, [nextUpId, currentSong?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // In video mode, fetch the next song's thumbnail ahead of time (the embed API cannot preload a second video without replacing the
  // current one, so the video itself starts when the song does)
  const nextVideoId = qs.upcoming[0]?.song?.videoId;
  useEffect(() => {
    if (playbackMode !== 'video' || !nextVideoId || unavailableVideosRef.current.has(nextVideoId)) return;
    const src = youtubeThumb(nextVideoId);
    if (src) { const img = new Image(); img.src = src; }
  }, [playbackMode, nextVideoId]);

  // Media Session API: lock screen, notification, headphone and Bluetooth controls.
  // The handlers are registered once and read the latest functions through a ref (the old effect re-ran every second because it
  // depended on currentTime, rebuilding the metadata and every handler each tick).
  const mediaCtl = useRef({});
  mediaCtl.current = { resume, pause, previousTrack, nextTrack, seek, currentTime, duration };

  useEffect(() => {
    if (!('mediaSession' in navigator)) return undefined;
    const ms = navigator.mediaSession;
    const handlers = {
      play: () => mediaCtl.current.resume(),
      pause: () => mediaCtl.current.pause(),
      stop: () => mediaCtl.current.pause(),
      previoustrack: () => mediaCtl.current.previousTrack(),
      nexttrack: () => mediaCtl.current.nextTrack(),
      seekto: (d) => { if (d?.seekTime !== undefined) mediaCtl.current.seek(d.seekTime); },
      seekbackward: (d) => mediaCtl.current.seek(Math.max(0, mediaCtl.current.currentTime - (d?.seekOffset || 10))),
      seekforward: (d) => mediaCtl.current.seek(Math.min(mediaCtl.current.duration || Infinity, mediaCtl.current.currentTime + (d?.seekOffset || 10))),
    };
    for (const [action, fn] of Object.entries(handlers)) { try { ms.setActionHandler(action, fn); } catch { /* this browser does not support that action */ } }
    return () => { for (const action of Object.keys(handlers)) { try { ms.setActionHandler(action, null); } catch { /* ignore */ } } };
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!currentSong) { navigator.mediaSession.metadata = null; return; }
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist || currentSong.singers || 'TamilTunes Artist',
        album: currentSong.album || 'TamilTunes',
        artwork: mediaArtwork(currentSong),
      });
    } catch (e) {
      console.warn('MediaSession metadata warning:', e);
    }
  }, [currentSong?.id, currentSong?.title, currentSong?.artist, currentSong?.image]); // eslint-disable-line react-hooks/exhaustive-deps

  // The lock screen needs the length and position to draw its seek bar; the system moves it on by itself while playing,
  // so this only needs refreshing when the song, the play state or the position jumps (every 5 s is plenty).
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong || !(duration > 0) || !navigator.mediaSession.setPositionState) return;
    try {
      navigator.mediaSession.setPositionState({ duration, playbackRate: 1, position: Math.min(Math.max(0, currentTime), duration) });
    } catch { /* position outside the song: ignore */ }
  }, [currentSong?.id, duration, isPlaying, Math.floor(currentTime / 5)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync playback state to MediaSession
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  // Sync position state to MediaSession
  useEffect(() => {
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && duration > 0 && isFinite(currentTime)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, duration),
          playbackRate: 1,
          position: Math.min(Math.max(0, currentTime), duration)
        });
      } catch (e) {}
    }
  }, [currentTime, duration]);

  // Global accessible keyboard shortcuts (Space, M, N next, P previous, Q queue, Arrows)
  // Strictly disabled while typing in Search, Login, or any input/textarea
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      } else if (e.code === 'KeyN' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        nextTrack();
      } else if (e.code === 'KeyP' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        previousTrack();
      } else if (e.code === 'KeyQ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setIsQueueOpen((open) => !open);
      } else if (e.code === 'ArrowRight' && e.shiftKey) {
        e.preventDefault();
        nextTrack();
      } else if (e.code === 'ArrowLeft' && e.shiftKey) {
        e.preventDefault();
        previousTrack();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seek(Math.min(duration, currentTime + 5));
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seek(Math.max(0, currentTime - 5));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, toggleMute, nextTrack, previousTrack, seek, currentTime, duration]);

  return (
    <AudioContext.Provider
      value={{
        showToast,
        audioInstance: audioRef.current,
        currentSong,
        isPlaying,
        currentTime,
        duration,
        volume,
        isMuted,
        isBuffering,
        playbackError,
        queue,
        queueIndex,
        queueSections,
        sleepTimer,
        startSleepTimer,
        cancelSleepTimer,
        toggleStopAfter,
        removeUids,
        moveUidsToQueue,
        reorderByUid,
        jumpToUid,
        removeCurrentSong,
        refreshRecommendations,
        playFromHistoryAt,
        saveQueueAsPlaylist,
        autoplay: qs.autoplay,
        offerRadio: qs.offerRadio,
        isShuffle,
        repeatMode,
        isFullScreen,
        isQueueOpen,
        playSong,
        togglePlay,
        pause,
        resume,
        seek,
        setVolume,
        toggleMute,
        nextTrack,
        previousTrack,
        toggleShuffle,
        toggleRepeat,
        addToQueue,
        playNext,
        startRadio,
        continueWithRadio,
        setAutoplay,
        removeFromUpcomingAt,
        reorderUpcomingAt,
        jumpToUpcoming,
        moveInQueue,
        removeFromQueue,
        clearQueue,
        setIsFullScreen,
        setIsQueueOpen,
        setPlaybackError,
        playbackMode,
        activeEngine,
        canToggleVideo: canToggleVideo(currentSong, unavailableVideosRef.current),
        videoPrefs,
        setVideoPrefs,
        videoBlocked,
        playAsVideo,
        switchPlaybackMode,
        registerVideoSlot,
        unavailableVersion,
        isUserPaused: () => userPausedRef.current,
        isTransitioning: () => isTransitioningRef.current,
        duck,
        unduck
      }}
    >
      {/* YouTube IFrame Engine (visible floating player, min 200x200) */}
      <YouTubePlayer
        ref={ytPlayerRef}
        videoId={activeEngine === 'youtube' ? getYouTubeVideoId(currentSong) : null}
        visible={activeEngine === 'youtube'}
        rect={slotRect}
        onPlaying={() => {
          if (isYouTubeSong(currentSongRef.current)) {
            setIsPlaying(true);
            setIsBuffering(false);
            setPlaybackError(null);
          } else {
            ytPlayerRef.current?.pause(); // never let YouTube play while the audio engine is active
          }
        }}
        onPause={() => {
          if (isYouTubeSong(currentSongRef.current)) {
            setIsPlaying(false);
          }
        }}
        onBuffering={() => {
          if (isYouTubeSong(currentSongRef.current)) {
            setIsBuffering(true);
          }
        }}
        onEnded={() => {
          if (isYouTubeSong(currentSongRef.current)) {
            finishSongRef.current('ended');
          }
        }}
        onTimeUpdate={(cur, dur) => {
          if (isYouTubeSong(currentSongRef.current)) {
            setCurrentTime(cur);
            if (dur > 0) setDuration(dur);
            checkRecordHistory(currentSongRef.current, cur);
          }
        }}
        onError={handleYouTubeError}
      />
      <QueueContext.Provider value={queueValue}>{children}</QueueContext.Provider>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <DuplicateQueuePrompt prompt={dupPrompt} onChoose={resolveDuplicate} />
      <ContinueHerePrompt open={Boolean(syncPrompt)} onChoose={resolveSyncPrompt} />
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};

/** The queue panel's view of the player: steady (no re-render on every tick of the song clock). */
export const useQueue = () => {
  const context = useContext(QueueContext);
  if (!context) throw new Error('useQueue must be used within an AudioProvider');
  return context;
};

export default AudioContext;
