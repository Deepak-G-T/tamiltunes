import React, { memo } from 'react';
import { Play, MoreHorizontal, Flame, Pin, Sparkles } from 'lucide-react';
import SafeImage from '../common/SafeImage';
import Equalizer from '../common/Equalizer';
import { useLongPress } from '../../hooks/useLongPress';
import { haptic } from '../../lib/haptics';

/**
 * One Speed Dial tile: album art, gradient + title + artist, flame on the most played, equalizer when it is playing.
 * Tap plays (and starts the radio); long-press or "..." opens the action menu; desktop users can drag to reorder.
 */
const SpeedDialTile = ({ item, index, isCurrent, isPlaying, onPlay, onOpenMenu, draggable, dragOver, onDragStart, onDragOver, onDrop, onDragEnd }) => {
  const { handlers, guardClick } = useLongPress(() => {
    haptic(15);
    onOpenMenu(item, index);
  });

  const label = `${isCurrent && isPlaying ? 'Pause' : 'Play'} ${item.title} by ${item.artist}${item.pinned ? ', pinned' : ''}${item.source === 'suggested' ? ', suggested' : ''}`;

  return (
    <li
      className={`group relative aspect-square rounded-xl overflow-hidden bg-surface-3 select-none transition-shadow ${
        isCurrent ? 'ring-2 ring-brand-400' : 'hover:ring-1 hover:ring-white/30'
      } ${dragOver ? 'ring-2 ring-accent-400' : ''}`}
      draggable={draggable}
      onDragStart={draggable ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.id); onDragStart(index); } : undefined}
      onDragOver={draggable ? (e) => { e.preventDefault(); onDragOver(index); } : undefined}
      onDrop={draggable ? (e) => { e.preventDefault(); onDrop(index); } : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      {...handlers}
    >
      <button
        type="button"
        onClick={guardClick(() => onPlay(item))}
        aria-label={label}
        aria-current={isCurrent ? 'true' : undefined}
        className="absolute inset-0 w-full h-full text-left press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-400"
      >
        <SafeImage src={item.image} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent pointer-events-none" />
        <span className="absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-6 pointer-events-none">
          <span dir="auto" className="block text-[13px] md:text-sm font-bold text-white truncate leading-[1.4]">{item.title}</span>
          <span dir="auto" className="block text-[11px] md:text-xs text-zinc-300 truncate leading-[1.4]">{item.artist}</span>
        </span>
      </button>

      {/* status badges (top-left) */}
      <span className="absolute top-1.5 left-1.5 flex items-center gap-1 pointer-events-none">
        {item.hot && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-black/60 backdrop-blur px-1.5 py-0.5 text-[10px] font-bold text-accent-300" title={`${item.playCount} plays`}>
            <Flame className="w-3 h-3 fill-accent-400 text-accent-400" aria-hidden="true" />
            <span aria-hidden="true">{item.playCount}</span>
            <span className="sr-only">{item.playCount} plays</span>
          </span>
        )}
        {item.pinned && (
          <span className="inline-flex items-center rounded-full bg-black/60 backdrop-blur p-1 text-brand-300" title="Pinned">
            <Pin className="w-3 h-3" aria-hidden="true" />
            <span className="sr-only">Pinned</span>
          </span>
        )}
        {item.source === 'suggested' && !item.pinned && (
          <span className="inline-flex items-center rounded-full bg-black/45 p-1 text-zinc-300" title="Suggested for you">
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            <span className="sr-only">Suggested</span>
          </span>
        )}
      </span>

      {/* equalizer while this song plays */}
      {isCurrent && isPlaying && (
        <span className="absolute bottom-2 right-2 pointer-events-none"><Equalizer /></span>
      )}

      {/* desktop hover play button */}
      {!(isCurrent && isPlaying) && (
        <span aria-hidden="true" className="hidden md:flex absolute right-2 bottom-2 w-9 h-9 rounded-full bg-brand-500 text-black items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition pointer-events-none">
          <Play className="w-4 h-4 ml-0.5 fill-black" />
        </span>
      )}

      {/* "..." menu button: always visible on touch, on hover / focus on desktop */}
      <button
        type="button"
        onClick={() => onOpenMenu(item, index)}
        aria-label={`More actions for ${item.title}`}
        aria-haspopup="dialog"
        className="absolute top-1 right-1 p-1.5 rounded-full bg-black/45 text-white hover:bg-black/70 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
    </li>
  );
};

export default memo(SpeedDialTile);
