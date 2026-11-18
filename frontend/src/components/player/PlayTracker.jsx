import { useEffect, useRef } from 'react';
import { useAudio } from '../../context/AudioContext';
import { useAuth } from '../../context/AuthContext';
import { createTracker, onTick, onLeave } from '../../lib/playTracker';
import { speedDialApi } from '../../lib/speedDialApi';
import { recordGuestPlay } from '../../lib/guestPlays';
import { GUEST_PLAYS_EVENT } from '../../hooks/useSpeedDial';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Invisible: watches playback and reports a play to the server only once it counts (30 s or half the song), plus
 * completion and early skips. Logged-out listeners are counted in localStorage instead.
 * It reads the player state, so it needs no changes to the player itself.
 */
const PlayTracker = () => {
  const { currentSong, currentTime, duration, isPlaying } = useAudio();
  const { isAuthenticated } = useAuth();
  const state = useRef(createTracker());
  const authed = useRef(isAuthenticated);
  const guestCounted = useRef(new Set());

  useEffect(() => { authed.current = isAuthenticated; }, [isAuthenticated]);

  const report = (events, { keepalive = false } = {}) => {
    for (const e of events) {
      if (authed.current) {
        if (keepalive) {
          // the page is closing: a normal request could be cancelled, so use fetch with keepalive
          try {
            fetch(`${API_BASE}/me/play-events`, {
              method: 'POST', keepalive: true,
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tamiltunes_token')}` },
              body: JSON.stringify(e),
            }).catch(() => {});
          } catch { /* ignore */ }
        } else {
          speedDialApi.recordPlay(e).catch(() => {});
        }
      } else if (e.skippedAtSec == null && !guestCounted.current.has(e.playId)) {
        guestCounted.current.add(e.playId);
        recordGuestPlay(window.localStorage, { id: e.songId, title: e.title, artist: e.artist, album: e.album, image: e.image, duration: e.duration, streamUrl: e.streamUrl });
        window.dispatchEvent(new Event(GUEST_PLAYS_EVENT));
      }
    }
  };

  useEffect(() => {
    const r = onTick(state.current, { song: currentSong, currentTime, duration, isPlaying });
    state.current = r.state;
    if (r.events.length) report(r.events);
  }, [currentSong, currentTime, duration, isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only when the page is really closing. A hidden tab can keep playing in the background (phones), so tab
  // visibility is not a reason to end a play. Unreported skips are non-critical and simply lost if the tab is killed.
  useEffect(() => {
    const leave = () => {
      const r = onLeave(state.current);
      state.current = r.state;
      if (r.events.length) report(r.events, { keepalive: true });
    };
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};

export default PlayTracker;
