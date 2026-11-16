import React from 'react';
import { Play, Pause, SkipForward, AlertCircle } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';

const MiniPlayer = () => {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    nextTrack,
    setIsFullScreen,
    isBuffering,
    playbackError
  } = useAudio();

  if (!currentSong) return null;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="md:hidden fixed bottom-16 left-0 right-0 z-30 px-2 pb-1">
      <div
        className="bg-[#18181B]/95 backdrop-blur-md rounded-xl p-2.5 border border-zinc-800/80 shadow-2xl flex items-center justify-between cursor-pointer"
        onClick={() => setIsFullScreen(true)}
      >
        {/* Left: Thumbnail & Song Info */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
          <img
            src={currentSong.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80'}
            alt={currentSong.title}
            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-semibold text-white truncate">
              {currentSong.title}
            </h4>
            <p className="text-[11px] text-zinc-400 truncate">
              {currentSong.artist || currentSong.singers}
            </p>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={togglePlay}
            className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center"
          >
            {isBuffering ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>

          <button
            onClick={nextTrack}
            className="p-1.5 text-zinc-300 hover:text-white"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mini bottom progress bar */}
      <div className="w-full h-0.5 bg-zinc-800 rounded-full overflow-hidden mt-0.5">
        <div
          className="h-full bg-purple-500 transition-all duration-100"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
};

export default MiniPlayer;
