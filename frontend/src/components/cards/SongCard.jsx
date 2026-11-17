import React, { useState } from 'react';
import { Play, Pause, Heart, PlusCircle, ShieldCheck } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';

const MUSIC_COVER_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%233b185f'/%3E%3Cstop offset='50%25' stop-color='%231f1338'/%3E%3Cstop offset='100%25' stop-color='%230f091f'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' rx='16' fill='url(%23bg)'/%3E%3Ccircle cx='150' cy='150' r='60' fill='%23a855f7' opacity='0.2'/%3E%3Cpath d='M135 180V120l50-14v54m-50 0a16 16 0 11-32 0 16 16 0 0132 0zm50-14a16 16 0 11-32 0 16 16 0 0132 0z' stroke='%23c084fc' stroke-width='6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

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
      className="group relative bg-surface-2 hover:bg-surface-4 p-3 rounded-xl transition-all duration-200 cursor-pointer border border-zinc-800/40 hover:border-zinc-700/60 shadow-sm hover:shadow-xl select-none"
    >
      {/* Artwork */}
      <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-3 bg-zinc-900 shadow-inner">
        <img
          src={song.image || MUSIC_COVER_FALLBACK}
          alt={song.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = MUSIC_COVER_FALLBACK;
          }}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* Play overlay button */}
        <button
          onClick={handlePlayClick}
          title={isCurrent && isPlaying ? 'Pause' : 'Play'}
          className={`absolute bottom-2 right-2 w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-400 text-black flex items-center justify-center shadow-lg shadow-brand-900/50 transition-all duration-200 transform ${
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
        <h4 className={`text-sm font-semibold truncate ${isCurrent ? 'text-brand-400' : 'text-white'}`}>
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
              className="p-1 hover:text-brand-400 transition-colors"
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
