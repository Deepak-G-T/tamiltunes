import React, { useEffect, useRef } from 'react';
import { useAudio } from '../../context/AudioContext';

/**
 * Placeholder the YouTube iframe is pinned over. Enforces the 200x200 minimum that
 * YouTube's embed policy requires, so the player is always visible while it plays.
 */
const VideoSlot = ({ className = '', style }) => {
  const { registerVideoSlot } = useAudio();
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return undefined;
    return registerVideoSlot(ref.current);
  }, [registerVideoSlot]);

  return (
    <div
      ref={ref}
      data-testid="video-slot"
      className={`bg-black rounded-xl min-w-[200px] min-h-[200px] ${className}`}
      style={style}
    />
  );
};

export default VideoSlot;
