import React, { useEffect, useState } from 'react';

const formatTime = (seconds) => {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const ProgressBar = ({ currentTime, duration, onSeek, isBuffering }) => {
  const [dragging, setDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);

  // How far the audio is downloaded (HTML5 engine only; the YouTube player has its own bar)
  const [bufferedEnd, setBufferedEnd] = useState(0);
  useEffect(() => {
    const read = () => {
      const a = typeof window !== 'undefined' ? window.__tamiltunes_audio : null;
      try {
        if (!a || !a.buffered?.length) { setBufferedEnd(0); return; }
        let end = 0;
        for (let i = 0; i < a.buffered.length; i++) if (a.buffered.start(i) <= a.currentTime + 0.5) end = Math.max(end, a.buffered.end(i));
        setBufferedEnd((prev) => (Math.abs(prev - end) < 0.5 ? prev : end));
      } catch { setBufferedEnd(0); }
    };
    read();
    const t = setInterval(read, 1000);
    return () => clearInterval(t);
  }, [duration]);
  const bufferedPercent = duration > 0 ? Math.min(100, Math.max(0, (bufferedEnd / duration) * 100)) : 0;

  const shown = dragging ? dragTime : currentTime;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (shown / duration) * 100)) : 0;

  const handleChange = (e) => {
    const newTime = parseFloat(e.target.value);
    setDragTime(newTime);
    onSeek(newTime);
  };

  const stopDrag = () => setDragging(false);

  return (
    <div className="w-full flex items-center gap-2.5 text-xs text-zinc-400 select-none">
      <span className="w-10 flex-shrink-0 text-right text-[11px] tabular-nums font-medium">
        {formatTime(shown)}
      </span>

      {/* 44px-tall touch target around a thin track; the track grows and a thumb appears while touched */}
      <div className="relative flex-1 flex items-center group h-11">
        <div
          className={`relative w-full bg-white/15 rounded-full overflow-hidden transition-all duration-150 ${
            dragging ? 'h-2' : 'h-1 group-hover:h-1.5'
          }`}
        >
          <div aria-hidden="true" data-testid="buffered" className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/25 pointer-events-none" style={{ width: `${bufferedPercent}%` }} />
          <div
            className={`relative h-full rounded-full transition-[width] duration-75 ${
              isBuffering ? 'bg-brand-400/70 animate-pulse' : dragging ? 'bg-brand-400' : 'bg-brand-500 group-hover:bg-brand-400'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Thumb: always visible on touch screens, on hover/drag with a mouse */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute top-1/2 w-4 h-4 rounded-full bg-white shadow-md -translate-x-1/2 -translate-y-1/2 transition-opacity [@media(hover:none)]:opacity-100 ${
            dragging ? 'opacity-100 scale-125' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ left: `${progressPercent}%` }}
        />

        {/* Time bubble while scrubbing */}
        {dragging && (
          <span
            data-testid="scrub-time"
            className="pointer-events-none absolute -top-6 -translate-x-1/2 px-2 py-0.5 rounded-md bg-white text-black text-[11px] font-bold tabular-nums shadow-lg"
            style={{ left: `${Math.min(92, Math.max(8, progressPercent))}%` }}
          >
            {formatTime(dragTime)}
          </span>
        )}

        {/* Real range input overlaid */}
        <input
          type="range"
          min="0"
          max={duration || 100}
          step="0.1"
          value={shown || 0}
          onChange={handleChange}
          onPointerDown={(e) => {
            setDragTime(parseFloat(e.currentTarget.value));
            setDragging(true);
          }}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onBlur={stopDrag}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          title="Seek playback"
        />
      </div>

      <span className="w-10 flex-shrink-0 text-left text-[11px] tabular-nums font-medium">
        {formatTime(duration)}
      </span>
    </div>
  );
};

export default ProgressBar;
