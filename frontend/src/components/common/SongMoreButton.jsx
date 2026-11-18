import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useSongActions } from './SongActionsSheet';

/** The "..." button for a song row: opens the song menu (Play now, Start radio, Play next, Add to queue, Add to playlist ...). */
const SongMoreButton = ({ song, onAddToPlaylist, className = '' }) => {
  const actions = useSongActions();
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); actions.open(song, { onAddToPlaylist }); }}
      aria-label={`More actions for ${song.title}`}
      aria-haspopup="menu"
      className={`press p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ${className}`}
    >
      <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
    </button>
  );
};

export default SongMoreButton;
