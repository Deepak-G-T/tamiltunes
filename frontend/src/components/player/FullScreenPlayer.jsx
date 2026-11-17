import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  ListMusic,
  Heart,
  ShieldCheck,
  Disc
} from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import ProgressBar from './ProgressBar';
import VolumeSlider from './VolumeSlider';
import VideoSlot from './VideoSlot';
import VideoModeToggle from './VideoModeToggle';

const MUSIC_COVER_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%233b185f'/%3E%3Cstop offset='50%25' stop-color='%231f1338'/%3E%3Cstop offset='100%25' stop-color='%230f091f'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' rx='16' fill='url(%23bg)'/%3E%3Ccircle cx='150' cy='150' r='60' fill='%23a855f7' opacity='0.2'/%3E%3Cpath d='M135 180V120l50-14v54m-50 0a16 16 0 11-32 0 16 16 0 0132 0zm50-14a16 16 0 11-32 0 16 16 0 0132 0z' stroke='%23c084fc' stroke-width='6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const FullScreenPlayer = ({ isOpen, onClose, onToggleFavorite, isFavorite }) => {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isBuffering,
    playbackError,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    nextTrack,
    previousTrack,
    isShuffle,
    toggleShuffle,
    repeatMode,
    toggleRepeat,
    setIsQueueOpen,
    activeEngine
  } = useAudio();

  // Lock body scroll when full screen player is open on mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !currentSong) return null;

  const content = (
    <div
      style={{ zIndex: 99999 }}
      className="fixed inset-0 bg-black flex flex-col justify-between p-4 sm:p-8 select-none overflow-y-auto animate-in fade-in duration-200"
    >
      {/* Blurred ambient background effect */}
      <div
        className="fixed inset-0 opacity-25 filter blur-3xl pointer-events-none scale-125"
        style={{
          backgroundImage: `url(${currentSong.image || MUSIC_COVER_FALLBACK})`,
          backgroundPosition: 'center',
          backgroundSize: 'cover'
        }}
      />

      {/* Top Bar with Down Chevron to close */}
      <div className="relative z-10 flex items-center justify-between pb-2">
        <button
          onClick={onClose}
          aria-label="Close now playing"
          className="p-2.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all active:scale-90"
        >
          <ChevronDown className="w-7 h-7" />
        </button>

        <div className="text-center px-2 min-w-0">
          <p className="text-[10px] sm:text-xs uppercase tracking-widest text-zinc-400 font-semibold truncate">
            Playing From {currentSong.album ? `"${currentSong.album}"` : 'TamilTunes'}
          </p>
        </div>

        <button
          onClick={() => {
            setIsQueueOpen(true);
            onClose();
          }}
          aria-label="Open queue"
          className="p-2.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all active:scale-90"
        >
          <ListMusic className="w-6 h-6" />
        </button>
      </div>

      {/* Center Artwork & Metadata */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto max-w-sm sm:max-w-md mx-auto w-full py-4">
        {/* Video surface (YouTube engine active) or album cover */}
        {activeEngine === 'youtube' && (
          <VideoSlot className="w-full aspect-video mb-6 shadow-2xl border border-zinc-800/80" />
        )}
        {activeEngine !== 'youtube' && (
        <div className="relative w-56 h-56 xs:w-64 xs:h-64 sm:w-80 sm:h-80 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800/80 mb-6 group bg-zinc-900">
          <img
            src={currentSong.image || MUSIC_COVER_FALLBACK}
            alt={currentSong.title}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = MUSIC_COVER_FALLBACK;
            }}
            className={`w-full h-full object-cover transition-transform duration-500 ${
              isPlaying ? 'scale-105' : 'scale-100'
            }`}
          />
          {isBuffering && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        )}

        <VideoModeToggle className="mb-4" />

        {/* Title, Artist, & Favorite */}
        <div className="w-full flex items-center justify-between mb-3 px-1">
          <div className="min-w-0 flex-1 mr-3">
            <h2 className="text-xl sm:text-2xl font-bold text-white truncate tracking-tight">
              {currentSong.title}
            </h2>
            <p className="text-sm font-medium text-zinc-400 truncate mt-1">
              {currentSong.artist || currentSong.singers}
            </p>
            {currentSong.album && (
              <p className="text-xs text-brand-400/80 truncate mt-0.5">
                {currentSong.album}
              </p>
            )}
          </div>
          {onToggleFavorite && (
            <button
              onClick={() => onToggleFavorite(currentSong)}
              className="p-3 rounded-full hover:bg-zinc-800/60 active:scale-90 transition-transform"
            >
              <Heart
                className={`w-6 h-6 transition-colors ${
                  isFavorite ? 'fill-rose-500 text-rose-500' : 'text-zinc-400 hover:text-white'
                }`}
              />
            </button>
          )}
        </div>

        {/* License Notice / Stream Status Badge */}
        <div className="w-full mb-3 px-1">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="truncate">
              {currentSong.licenseNotice || '320kbps CD Quality Audio • Direct Tamil Stream'}
            </span>
          </div>
          {playbackError && (
            <p className="text-xs text-amber-400 mt-1 px-1">{playbackError}</p>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="relative z-10 max-w-sm sm:max-w-md mx-auto w-full pb-2">
        {/* Scrubber */}
        <div className="mb-5">
          <ProgressBar
            currentTime={currentTime}
            duration={duration}
            onSeek={seek}
            isBuffering={isBuffering}
          />
        </div>

        {/* Transport controls */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={toggleShuffle}
            aria-label={`Shuffle ${isShuffle ? 'On' : 'Off'}`}
            className={`p-2.5 transition-colors active:scale-90 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
              isShuffle ? 'text-brand-400' : 'text-zinc-500 hover:text-white'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            onClick={previousTrack}
            aria-label="Previous track"
            className="p-2.5 text-zinc-300 hover:text-white active:scale-90 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none transition-all"
          >
            <SkipBack className="w-7 h-7" />
          </button>

          <button
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            data-testid="fs-play"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="w-16 h-16 rounded-full bg-brand-500 hover:bg-brand-400 text-black flex items-center justify-center shadow-lg shadow-brand-600/40 hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none transition-all"
          >
            {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
          </button>

          <button
            onClick={nextTrack}
            aria-label="Next track"
            className="p-2.5 text-zinc-300 hover:text-white active:scale-90 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none transition-all"
          >
            <SkipForward className="w-7 h-7" />
          </button>

          <button
            onClick={toggleRepeat}
            aria-label={`Repeat: ${repeatMode}`}
            className={`p-2.5 transition-colors active:scale-90 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
              repeatMode !== 'off' ? 'text-brand-400' : 'text-zinc-500 hover:text-white'
            }`}
          >
            {repeatMode === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
          </button>
        </div>

        {/* Volume */}
        <div className="flex justify-center pb-2">
          <VolumeSlider
            volume={volume}
            isMuted={isMuted}
            onVolumeChange={setVolume}
            onToggleMute={toggleMute}
          />
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};

export default FullScreenPlayer;
