import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History as HistoryIcon, Play, Trash2, Clock, Loader2, Music } from 'lucide-react';
import { useAudio } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const formatTimeAgo = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffInMinutes = Math.floor((now - date) / (1000 * 60));

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
};

const History = () => {
  const { currentSong, playSong } = useAudio();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const fetchHistory = (newOffset = 0, isAppend = false) => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    if (isAppend) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    api.get('/history', { params: { limit: LIMIT, offset: newOffset } })
      .then(({ data }) => {
        if (data.success) {
          const items = data.items || data.history || [];
          const totalCount = data.total !== undefined ? data.total : (items.length + newOffset);
          const more = data.hasMore !== undefined ? data.hasMore : (items.length === LIMIT && items.length + newOffset < totalCount);

          if (isAppend) {
            setHistoryList((prev) => [...prev, ...items]);
          } else {
            setHistoryList(items);
          }
          setTotal(totalCount);
          setHasMore(more);
          setOffset(newOffset);
        }
      })
      .catch((err) => {
        if (err.response?.status !== 401) {
          console.error('Error fetching listening history:', err);
        }
      })
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  };

  useEffect(() => {
    fetchHistory(0, false);
  }, [isAuthenticated]);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    fetchHistory(offset + LIMIT, true);
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Clear all your listening history?')) return;
    try {
      const { data } = await api.delete('/history');
      if (data.success) {
        setHistoryList([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="py-20 text-center max-w-md mx-auto space-y-4 animate-in fade-in">
        <div className="w-16 h-16 rounded-full bg-purple-600/20 text-purple-400 flex items-center justify-center mx-auto">
          <HistoryIcon className="w-8 h-8 text-sky-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Listening History</h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Log in to track your recently played Tamil songs and easily jump back into your favorite sessions.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="px-6 py-2.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg transition-all"
        >
          Sign In
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-zinc-400 gap-3">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        <p className="text-xs">Loading listening history...</p>
      </div>
    );
  }

  const songsList = historyList.map((item) => item.song || item);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <HistoryIcon className="w-6 h-6 text-sky-400" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Listening History</h1>
        </div>

        {historyList.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {historyList.length === 0 ? (
        <div className="py-20 text-center text-zinc-500 text-xs">
          No songs played yet. Start streaming your favorite Tamil tunes to see them here!
        </div>
      ) : (
        <div className="space-y-1">
          {historyList.map((item, idx) => {
            const song = item.song || item;
            const isThisSong = currentSong?.id === (song.id || item.songId);

            return (
              <div
                key={item.id || idx}
                onClick={() => playSong(song, songsList)}
                className={`flex items-center justify-between p-3 rounded-xl hover:bg-zinc-800/40 cursor-pointer group transition-colors ${
                  isThisSong ? 'bg-purple-500/10 border border-purple-500/20' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
                    <img
                      src={song.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80'}
                      alt={song.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Play className="w-4 h-4 text-white fill-white" />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4 className={`text-sm font-semibold truncate ${isThisSong ? 'text-purple-400' : 'text-white'}`}>
                      {song.title}
                    </h4>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                      {song.artist || song.singers}
                    </p>
                  </div>
                </div>

                <div className="text-right text-[11px] text-zinc-500 font-medium ml-4">
                  {formatTimeAgo(item.playedAt || item.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="pt-4 text-center">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="px-6 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold transition-all inline-flex items-center gap-2 border border-zinc-700/60"
          >
            {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />}
            <span>{loadingMore ? 'Loading more...' : 'Load more history'}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default History;
