import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from 'lucide-react';

const ArtistCard = ({ artist }) => {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/artist/${artist.id || encodeURIComponent(artist.name)}`)}
      className="group relative bg-[#18181B] hover:bg-[#27272A] p-4 rounded-xl transition-all duration-200 cursor-pointer border border-zinc-800/40 hover:border-zinc-700/60 shadow-sm hover:shadow-xl flex flex-col items-center text-center"
    >
      <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden mb-3 bg-zinc-800 shadow-lg">
        <img
          src={artist.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80'}
          alt={artist.name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      <h4 className="text-sm font-semibold text-white truncate w-full group-hover:text-purple-400 transition-colors">
        {artist.name}
      </h4>
      <p className="text-xs text-zinc-400 capitalize mt-0.5">
        {artist.role || 'Artist'}
      </p>
    </div>
  );
};

export default ArtistCard;
