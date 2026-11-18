import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { speedDialApi } from '../lib/speedDialApi';
import { topGuestSongs } from '../lib/guestPlays';
import { guestItems, moveItem, pinItem, unpinItem, removeItem, orderOf, hasNoPlays } from '../lib/speedDialOps';

export const GUEST_PLAYS_EVENT = 'tamiltunes:guest-plays';

/**
 * Speed Dial data for the home page.
 * Signed in: from the API, with optimistic pin / unpin / remove / move (rolled back and reloaded on failure).
 * Signed out: the browser's own play counts, filled with trending songs.
 * @param {{ trending?: object[] }} opts trending songs used to fill empty slots for guests
 */
export function useSpeedDial({ trending = [] } = {}) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { showToast } = useAudio();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [guestTick, setGuestTick] = useState(0);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const gen = ++generation.current;
    setStatus((s) => (s === 'ready' ? s : 'loading')); // keep showing the grid while refreshing
    setError('');
    try {
      const data = await speedDialApi.get();
      if (gen !== generation.current) return;
      setItems(data.items || []);
      setStatus('ready');
    } catch (e) {
      if (gen !== generation.current) return;
      setError(e.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) load();
  }, [authLoading, isAuthenticated, load]);

  // guests: refresh when their local plays change
  useEffect(() => {
    const bump = () => setGuestTick((t) => t + 1);
    window.addEventListener(GUEST_PLAYS_EVENT, bump);
    return () => window.removeEventListener(GUEST_PLAYS_EVENT, bump);
  }, []);

  const guestGrid = useMemo(() => {
    if (isAuthenticated) return [];
    return guestItems(topGuestSongs(window.localStorage, 9), trending, 9);
  }, [isAuthenticated, trending, guestTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = isAuthenticated ? items : guestGrid;

  // Optimistic edit: apply locally, call the server, undo + reload if it fails
  const edit = useCallback(async (apply, request) => {
    const before = items;
    setItems(apply);
    try {
      await request();
    } catch (e) {
      setItems(before);
      showToast?.(e.message);
      load();
    }
  }, [items, load, showToast]);

  const actions = isAuthenticated
    ? {
        pin: (song, slot) => edit((s) => pinItem(s, song.id), () => speedDialApi.pin(song.id, slot, song).then(load)),
        unpin: (song) => edit((s) => unpinItem(s, song.id), () => speedDialApi.unpin(song.id).then(load)),
        remove: (song) => edit((s) => removeItem(s, song.id), () => speedDialApi.hide(song.id).then(load)),
        move: (from, to) => {
          const moved = items[from];
          if (!moved) return;
          const next = moveItem(items, from, to);
          if (next === items) return;
          return edit(() => next, () => speedDialApi.order(orderOf(next), moved.id).then(load));
        },
      }
    : null; // guests can only play

  return {
    items: shown,
    status: isAuthenticated ? status : authLoading ? 'loading' : 'ready',
    error,
    reload: load,
    isAuthenticated,
    noPlays: hasNoPlays(shown),
    actions,
  };
}
