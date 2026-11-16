import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from 'lucide-react';

const ARTIST_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%233b185f'/%3E%3Cstop offset='50%25' stop-color='%231f1338'/%3E%3Cstop offset='100%25' stop-color='%230f091f'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' rx='150' fill='url(%23bg)'/%3E%3Ccircle cx='150' cy='120' r='45' fill='%23a855f7' opacity='0.3'/%3E%3Cpath d='M90 240c0-33 27-60 60-60s60 27 60 60' stroke='%23c084fc' stroke-width='6' fill='none' stroke-linecap='round'/%3E%3Ccircle cx='150' cy='120' r='35' stroke='%23c084fc' stroke-width='6' fill='none'/%3E%3C/svg%3E";

const ArtistCard = ({ artist }) => {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/artist/${artist.id || encodeURIComponent(artist.name)}`)}
      className="group relative bg-[#18181B] hover:bg-[#27272A] p-4 rounded-xl transition-all duration-200 cursor-pointer border border-zinc-800/40 hover:border-zinc-700/60 shadow-sm hover:shadow-xl flex flex-col items-center text-center select-none"
    >
      <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden mb-3 bg-zinc-900 shadow-lg">
        <img
          src={artist.image || ARTIST_FALLBACK}
          alt={artist.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = ARTIST_FALLBACK;
          }}
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
