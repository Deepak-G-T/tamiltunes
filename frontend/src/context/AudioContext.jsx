import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import YouTubePlayer from '../components/player/YouTubePlayer';
import DuplicateQueuePrompt from '../components/player/DuplicateQueuePrompt';
import {
  createQueueState, playFromSearch, playFromContext, switchToRadio, advance, previous, jumpTo,
  addToQueue as queueAdd, playNext as queuePlayNext, removeFromUpcoming, removeFromHistory, reorderUpcoming,
  clearUserQueue, setShuffle as queueSetShuffle, setRepeat as queueSetRepeat, nextRepeat, setAutoplay as queueSetAutoplay,
  needsRefill, runRefill, toFlatQueue, getSections, isQueueFull, findQueued, moveToQueue, indexOfUid, MAX_QUEUE
} from '../lib/radioQueue';
import { fetchRelated } from '../lib/radioApi';
import Toast from '../components/common/Toast';
import { getCoverColor, rgbVar } from '../lib/coverColor';
import { engineFor, canToggleVideo, getVideoId, planSwitch, planEmbedError } from '../lib/playbackLogic';

const AudioContext = createContext();
const AUTOPLAY_KEY = 'tamiltunes_autoplay';
const FADE_IN_SECONDS = 0.6; // soft start / end of each track (HTML5 engine only)
const FADE_OUT_SECONDS = 1.2;

export const AudioProvider = ({ children }) => {
  const audioRef = useRef(new Audio());
  const ytPlayerRef = useRef(null);

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
  const activeCandidatesRef = useRef([]);
  const candidateIndexRef = useRef(0);
  const currentSongRef = useRef(null);

  // Video/Audio mode (only meaningful for songs that have both an audio stream and a videoId)
  const [playbackMode, setPlaybackModeState] = useState('audio'); // 'audio' | 'video'
  const playbackModeRef = useRef('audio');
  const unavailableVideosRef = useRef(new Set()); // videoIds that failed to embed (101/150)
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
      const token = localStorage.getItem('tamiltunes_token');
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
      const playPromise = audio.play();
      playPromiseRef.current = playPromise;
      await playPromise;

      if (requestId === playRequestIdRef.current) {
        setIsPlaying(true);
        setIsBuffering(false);
        setPlaybackError(null);
      }
    } catch (err) {
      if (err.name === 'AbortError' || requestId !== playRequestIdRef.current) {
        // Play was safely aborted by a newer track selection
        return;
      }
      throw err;
    }
  };

  // Attempt to refresh expired stream URL by song ID (GET /api/music/song/:id?fresh=1)
  const handleExpiredStream = async (song) => {
    if (!song || song._hasRetriedFreshFetch) {
      setPlaybackError('Stream unavailable or expired. Skipping to next track...');
      showToast('That song could not be played. Skipping to the next one.');
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
    showToast('That song could not be played. Skipping to the next one.');
    setTimeout(() => {
      nextTrack();
    }, 1500);
  };

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

    const onLoadedMetadata = () => {
      if (!isYouTubeSong(currentSongRef.current)) {
        setDuration(audio.duration || currentSongRef.current?.duration || 0);
        setIsBuffering(false);
      }
    };

    const onWaiting = () => {
      if (!isYouTubeSong(currentSongRef.current)) setIsBuffering(true);
    };

    const onCanPlay = () => {
      if (!isYouTubeSong(currentSongRef.current)) setIsBuffering(false);
    };

    const onPlaying = () => {
      if (isYouTubeSong(currentSongRef.current)) {
        audio.pause(); // never let the audio element play while the YouTube engine is active
        return;
      }
      {
        setIsPlaying(true);
        setIsBuffering(false);
        setPlaybackError(null);
      }
    };

    const onPause = () => {
      if (!isYouTubeSong(currentSongRef.current)) setIsPlaying(false);
    };

    const onError = async () => {
      if (isYouTubeSong(currentSongRef.current)) return;
      console.warn('Playback error encountered on source:', audio.src);

      // Try next audio candidate if available
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
        handleTrackEnd();
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
    };
  }, [isYouTubeSong, checkRecordHistory]);

  // Handle track end
  const handleTrackEnd = () => goNextRef.current('ended');

  // Start a song on the right engine (audio element or YouTube). The queue is handled by the engine, not here.
  const startPlayback = async (song) => {
    if (!song) return;

    // Increment request ID to invalidate in-flight play attempts
    const requestId = ++playRequestIdRef.current;

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
  const switchPlaybackMode = (target) => {
    const song = currentSongRef.current;
    const plan = planSwitch({
      song,
      currentMode: playbackModeRef.current,
      targetMode: target,
      unavailable: unavailableVideosRef.current
    });
    if (!plan.ok) return false;

    const wasPlaying = isPlayingRef.current;
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
      setUnavailableVersion((v) => v + 1);
      playbackModeRef.current = 'audio';
      setPlaybackModeState('audio');
      setIsPlaying(wasPlaying);
      setIsBuffering(wasPlaying);
      setCurrentTime(t);
      seekAudioWhenReady(t);
      if (wasPlaying) {
        showToast('This video can’t be played here. Switched back to audio.');
        safeAudioPlay(audioRef.current, requestId).catch(() => {
          setIsPlaying(false);
          setIsBuffering(false);
          showToast('This video can’t be played here. Switched to audio: tap play to continue.');
        });
      } else {
        showToast('This video can’t be played here. Switched to audio.');
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

  const togglePlay = async () => {
    if (!currentSong) return;
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
    if (isYouTubeSong(currentSong)) {
      ytPlayerRef.current?.pause();
    } else {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  };

  const resume = async () => {
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

  const goNext = async (reason = 'skip') => {
    let r = advance(qsRef.current, { reason });
    if (r.status === 'repeat-one') {
      seek(0);
      resume();
      return;
    }
    if (r.status === 'waiting') {
      // radio queue ran dry: fetch more, then try again
      await runRefill({ get: () => qsRef.current, update: updateQs, fetchRelated });
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
  const goNextRef = useRef(goNext);
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
  const requestQueueAdd = (song, where) => {
    if (!song) return;
    const q = qsRef.current;
    if (isQueueFull(q)) { showToast(`The queue is full (${MAX_QUEUE} songs). Remove some to add more.`); return; }
    const at = findQueued(q, song.id);
    if (at >= 0) { setDupPrompt({ song, where, uid: q.upcoming[at].uid }); return; }
    updateQs((s) => (where === 'next' ? queuePlayNext(s, song) : queueAdd(s, song)));
  };
  const addToQueue = (song) => requestQueueAdd(song, 'end');
  const playNext = (song) => requestQueueAdd(song, 'next');
  const resolveDuplicate = (choice) => {
    const p = dupPrompt;
    setDupPrompt(null);
    if (!p || choice === 'cancel') return;
    if (choice === 'again') updateQs((s) => (p.where === 'next' ? queuePlayNext(s, p.song) : queueAdd(s, p.song)));
    else updateQs((s) => { const i = indexOfUid(s, p.uid); return i >= 0 ? moveToQueue(s, i, p.where) : s; });
  };
  const clearQueue = () => updateQs(clearUserQueue); // clears the songs the user added; the radio / list carries on

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

  // ---- radio refill: keep the queue topped up so the music never stops ----
  useEffect(() => {
    if (needsRefill(qs)) runRefill({ get: () => qsRef.current, update: updateQs, fetchRelated });
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
    const t = setTimeout(() => {
      try {
        const url = buildCandidateUrls(next)[0];
        if (!url) return;
        const el = preloadRef.current ?? (preloadRef.current = new Audio());
        el.preload = 'auto';
        el.src = new URL(url, window.location.origin).href;
      } catch { /* preloading is best effort */ }
    }, 4000); // after the current song has settled
    return () => clearTimeout(t);
  }, [nextUpId, currentSong?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Media Session API integration for Lock-screen, Headphone, & Bluetooth controls
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong) return;

    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist || currentSong.singers || 'TamilTunes Artist',
        album: currentSong.album || 'TamilTunes',
        artwork: currentSong.image
          ? ['96x96', '256x256', '512x512'].map((sizes) => ({ src: currentSong.image, sizes, type: 'image/jpeg' }))
          : []
      });

      navigator.mediaSession.setActionHandler('play', () => resume());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => previousTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) seek(details.seekTime);
      });
      navigator.mediaSession.setActionHandler('seekbackward', (d) => seek(Math.max(0, currentTime - (d?.seekOffset || 10))));
      navigator.mediaSession.setActionHandler('seekforward', (d) => seek(Math.min(duration || Infinity, currentTime + (d?.seekOffset || 10))));
    } catch (e) {
      console.warn('MediaSession handler warning:', e);
    }

    return () => {
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
          navigator.mediaSession.setActionHandler('previoustrack', null);
          navigator.mediaSession.setActionHandler('nexttrack', null);
          navigator.mediaSession.setActionHandler('seekto', null);
          navigator.mediaSession.setActionHandler('seekbackward', null);
          navigator.mediaSession.setActionHandler('seekforward', null);
        } catch (e) {}
      }
    };
  }, [currentSong, queueIndex, queue, isShuffle, repeatMode, currentTime]);

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

  // Global accessible keyboard shortcuts (Space, M, Arrows)
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
        queueSections: getSections(qs),
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
        switchPlaybackMode,
        registerVideoSlot,
        unavailableVersion
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
            handleTrackEnd();
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
      {children}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <DuplicateQueuePrompt prompt={dupPrompt} onChoose={resolveDuplicate} />
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

export default AudioContext;
