import React from 'react';
import { Volume2, Volume1, VolumeX } from 'lucide-react';

const VolumeSlider = ({ volume, isMuted, onVolumeChange, onToggleMute }) => {
  const currentVolume = isMuted ? 0 : volume;

  const getIcon = () => {
    if (isMuted || currentVolume === 0) {
      return <VolumeX className="w-4 h-4 text-zinc-400 hover:text-white" />;
    }
    if (currentVolume < 0.5) {
      return <Volume1 className="w-4 h-4 text-zinc-400 hover:text-white" />;
    }
    return <Volume2 className="w-4 h-4 text-zinc-400 hover:text-white" />;
  };

  return (
    <div className="flex items-center gap-2 group">
      <button
        onClick={onToggleMute}
        title={isMuted ? 'Unmute' : 'Mute'}
        className="p-1 rounded-md text-zinc-400 hover:text-white transition-colors"
      >
        {getIcon()}
      </button>

      <div className="relative w-20 sm:w-24 flex items-center">
        <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-zinc-400 group-hover:bg-brand-400 rounded-full transition-colors"
            style={{ width: `${currentVolume * 100}%` }}
          />
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={currentVolume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          title={`Volume ${Math.round(currentVolume * 100)}%`}
        />
      </div>
    </div>
  );
};

export default VolumeSlider;
