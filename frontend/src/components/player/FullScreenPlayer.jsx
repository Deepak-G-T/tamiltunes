import React from 'react';
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
    setIsQueueOpen
  } = useAudio();

  if (!isOpen || !currentSong) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#09090B] flex flex-col justify-between p-6 sm:p-10 select-none overflow-hidden animate-in fade-in duration-200">
      {/* Blurred background effect */}
      <div
        className="absolute inset-0 opacity-20 filter blur-3xl pointer-events-none scale-125"
        style={{
          backgroundImage: `url(${currentSong.image})`,
          backgroundPosition: 'center',
          backgroundSize: 'cover'
        }}
      />

      {/* Top Bar */}
      <div className="relative z-10 flex items-center justify-between">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
        >
          <ChevronDown className="w-6 h-6" />
        </button>

        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-zinc-400 font-semibold">
            Playing From {currentSong.album ? `"${currentSong.album}"` : 'TamilTunes'}
          </p>
        </div>

        <button
          onClick={() => {
            setIsQueueOpen(true);
            onClose();
          }}
          className="p-2 rounded-full bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
        >
          <ListMusic className="w-5 h-5" />
        </button>
      </div>

      {/* Center Artwork & Metadata */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto max-w-md mx-auto w-full">
        {/* Album Cover */}
        <div className="relative w-64 h-64 sm:w-80 sm:h-80 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800/80 mb-8 group">
          <img
            src={currentSong.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80'}
            alt={currentSong.title}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80';
            }}
            className={`w-full h-full object-cover transition-transform duration-500 ${
              isPlaying ? 'scale-105' : 'scale-100'
            }`}
          />
          {isBuffering && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Title, Artist, & Favorite */}
        <div className="w-full flex items-center justify-between mb-4">
          <div className="min-w-0 flex-1 mr-4">
            <h2 className="text-2xl font-bold text-white truncate tracking-tight">
              {currentSong.title}
            </h2>
            <p className="text-sm font-medium text-zinc-400 truncate mt-1">
              {currentSong.artist || currentSong.singers}
            </p>
            {currentSong.album && (
              <p className="text-xs text-purple-400/80 truncate mt-0.5">
                {currentSong.album}
              </p>
            )}
          </div>
          {onToggleFavorite && (
            <button
              onClick={() => onToggleFavorite(currentSong)}
              className="p-3 rounded-full hover:bg-zinc-800/60 transition-colors"
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
        <div className="w-full mb-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="truncate">
              {currentSong.licenseNotice || 'Authorized Music Stream • Ad-Free Playback'}
            </span>
          </div>
          {playbackError && (
            <p className="text-xs text-amber-400 mt-1 px-1">{playbackError}</p>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="relative z-10 max-w-md mx-auto w-full">
        {/* Scrubber */}
        <div className="mb-6">
          <ProgressBar
            currentTime={currentTime}
            duration={duration}
            onSeek={seek}
            isBuffering={isBuffering}
          />
        </div>

        {/* Transport controls */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={toggleShuffle}
            className={`p-2 transition-colors ${
              isShuffle ? 'text-purple-400' : 'text-zinc-500 hover:text-white'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            onClick={previousTrack}
            className="p-2 text-zinc-300 hover:text-white transition-colors"
          >
            <SkipBack className="w-7 h-7" />
          </button>

          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-lg shadow-purple-600/40 hover:scale-105 active:scale-95 transition-all"
          >
            {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
          </button>

          <button
            onClick={nextTrack}
            className="p-2 text-zinc-300 hover:text-white transition-colors"
          >
            <SkipForward className="w-7 h-7" />
          </button>

          <button
            onClick={toggleRepeat}
            className={`p-2 transition-colors ${
              repeatMode !== 'off' ? 'text-purple-400' : 'text-zinc-500 hover:text-white'
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
};

export default FullScreenPlayer;
