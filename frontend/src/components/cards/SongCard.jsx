import React, { useState } from 'react';
import { Play, Pause, MoreVertical, Heart, PlusCircle, ShieldCheck } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';

const SongCard = ({ song, playlist, onAddToPlaylist, onToggleFavorite, isFavorite }) => {
  const { currentSong, isPlaying, playSong, togglePlay } = useAudio();
  const [menuOpen, setMenuOpen] = useState(false);

  const isCurrent = currentSong?.id === song.id;

  const handlePlayClick = (e) => {
    e.stopPropagation();
    if (isCurrent) {
      togglePlay();
    } else {
      playSong(song, playlist);
    }
  };

  return (
    <div
      onClick={() => {
        if (!isCurrent) playSong(song, playlist);
      }}
      className="group relative bg-[#18181B] hover:bg-[#27272A] p-3 rounded-xl transition-all duration-200 cursor-pointer border border-zinc-800/40 hover:border-zinc-700/60 shadow-sm hover:shadow-xl"
    >
      {/* Artwork */}
      <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-3 bg-zinc-800">
        <img
          src={song.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80'}
          alt={song.title}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* Play overlay button */}
        <button
          onClick={handlePlayClick}
          title={isCurrent && isPlaying ? 'Pause' : 'Play'}
          className={`absolute bottom-2 right-2 w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-lg shadow-purple-900/50 transition-all duration-200 transform ${
            isCurrent
              ? 'opacity-100 scale-100'
              : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 scale-95 hover:scale-105'
          }`}
        >
          {isCurrent && isPlaying ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5 ml-0.5" />
          )}
        </button>
      </div>

      {/* Info */}
      <div className="min-w-0">
        <h4 className={`text-sm font-semibold truncate ${isCurrent ? 'text-purple-400' : 'text-white'}`}>
          {song.title}
        </h4>
        <p className="text-xs text-zinc-400 truncate mt-0.5">
          {song.artist || song.singers || song.subtitle}
        </p>
      </div>

      {/* Quick Actions (favorite & more) */}
      <div className="mt-2 flex items-center justify-between text-zinc-500 text-[11px]">
        <span className="truncate">{song.album || 'Tamil Single'}</span>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {onToggleFavorite && (
            <button
              onClick={() => onToggleFavorite(song)}
              title="Add to favourites"
              className="p-1 hover:text-rose-400 transition-colors"
            >
              <Heart
                className={`w-3.5 h-3.5 ${
                  isFavorite ? 'fill-rose-500 text-rose-500' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              />
            </button>
          )}
          {onAddToPlaylist && (
            <button
              onClick={() => onAddToPlaylist(song)}
              title="Add to playlist"
              className="p-1 hover:text-purple-400 transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SongCard;
