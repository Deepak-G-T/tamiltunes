import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ListMusic, Plus, Pencil, Trash2, Lock, Globe, Check, X } from 'lucide-react';
import ListShell from './ListShell';
import SafeImage from '../../common/SafeImage';
import { usePagedList } from '../../../hooks/usePagedList';
import { usersApi, playlistsApi } from '../../../lib/communityApi';

/** Playlists: public ones for visitors; full create / rename / delete / visibility for the owner. */
const PlaylistsTab = ({ username, isSelf, onCountChange }) => {
  const list = usePagedList((offset) => usersApi.tab(username, 'playlists', { offset }), [username]);
  const [editing, setEditing] = useState(null); // playlist id being renamed
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState('');

  const guard = async (fn) => {
    setError('');
    try { await fn(); } catch (e) { setError(e.message); }
  };

  const create = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    guard(async () => {
      const { playlist } = await playlistsApi.create({ name: newName.trim() });
      list.setItems((prev) => [{ id: playlist.id, name: playlist.name, description: null, isPublic: false, songCount: 0, cover: null, createdAt: playlist.createdAt }, ...prev]);
      list.setTotal((t) => t + 1);
      onCountChange?.(1);
      setNewName('');
      setCreating(false);
    });
  };

  const rename = (p) => guard(async () => {
    const name = draft.trim();
    if (!name || name === p.name) { setEditing(null); return; }
    await playlistsApi.update(p.id, { name });
    list.setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, name } : x)));
    setEditing(null);
  });

  const toggleVisibility = (p) => guard(async () => {
    const isPublic = !p.isPublic;
    list.setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, isPublic } : x))); // optimistic
    try {
      await playlistsApi.update(p.id, { name: p.name, isPublic });
    } catch (e) {
      list.setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, isPublic: p.isPublic } : x)));
      throw e;
    }
  });

  const remove = (p) => guard(async () => {
    await playlistsApi.remove(p.id);
    list.setItems((prev) => prev.filter((x) => x.id !== p.id));
    list.setTotal((t) => Math.max(0, t - 1));
    onCountChange?.(-1);
    setConfirmDelete(null);
  });

  return (
    <>
      {isSelf && (
        <div className="mb-3">
          {creating ? (
            <form onSubmit={create} className="flex gap-2">
              <label htmlFor="new-playlist" className="sr-only">Playlist name</label>
              <input id="new-playlist" autoFocus maxLength={80} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Playlist name"
                className="flex-1 min-w-0 rounded-full bg-surface-3 border border-white/10 focus:border-brand-400 focus:outline-none px-4 py-2 text-sm text-white" />
              <button type="submit" disabled={!newName.trim()} className="press px-4 py-2 rounded-full bg-brand-500 text-black text-sm font-bold disabled:opacity-40">Create</button>
              <button type="button" onClick={() => setCreating(false)} aria-label="Cancel" className="press p-2 rounded-full bg-white/10"><X className="w-4 h-4" /></button>
            </form>
          ) : (
            <button type="button" onClick={() => setCreating(true)} className="press inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-sm font-semibold text-white">
              <Plus className="w-4 h-4" /> New playlist
            </button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-rose-400 mb-2">{error}</p>}
      <ListShell list={list} label="playlists" emptyIcon={ListMusic} emptyTitle={isSelf ? 'No playlists yet' : 'No public playlists'}
        emptyText={isSelf ? 'Create one to collect your favourite songs.' : 'Playlists shared publicly will appear here.'}>
        <ul className="space-y-1">
          {list.items.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
              <Link to={`/playlist/${p.id}`} aria-label={`Open ${p.name}`} className="w-12 h-12 rounded-lg overflow-hidden bg-surface-3 flex-shrink-0 flex items-center justify-center">
                {p.cover ? <SafeImage src={p.cover} alt="" className="w-full h-full object-cover" /> : <ListMusic className="w-5 h-5 text-zinc-500" />}
              </Link>
              <div className="min-w-0 flex-1">
                {editing === p.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); rename(p); }} className="flex items-center gap-1">
                    <label htmlFor={`rn-${p.id}`} className="sr-only">Rename playlist</label>
                    <input id={`rn-${p.id}`} autoFocus maxLength={80} value={draft} onChange={(e) => setDraft(e.target.value)}
                      className="flex-1 min-w-0 rounded-md bg-surface-3 border border-white/10 focus:border-brand-400 focus:outline-none px-2 py-1 text-sm text-white" />
                    <button type="submit" aria-label="Save name" className="press p-1.5 rounded-full bg-brand-500 text-black"><Check className="w-4 h-4" /></button>
                    <button type="button" onClick={() => setEditing(null)} aria-label="Cancel rename" className="press p-1.5 rounded-full bg-white/10"><X className="w-4 h-4" /></button>
                  </form>
                ) : (
                  <Link to={`/playlist/${p.id}`} className="block text-sm font-semibold text-white truncate hover:underline">{p.name}</Link>
                )}
                <p className="text-xs text-zinc-400 flex items-center gap-1.5">
                  {p.songCount} {p.songCount === 1 ? 'song' : 'songs'}
                  {isSelf && <span className="inline-flex items-center gap-0.5">· {p.isPublic ? <><Globe className="w-3 h-3" /> Public</> : <><Lock className="w-3 h-3" /> Private</>}</span>}
                </p>
              </div>
              {isSelf && editing !== p.id && (
                confirmDelete === p.id ? (
                  <span className="flex items-center gap-1">
                    <button onClick={() => remove(p)} className="press px-3 py-1.5 rounded-full bg-rose-500 text-white text-xs font-bold">Delete</button>
                    <button onClick={() => setConfirmDelete(null)} className="press px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-semibold">Keep</button>
                  </span>
                ) : (
                  <span className="flex items-center">
                    <button onClick={() => toggleVisibility(p)} role="switch" aria-checked={p.isPublic} aria-label={`${p.name}: ${p.isPublic ? 'public' : 'private'}. Toggle visibility`}
                      className="press p-2 rounded-full text-zinc-300 hover:bg-white/10">{p.isPublic ? <Globe className="w-4 h-4 text-brand-400" /> : <Lock className="w-4 h-4" />}</button>
                    <button onClick={() => { setEditing(p.id); setDraft(p.name); }} aria-label={`Rename ${p.name}`} className="press p-2 rounded-full text-zinc-300 hover:bg-white/10"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => setConfirmDelete(p.id)} aria-label={`Delete ${p.name}`} className="press p-2 rounded-full text-zinc-300 hover:text-rose-400 hover:bg-white/10"><Trash2 className="w-4 h-4" /></button>
                  </span>
                )
              )}
            </li>
          ))}
        </ul>
      </ListShell>
    </>
  );
};

export default PlaylistsTab;
