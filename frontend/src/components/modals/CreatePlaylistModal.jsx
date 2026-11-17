import React, { useState } from 'react';
import { X, ListMusic, Loader2 } from 'lucide-react';
import api from '../../services/api';

const CreatePlaylistModal = ({ isOpen, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Playlist name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/playlists', { name: name.trim(), description: description.trim() });
      if (data.success) {
        setName('');
        setDescription('');
        if (onCreated) onCreated(data.playlist);
        onClose();
      } else {
        setError(data.message || 'Failed to create playlist');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to create playlist');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-2 rounded-2xl border border-zinc-800 max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center">
            <ListMusic className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Create New Playlist</h3>
            <p className="text-xs text-zinc-400">Organize your favorite Tamil songs</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Playlist Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g., AR Rahman Melodies, Ilaiyaraaja 80s Hits"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700/80 text-white text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder-zinc-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Description (Optional)
            </label>
            <textarea
              rows={3}
              placeholder="Add an optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-700/80 text-white text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder-zinc-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-black text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-brand-600/30 transition-all disabled:opacity-50"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Create Playlist</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreatePlaylistModal;
