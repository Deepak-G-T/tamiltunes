import { useCallback } from 'react';
import { useAudio } from '../context/AudioContext';

/**
 * Returns `start(song, fallbackSongs?)`: play the song now and let the radio fill the queue after it.
 * `fallbackSongs` (e.g. the other Speed Dial tiles) are queued if the radio has nothing.
 */
export function useStartRadio() {
  const { startRadio } = useAudio();
  return useCallback((song, fallback = []) => startRadio(song, { fallback }), [startRadio]);
}
