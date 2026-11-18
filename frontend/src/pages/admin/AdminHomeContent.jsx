import React, { useState, useEffect } from 'react';
import { Home, Plus, X, Check, Save } from 'lucide-react';
import { adminApi } from '../../services/adminApi';

const AdminHomeContent = () => {
  const [chips, setChips] = useState([]);
  const [newChip, setNewChip] = useState('');
  const [featuredSongs, setFeaturedSongs] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const loadContent = async () => {
    try {
      setLoading(true);
      const res = await adminApi.getHomeContent();
      setChips(res.categoryChips || ['All', 'Romance', 'Mass', 'Melody', '90s Hits']);
      setFeaturedSongs((res.featuredSongs || []).join(', '));
    } catch (err) {
      console.error('Failed to load home content:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContent();
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleAddChip = (e) => {
    e.preventDefault();
    const trimmed = newChip.trim();
    if (!trimmed || chips.includes(trimmed)) return;
    setChips([...chips, trimmed]);
    setNewChip('');
  };

  const handleRemoveChip = (chipToRemove) => {
    setChips(chips.filter((c) => c !== chipToRemove));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const songIds = featuredSongs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await adminApi.updateHomeContent({
        categoryChips: chips,
        featuredSongs: songIds
      });
      showToast('Home content successfully updated');
    } catch (err) {
      showToast('Failed to save home content');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-zinc-500 animate-pulse">Loading home settings...</div>;
  }

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 border border-brand-500/50 text-white text-xs font-semibold shadow-2xl flex items-center gap-2">
          <Check className="w-4 h-4 text-brand-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Home Page Editorial</h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
          Configure category chips and pin featured songs for the Speed Dial & Home feed
        </p>
      </div>

      {/* Category Chips Manager */}
      <div className="p-6 rounded-2xl bg-[#18181B] border border-zinc-800/80 space-y-4">
        <h3 className="text-sm font-bold text-white">Category Filter Chips</h3>
        <p className="text-xs text-zinc-400">
          Chips displayed at the top of the Home feed to filter by genre or mood:
        </p>

        <div className="flex flex-wrap gap-2 pt-2">
          {chips.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800 text-zinc-200 text-xs font-semibold"
            >
              <span>{chip}</span>
              {chip !== 'All' && (
                <button
                  type="button"
                  onClick={() => handleRemoveChip(chip)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>

        <form onSubmit={handleAddChip} className="flex gap-2 pt-2 max-w-sm">
          <input
            type="text"
            value={newChip}
            onChange={(e) => setNewChip(e.target.value)}
            placeholder="Add new category (e.g. Kuthu, Folk)..."
            className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </button>
        </form>
      </div>

      {/* Featured Songs */}
      <div className="p-6 rounded-2xl bg-[#18181B] border border-zinc-800/80 space-y-4">
        <h3 className="text-sm font-bold text-white">Featured Songs (Pinned Song IDs)</h3>
        <p className="text-xs text-zinc-400">
          Comma-separated list of song IDs to feature in hero promotions and default Speed Dial slots:
        </p>

        <textarea
          value={featuredSongs}
          onChange={(e) => setFeaturedSongs(e.target.value)}
          rows={3}
          placeholder="song_id_1, song_id_2, song_id_3..."
          className="w-full p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs font-mono focus:outline-none focus:border-brand-500"
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-black text-xs font-bold flex items-center gap-2 transition-transform active:scale-95"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : 'Save Editorial Content'}</span>
        </button>
      </div>
    </div>
  );
};

export default AdminHomeContent;
