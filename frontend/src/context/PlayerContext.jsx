import { useAudio, AudioProvider } from './AudioContext';

/**
 * PlayerContext compatibility bridge
 * Aliases useAudio and AudioProvider to usePlayer and PlayerProvider
 */
export const usePlayer = useAudio;
export const PlayerProvider = AudioProvider;
export default useAudio;
