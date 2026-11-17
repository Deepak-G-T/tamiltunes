import React, { memo } from 'react';
import { Play } from 'lucide-react';
import SafeImage from '../../common/SafeImage';
import Equalizer from '../../common/Equalizer';

/** A playable song row (shared by Liked and Recently Played). */
const SongRow = ({ song, active, playing, onPlay, right }) => (
  <div className={`press group flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 ${active ? 'bg-white/10' : ''}`}>
    <button type="button" onClick={onPlay} aria-label={`Play ${song.title}`}
      className="flex items-center gap-3 min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 rounded-lg">
      <span className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
        <SafeImage src={song.image} alt="" className="w-full h-full object-cover" />
        <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <Play className="w-4 h-4 text-white fill-white" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 min-w-0">
          {active && playing && <Equalizer />}
          <span className={`text-sm font-semibold truncate ${active ? 'text-brand-400' : 'text-white'}`}>{song.title}</span>
        </span>
        <span className="block text-xs text-zinc-400 truncate">{song.artist}</span>
      </span>
    </button>
    {right}
  </div>
);

export default memo(SongRow);
