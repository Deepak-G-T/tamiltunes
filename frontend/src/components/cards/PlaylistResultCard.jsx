import React from 'react';
import { Link } from 'react-router-dom';
import { ListMusic } from 'lucide-react';
import SafeImage from '../common/SafeImage';

/** A public playlist found in search: cover, name, owner and song count. Opens the playlist page. */
const PlaylistResultCard = ({ playlist }) => (
  <Link
    to={`/playlist/${playlist.id}`}
    aria-label={`Open playlist ${playlist.name}`}
    className="group press block bg-surface-2 hover:bg-surface-4 rounded-card p-3 md:p-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
  >
    <span className="relative block aspect-square w-full rounded-md overflow-hidden mb-3 bg-surface-3">
      {playlist.cover ? (
        <SafeImage src={playlist.cover} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-zinc-600"><ListMusic className="w-10 h-10" aria-hidden="true" /></span>
      )}
    </span>
    <span dir="auto" className="block text-sm font-bold text-white truncate leading-[1.4]">{playlist.name}</span>
    <span className="block text-xs text-zinc-400 truncate leading-[1.4]">
      {playlist.owner?.name ? `By ${playlist.owner.name} · ` : ''}{playlist.songCount} {playlist.songCount === 1 ? 'song' : 'songs'}
    </span>
  </Link>
);

export default PlaylistResultCard;
