import React, { useState, useEffect } from 'react';
import { X, Plus, Check, ListMusic, Loader2 } from 'lucide-react';
import api from '../../services/api';

const AddToPlaylistModal = ({ isOpen, onClose, song, onOpenCreatePlaylist }) => {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);
  const [statusMap, setStatusMap] = useState({});
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const fetchPlaylists = (newOffset = 0, isAppend = false) => {
    if (!isOpen) return;
    setLoading(true);
    api.get('/playlists', { params: { limit: LIMIT, offset: newOffset } })
      .then(({ data }) => {
        if (data.success) {
          const items = data.items || data.playlists || [];
          const more = data.hasMore !== undefined ? data.hasMore : (items.length === LIMIT);
          if (isAppend) {
            setPlaylists((prev) => [...prev, ...items]);
          } else {
            setPlaylists(items);
          }
          setHasMore(more);
          setOffset(newOffset);
        }
      })
      .catch((err) => {
        if (err.response?.status !== 401) {
          console.error('Failed to load playlists:', err);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      fetchPlaylists(0, false);
    }
  }, [isOpen]);

  if (!isOpen || !song) return null;

  const handleAdd = async (playlistId) => {
    setAddingId(playlistId);
    try {
      const { data } = await api.post(`/playlists/${playlistId}/songs`, {
        songId: song.id,
        title: song.title,
        artist: song.artist || song.singers,
        album: song.album,
        image: song.image,
        duration: song.duration,
        streamUrl: song.streamUrl
      });
      if (data.success) {
        setStatusMap((prev) => ({ ...prev, [playlistId]: true }));
      }
    } catch (err) {
      console.error('Failed to add song to playlist:', err);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#18181B] rounded-2xl border border-zinc-800 max-w-sm w-full p-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-sm font-bold text-white mb-1">Add to Playlist</h3>
        <p className="text-xs text-zinc-400 truncate mb-4">
          Song: <span className="text-purple-400 font-medium">{song.title}</span>
        </p>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
          </div>
        ) : playlists.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-xs text-zinc-500 mb-3">You don't have any playlists yet.</p>
            <button
              onClick={() => {
                onClose();
                onOpenCreatePlaylist();
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg shadow transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Playlist</span>
            </button>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-60 overflow-y-auto mb-4">
            {playlists.map((pl) => {
              const isAdded = statusMap[pl.id];
              const isBusy = addingId === pl.id;

              return (
                <div
                  key={pl.id}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-zinc-800/60 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ListMusic className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                    <span className="text-xs font-medium text-white truncate">{pl.name}</span>
                  </div>

                  <button
                    disabled={isAdded || isBusy}
                    onClick={() => handleAdd(pl.id)}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-all flex items-center gap-1 ${
                      isAdded
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-zinc-800 hover:bg-purple-600 text-zinc-300 hover:text-white'
                    }`}
                  >
                    {isBusy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isAdded ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Added</span>
                      </>
                    ) : (
                      <span>Add</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="pt-2 border-t border-zinc-800/60 flex justify-between items-center">
          <button
            onClick={() => {
              onClose();
              onOpenCreatePlaylist();
            }}
            className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Playlist</span>
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddToPlaylistModal;
