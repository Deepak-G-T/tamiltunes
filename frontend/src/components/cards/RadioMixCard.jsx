import React from 'react';
import { Radio, Play } from 'lucide-react';
import SafeImage from '../common/SafeImage';

/** "Made for you": a radio mix seeded from one of your most-played songs. Tap to start it. */
const RadioMixCard = ({ song, onStart }) => (
  <button
    type="button"
    onClick={() => onStart(song)}
    aria-label={`Start ${song.title} radio`}
    className="group press w-full text-left bg-surface-2 hover:bg-surface-3 rounded-card p-3 md:p-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
  >
    <span className="relative block aspect-square w-full rounded-md overflow-hidden mb-3 bg-surface-4">
      <SafeImage src={song.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
      <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-2 py-0.5 text-[10px] font-bold tracking-wider text-brand-300">
        <Radio className="w-3 h-3" aria-hidden="true" /> RADIO
      </span>
      <span aria-hidden="true" className="hidden md:flex absolute right-2 bottom-2 w-10 h-10 rounded-full bg-brand-500 text-black items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition">
        <Play className="w-5 h-5 ml-0.5 fill-black" />
      </span>
    </span>
    <span dir="auto" className="block text-sm font-bold text-white truncate leading-[1.4]">{song.title} Radio</span>
    <span dir="auto" className="block text-xs text-zinc-400 truncate leading-[1.4]">Songs like {song.artist}</span>
  </button>
);

export default RadioMixCard;
