import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Disc, Play } from 'lucide-react';

const AlbumCard = ({ album }) => {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/album/${album.id}`)}
      className="group relative bg-[#18181B] hover:bg-[#27272A] p-3 rounded-xl transition-all duration-200 cursor-pointer border border-zinc-800/40 hover:border-zinc-700/60 shadow-sm hover:shadow-xl"
    >
      <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-3 bg-zinc-800">
        <img
          src={album.image || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&auto=format&fit=crop&q=80'}
          alt={album.name || album.title}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&auto=format&fit=crop&q=80';
          }}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
          <Play className="w-5 h-5 ml-0.5" />
        </div>
      </div>

      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-white truncate group-hover:text-purple-400 transition-colors">
          {album.name || album.title}
        </h4>
        <p className="text-xs text-zinc-400 truncate mt-0.5">
          {album.artist || album.music || (album.year ? `${album.year} • Tamil Album` : 'Tamil Album')}
        </p>
      </div>
    </div>
  );
};

export default AlbumCard;
