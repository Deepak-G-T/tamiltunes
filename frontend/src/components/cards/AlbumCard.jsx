import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';

const MUSIC_COVER_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23143d24'/%3E%3Cstop offset='50%25' stop-color='%230f2a1a'/%3E%3Cstop offset='100%25' stop-color='%23071a10'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' rx='16' fill='url(%23bg)'/%3E%3Ccircle cx='150' cy='150' r='60' fill='%231db954' opacity='0.2'/%3E%3Cpath d='M135 180V120l50-14v54m-50 0a16 16 0 11-32 0 16 16 0 0132 0zm50-14a16 16 0 11-32 0 16 16 0 0132 0z' stroke='%236ee9a0' stroke-width='6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const AlbumCard = ({ album }) => {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/album/${album.id}`)}
      className="group relative bg-surface-2 hover:bg-surface-4 p-3 md:p-4 rounded-card transition-colors duration-300 cursor-pointer select-none press"
    >
      <div className="relative aspect-square w-full rounded-md overflow-hidden mb-3 md:mb-4 bg-surface-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
        <img
          src={album.image || MUSIC_COVER_FALLBACK}
          alt={album.name || album.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = MUSIC_COVER_FALLBACK;
          }}
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-2 right-2 w-11 h-11 rounded-full bg-brand-500 text-black flex items-center justify-center shadow-[0_8px_16px_rgba(0,0,0,0.5)] md:opacity-0 md:translate-y-2 md:group-hover:opacity-100 md:group-hover:translate-y-0 transition-all duration-300">
          <Play className="w-5 h-5 ml-0.5 fill-black" />
        </div>
      </div>

      <div className="min-w-0">
        <h4 className="text-sm font-bold text-white truncate">{album.name || album.title}</h4>
        <p className="text-[13px] text-zinc-400 line-clamp-2 mt-1 leading-snug">
          {album.artist || album.music || (album.year ? `${album.year} • Album` : 'Album')}
        </p>
      </div>
    </div>
  );
};

export default AlbumCard;
