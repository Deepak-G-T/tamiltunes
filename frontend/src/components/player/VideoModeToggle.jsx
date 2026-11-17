import React from 'react';
import { Headphones, Video } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';

/** Audio/Video switch. Renders nothing unless the current song has a usable videoId AND an audio stream. */
const VideoModeToggle = ({ className = '' }) => {
  const { canToggleVideo, playbackMode, switchPlaybackMode } = useAudio();
  if (!canToggleVideo) return null;

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
        playbackMode === mode ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
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
