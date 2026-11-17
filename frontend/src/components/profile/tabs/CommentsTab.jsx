import React, { useState } from 'react';
import { MessageCircle, Heart, Play, Loader2 } from 'lucide-react';
import ListShell from './ListShell';
import { usePagedList } from '../../../hooks/usePagedList';
import { usersApi } from '../../../lib/communityApi';
import { timeAgo, formatTimestamp } from '../../../lib/format';
import { useAudio } from '../../../context/AudioContext';
import api from '../../../services/api';

const CommentsTab = ({ username, isSelf }) => {
  const { playSong, showToast } = useAudio();
  const list = usePagedList((offset) => usersApi.tab(username, 'comments', { offset }), [username]);
  const [opening, setOpening] = useState(null);

  // Comments store only a song id, so resolve the song before playing it
  const openSong = async (songId) => {
    setOpening(songId);
    try {
      const { data } = await api.get(`/music/song/${encodeURIComponent(songId)}`);
      const song = data.song || data.data;
      if (!song) throw new Error('Song not found');
      playSong(song, [song]);
    } catch {
      showToast?.('Could not open that song right now.');
    } finally {
      setOpening(null);
    }
  };

  return (
    <ListShell list={list} label="comments" emptyIcon={MessageCircle} emptyTitle="No comments yet"
      emptyText={isSelf ? 'Open any song, tap Comments and say something.' : 'This person has not commented yet.'}>
      <ul className="space-y-2">
        {list.items.map((c) => (
          <li key={c.id} className="rounded-xl bg-surface-3 p-3">
            <p dir="auto" lang="ta" className="text-[15px] leading-relaxed text-zinc-100 whitespace-pre-wrap break-words">{c.body}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
              <span>{timeAgo(c.createdAt)}</span>
              <span className="inline-flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> {c.likeCount}</span>
              {c.parentId && <span>Reply</span>}
              {c.timestampSec != null && <span className="tabular-nums">at {formatTimestamp(c.timestampSec)}</span>}
              <button type="button" onClick={() => openSong(c.songId)} disabled={opening === c.songId}
                className="press ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-500/15 text-brand-300 font-semibold hover:bg-brand-500/25">
                {opening === c.songId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Go to song
              </button>
            </div>
          </li>
        ))}
      </ul>
    </ListShell>
  );
};

export default CommentsTab;
