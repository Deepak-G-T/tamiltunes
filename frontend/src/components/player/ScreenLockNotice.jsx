import React from 'react';
import { Info } from 'lucide-react';
import { screenLockNotice } from '../../lib/playbackLogic';

/** A small note under the player while a song plays through YouTube (it stops when the screen locks). Songs on the audio engine show nothing. */
const ScreenLockNotice = ({ song, engine, className = '' }) => {
  const n = screenLockNotice(song, engine);
  if (!n) return null;
  return (
    <p role="note" data-testid="screen-lock-notice" className={`flex items-start gap-2 text-xs text-zinc-400 leading-5 ${className}`}>
      <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-zinc-500" aria-hidden="true" />
      <span>{n.text}{n.canSwitchToAudio ? ' Switch to audio to keep it playing.' : ''}</span>
    </p>
  );
};

export default ScreenLockNotice;
