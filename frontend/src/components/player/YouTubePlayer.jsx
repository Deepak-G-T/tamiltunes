import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

/**
 * YouTubePlayer Component
 * Uses the official YouTube IFrame Player API. The iframe is moved offscreen while the audio
 * engine is active, and pinned over a registered <VideoSlot> (min 200x200, visible) while it plays.
 * Implements the exact same playback interface as HTML5 audio engine:
 * play, pause, seek, setVolume, mute, unMute, onTimeUpdate, onEnded, onPlaying, onPause, onBuffering.
 */
const YouTubePlayer = forwardRef(({
  onPlaying,
  onPause,
  onBuffering,
  onEnded,
  onTimeUpdate,
  onError,
  rect = null
}, ref) => {
  const playerRef = useRef(null);
  const isReadyRef = useRef(false);
  const progressTimerRef = useRef(null);
  const pendingRef = useRef(null); // video requested before the iframe API was ready

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
        height: '100%',
        width: '100%',
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
          onReady: () => {
            isReadyRef.current = true;
            if (pendingRef.current) {
              const { videoId, autoPlay, startSeconds } = pendingRef.current;
              pendingRef.current = null;
              applyVideo(videoId, autoPlay, startSeconds);
            }
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

  const applyVideo = (videoId, autoPlay, startSeconds) => {
    const player = playerRef.current;
    if (!player) return;
    const payload = { videoId, startSeconds: Math.max(0, Math.floor(startSeconds || 0)) };
    if (autoPlay && typeof player.loadVideoById === 'function') player.loadVideoById(payload);
    else if (typeof player.cueVideoById === 'function') player.cueVideoById(payload); // cue = no autoplay
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
    loadVideo(videoId, autoPlay = true, startSeconds = 0) {
      if (!videoId) return;
      if (playerRef.current && isReadyRef.current) {
        applyVideo(videoId, autoPlay, startSeconds);
      } else {
        pendingRef.current = { videoId, autoPlay, startSeconds };
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

  // Visible: pinned over the registered slot. Otherwise parked offscreen (audio engine active).
  const style = rect
    ? {
        position: 'fixed',
        top: rect.top,
        left: rect.left,
        width: Math.max(rect.width, 200),
        height: Math.max(rect.height, 200),
        zIndex: 100000,
        overflow: 'hidden',
        borderRadius: 12,
        background: '#000'
      }
    : {
        position: 'fixed',
        bottom: -400,
        right: -400,
        width: 200,
        height: 200,
        opacity: 0,
        pointerEvents: 'none',
        zIndex: -1
      };

  return (
    <div
      id="yt-player-container"
      data-testid="yt-player-container"
      data-visible={rect ? 'true' : 'false'}
      style={style}
      aria-hidden={rect ? undefined : 'true'}
    >
      <div id="yt-player-iframe" style={{ width: '100%', height: '100%' }} />
    </div>
  );
});

export default YouTubePlayer;
