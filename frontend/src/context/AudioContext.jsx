import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import api from '../services/api';

const AudioContext = createContext();

export const AudioProvider = ({ children }) => {
  const audioRef = useRef(new Audio());
  
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
  
  // Adaptive streaming fallback tracking
  const activeCandidatesRef = useRef([]);
  const candidateIndexRef = useRef(0);
  const currentSongRef = useRef(null);

  // UI states
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [historyRecordedSongId, setHistoryRecordedSongId] = useState(null);

  // Build ordered list of candidate URLs for multi-tiered resilient playback
  const buildCandidateUrls = (song) => {
    const candidates = [];
    const rawUrl = song.streamUrl || song.downloadUrl || song.media_url;

    if (rawUrl && typeof rawUrl === 'string') {
      candidates.push(rawUrl);

      // If JioSaavn high-res mp4, add alternate bitrates & backend proxy
      if (rawUrl.includes('saavncdn.com')) {
        const url160 = rawUrl.replace(/_320\.mp4$/, '_160.mp4');
        const url96 = rawUrl.replace(/_320\.mp4$/, '_96.mp4');
        if (!candidates.includes(url160)) candidates.push(url160);
        if (!candidates.includes(url96)) candidates.push(url96);

        // Add backend streaming proxy
        candidates.push(`/api/music/stream?url=${encodeURIComponent(rawUrl)}`);
        candidates.push(`/api/music/stream?url=${encodeURIComponent(url160)}`);
      }
    }

    return candidates;
  };

  // Initialize audio volume and events
  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = volume;
    window.__tamiltunes_audio = audio;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      // Automatically record to listening history after 5s of playback
      if (audio.currentTime > 5 && currentSongRef.current && historyRecordedSongId !== currentSongRef.current.id) {
        setHistoryRecordedSongId(currentSongRef.current.id);
        const token = localStorage.getItem('tamiltunes_token');
        if (token) {
          api.post('/history', {
            songId: currentSongRef.current.id,
            title: currentSongRef.current.title,
            artist: currentSongRef.current.artist || currentSongRef.current.singers,
            album: currentSongRef.current.album,
            image: currentSongRef.current.image,
            duration: currentSongRef.current.duration,
            streamUrl: currentSongRef.current.streamUrl
          }).catch(() => {});
        }
      }
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration || currentSongRef.current?.duration || 0);
      setIsBuffering(false);
    };

    const onWaiting = () => {
      setIsBuffering(true);
    };

    const onCanPlay = () => {
      setIsBuffering(false);
    };

    const onPlaying = () => {
      setIsPlaying(true);
      setIsBuffering(false);
      setPlaybackError(null);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    // Resilient fallback logic when audio error occurs
    const onError = async (e) => {
      console.warn('Playback error encountered on source:', audio.src);

      // Attempt next stream candidate
      if (candidateIndexRef.current < activeCandidatesRef.current.length - 1) {
        candidateIndexRef.current += 1;
        const nextUrl = activeCandidatesRef.current[candidateIndexRef.current];
        console.log(`Auto-recovering: Switching to fallback candidate [${candidateIndexRef.current + 1}/${activeCandidatesRef.current.length}]:`, nextUrl);
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
          console.warn('Fallback stream attempt failed, continuing recovery chain:', err.message);
        }
      }

      setIsBuffering(false);
      setIsPlaying(false);
      if (currentSongRef.current) {
        setPlaybackError('Stream unavailable. Please try another track.');
      }
    };

    const onEnded = () => {
      handleTrackEnd();
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
  }, [historyRecordedSongId]);

  // Handle track end according to repeat and shuffle
  const handleTrackEnd = () => {
    if (repeatMode === 'one') {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(console.error);
    } else {
      nextTrack();
    }
  };

  // Play a specific song and optionally update the queue
  const playSong = async (song, newQueue = null) => {
    if (!song) return;

    setPlaybackError(null);
    setCurrentSong(song);
    currentSongRef.current = song;

    if (newQueue && Array.isArray(newQueue) && newQueue.length > 0) {
      setQueue(newQueue);
      const index = newQueue.findIndex((item) => item.id === song.id);
      setQueueIndex(index !== -1 ? index : 0);
    } else if (!queue.some((item) => item.id === song.id)) {
      setQueue((prev) => [...prev, song]);
      setQueueIndex(queue.length);
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
      console.warn('Primary stream playback delayed, triggering candidate recovery:', err.message);
      // Trigger error fallback recovery
      if (candidates.length > 1) {
        candidateIndexRef.current = 1;
        try {
          const fallbackResolved = new URL(candidates[1], window.location.origin).href;
          audio.src = fallbackResolved;
          audio.load();
          setIsBuffering(true);
          await audio.play();
          setIsPlaying(true);
          setPlaybackError(null);
        } catch (fallbackErr) {
          console.warn('Initial fallback delayed:', fallbackErr.message);
        }
      }
    }
  };

  const togglePlay = async () => {
    if (!currentSong) return;
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
  };

  const pause = () => {
    audioRef.current.pause();
    setIsPlaying(false);
  };

  const resume = async () => {
    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (err) {
      console.error(err);
    }
  };

  const seek = (timeInSeconds) => {
    if (audioRef.current && isFinite(timeInSeconds)) {
      audioRef.current.currentTime = timeInSeconds;
      setCurrentTime(timeInSeconds);
    }
  };

  const setVolume = (val) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
    localStorage.setItem('tamiltunes_vol', clamped.toString());
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume;
        setIsMuted(false);
      } else {
        audioRef.current.volume = 0;
        setIsMuted(true);
      }
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

  const toggleShuffle = () => {
    setIsShuffle((prev) => !prev);
  };

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
        setPlaybackError
      }}
    >
      {children}
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
