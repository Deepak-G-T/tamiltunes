import React, { memo, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreHorizontal, X, Check, Trash2 } from 'lucide-react';
import SafeImage from '../../common/SafeImage';
import { formatClock, ROW_HEIGHT } from '../../../lib/queueView';

const SWIPE_REMOVE_PX = 90;

/**
 * One queued song. Tap to play. Drag the handle (mouse, touch or keyboard) to reorder. Swipe left to remove on a touch screen.
 * Keyboard (handled by the list): arrows move between rows, Enter plays, Delete removes, Alt+Up / Alt+Down reorder.
 */
const QueueItem = ({ entry, index, tabStop, selectMode, selected, onPlay, onRemove, onToggleSelect, onOpenMenu, onFocusRow }) => {
  const { song, uid, origin } = entry;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isSorting, index: slot, overIndex, activeIndex } = useSortable({ id: uid, disabled: selectMode });
  const dropHere = isSorting && !isDragging && overIndex === slot && activeIndex !== slot; // where the dragged song will land
  const lineAtBottom = activeIndex < slot;
  const [dx, setDx] = useState(0);
  const start = useRef(null);

  const down = (e) => { if (e.pointerType !== 'mouse' && !selectMode) start.current = { x: e.clientX, y: e.clientY }; };
  const move = (e) => {
    const s = start.current;
    if (!s) return;
    const d = e.clientX - s.x;
    if (Math.abs(e.clientY - s.y) > Math.abs(d) + 8 && Math.abs(d) < 12) { start.current = null; setDx(0); return; } // scrolling
    if (d < -8) setDx(Math.max(d, -150));
  };
  const up = () => {
    if (start.current && dx <= -SWIPE_REMOVE_PX) onRemove(uid);
    start.current = null;
    setDx(0);
  };

  const tab = tabStop ? 0 : -1;
  const btn = 'rounded-full text-zinc-400 hover:text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400';
  return (
    <li
      ref={setNodeRef}
      data-queue-row=""
      data-uid={uid}
      data-testid="queue-row"
      tabIndex={tab}
      onFocus={() => onFocusRow(uid)}
      aria-label={`${song.title}, ${song.artist || song.singers || 'unknown artist'}, position ${index + 1}`}
      style={{ transform: CSS.Transform.toString(transform), transition, height: ROW_HEIGHT, zIndex: isDragging ? 5 : undefined, listStyle: 'none' }}
      className={`relative rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ${isDragging ? 'scale-[1.02] shadow-2xl bg-surface-4 ring-1 ring-brand-500/60 opacity-95' : ''}`}
    >
      {dropHere && <span aria-hidden="true" data-testid="drop-line" className={`absolute left-2 right-2 h-0.5 rounded-full bg-brand-400 z-10 ${lineAtBottom ? '-bottom-px' : '-top-px'}`} />}
      {/* what a left swipe reveals: it grows as the row slides away */}
      <div aria-hidden="true" className="absolute inset-0 rounded-lg bg-rose-500/20 flex items-center justify-end gap-1.5 pr-4 text-rose-300 text-xs font-bold" style={{ opacity: dx < 0 ? Math.min(1, -dx / SWIPE_REMOVE_PX) : 0 }}>
        <Trash2 className="w-4 h-4" /> Remove
      </div>
      <div
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: 'pan-y', transition: dx ? 'none' : 'transform 0.18s' }}
        className={`group relative flex items-center gap-1 h-full px-0.5 rounded-lg bg-surface-2 hover:bg-surface-3 ${selected ? 'bg-brand-500/15 ring-1 ring-brand-500/60' : ''} ${dx <= -SWIPE_REMOVE_PX ? 'bg-rose-500/20' : ''}`}
      >
        {selectMode ? (
          <button type="button" role="checkbox" aria-checked={selected} aria-label={`Select ${song.title}`} tabIndex={tab} onClick={() => onToggleSelect(uid)}
            className={`w-6 h-6 flex-shrink-0 rounded-md border flex items-center justify-center ${selected ? 'bg-brand-500 border-brand-500 text-black' : 'border-zinc-500 text-transparent'}`}>
            <Check className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : (
          <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} tabIndex={tab}
            aria-label={`Reorder ${song.title}. Press space to pick up, arrow keys to move, space to drop.`}
            style={{ touchAction: 'none' }}
            className={`${btn} w-10 h-10 inline-flex items-center justify-center cursor-grab active:cursor-grabbing flex-shrink-0`}>
            <GripVertical className="w-5 h-5" aria-hidden="true" />
          </button>
        )}

        <button type="button" tabIndex={tab} onClick={() => (selectMode ? onToggleSelect(uid) : onPlay(uid))} aria-label={selectMode ? `Select ${song.title}` : `Play ${song.title} now`}
          className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
          <SafeImage src={song.image} alt="" className="w-11 h-11 rounded-md object-cover flex-shrink-0 bg-surface-4" />
          <span className="min-w-0 flex-1">
            <span dir="auto" className="block text-sm font-semibold text-white truncate leading-[1.4]">{song.title}</span>
            <span dir="auto" className="flex items-center gap-1.5 text-xs text-zinc-400 leading-[1.4]">
              {origin === 'radio' && <span className="flex-shrink-0 px-1.5 rounded bg-brand-500/15 text-brand-300 text-[10px] font-bold uppercase tracking-wide">Autoplay</span>}
              <span className="truncate">{song.artist || song.singers}{song.why && <span className="text-brand-300/90"> · {song.why}</span>}</span>
            </span>
          </span>
        </button>

        <span className="text-xs tabular-nums text-zinc-500 flex-shrink-0 w-10 text-right" aria-label={`Length ${formatClock(song.duration)}`}>{formatClock(song.duration)}</span>

        {!selectMode && (
          <>
            <button type="button" tabIndex={tab} onClick={(e) => onOpenMenu(uid, e.currentTarget)} aria-haspopup="menu" aria-label={`More options for ${song.title}`} className={`${btn} p-1.5 flex-shrink-0`}>
              <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
            </button>
            <button type="button" tabIndex={tab} onClick={() => onRemove(uid)} aria-label={`Remove ${song.title} from the queue`} className={`${btn} p-1.5 flex-shrink-0 hidden md:inline-flex hover:!text-rose-400`}>
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </li>
  );
};

export default memo(QueueItem);
