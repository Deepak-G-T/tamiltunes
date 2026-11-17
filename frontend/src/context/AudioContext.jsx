import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import api from '../services/api';
import YouTubePlayer from '../components/player/YouTubePlayer';
import Toast from '../components/common/Toast';
import { engineFor, canToggleVideo, getVideoId, planSwitch, planEmbedError } from '../lib/playbackLogic';

const AudioContext = createContext();

export const AudioProvider = ({ children }) => {
  const audioRef = useRef(new Audio());
  const ytPlayerRef = useRef(null);

  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
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

  // Adaptive streaming fallback tracking for HTML5 audio
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

  // Engine is chosen by source + mode, NOT by the mere presence of a videoId.
  const isYouTubeSong = useCallback(
    (song) => engineFor(song, playbackModeRef.current, unavailableVideosRef.current) === 'youtube',
    []
  );

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

  // Initialize HTML5 audio element events
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

      if (candidateIndexRef.current < activeCandidatesRef.current.length - 1) {
        candidateIndexRef.current += 1;
        const nextUrl = activeCandidatesRef.current[candidateIndexRef.current];
        try {
          const resolvedUrl = new URL(nextUrl, window.location.origin).href;
          audio.src = resolvedUrl;
          audio.load();
          setIsBuffering(true);
          await audio.play();
          setIsPlaying(true);
          setPlaybackError(null);
          return;
        } catch (err) {
          console.warn('Fallback stream attempt failed:', err.message);
        }
      }

      setIsBuffering(false);
      setIsPlaying(false);
      if (currentSongRef.current) {
        setPlaybackError('Stream unavailable. Please try another track.');
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

      const vid = song.videoId || song.youtubeId;
      setDuration(song.duration || 0);
      setIsBuffering(true);
      setIsPlaying(true);

      if (ytPlayerRef.current) {
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
        await audio.play();
        setIsPlaying(true);
        setPlaybackError(null);
      } catch (err) {
        console.warn('Primary stream error, trying fallback:', err.message);
        if (candidates.length > 1) {
          candidateIndexRef.current = 1;
          try {
            const fallbackResolved = new URL(candidates[1], window.location.origin).href;
            audio.src = fallbackResolved;
            audio.load();
            setIsBuffering(true);
            await audio.play();
            setIsPlaying(true);
          } catch (e2) {}
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

  // Switch between Audio and Video. Both engines are stopped first, the new one is only
  // PREPARED at the same position, and playback waits for a user tap (no silent autoplay).
  const switchPlaybackMode = (target) => {
    const song = currentSongRef.current;
    const plan = planSwitch({
      song,
      currentMode: playbackModeRef.current,
      targetMode: target,
      unavailable: unavailableVideosRef.current
    });
    if (!plan.ok) return false;

    const t = Math.max(0, getActiveTime());
    audioRef.current.pause();
    ytPlayerRef.current?.pause();

    playbackModeRef.current = target;
    setPlaybackModeState(target);
    setIsPlaying(false);
    setIsBuffering(false);
    setPlaybackError(null);
    setCurrentTime(t);

    if (target === 'video') {
      ytPlayerRef.current?.loadVideo(getVideoId(song), false, t); // cue only
      ytPlayerRef.current?.setVolume(isMuted ? 0 : volume);
      setDuration(song.duration || duration || 0);
    } else {
      seekAudioWhenReady(t);
      setDuration(audioRef.current.duration || song.duration || duration || 0);
    }
    return true;
  };

  const handleYouTubeError = (event) => {
    const song = currentSongRef.current;
    if (!isYouTubeSong(song)) return;

    const plan = planEmbedError({ song, code: event?.data });
    if (plan.action === 'fallback-audio') {
      // Embedding blocked (101/150): remember it, go back to audio at the same position, tell the user.
      const t = Math.max(0, ytPlayerRef.current?.getCurrentTime() || 0);
      ytPlayerRef.current?.pause();
      unavailableVideosRef.current.add(plan.videoId);
      setUnavailableVersion((v) => v + 1);
      playbackModeRef.current = 'audio';
      setPlaybackModeState('audio');
      setIsPlaying(false);
      setIsBuffering(false);
      setCurrentTime(t);
      seekAudioWhenReady(t);
      showToast('This video can’t be played here. Switched to audio — tap play to continue.');
      return;
    }

    setPlaybackError('YouTube stream failed to play. Skipping to next...');
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
        try {
          setIsBuffering(true);
          await audio.play();
          setIsPlaying(true);
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
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.error(err);
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

    if (repeatMode === 'one') {
      seek(0);
      resume();
      return;
    }

    let nextIndex;
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      nextIndex = queueIndex + 1;
      if (nextIndex >= queue.length) {
        if (repeatMode === 'all') {
          nextIndex = 0;
        } else {
          pause();
          return;
        }
      }
    }

    setQueueIndex(nextIndex);
    playSong(queue[nextIndex]);
  };

  const previousTrack = () => {
    if (queue.length === 0) return;

    if (currentTime > 3) {
      seek(0);
      return;
    }

    let prevIndex = queueIndex - 1;
    if (prevIndex < 0) {
      prevIndex = queue.length - 1;
    }

    setQueueIndex(prevIndex);
    playSong(queue[prevIndex]);
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

  const removeFromQueue = (index) => {
    setQueue((prev) => prev.filter((_, idx) => idx !== index));
    if (index === queueIndex) {
      nextTrack();
    } else if (index < queueIndex) {
      setQueueIndex((prev) => prev - 1);
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
  }, [currentSong, queueIndex, queue]);

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
      {/* Hidden YouTube IFrame Engine */}
      <YouTubePlayer
        ref={ytPlayerRef}
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
