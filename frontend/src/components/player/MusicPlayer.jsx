import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  ListMusic,
  Maximize2,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import { useAuth } from '../../context/AuthContext';
import ProgressBar from './ProgressBar';
import VolumeSlider from './VolumeSlider';
import QueueDrawer from './QueueDrawer';
import FullScreenPlayer from './FullScreenPlayer';
import api from '../../services/api';

const MusicPlayer = () => {
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
    isFullScreen,
    setIsFullScreen,
    isQueueOpen,
    setIsQueueOpen
  } = useAudio();

  const { isAuthenticated } = useAuth();
  const [isFavorite, setIsFavorite] = useState(false);

  // Check if currentSong is in user favorites
  useEffect(() => {
    if (isAuthenticated && currentSong?.id) {
      api.get('/favorites')
        .then(({ data }) => {
          if (data.success && Array.isArray(data.favorites)) {
            const exists = data.favorites.some(
              (f) => f.songId === currentSong.id || f.id === currentSong.id
            );
            setIsFavorite(exists);
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated, currentSong]);

  const toggleFavorite = async (song) => {
    if (!isAuthenticated) {
      alert('Please log in to save songs to your favourites.');
      return;
    }
    const targetSong = song || currentSong;
    if (!targetSong) return;

    try {
      if (isFavorite) {
        await api.delete(`/favorites/${targetSong.id}`);
        setIsFavorite(false);
      } else {
        await api.post('/favorites', {
          songId: targetSong.id,
          title: targetSong.title,
          artist: targetSong.artist || targetSong.singers,
          album: targetSong.album,
          image: targetSong.image,
          duration: targetSong.duration,
          streamUrl: targetSong.streamUrl
        });
        setIsFavorite(true);
      }
    } catch (err) {
      console.error('Toggle favorite failed:', err);
    }
  };

  if (!currentSong) {
    return (
      <footer className="h-20 bg-[#111114] border-t border-zinc-800/80 px-4 md:px-6 flex items-center justify-between text-zinc-500 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-zinc-800/50 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-zinc-600" />
          </div>
          <div>
            <p className="font-medium text-zinc-400">TamilTunes Ready</p>
            <p className="text-[11px] text-zinc-600">Discover and play your favorite Tamil tracks</p>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <>
      <footer className="h-22 bg-[#111114] border-t border-zinc-800/80 px-4 md:px-6 flex items-center justify-between select-none relative z-30">
        {/* Left: Track Information */}
        <div className="flex items-center gap-3 w-1/4 min-w-[200px]">
          <div
            className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer group shadow"
            onClick={() => setIsFullScreen(true)}
          >
            <img
              src={currentSong.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop&q=80'}
              alt={currentSong.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Maximize2 className="w-4 h-4 text-white" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h4
                className="text-sm font-semibold text-white truncate cursor-pointer hover:underline"
                onClick={() => setIsFullScreen(true)}
              >
                {currentSong.title}
              </h4>
            </div>
            <p className="text-xs text-zinc-400 truncate">
              {currentSong.artist || currentSong.singers || 'Tamil Artist'}
            </p>
            {playbackError ? (
              <p className="text-[10px] text-amber-400 flex items-center gap-1 truncate mt-0.5">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span>Audio stream restricted</span>
              </p>
            ) : (
              <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500/80" />
                <span>Ad-Free</span>
              </span>
            )}
          </div>

          <button
            onClick={() => toggleFavorite(currentSong)}
            title={isFavorite ? 'Remove from Favourites' : 'Add to Favourites'}
            className="p-2 rounded-full hover:bg-zinc-800/60 transition-colors"
          >
            <Heart
              className={`w-4 h-4 transition-colors ${
                isFavorite ? 'fill-rose-500 text-rose-500' : 'text-zinc-400 hover:text-white'
              }`}
            />
          </button>
        </div>

        {/* Center: Controls & Scrubber */}
        <div className="flex flex-col items-center max-w-xl w-2/4 px-4">
          <div className="flex items-center gap-4 mb-1">
            <button
              onClick={toggleShuffle}
              title={`Shuffle ${isShuffle ? 'On' : 'Off'}`}
              className={`p-1.5 rounded-full transition-colors ${
                isShuffle ? 'text-purple-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              onClick={previousTrack}
              title="Previous song"
              className="p-1.5 rounded-full text-zinc-300 hover:text-white transition-colors"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              onClick={togglePlay}
              title={isPlaying ? 'Pause' : 'Play'}
              className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-md shadow-purple-600/30 hover:scale-105 active:scale-95 transition-all"
            >
              {isBuffering ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </button>

            <button
              onClick={nextTrack}
              title="Next song"
              className="p-1.5 rounded-full text-zinc-300 hover:text-white transition-colors"
            >
              <SkipForward className="w-5 h-5" />
            </button>

            <button
              onClick={toggleRepeat}
              title={`Repeat: ${repeatMode}`}
              className={`p-1.5 rounded-full transition-colors ${
                repeatMode !== 'off' ? 'text-purple-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </button>
          </div>

          <ProgressBar
            currentTime={currentTime}
            duration={duration}
            onSeek={seek}
            isBuffering={isBuffering}
          />
        </div>

        {/* Right: Tools & Volume */}
        <div className="flex items-center justify-end gap-3 w-1/4">
          <button
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            title="Toggle Queue"
            className={`p-2 rounded-lg transition-colors ${
              isQueueOpen ? 'text-purple-400 bg-purple-500/10' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <ListMusic className="w-5 h-5" />
          </button>

          <VolumeSlider
            volume={volume}
            isMuted={isMuted}
            onVolumeChange={setVolume}
            onToggleMute={toggleMute}
          />

          <button
            onClick={() => setIsFullScreen(true)}
            title="Full screen view"
            className="p-2 rounded-lg text-zinc-400 hover:text-white transition-colors hidden lg:inline-block"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </footer>

      {/* Slide-out Queue Drawer */}
      <QueueDrawer isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />

      {/* Full-screen Now Playing Modal */}
      <FullScreenPlayer
        isOpen={isFullScreen}
        onClose={() => setIsFullScreen(false)}
        onToggleFavorite={toggleFavorite}
        isFavorite={isFavorite}
      />
    </>
  );
};

export default MusicPlayer;
