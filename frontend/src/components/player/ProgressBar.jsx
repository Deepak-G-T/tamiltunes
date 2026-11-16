import React from 'react';

const formatTime = (seconds) => {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const ProgressBar = ({ currentTime, duration, onSeek, isBuffering }) => {
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleChange = (e) => {
    const newTime = parseFloat(e.target.value);
    onSeek(newTime);
  };

  return (
    <div className="w-full flex items-center gap-2.5 text-xs text-zinc-400 select-none">
      <span className="w-9 text-right font-mono text-[11px] tabular-nums">
        {formatTime(currentTime)}
      </span>

      <div className="relative flex-1 flex items-center group">
        {/* Background track */}
        <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
          {/* Active progress fill */}
          <div
            className={`h-full rounded-full transition-all duration-75 ${
              isBuffering ? 'bg-purple-400/70 animate-pulse' : 'bg-purple-500 group-hover:bg-purple-400'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Real range input overlaid */}
        <input
          type="range"
          min="0"
          max={duration || 100}
          step="0.1"
          value={currentTime || 0}
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          title="Seek playback"
        />
      </div>

      <span className="w-9 text-left font-mono text-[11px] tabular-nums">
        {formatTime(duration)}
      </span>
    </div>
  );
};

export default ProgressBar;
