import React from 'react';
import { useAudio } from '../../context/AudioContext';
import VideoSlot from './VideoSlot';
import VideoModeToggle from './VideoModeToggle';

/**
 * Always-visible video surface while the YouTube engine is active and the full-screen player is
 * closed (mobile: above the mini player; desktop: bottom-right above the player bar).
 */
const VideoPanel = () => {
  const { currentSong, activeEngine, isFullScreen } = useAudio();
  if (!currentSong || activeEngine !== 'youtube' || isFullScreen) return null;

  return (
    <div
      data-testid="video-panel"
      className="fixed z-[45] left-2 right-2 bottom-[8.5rem] md:left-auto md:right-4 md:bottom-24 md:w-80 flex flex-col gap-1.5"
    >
      <VideoSlot className="w-full h-[200px]" />
      <div className="hidden md:flex justify-end">
        <VideoModeToggle />
      </div>
    </div>
  );
};

export default VideoPanel;
