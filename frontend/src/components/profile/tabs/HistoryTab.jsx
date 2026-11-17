import React, { useState } from 'react';
import { History, Trash2 } from 'lucide-react';
import ListShell from './ListShell';
import SongRow from './SongRow';
import { usePagedList } from '../../../hooks/usePagedList';
import { usersApi, historyApi } from '../../../lib/communityApi';
import { useAudio } from '../../../context/AudioContext';
import { timeAgo } from '../../../lib/format';

const HistoryTab = ({ username, isSelf, onCleared }) => {
  const { currentSong, isPlaying, playSong } = useAudio();
  const list = usePagedList((offset) => usersApi.tab(username, 'history', { offset }), [username]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const clear = async () => {
    try {
      await historyApi.clear();
      list.setItems([]);
      list.setTotal(0);
      setConfirming(false);
      onCleared?.();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      {isSelf && list.items.length > 0 && (
        <div className="flex items-center justify-end gap-2 mb-2">
          {confirming ? (
            <>
              <span className="text-xs text-zinc-300">Clear all listening history?</span>
              <button onClick={clear} className="press px-3 py-1.5 rounded-full bg-rose-500 text-white text-xs font-bold">Clear</button>
              <button onClick={() => setConfirming(false)} className="press px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-semibold">Keep</button>
            </>
          ) : (
            <button onClick={() => setConfirming(true)} className="press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-rose-950 text-zinc-300 hover:text-rose-300 text-xs font-semibold">
              <Trash2 className="w-3.5 h-3.5" /> Clear history
            </button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-rose-400 mb-2">{error}</p>}
      <ListShell list={list} label="recently played" emptyIcon={History} emptyTitle="Nothing played yet" emptyText="Songs you listen to will appear here.">
        <div className="space-y-0.5">
          {list.items.map((s, i) => (
            <SongRow key={`${s.id}-${s.playedAt}-${i}`} song={s} active={currentSong?.id === s.id} playing={isPlaying}
              onPlay={() => playSong(s, list.items)}
              right={<span className="text-[11px] text-zinc-500 flex-shrink-0 pr-1">{timeAgo(s.playedAt)}</span>} />
          ))}
        </div>
      </ListShell>
    </>
  );
};

export default HistoryTab;
