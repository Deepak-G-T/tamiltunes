import React, { useEffect, useState } from 'react';
import { listBlocks, unblockSongById } from '../../lib/blocksApi';

/** Settings: songs marked "Don't recommend this", each with an Unblock button. */
const BlockedSongs = () => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    listBlocks().then((list) => { if (live) setItems(list); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, []);
  const unblock = async (song) => {
    setError('');
    try { await unblockSongById(song.songId || song.id); setItems((list) => list.filter((x) => x !== song)); } catch { setError('Could not unblock. Try again.'); }
  };
  if (!items?.length) return <p className="text-xs text-zinc-500 py-2" data-testid="blocked-empty">Songs you mark "Don't recommend this" appear here.</p>;
  return (
    <div data-testid="blocked-list">
      <ul role="list" className="divide-y divide-white/5">
        {items.map((song) => (
          <li key={song.songId || song.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white truncate">{song.title}</p>
              <p className="text-xs text-zinc-400 truncate">{song.artist}</p>
            </div>
            <button type="button" onClick={() => unblock(song)} className="press min-h-11 px-3 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-white">Unblock</button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </div>
  );
};
export default BlockedSongs;
