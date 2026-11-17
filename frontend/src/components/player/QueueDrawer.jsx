import React from 'react';
import { X, Trash2, Music, Play, Disc, ChevronUp, ChevronDown } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';

const QueueDrawer = ({ isOpen, onClose }) => {
  const {
    queue,
    queueIndex,
    currentSong,
    playSong,
    removeFromQueue,
    clearQueue,
    moveInQueue
  } = useAudio();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 sm:w-96 bg-surface-1 border-l border-zinc-800/80 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-brand-400" />
          <h3 className="font-semibold text-sm text-white">Play Queue</h3>
          <span className="text-xs text-zinc-500">({queue.length} tracks)</span>
        </div>
        <div className="flex items-center gap-1">
          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              title="Clear queue"
              className="p-1.5 rounded-md text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/60 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            title="Close queue"
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Currently Playing Card */}
        {currentSong && (
          <div>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-brand-400 mb-2 px-1">
              Now Playing
            </h4>
            <div className="flex items-center gap-3 p-2 rounded-xl bg-brand-950/20 border border-brand-500/20">
              <img
                src={currentSong.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80'}
                alt={currentSong.title}
                className="w-12 h-12 rounded-lg object-cover shadow"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{currentSong.title}</p>
                <p className="text-xs text-brand-300 truncate">{currentSong.artist || currentSong.singers}</p>
              </div>
              <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse mr-2" />
            </div>
          </div>
        )}

        {/* Next Up Section */}
        <div>
          <h4 className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 mb-2 px-1">
            Next Up
          </h4>
          {queue.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-xs italic">
              Queue is empty. Click any Tamil song to start listening!
            </div>
          ) : (
            <div className="space-y-1">
              {queue.map((song, idx) => {
                const isCurrent = idx === queueIndex;
                return (
                  <div
                    key={`${song.id}-${idx}`}
                    className={`flex items-center justify-between p-2 rounded-lg group transition-colors ${
                      isCurrent
                        ? 'bg-zinc-800/60 border border-brand-500/30'
                        : 'hover:bg-zinc-800/30'
                    }`}
                  >
                    <div
                      className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                      onClick={() => playSong(song)}
                    >
                      <img
                        src={song.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=80&auto=format&fit=crop&q=80'}
                        alt={song.title}
                        className="w-9 h-9 rounded-md object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium truncate ${isCurrent ? 'text-brand-400 font-semibold' : 'text-zinc-200'}`}>
                          {song.title}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {song.artist || song.singers}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                      {idx > 0 && (
                        <button
                          onClick={() => moveInQueue && moveInQueue(idx, idx - 1)}
                          title="Move up"
                          aria-label="Move track up"
                          className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-700/50 transition-colors"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {idx < queue.length - 1 && (
                        <button
                          onClick={() => moveInQueue && moveInQueue(idx, idx + 1)}
                          title="Move down"
                          aria-label="Move track down"
                          className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-700/50 transition-colors"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => removeFromQueue(idx)}
                        title="Remove from queue"
                        aria-label="Remove from queue"
                        className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-700/50 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QueueDrawer;
