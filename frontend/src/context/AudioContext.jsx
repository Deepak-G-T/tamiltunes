import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import api from '../services/api';
import YouTubePlayer from '../components/player/YouTubePlayer';
import {
  getNextTrackIndex,
  getPreviousTrackAction,
  reorderQueue,
  calculateNewQueueIndexAfterRemoval
} from '../utils/queueLogic';
import Toast from '../components/common/Toast';
import { getCoverColor, rgbVar } from '../lib/coverColor';
import { engineFor, canToggleVideo, getVideoId, planSwitch, planEmbedError } from '../lib/playbackLogic';

const AudioContext = createContext();

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
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState(null);

  // Playback playlist / queue
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState('off'); // 'off' | 'all' | 'one'

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

  const showToast = useCallback((message) => setToast({ id: Date.now(), message }), []);
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
  const handleTrackEnd = () => {
    if (repeatMode === 'one') {
      seek(0);
      resume();
    } else {
      nextTrack();
    }
  };

  // Play a specific song and choose engine by source
  const playSong = async (song, newQueue = null) => {
    if (!song) return;

    // Increment request ID to invalidate in-flight play attempts
    const requestId = ++playRequestIdRef.current;

    setPlaybackError(null);
    playbackModeRef.current = 'audio'; // every new song starts in audio mode
    setPlaybackModeState('audio');
    setCurrentSong(song);
    currentSongRef.current = song;
    setCurrentTime(0);

    if (newQueue && Array.isArray(newQueue) && newQueue.length > 0) {
      setQueue(newQueue);
      const index = newQueue.findIndex((item) => item.id === song.id);
      setQueueIndex(index !== -1 ? index : 0);
    } else if (!queue.some((item) => item.id === song.id)) {
      setQueue((prev) => [...prev, song]);
      setQueueIndex(queue.length);
    }

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

  const nextTrack = () => {
    if (queue.length === 0) return;

    const nextIndex = getNextTrackIndex(queueIndex, queue.length, {
      isShuffle,
      repeatMode
    });

    if (nextIndex === -1) {
      pause();
      return;
    }

    setQueueIndex(nextIndex);
    playSong(queue[nextIndex]);
  };

  const previousTrack = () => {
    if (queue.length === 0) return;

    const { action, index } = getPreviousTrackAction(queueIndex, queue.length, currentTime, {
      restartThreshold: 3
    });

    if (action === 'restart') {
      seek(0);
      resume();
      return;
    }

    if (index >= 0) {
      setQueueIndex(index);
      playSong(queue[index]);
    }
  };

  const toggleShuffle = () => setIsShuffle((prev) => !prev);

  const toggleRepeat = () => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  };

  const addToQueue = (song) => {
    if (!song) return;
    setQueue((prev) => [...prev, song]);
  };

  const moveInQueue = (fromIndex, toIndex) => {
    setQueue((prev) => {
      const nextQ = reorderQueue(prev, fromIndex, toIndex);
      return nextQ;
    });
    // Adjust queueIndex if the currently playing song moved
    if (fromIndex === queueIndex) {
      setQueueIndex(toIndex);
    } else if (fromIndex < queueIndex && toIndex >= queueIndex) {
      setQueueIndex((prev) => prev - 1);
    } else if (fromIndex > queueIndex && toIndex <= queueIndex) {
      setQueueIndex((prev) => prev + 1);
    }
  };

  const removeFromQueue = (index) => {
    const nextQ = queue.filter((_, idx) => idx !== index);
    const newIdx = calculateNewQueueIndexAfterRemoval(index, queueIndex, nextQ.length);
    setQueue(nextQ);
    setQueueIndex(newIdx);

    if (index === queueIndex) {
      if (newIdx >= 0 && nextQ[newIdx]) {
        playSong(nextQ[newIdx]);
      } else {
        pause();
      }
    }
  };

  const clearQueue = () => {
    setQueue([]);
    setQueueIndex(-1);
  };

  // Media Session API integration for Lock-screen, Headphone, & Bluetooth controls
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong) return;

    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist || currentSong.singers || 'TamilTunes Artist',
        album: currentSong.album || 'TamilTunes',
        artwork: [
          { src: currentSong.image, sizes: '512x512', type: 'image/jpeg' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => resume());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => previousTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) seek(details.seekTime);
      });
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
