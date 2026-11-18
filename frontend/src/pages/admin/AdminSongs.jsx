import React, { useState, useEffect } from 'react';
import {
  Music,
  Search,
  Eye,
  EyeOff,
  Trash2,
  Edit,
  GitMerge,
  AlertTriangle,
  X,
  Check,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { adminApi } from '../../services/adminApi';

const AdminSongs = () => {
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'duplicates'
  const [songs, setSongs] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');

  // Edit metadata modal
  const [editSong, setEditSong] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  // Merge modal
  const [mergeModalGroup, setMergeModalGroup] = useState(null);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [mergeError, setMergeError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const fetchSongs = async () => {
    try {
      setLoading(true);
      const res = await adminApi.getSongs({
        page,
        limit: 15,
        search: search.trim() || undefined,
        status: statusFilter
      });
      setSongs(res.songs || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Error fetching songs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDuplicates = async () => {
    try {
      setLoading(true);
      const res = await adminApi.getDuplicates();
      setDuplicates(res.duplicates || []);
    } catch (err) {
      console.error('Error fetching duplicates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'all') {
      fetchSongs();
    } else {
      fetchDuplicates();
    }
  }, [activeTab, page, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchSongs();
  };

  const handleToggleHide = async (song) => {
    try {
      const res = await adminApi.toggleHideSong(song.id);
      showToast(`Song ${res.isHidden ? 'hidden' : 'visible'}`);
      fetchSongs();
    } catch (err) {
      showToast('Failed to toggle song visibility');
    }
  };

  const handleDelete = async (song) => {
    if (!window.confirm(`Are you sure you want to soft delete "${song.title}"?`)) return;
    try {
      await adminApi.deleteSong(song.id);
      showToast(`"${song.title}" soft deleted`);
      fetchSongs();
    } catch (err) {
      showToast('Failed to delete song');
    }
  };

  const handleOpenEdit = (song) => {
    setEditSong(song);
    setEditFormData({
      title: song.title || '',
      artist: song.artist || '',
      album: song.album || '',
      movie: song.movie || '',
      year: song.year || '',
      language: song.language || 'Tamil'
    });
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      await adminApi.updateSong(editSong.id, editFormData);
      showToast('Song metadata updated');
      setEditSong(null);
      fetchSongs();
    } catch (err) {
      showToast('Failed to update song');
    } finally {
      setActionLoading(false);
    }
  };

  const submitMerge = async (e) => {
    e.preventDefault();
    if (!sourceId || !targetId || sourceId === targetId) {
      setMergeError('Please select two distinct songs to merge');
      return;
    }
    if (!adminPassword) {
      setMergeError('Enter your admin password to confirm');
      return;
    }
    try {
      setActionLoading(true);
      setMergeError('');
      await adminApi.mergeSongs({
        sourceSongId: sourceId,
        targetSongId: targetId,
        password: adminPassword
      });
      showToast('Songs successfully merged');
      setMergeModalGroup(null);
      setAdminPassword('');
      fetchDuplicates();
    } catch (err) {
      setMergeError(err.response?.data?.message || 'Failed to merge songs');
    } finally {
      setActionLoading(false);
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

      {/* Header and Mode Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Songs Library</h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            Manage metadata, visibility, duplicates, and canonical song groups
          </p>
        </div>

        <div className="flex items-center gap-2 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'all' ? 'bg-brand-500 text-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            All Songs
          </button>
          <button
            onClick={() => setActiveTab('duplicates')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'duplicates'
                ? 'bg-brand-500 text-black'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <GitMerge className="w-3.5 h-3.5" />
            <span>Duplicates</span>
          </button>
        </div>
      </div>

      {activeTab === 'all' && (
        <>
          {/* Search & Filter */}
          <div className="p-4 rounded-2xl bg-[#18181B] border border-zinc-800/80 flex flex-col md:flex-row items-center gap-3">
            <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search songs by title, artist, or movie..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs placeholder:text-zinc-500 focus:outline-none focus:border-brand-500"
              />
            </form>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-brand-500 w-full md:w-auto"
            >
              <option value="all">All Songs</option>
              <option value="visible">Visible Only</option>
              <option value="hidden">Hidden Only</option>
              <option value="deleted">Soft Deleted</option>
            </select>
          </div>

          {/* Songs List */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-zinc-900/60 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : songs.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-[#18181B] border border-zinc-800/80">
              <Music className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-zinc-300">No songs found</p>
            </div>
          ) : (
            <>
              {/* Mobile Card List */}
              <div className="md:hidden space-y-3">
                {songs.map((s) => (
                  <div
                    key={s.id}
                    className="p-4 rounded-2xl bg-[#18181B] border border-zinc-800/80 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white">{s.title}</h4>
                        <p className="text-[11px] text-zinc-400">
                          {s.artist} {s.movie ? `• ${s.movie}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {s.isHidden && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Hidden
                          </span>
                        )}
                        {s.deletedAt && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            Deleted
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenEdit(s)}
                        className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1"
                      >
                        <Edit className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => handleToggleHide(s)}
                        className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1"
                      >
                        {s.isHidden ? <Eye className="w-3 h-3 text-brand-400" /> : <EyeOff className="w-3 h-3 text-amber-400" />}
                        <span>{s.isHidden ? 'Unhide' : 'Hide'}</span>
                      </button>
                      {!s.deletedAt && (
                        <button
                          onClick={() => handleDelete(s)}
                          className="px-3 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-xs font-semibold flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block rounded-2xl bg-[#18181B] border border-zinc-800/80 overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/60 border-b border-zinc-800/80 text-zinc-400 uppercase font-semibold text-[11px]">
                    <tr>
                      <th className="px-5 py-3.5">Title & Artist</th>
                      <th className="px-4 py-3.5">Movie</th>
                      <th className="px-4 py-3.5">Year</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {songs.map((s) => (
                      <tr key={s.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-white">{s.title}</div>
                          <div className="text-[11px] text-zinc-400">{s.artist}</div>
                        </td>
                        <td className="px-4 py-3.5 text-zinc-300">{s.movie || '—'}</td>
                        <td className="px-4 py-3.5 text-zinc-400 font-mono">{s.year || '—'}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {s.isHidden && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                Hidden
                              </span>
                            )}
                            {s.deletedAt && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                Deleted
                              </span>
                            )}
                            {!s.isHidden && !s.deletedAt && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400">
                                Visible
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(s)}
                              title="Edit metadata"
                              className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleHide(s)}
                              title={s.isHidden ? 'Unhide' : 'Hide'}
                              className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white"
                            >
                              {s.isHidden ? <Eye className="w-3.5 h-3.5 text-brand-400" /> : <EyeOff className="w-3.5 h-3.5" />}
                            </button>
                            {!s.deletedAt && (
                              <button
                                onClick={() => handleDelete(s)}
                                title="Soft delete"
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between text-xs text-zinc-400 pt-2">
                <span>
                  Page {page} of {totalPages} ({total} songs)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Duplicates Tab */}
      {activeTab === 'duplicates' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-[#18181B] border border-zinc-800/80">
            <h3 className="text-sm font-bold text-white">Duplicate Song Detection</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Identifies tracks with identical normalised titles or metadata. Merging reassigns user favorites and playlists to the canonical track.
            </p>
          </div>

          {duplicates.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-[#18181B] border border-zinc-800/80">
              <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-white">No duplicate songs found</p>
              <p className="text-xs text-zinc-500 mt-1">The catalog is clean and deduplicated.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {duplicates.map((group, idx) => (
                <div key={idx} className="p-5 rounded-2xl bg-[#18181B] border border-zinc-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold text-brand-400 uppercase">
                        Group #{idx + 1} ({group.count} tracks)
                      </span>
                      <h4 className="text-sm font-bold text-white">{group.songs[0].title}</h4>
                    </div>

                    <button
                      onClick={() => {
                        setMergeModalGroup(group);
                        setSourceId(group.songs[1]?.id || '');
                        setTargetId(group.songs[0]?.id || '');
                        setAdminPassword('');
                        setMergeError('');
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-black text-xs font-bold flex items-center gap-1.5"
                    >
                      <GitMerge className="w-3.5 h-3.5" />
                      <span>Merge Group</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-zinc-800/60">
                    {group.songs.map((s) => (
                      <div key={s.id} className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs">
                        <p className="font-bold text-white">{s.title}</p>
                        <p className="text-zinc-400 text-[11px]">{s.artist} • {s.movie || 'No Movie'}</p>
                        <p className="text-zinc-500 font-mono text-[10px] mt-1">ID: {s.id}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Metadata Modal */}
      {editSong && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#18181B] border border-zinc-800 p-6 shadow-2xl relative">
            <button
              onClick={() => setEditSong(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-4">Edit Song Metadata</h3>

            <form onSubmit={submitEdit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-400 mb-1 block">Title</label>
                <input
                  type="text"
                  value={editFormData.title}
                  onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-400 mb-1 block">Artist</label>
                  <input
                    type="text"
                    value={editFormData.artist}
                    onChange={(e) => setEditFormData({ ...editFormData, artist: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-400 mb-1 block">Movie</label>
                  <input
                    type="text"
                    value={editFormData.movie}
                    onChange={(e) => setEditFormData({ ...editFormData, movie: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-400 mb-1 block">Year</label>
                  <input
                    type="number"
                    value={editFormData.year}
                    onChange={(e) => setEditFormData({ ...editFormData, year: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-400 mb-1 block">Language</label>
                  <input
                    type="text"
                    value={editFormData.language}
                    onChange={(e) => setEditFormData({ ...editFormData, language: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditSong(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-black text-xs font-bold"
                >
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Merge Confirmation Modal */}
      {mergeModalGroup && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#18181B] border border-zinc-800 p-6 shadow-2xl relative">
            <button
              onClick={() => setMergeModalGroup(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Merge Duplicate Track</h3>
                <p className="text-xs text-zinc-400">Reassigns user history & favorites</p>
              </div>
            </div>

            <form onSubmit={submitMerge} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-400 mb-1 block">
                  Source Track (will be archived/merged)
                </label>
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
                >
                  {mergeModalGroup.songs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-400 mb-1 block">
                  Target Canonical Track (will remain primary)
                </label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
                >
                  {mergeModalGroup.songs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-400 mb-1 block">
                  Re-enter Admin Password to Confirm
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Your admin password"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-brand-500"
                />
                {mergeError && (
                  <p className="text-[11px] text-rose-400 mt-1.5">{mergeError}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMergeModalGroup(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-black text-xs font-bold"
                >
                  {actionLoading ? 'Merging...' : 'Confirm Merge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSongs;
