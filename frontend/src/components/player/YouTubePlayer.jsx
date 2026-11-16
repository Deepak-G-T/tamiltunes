import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

/**
 * YouTubePlayer Component
 * Uses the official YouTube IFrame Player API (hidden offscreen iframe)
 * Implements the exact same playback interface as HTML5 audio engine:
 * play, pause, seek, setVolume, mute, unMute, onTimeUpdate, onEnded, onPlaying, onPause, onBuffering.
 */
const YouTubePlayer = forwardRef(({
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
        height: '1',
        width: '1',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
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
            console.warn('YouTube IFrame Player error:', e.data);
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

  return (
    <div
      id="yt-player-container"
      style={{
        position: 'fixed',
        bottom: -200,
        right: -200,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: 'none',
        zIndex: -1
      }}
      aria-hidden="true"
    >
      <div id="yt-player-iframe" />
    </div>
  );
});

export default YouTubePlayer;
