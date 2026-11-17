import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Play, Pause, Trash2, Clock, Loader2, Music2 } from 'lucide-react';
import CoverImage from '../components/common/CoverImage';
import Equalizer from '../components/common/Equalizer';
import { useAudio } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '3:30';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const Favorites = () => {
  const { currentSong, isPlaying, playSong, togglePlay } = useAudio();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const fetchFavorites = (newOffset = 0, isAppend = false) => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    if (isAppend) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    api.get('/favorites', { params: { limit: LIMIT, offset: newOffset } })
      .then(({ data }) => {
        if (data.success) {
          const items = data.items || data.favorites || [];
          const totalCount = data.total !== undefined ? data.total : (items.length + newOffset);
          const more = data.hasMore !== undefined ? data.hasMore : (items.length === LIMIT && items.length + newOffset < totalCount);

          if (isAppend) {
            setFavorites((prev) => [...prev, ...items]);
          } else {
            setFavorites(items);
          }
          setTotal(totalCount);
          setHasMore(more);
          setOffset(newOffset);
        }
      })
      .catch((err) => {
        if (err.response?.status !== 401) {
          console.error('Error fetching favorites:', err);
        }
      })
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  };

  useEffect(() => {
    fetchFavorites(0, false);
  }, [isAuthenticated]);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    fetchFavorites(offset + LIMIT, true);
  };

  const handleRemove = async (songId, e) => {
    e.stopPropagation();
    try {
      const { data } = await api.delete(`/favorites/${songId}`);
      if (data.success) {
        setFavorites((prev) => prev.filter((f) => (f.songId || f.id) !== songId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePlayAll = () => {
    if (favorites.length === 0) return;
    const songsList = favorites.map((f) => f.song || f);
    playSong(songsList[0], songsList);
  };

  if (!isAuthenticated) {
    return (
      <div className="py-20 text-center max-w-md mx-auto space-y-4 animate-in fade-in">
        <div className="w-16 h-16 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center mx-auto">
          <Heart className="w-8 h-8 text-rose-500" />
        </div>
        <h2 className="text-xl font-bold text-white">Log in to view your Favourites</h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Save your cherished Tamil melodies, film tracks, and acoustic instrumentals in one personalized library.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="px-8 py-3 rounded-full bg-brand-500 hover:bg-brand-400 text-black text-sm font-bold shadow-lg transition-all"
        >
          Sign In
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-zinc-400 gap-3">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <p className="text-xs">Loading your favourites...</p>
      </div>
    );
  }

  const songsList = favorites.map((f) => f.song || f);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="cover-wash-strong -mx-4 md:-mx-6 -mt-4 px-4 md:px-6 pt-10 pb-6 flex flex-col md:flex-row items-center md:items-end gap-6">
        <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-md overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.6)] flex-shrink-0 bg-gradient-to-br from-brand-700 to-brand-300 flex items-center justify-center">
          <Heart className="w-20 h-20 text-white fill-white" />
        </div>

        <div className="flex-1 text-center md:text-left space-y-2">
          <span className="text-xs font-bold text-white">
            Playlist
            <span lang="ta" className="ml-2 font-semibold text-accent-300">· பிடித்த பாடல்கள்</span>
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Favourite Songs
          </h1>
          <p className="text-xs text-zinc-400">
            {total || favorites.length} saved Tamil songs
          </p>

          {favorites.length > 0 && (
            <div className="pt-2">
              <button
                onClick={handlePlayAll}
                className="px-8 py-3 rounded-full bg-brand-500 hover:bg-brand-400 text-black text-sm font-bold flex items-center gap-2 shadow-lg shadow-brand-600/30 hover:scale-105 active:scale-95 transition-all mx-auto md:mx-0"
              >
                <Play className="w-4 h-4 fill-black" />
                <span>Play All Favourites</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Songs Table */}
      <div className="space-y-1">
        <div className="grid grid-cols-12 px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-zinc-500 border-b border-white/10">
          <div className="col-span-1">#</div>
          <div className="col-span-6 sm:col-span-7">Title</div>
          <div className="col-span-3 sm:col-span-2 hidden sm:block">Album</div>
          <div className="col-span-5 sm:col-span-2 text-right flex items-center justify-end gap-1">
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>

        {favorites.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-xs space-y-2">
            <p className="text-zinc-400 font-medium">You haven't added any songs to favourites yet.</p>
            <p>Click the heart icon on any Tamil track to save it here.</p>
          </div>
        ) : (
          favorites.map((fav, idx) => {
            const song = fav.song || fav;
            const isThisSong = currentSong?.id === (song.id || fav.songId);

            return (
              <div
                key={fav.id || idx}
                onClick={() => playSong(song, songsList)}
                className={`grid grid-cols-12 items-center px-4 py-3 rounded-md hover:bg-white/10 cursor-pointer group transition-colors ${
                  isThisSong ? 'bg-white/10 text-brand-400' : 'text-zinc-300'
                }`}
              >
                <div className="col-span-1 text-xs text-zinc-500 group-hover:hidden">
                  {isThisSong && isPlaying ? <Equalizer /> : idx + 1}
                </div>
                <div className="col-span-1 hidden group-hover:block">
                  <Play className="w-4 h-4 text-brand-400 fill-brand-400" />
                </div>

                <div className="col-span-6 sm:col-span-7 min-w-0 pr-2 flex items-center gap-3">
                  <CoverImage src={song.image} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold truncate ${isThisSong ? 'text-brand-400' : 'text-white'}`}>
                      {song.title}
                    </p>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                      {song.artist || song.singers}
                    </p>
                  </div>
                </div>

                <div className="col-span-3 sm:col-span-2 hidden sm:block text-xs text-zinc-400 truncate">
                  {song.album || 'Tamil Single'}
                </div>

                <div className="col-span-5 sm:col-span-2 flex items-center justify-end gap-3 text-xs text-zinc-400">
                  <button
                    onClick={(e) => handleRemove(song.id || fav.songId, e)}
                    title="Remove from favourites"
                    className="hover:text-rose-400 transition-colors p-1"
                  >
                    <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
                  </button>
                  <span className="font-mono text-[11px] tabular-nums">
                    {formatDuration(song.duration)}
                  </span>
                </div>
              </div>
            );
          })
        )}

        {hasMore && (
          <div className="pt-4 text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-6 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold transition-all inline-flex items-center gap-2 border border-zinc-700/60"
            >
              {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />}
              <span>{loadingMore ? 'Loading more...' : 'Load more favourites'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Favorites;
