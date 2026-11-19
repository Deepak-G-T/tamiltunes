import React, { useState, useEffect } from 'react';
import { MessageSquare, Trash2, Check, ListMusic, Star } from 'lucide-react';
import { adminApi } from '../../services/adminApi';

const AdminModeration = () => {
  const [activeTab, setActiveTab] = useState('comments'); // 'comments' | 'playlists'
  const [comments, setComments] = useState([]);
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
      if (activeTab === 'comments') {
        const res = await adminApi.getReportedComments();
        setComments(res.comments || []);
      } else {
        const res = await adminApi.getPlaylists();
        setPlaylists(res.playlists || []);
      }
    } catch (err) {
      console.error('Failed to load moderation data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleDeleteComment = async (id) => {
    if (!window.confirm('Delete this comment permanently?')) return;
    try {
      await adminApi.deleteComment(id);
      showToast('Comment deleted');
      setComments(comments.filter((c) => c.id !== id));
    } catch (err) {
      showToast('Failed to delete comment');
    }
  };

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

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Moderation & Editorial</h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            Manage community discussions and feature user playlists
          </p>
        </div>

        <div className="flex items-center gap-2 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => setActiveTab('comments')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'comments'
                ? 'bg-brand-500 text-black'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Comments</span>
          </button>
          <button
            onClick={() => setActiveTab('playlists')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'playlists'
                ? 'bg-brand-500 text-black'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span>Playlists</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-zinc-900/60 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : activeTab === 'comments' ? (
        comments.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-[#18181B] border border-zinc-800/80">
            <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-white">No reported or pending comments</p>
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <div
                key={c.id}
                className="p-4 rounded-2xl bg-[#18181B] border border-zinc-800/80 flex items-start justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-white">{c.user?.name || 'User'}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">{c.body}</p>
                </div>

                <button
                  onClick={() => handleDeleteComment(c.id)}
                  className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1 flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )
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
