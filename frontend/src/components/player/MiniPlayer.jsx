import React from 'react';
import { Play, Pause, SkipForward, ChevronUp } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import VideoModeToggle from './VideoModeToggle';

const MUSIC_COVER_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23143d24'/%3E%3Cstop offset='50%25' stop-color='%230f2a1a'/%3E%3Cstop offset='100%25' stop-color='%23071a10'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' rx='16' fill='url(%23bg)'/%3E%3Ccircle cx='150' cy='150' r='60' fill='%231db954' opacity='0.2'/%3E%3Cpath d='M135 180V120l50-14v54m-50 0a16 16 0 11-32 0 16 16 0 0132 0zm50-14a16 16 0 11-32 0 16 16 0 0132 0z' stroke='%236ee9a0' stroke-width='6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const MiniPlayer = () => {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    nextTrack,
    setIsFullScreen,
    isBuffering
  } = useAudio();

  if (!currentSong) return null;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleOpenFull = (e) => {
    if (e) {
      e.stopPropagation?.();
    }
    setIsFullScreen(true);
  };

  return (
    <div className="md:hidden fixed bottom-16 left-0 right-0 z-40 px-2 pb-1 pointer-events-auto">
      <div
        className="bg-surface-4 rounded-lg p-2 shadow-[0_8px_24px_rgba(0,0,0,0.5)] flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform select-none touch-manipulation"
        onClick={handleOpenFull}
        role="button"
        tabIndex={0}
        aria-label="Open now playing full screen"
      >
        {/* Left: Thumbnail & Song Info (tap opens player) */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2 cursor-pointer" onClick={handleOpenFull}>
          <img
            src={currentSong.image || MUSIC_COVER_FALLBACK}
            alt={currentSong.title}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = MUSIC_COVER_FALLBACK;
            }}
            className="w-10 h-10 rounded object-cover flex-shrink-0 bg-surface-3"
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

        {/* Right: Controls + Expand hint */}
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <VideoModeToggle compact />
          <button
            onClick={togglePlay}
            className="w-9 h-9 rounded-full bg-white hover:bg-zinc-100 text-black flex items-center justify-center shadow-md active:scale-90 transition-transform"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isBuffering ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4 fill-black" />
            ) : (
              <Play className="w-4 h-4 fill-black ml-0.5" />
            )}
          </button>

          <button
            onClick={nextTrack}
            className="p-2 text-zinc-300 hover:text-white active:scale-90 transition-transform"
            aria-label="Next song"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <button
            onClick={handleOpenFull}
            className="p-1.5 text-brand-400 hover:text-brand-300 active:scale-90 transition-transform"
            title="Expand player"
            aria-label="Expand player"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mini bottom progress bar */}
      <div className="w-full h-0.5 bg-white/20 rounded-full overflow-hidden mt-0.5">
        <div
          className="h-full bg-white transition-all duration-100"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
};

export default MiniPlayer;
