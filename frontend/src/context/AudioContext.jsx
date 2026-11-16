import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import api from '../services/api';
import YouTubePlayer from '../components/player/YouTubePlayer';

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

  // UI states
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [historyRecordedSongId, setHistoryRecordedSongId] = useState(null);

  const isYouTubeSong = useCallback((song) => {
    if (!song) return false;
    return song.source === 'youtube' || !!song.videoId || !!song.youtubeId;
  }, []);

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
      if (!isYouTubeSong(currentSongRef.current)) {
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
        setPlaybackError
      }}
    >
      {/* YouTube IFrame Engine (visible when playing YouTube source, min 200x200) */}
      <YouTubePlayer
        ref={ytPlayerRef}
        visible={isYouTubeSong(currentSong)}
        onPlaying={() => {
          if (isYouTubeSong(currentSongRef.current)) {
            setIsPlaying(true);
            setIsBuffering(false);
            setPlaybackError(null);
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
        onError={() => {
          if (isYouTubeSong(currentSongRef.current)) {
            setPlaybackError('YouTube stream failed to play. Skipping to next...');
            setTimeout(() => nextTrack(), 1500);
          }
        }}
      />
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

export default AudioContext;
