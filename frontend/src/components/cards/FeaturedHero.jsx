import React from 'react';
import { Play, Pause } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import useCoverColor from '../../hooks/useCoverColor';
import Equalizer from '../common/Equalizer';

const MUSIC_COVER_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23143d24'/%3E%3Cstop offset='50%25' stop-color='%230f2a1a'/%3E%3Cstop offset='100%25' stop-color='%23071a10'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' rx='16' fill='url(%23bg)'/%3E%3Ccircle cx='150' cy='150' r='60' fill='%231db954' opacity='0.2'/%3E%3C/svg%3E";

/**
 * Large "featured today" card at the top of Home: artwork, title, artist and a play button,
 * washed with the artwork's colour and a faint kolam dot lattice. Click anywhere to play/pause.
 */
const FeaturedHero = ({ song, playlist }) => {
  const { currentSong, isPlaying, playSong, togglePlay } = useAudio();
  const rgb = useCoverColor(song.image, song.id);
  const isCurrent = currentSong?.id === song.id;
  const toggle = () => (isCurrent ? togglePlay() : playSong(song, playlist));

  return (
    <section
      aria-label="Featured today"
      role="button"
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
      style={{ '--cover-rgb': rgb }}
      className="relative overflow-hidden rounded-panel cover-wash-strong bg-surface-2 p-4 md:p-6 flex items-center gap-4 md:gap-8 cursor-pointer select-none lift focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none"
    >
      <div aria-hidden="true" className="absolute inset-0 kolam pointer-events-none" />
      <div aria-hidden="true" className="cover-glow absolute -left-10 -top-10 w-72 h-72 pointer-events-none" />

      <img
        src={song.image || MUSIC_COVER_FALLBACK}
        alt=""
        referrerPolicy="no-referrer"
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = MUSIC_COVER_FALLBACK;
        }}
        className="relative w-28 h-28 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-lg object-cover flex-shrink-0 shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
      />

      <div className="relative min-w-0 flex-1">
        <p className="inline-flex items-center gap-2 text-[11px] md:text-xs font-bold uppercase tracking-wider text-accent-300">
          <span aria-hidden="true">✦</span>
          <span>Featured today</span>
        </p>
        <h2 className="mt-1 text-2xl sm:text-3xl md:text-5xl font-black text-white tracking-tight leading-tight line-clamp-2">
          {song.title}
        </h2>
        <p className="mt-1 text-sm md:text-base text-zinc-300 line-clamp-1">{song.artist || song.singers}</p>

        <div className="mt-3 md:mt-4 flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            aria-label={isCurrent && isPlaying ? `Pause ${song.title}` : `Play ${song.title}`}
            className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-brand-500 hover:bg-brand-400 text-black flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.5)] hover:scale-105 active:scale-95 transition-transform"
          >
            {isCurrent && isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 ml-0.5 fill-black" />}
          </button>
          {isCurrent && isPlaying && (
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-brand-300">
              <Equalizer /> Now playing
            </span>
          )}
        </div>
      </div>
    </section>
  );
};

export default FeaturedHero;
