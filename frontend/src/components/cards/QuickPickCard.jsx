import React from 'react';
import { Play, Pause } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import Equalizer from '../common/Equalizer';

const MUSIC_COVER_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23143d24'/%3E%3Cstop offset='50%25' stop-color='%230f2a1a'/%3E%3Cstop offset='100%25' stop-color='%23071a10'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' rx='16' fill='url(%23bg)'/%3E%3Ccircle cx='150' cy='150' r='60' fill='%231db954' opacity='0.2'/%3E%3Cpath d='M135 180V120l50-14v54m-50 0a16 16 0 11-32 0 16 16 0 0132 0zm50-14a16 16 0 11-32 0 16 16 0 0132 0z' stroke='%236ee9a0' stroke-width='6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

// Compact tile: small cover + title. Tap/click plays the song.
const QuickPickCard = ({ song, playlist }) => {
  const { currentSong, isPlaying, playSong, togglePlay } = useAudio();
  const isCurrent = currentSong?.id === song.id;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => (isCurrent ? togglePlay() : playSong(song, playlist))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (isCurrent) togglePlay();
          else playSong(song, playlist);
        }
      }}
      className="group relative flex items-center gap-3 rounded-md overflow-hidden bg-white/10 hover:bg-white/20 transition-colors duration-200 cursor-pointer select-none press pr-2 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none"
    >
      <img
        src={song.image || MUSIC_COVER_FALLBACK}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = MUSIC_COVER_FALLBACK;
        }}
        className="w-12 h-12 md:w-14 md:h-14 object-cover flex-shrink-0 shadow-[4px_0_12px_rgba(0,0,0,0.4)]"
      />
      <span className={`text-[13px] md:text-sm font-bold line-clamp-2 leading-tight flex-1 min-w-0 ${isCurrent ? 'text-brand-400' : 'text-white'}`}>
        {song.title}
      </span>
      {isCurrent && isPlaying && <Equalizer />}
      <span
        aria-hidden="true"
        className={`hidden md:flex w-9 h-9 rounded-full bg-brand-500 text-black items-center justify-center flex-shrink-0 shadow-lg transition-all duration-200 ${
          isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {isCurrent && isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 ml-0.5 fill-black" />}
      </span>
    </div>
  );
};

export default QuickPickCard;
