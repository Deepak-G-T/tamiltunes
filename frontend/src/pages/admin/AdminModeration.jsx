import React, { useState, useEffect } from 'react';
import { Check, ListMusic, Star } from 'lucide-react';
import { adminApi } from '../../services/adminApi';

const AdminModeration = () => {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await adminApi.getPlaylists();
      setPlaylists(res.playlists || []);
    } catch (err) {
      console.error('Failed to load moderation data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleFeaturePlaylist = async (pl) => {
    try {
      const res = await adminApi.toggleFeaturePlaylist(pl.id);
      showToast(`Playlist ${res.isFeatured ? 'featured' : 'unfeatured'}`);
      setPlaylists(
        playlists.map((p) => (p.id === pl.id ? { ...p, isFeatured: res.isFeatured } : p))
      );
    } catch (err) {
      showToast('Failed to update playlist');
    }
  };

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 border border-brand-500/50 text-white text-xs font-semibold shadow-2xl flex items-center gap-2">
          <Check className="w-4 h-4 text-brand-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Moderation & Editorial</h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
          Feature user playlists and manage editorial content
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-zinc-900/60 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#18181B] border border-zinc-800/80">
          <ListMusic className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-white">No public playlists found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              className="p-4 rounded-2xl bg-[#18181B] border border-zinc-800/80 flex items-center justify-between"
            >
              <div>
                <h4 className="text-xs font-bold text-white">{pl.name}</h4>
                <p className="text-[11px] text-zinc-400">{pl.description || 'User playlist'}</p>
              </div>

              <button
                onClick={() => handleToggleFeaturePlaylist(pl)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  pl.isFeatured
                    ? 'bg-amber-500 text-black font-bold'
                    : 'bg-zinc-800 text-zinc-300 hover:text-white'
                }`}
              >
                <Star className="w-3.5 h-3.5" />
                <span>{pl.isFeatured ? 'Featured' : 'Feature'}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminModeration;
