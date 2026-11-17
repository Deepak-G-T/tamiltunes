import React from 'react';
import { Play, Pause, Heart, Plus } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import Equalizer from '../common/Equalizer';

const MUSIC_COVER_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23143d24'/%3E%3Cstop offset='50%25' stop-color='%230f2a1a'/%3E%3Cstop offset='100%25' stop-color='%23071a10'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' rx='16' fill='url(%23bg)'/%3E%3Ccircle cx='150' cy='150' r='60' fill='%231db954' opacity='0.2'/%3E%3Cpath d='M135 180V120l50-14v54m-50 0a16 16 0 11-32 0 16 16 0 0132 0zm50-14a16 16 0 11-32 0 16 16 0 0132 0z' stroke='%236ee9a0' stroke-width='6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const SongCard = ({ song, playlist, onAddToPlaylist, onToggleFavorite, isFavorite }) => {
  const { currentSong, isPlaying, playSong, togglePlay } = useAudio();
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
      className="group relative bg-surface-2 hover:bg-surface-4 p-3 md:p-4 rounded-card transition-colors duration-300 cursor-pointer select-none press lift"
    >
      {/* Artwork */}
      <div className="relative aspect-square w-full rounded-md overflow-hidden mb-3 md:mb-4 bg-surface-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
        <img
          src={song.image || MUSIC_COVER_FALLBACK}
          alt={song.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = MUSIC_COVER_FALLBACK;
          }}
          className="w-full h-full object-cover"
        />

        {/* Favourite / add-to-playlist: always visible on touch, on hover on desktop */}
        <div
          className="absolute top-2 right-2 flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {onToggleFavorite && (
            <button
              onClick={() => onToggleFavorite(song)}
              title="Add to favourites"
              aria-label="Add to favourites"
              className="w-7 h-7 rounded-full bg-black/55 hover:bg-black/80 flex items-center justify-center transition-colors"
            >
              <Heart
                className={`w-3.5 h-3.5 ${isFavorite ? 'fill-brand-500 text-brand-500' : 'text-white'}`}
              />
            </button>
          )}
          {onAddToPlaylist && (
            <button
              onClick={() => onAddToPlaylist(song)}
              title="Add to playlist"
              aria-label="Add to playlist"
              className="w-7 h-7 rounded-full bg-black/55 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Play button: slides up on hover (desktop), always shown for the current song */}
        <button
          onClick={handlePlayClick}
          title={isCurrent && isPlaying ? 'Pause' : 'Play'}
          aria-label={isCurrent && isPlaying ? `Pause ${song.title}` : `Play ${song.title}`}
          className={`absolute bottom-2 right-2 w-11 h-11 rounded-full bg-brand-500 hover:bg-brand-400 text-black flex items-center justify-center shadow-[0_8px_16px_rgba(0,0,0,0.5)] transition-all duration-300 hover:scale-105 ${
            isCurrent
              ? 'opacity-100 translate-y-0'
              : 'md:opacity-0 md:translate-y-2 md:group-hover:opacity-100 md:group-hover:translate-y-0'
          }`}
        >
          {isCurrent && isPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 ml-0.5 fill-black" />}
        </button>
      </div>

      {/* Info */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {isCurrent && isPlaying && <Equalizer />}
          <h4 className={`text-sm font-bold truncate ${isCurrent ? 'text-brand-400' : 'text-white'}`}>
            {song.title}
          </h4>
        </div>
        <p className="text-[13px] text-zinc-400 line-clamp-2 mt-1 leading-snug">
          {song.artist || song.singers || song.subtitle}
        </p>
      </div>
    </div>
  );
};

export default SongCard;
