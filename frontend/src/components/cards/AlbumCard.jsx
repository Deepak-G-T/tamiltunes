import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Disc, Play } from 'lucide-react';

const MUSIC_COVER_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%233b185f'/%3E%3Cstop offset='50%25' stop-color='%231f1338'/%3E%3Cstop offset='100%25' stop-color='%230f091f'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' rx='16' fill='url(%23bg)'/%3E%3Ccircle cx='150' cy='150' r='60' fill='%23a855f7' opacity='0.2'/%3E%3Cpath d='M135 180V120l50-14v54m-50 0a16 16 0 11-32 0 16 16 0 0132 0zm50-14a16 16 0 11-32 0 16 16 0 0132 0z' stroke='%23c084fc' stroke-width='6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const AlbumCard = ({ album }) => {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/album/${album.id}`)}
      className="group relative bg-[#18181B] hover:bg-[#27272A] p-3 rounded-xl transition-all duration-200 cursor-pointer border border-zinc-800/40 hover:border-zinc-700/60 shadow-sm hover:shadow-xl select-none"
    >
      <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-3 bg-zinc-900 shadow-inner">
        <img
          src={album.image || MUSIC_COVER_FALLBACK}
          alt={album.name || album.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = MUSIC_COVER_FALLBACK;
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
