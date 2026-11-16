import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Play,
  Pause,
  Trash2,
  Edit2,
  Clock,
  ListMusic,
  ArrowLeft,
  Loader2,
  X
} from 'lucide-react';
import { useAudio } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '3:30';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const PlaylistDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentSong, isPlaying, playSong, togglePlay } = useAudio();
  const { isAuthenticated } = useAuth();

  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const fetchPlaylist = () => {
    setLoading(true);
    api.get(`/playlists/${id}`)
      .then(({ data }) => {
        if (data.success && data.playlist) {
          setPlaylist(data.playlist);
          setEditName(data.playlist.name);
          setEditDesc(data.playlist.description || '');
        } else {
          setError('Playlist not found');
        }
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to fetch playlist.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPlaylist();
  }, [id]);

  const handlePlayAll = () => {
    if (!playlist?.songs || playlist.songs.length === 0) return;
    const songsList = playlist.songs.map((ps) => ps.song || ps);
    playSong(songsList[0], songsList);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editName.trim()) return;

    try {
      const { data } = await api.put(`/playlists/${id}`, {
        name: editName.trim(),
        description: editDesc.trim()
      });
      if (data.success) {
        setPlaylist((prev) => ({
          ...prev,
          name: editName.trim(),
          description: editDesc.trim()
        }));
        setIsEditing(false);
      }
    } catch (err) {
      alert('Failed to update playlist');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete playlist "${playlist.name}"?`)) return;

    try {
      const { data } = await api.delete(`/playlists/${id}`);
      if (data.success) {
        navigate('/favorites');
      }
    } catch (err) {
      alert('Failed to delete playlist');
    }
  };

  const handleRemoveSong = async (songId, e) => {
    e.stopPropagation();
    try {
      const { data } = await api.delete(`/playlists/${id}/songs/${songId}`);
      if (data.success) {
        setPlaylist((prev) => ({
          ...prev,
          songs: prev.songs.filter((s) => (s.songId || s.id) !== songId)
        }));
      }
    } catch (err) {
      alert('Failed to remove song');
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-zinc-400 gap-3">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        <p className="text-xs">Loading playlist...</p>
      </div>
    );
  }

  if (error || !playlist) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-zinc-400">{error || 'Playlist not found.'}</p>
        <button
          onClick={() => navigate('/favorites')}
          className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-xs font-semibold hover:bg-zinc-700"
        >
          View Library
        </button>
      </div>
    );
  }

  const songsList = (playlist.songs || []).map((item) => item.song || item);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      {/* Playlist Header */}
      <div className="flex flex-col md:flex-row items-center md:items-end gap-6 bg-gradient-to-b from-purple-900/30 to-zinc-900/40 p-6 rounded-2xl border border-zinc-800/60">
        <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-xl overflow-hidden shadow-2xl flex-shrink-0 bg-gradient-to-tr from-purple-800 to-indigo-900 flex items-center justify-center">
          <ListMusic className="w-20 h-20 text-purple-300/80" />
        </div>

        <div className="flex-1 text-center md:text-left space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-purple-400">
            Playlist
          </span>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            {playlist.name}
          </h1>
          {playlist.description && (
            <p className="text-sm text-zinc-300">
              {playlist.description}
            </p>
          )}
          <p className="text-xs text-zinc-400">
            Created by {playlist.user?.name || 'You'} • {songsList.length} songs
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-3">
            {songsList.length > 0 && (
              <button
                onClick={handlePlayAll}
                className="px-6 py-2.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-purple-600/30 hover:scale-105 active:scale-95 transition-all"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Play All</span>
              </button>
            )}

            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-2.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
              title="Edit playlist name & description"
            >
              <Edit2 className="w-4 h-4" />
            </button>

            <button
              onClick={handleDelete}
              className="p-2.5 rounded-full bg-zinc-800 hover:bg-rose-950 text-zinc-300 hover:text-rose-400 transition-colors"
              title="Delete playlist"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Inline Editing Form */}
      {isEditing && (
        <form onSubmit={handleUpdate} className="p-4 rounded-xl bg-[#18181B] border border-zinc-700/80 space-y-3 max-w-lg">
          <h3 className="text-sm font-bold text-white">Edit Playlist Details</h3>
          <input
            type="text"
            required
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-purple-500"
            placeholder="Playlist name"
          />
          <textarea
            rows={2}
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-purple-500 resize-none"
            placeholder="Optional description"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
            >
              Save Changes
            </button>
          </div>
        </form>
      )}

      {/* Songs Table */}
      <div className="space-y-1">
        <div className="grid grid-cols-12 px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-zinc-500 border-b border-zinc-800">
          <div className="col-span-1">#</div>
          <div className="col-span-6 sm:col-span-7">Title</div>
          <div className="col-span-3 sm:col-span-2 hidden sm:block">Album</div>
          <div className="col-span-5 sm:col-span-2 text-right flex items-center justify-end gap-1">
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>

        {songsList.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-xs">
            This playlist has no songs yet. Search for Tamil songs and add them here!
          </div>
        ) : (
          songsList.map((song, idx) => {
            const isThisSong = currentSong?.id === song.id;

            return (
              <div
                key={song.id || idx}
                onClick={() => playSong(song, songsList)}
                className={`grid grid-cols-12 items-center px-4 py-3 rounded-lg hover:bg-zinc-800/50 cursor-pointer group transition-colors ${
                  isThisSong ? 'bg-purple-500/10 text-purple-400' : 'text-zinc-300'
                }`}
              >
                <div className="col-span-1 text-xs text-zinc-500 group-hover:hidden">
                  {idx + 1}
                </div>
                <div className="col-span-1 hidden group-hover:block">
                  <Play className="w-4 h-4 text-purple-400 fill-purple-400" />
                </div>

                <div className="col-span-6 sm:col-span-7 min-w-0 pr-2 flex items-center gap-3">
                  <img
                    src={song.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=80&auto=format&fit=crop&q=80'}
                    alt={song.title}
                    className="w-9 h-9 rounded object-cover flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold truncate ${isThisSong ? 'text-purple-400' : 'text-white'}`}>
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
                    onClick={(e) => handleRemoveSong(song.id, e)}
                    title="Remove from playlist"
                    className="opacity-0 group-hover:opacity-100 hover:text-rose-400 transition-opacity p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <span className="font-mono text-[11px] tabular-nums">
                    {formatDuration(song.duration)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default PlaylistDetail;
