import React, { useEffect, useState, useRef, useImperativeHandle, forwardRef } from 'react';

/**
 * YouTubePlayer Component
 * Uses the official YouTube IFrame Player API (visible floating player, min 200x200)
 * Implements the exact same playback interface as HTML5 audio engine:
 * play, pause, seek, setVolume, mute, unMute, onTimeUpdate, onEnded, onPlaying, onPause, onBuffering.
 */
const YouTubePlayer = forwardRef(({
  visible = false,
  onPlaying,
  onPause,
  onBuffering,
  onEnded,
  onTimeUpdate,
  onError
}, ref) => {
  const playerRef = useRef(null);
  const isReadyRef = useRef(false);
  const progressTimerRef = useRef(null);

  // Responsive mobile check for non-overlapping bottom position
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load YouTube IFrame API script once
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      initPlayer();
      return;
    }

    // Check if script already appended
    const existingScript = document.getElementById('youtube-iframe-api');
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    const prevOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevOnReady === 'function') prevOnReady();
      initPlayer();
    };

    return () => {
      stopProgressTimer();
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch (e) {}
      }
    };
  }, []);

  const initPlayer = () => {
    if (playerRef.current || !window.YT) return;

    try {
      playerRef.current = new window.YT.Player('yt-player-iframe', {
        height: '200',
        width: '240',
        playerVars: {
          autoplay: 0,
          controls: 1,
          disablekb: 0,
          fs: 1,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin
        },
        events: {
          onReady: (event) => {
            isReadyRef.current = true;
          },
          onStateChange: (event) => {
            // YT.PlayerState: ENDED = 0, PLAYING = 1, PAUSED = 2, BUFFERING = 3, CUED = 5
            if (event.data === window.YT.PlayerState.PLAYING) {
              startProgressTimer();
              if (onPlaying) onPlaying();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              stopProgressTimer();
              if (onPause) onPause();
            } else if (event.data === window.YT.PlayerState.BUFFERING) {
              if (onBuffering) onBuffering();
            } else if (event.data === window.YT.PlayerState.ENDED) {
              stopProgressTimer();
              if (onEnded) onEnded();
            }
          },
          onError: (e) => {
            console.warn('YouTube IFrame Player error:', e?.data);
            if (onError) onError(e);
          }
        }
      });
    } catch (err) {
      console.warn('Could not initialize YT.Player:', err);
    }
  };

  const startProgressTimer = () => {
    stopProgressTimer();
    progressTimerRef.current = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        try {
          const cur = playerRef.current.getCurrentTime() || 0;
          const dur = playerRef.current.getDuration() || 0;
          if (onTimeUpdate) onTimeUpdate(cur, dur);
        } catch (e) {}
      }
    }, 250);
  };

  const stopProgressTimer = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  useImperativeHandle(ref, () => ({
    loadVideo(videoId, autoPlay = true) {
      if (!videoId) return;
      if (playerRef.current && isReadyRef.current && typeof playerRef.current.loadVideoById === 'function') {
        if (autoPlay) {
          playerRef.current.loadVideoById(videoId);
        } else {
          playerRef.current.cueVideoById(videoId);
        }
      } else {
        // Retry shortly once iframe finishes handshake
        setTimeout(() => {
          if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
            playerRef.current.loadVideoById(videoId);
          }
        }, 500);
      }
    },
    play() {
      if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
        playerRef.current.playVideo();
      }
    },
    pause() {
      if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
        playerRef.current.pauseVideo();
      }
      stopProgressTimer();
    },
    seek(seconds) {
      if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(seconds, true);
        if (onTimeUpdate) {
          const dur = playerRef.current.getDuration() || 0;
          onTimeUpdate(seconds, dur);
        }
      }
    },
    setVolume(vol0to1) {
      if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
        playerRef.current.setVolume(Math.round(vol0to1 * 100));
      }
    },
    mute() {
      if (playerRef.current && typeof playerRef.current.mute === 'function') {
        playerRef.current.mute();
      }
    },
    unMute() {
      if (playerRef.current && typeof playerRef.current.unMute === 'function') {
        playerRef.current.unMute();
      }
    },
    getCurrentTime() {
      return playerRef.current && typeof playerRef.current.getCurrentTime === 'function'
        ? playerRef.current.getCurrentTime()
        : 0;
    },
    getDuration() {
      return playerRef.current && typeof playerRef.current.getDuration === 'function'
        ? playerRef.current.getDuration()
        : 0;
    }
  }));

  // On mobile: sits at bottom 136px (above 64px mini-player + 56px bottom nav + 16px buffer)
  // On desktop: sits at bottom 96px (above 80px player bar + 16px buffer)
  const computedBottom = visible ? (isMobile ? '136px' : '96px') : '-400px';

  return (
    <div
      id="yt-player-container"
      style={{
        position: 'fixed',
        bottom: computedBottom,
        right: '16px',
        width: '240px',
        height: '200px',
        minWidth: '200px',
        minHeight: '200px',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        zIndex: visible ? 45 : -1,
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: '#09090b',
        border: '1px solid #27272a',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.8), 0 8px 10px -6px rgba(0, 0, 0, 0.6)',
        transition: 'opacity 0.25s ease, bottom 0.25s ease'
      }}
      aria-label="YouTube Video Player"
    >
      <div id="yt-player-iframe" style={{ width: '100%', height: '100%', minWidth: '200px', minHeight: '200px' }} />
    </div>
  );
});

export default YouTubePlayer;
