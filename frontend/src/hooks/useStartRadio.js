import { useCallback, useEffect, useRef } from 'react';
import { useAudio } from '../context/AudioContext';
import { startRadio } from '../lib/startRadio';
import { fetchRelated } from '../lib/radioApi';

/**
 * Returns `start(song, fallback?)`: play it now and fill the queue with related songs (interim radio, see
 * lib/startRadio.js). `fallback` songs are queued instead if the radio returns nothing.
 */
export function useStartRadio() {
  const { playSong, addToQueue, currentSong, queue } = useAudio();
  const live = useRef({ id: null, queue: [] });
  useEffect(() => {
    live.current = { id: currentSong?.id ?? null, queue: queue || [] };
  }, [currentSong, queue]);

  return useCallback(
    (song, fallback = []) =>
      startRadio(song, {
        fallback,
        playSong,
        addToQueue,
        fetchRelated,
        isStillPlaying: () => live.current.id === song.id,
        queuedIds: () => new Set(live.current.queue.map((s) => s.id)),
      }),
    [playSong, addToQueue]
  );
}
