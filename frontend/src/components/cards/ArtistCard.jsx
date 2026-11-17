import React from 'react';
import { useNavigate } from 'react-router-dom';

const ARTIST_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23143d24'/%3E%3Cstop offset='50%25' stop-color='%230f2a1a'/%3E%3Cstop offset='100%25' stop-color='%23071a10'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' rx='150' fill='url(%23bg)'/%3E%3Ccircle cx='150' cy='120' r='45' fill='%231db954' opacity='0.3'/%3E%3Cpath d='M90 240c0-33 27-60 60-60s60 27 60 60' stroke='%236ee9a0' stroke-width='6' fill='none' stroke-linecap='round'/%3E%3Ccircle cx='150' cy='120' r='35' stroke='%236ee9a0' stroke-width='6' fill='none'/%3E%3C/svg%3E";

const ArtistCard = ({ artist }) => {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/artist/${artist.id || encodeURIComponent(artist.name)}`)}
      className="group relative bg-surface-2 hover:bg-surface-4 p-3 md:p-4 rounded-card transition-colors duration-300 cursor-pointer select-none"
    >
      <div className="relative aspect-square w-full rounded-full overflow-hidden mb-3 md:mb-4 bg-surface-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
        <img
          src={artist.image || ARTIST_FALLBACK}
          alt={artist.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = ARTIST_FALLBACK;
          }}
          className="w-full h-full object-cover"
        />
      </div>
      <h4 className="text-sm font-bold text-white truncate">{artist.name}</h4>
      <p className="text-[13px] text-zinc-400 capitalize mt-1">{artist.role || 'Artist'}</p>
    </div>
  );
};

export default ArtistCard;
