import React, { memo, useRef, useState } from 'react';
import { X, ChevronUp, ChevronDown, GripVertical, ListStart } from 'lucide-react';
import SafeImage from '../common/SafeImage';

const SWIPE_REMOVE_PX = 90;

/**
 * One upcoming song in the queue panel.
 * Tap plays it. Remove with the X button or by swiping left on a touch screen. Reorder by dragging (desktop) or with
 * the up / down buttons (keyboard and touch). Radio songs also offer "Play next".
 */
const QueueRow = ({ song, index, last, dragOver, onPlay, onRemove, onMove, onPlayNext, onDragStart, onDragOver, onDrop, onDragEnd }) => {
  const [dx, setDx] = useState(0);
  const start = useRef(null);

  const down = (e) => {
    if (e.pointerType === 'mouse') return; // desktop uses buttons and drag and drop
    start.current = { x: e.clientX, y: e.clientY };
  };
  const move = (e) => {
    const s = start.current;
    if (!s) return;
    const d = e.clientX - s.x;
    if (Math.abs(e.clientY - s.y) > Math.abs(d) + 8 && Math.abs(d) < 12) { start.current = null; setDx(0); return; } // a vertical scroll
    if (d < -8) setDx(Math.max(d, -150));
  };
  const up = () => {
    if (start.current && dx <= -SWIPE_REMOVE_PX) onRemove(index);
    start.current = null;
    setDx(0);
  };

  return (
    <li
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', song.id); onDragStart(index); }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(index); }}
      onDrop={(e) => { e.preventDefault(); onDrop(index); }}
      onDragEnd={onDragEnd}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
      style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: 'pan-y', transition: dx ? 'none' : 'transform 0.18s' }}
      className={`group relative flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 ${dragOver ? 'ring-2 ring-accent-400' : ''} ${dx <= -SWIPE_REMOVE_PX ? 'bg-rose-500/20' : ''}`}
      data-testid="queue-row"
    >
      <GripVertical aria-hidden="true" className="w-4 h-4 text-zinc-600 flex-shrink-0 hidden md:block cursor-grab" />
      <button type="button" onClick={() => onPlay(index)} aria-label={`Play ${song.title} now`}
        className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
        <SafeImage src={song.image} alt="" className="w-11 h-11 rounded-md object-cover flex-shrink-0 bg-surface-4" />
        <span className="min-w-0 flex-1">
          <span dir="auto" className="block text-sm font-semibold text-white truncate leading-[1.4]">{song.title}</span>
          <span dir="auto" className="block text-xs text-zinc-400 truncate leading-[1.4]">
            {song.artist || song.singers}
            {song.why && <span className="text-brand-300/90"> · {song.why}</span>}
          </span>
        </span>
      </button>
      <span className="flex items-center flex-shrink-0">
        {onPlayNext && (
          <button type="button" onClick={() => onPlayNext(index)} aria-label={`Play ${song.title} next`} title="Play next"
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
            <ListStart className="w-4 h-4" />
          </button>
        )}
        <button type="button" onClick={() => onMove(index, index - 1)} disabled={index === 0} aria-label={`Move ${song.title} up`}
          className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
          <ChevronUp className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => onMove(index, index + 1)} disabled={last} aria-label={`Move ${song.title} down`}
          className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
          <ChevronDown className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => onRemove(index)} aria-label={`Remove ${song.title} from the queue`}
          className="p-1.5 rounded-full text-zinc-400 hover:text-rose-400 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
          <X className="w-4 h-4" />
        </button>
      </span>
    </li>
  );
};

export default memo(QueueRow);
