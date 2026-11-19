import React, { useEffect, useState, useRef, useImperativeHandle, forwardRef } from 'react';

/**
 * YouTubePlayer Component
 * Uses the official YouTube IFrame Player API (visible floating player, min 200x200). While the
 * full-screen player is open, the iframe is pinned over its registered <VideoSlot> instead (`rect`).
 * Implements the exact same playback interface as HTML5 audio engine:
 * play, pause, seek, setVolume, mute, unMute, onTimeUpdate, onEnded, onPlaying, onPause, onBuffering.
 */
const YouTubePlayer = forwardRef(({
  videoId: propVideoId,
  visible = false,
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
  const pendingRef = useRef(null); // load requested while the player exists but is not ready yet
  const pendingVideoIdRef = useRef(propVideoId || null);
  const pendingIntentRef = useRef({ autoPlay: true, startSeconds: 0 }); // how to start a video requested before the API/player was ready

  // Responsive mobile check for non-overlapping bottom position
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update pendingVideoIdRef when prop changes
  useEffect(() => {
    if (propVideoId) {
      pendingVideoIdRef.current = propVideoId;
      if (!playerRef.current && window.YT && window.YT.Player) {
        const { autoPlay, startSeconds } = pendingIntentRef.current;
        initPlayer(propVideoId, autoPlay, startSeconds);
      }
    }
  }, [propVideoId]);

  // The YouTube script (and YouTube's cookies) load only the first time a video is actually wanted, never on a plain page load
  const [apiWanted, setApiWanted] = useState(false);
  useEffect(() => { if (propVideoId) setApiWanted(true); }, [propVideoId]);

  // Destroy the player with the component
  useEffect(() => () => {
    stopProgressTimer();
    if (playerRef.current && typeof playerRef.current.destroy === 'function') {
      try { playerRef.current.destroy(); } catch { /* already gone */ }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load YouTube IFrame API script once, on first use
  useEffect(() => {
    if (!apiWanted) return undefined;
    if (window.YT && window.YT.Player) {
      if (pendingVideoIdRef.current) {
        initPlayer(pendingVideoIdRef.current, pendingIntentRef.current.autoPlay, pendingIntentRef.current.startSeconds);
      }
      return undefined;
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
      if (pendingVideoIdRef.current) {
        initPlayer(pendingVideoIdRef.current, pendingIntentRef.current.autoPlay, pendingIntentRef.current.startSeconds);
      }
    };

    return undefined;
  }, [apiWanted]); // eslint-disable-line react-hooks/exhaustive-deps

  const initPlayer = (vid, autoPlay = true, startSeconds = 0) => {
    if (playerRef.current || !window.YT || !window.YT.Player) return;

    try {
      const playerVars = {
        autoplay: autoPlay ? 1 : 0,
        start: Math.max(0, Math.floor(startSeconds || 0)),
        controls: 1,
        disablekb: 0,
        fs: 1,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        origin: window.location.origin
      };

      const opts = {
        height: '100%',
        width: '100%',
        host: 'https://www.youtube-nocookie.com', // privacy-enhanced mode: YouTube sets no tracking cookies until the video is played
        playerVars,
        events: {
          onReady: (event) => {
            isReadyRef.current = true;
            const target = event?.target || playerRef.current; // the API passes the player as event.target
            window.__ytPlayerInstance = target;
            if (autoPlay && target && typeof target.playVideo === 'function') {
              target.playVideo();
            }
            if (pendingRef.current) {
              const { videoId, autoPlay: pendingAutoPlay, startSeconds: pendingStart } = pendingRef.current;
              pendingRef.current = null;
              applyVideo(videoId, pendingAutoPlay, pendingStart);
            }
          },
          onStateChange: (event) => {
            window.__ytPlayerState = event.data;
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
      };

      if (vid) {
        opts.videoId = vid;
      }

      playerRef.current = new window.YT.Player('yt-player-iframe', opts);
      window.__ytPlayerInstance = playerRef.current;
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
      setApiWanted(true);
      if (!videoId) return;
      pendingVideoIdRef.current = videoId;
      pendingIntentRef.current = { autoPlay, startSeconds };

      if (!playerRef.current) {
        if (window.YT && window.YT.Player) {
          initPlayer(videoId, autoPlay, startSeconds); // player is created WITH the videoId
        }
        return; // otherwise the API-ready handler creates it using pendingIntentRef
      }

      if (isReadyRef.current) {
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

  // Default: floating player (mobile bottom 154px above mini player + nav + >= 12px buffer; desktop 96px).
  // `rect` (full-screen player open): pinned over the registered slot instead.
  const computedBottom = visible ? (isMobile ? '154px' : '96px') : '-400px';
  const placement = rect
    ? {
        top: rect.top,
        left: rect.left,
        width: Math.max(rect.width, 200),
        height: Math.max(rect.height, 200),
        opacity: 1,
        pointerEvents: 'auto',
        zIndex: 100000
      }
    : {
        bottom: computedBottom,
        right: '16px',
        width: '240px',
        height: '200px',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        zIndex: visible ? 45 : -1
      };

  return (
    <div
      id="yt-player-container"
      data-testid="yt-player-container"
      data-visible={rect || visible ? 'true' : 'false'}
      style={{
        position: 'fixed',
        minWidth: '200px',
        minHeight: '200px',
        ...placement,
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: '#09090b',
        border: '1px solid #27272a',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.8), 0 8px 10px -6px rgba(0, 0, 0, 0.6)',
        transition: rect ? 'none' : 'opacity 0.25s ease, bottom 0.25s ease'
      }}
      aria-label="YouTube Video Player"
    >
      <div id="yt-player-iframe" style={{ width: '100%', height: '100%', minWidth: '200px', minHeight: '200px' }} />
    </div>
  );
});

export default YouTubePlayer;
