import React from 'react';
import { Headphones, Video } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';

/** Audio/Video switch. Renders nothing unless the current song has a usable videoId AND an audio stream. */
const VideoModeToggle = ({ className = '', compact = false }) => {
  const { canToggleVideo, playbackMode, switchPlaybackMode } = useAudio();
  if (!canToggleVideo) return null;

  // Compact (mini bar): one icon button that switches to the OTHER mode, so the song title keeps its room.
  if (compact) {
    const target = playbackMode === 'video' ? 'audio' : 'video';
    const Icon = target === 'video' ? Video : Headphones;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          switchPlaybackMode(target);
        }}
        data-testid={`mode-${target}`}
        aria-label={target === 'video' ? 'Switch to video' : 'Switch to audio'}
        title={target === 'video' ? 'Watch video' : 'Audio only'}
        className={`p-2 rounded-full text-brand-300 hover:text-white active:scale-90 transition-transform ${className}`}
      >
        <Icon className="w-4 h-4" />
      </button>
    );
  }

  const btn = (mode, Icon, label) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        switchPlaybackMode(mode);
      }}
      aria-pressed={playbackMode === mode}
      data-testid={`mode-${mode}`}
      className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
        playbackMode === mode ? 'bg-brand-500 text-black' : 'text-zinc-400 hover:text-white'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );

  return (
    <div
      role="group"
      aria-label="Playback mode"
      data-testid="video-toggle"
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-full bg-zinc-900/90 border border-zinc-800 ${className}`}
    >
      {btn('audio', Headphones, 'Audio')}
      {btn('video', Video, 'Video')}
    </div>
  );
};

export default VideoModeToggle;
