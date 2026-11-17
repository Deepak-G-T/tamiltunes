import React from 'react';
import { Heart } from 'lucide-react';
import ListShell from './ListShell';
import SongRow from './SongRow';
import { usePagedList } from '../../../hooks/usePagedList';
import { usersApi } from '../../../lib/communityApi';
import { useAudio } from '../../../context/AudioContext';

const LikedTab = ({ username, isSelf }) => {
  const { currentSong, isPlaying, playSong } = useAudio();
  const list = usePagedList((offset) => usersApi.tab(username, 'liked', { offset }), [username]);
  return (
    <ListShell list={list} label="liked songs" emptyIcon={Heart} emptyTitle="No liked songs yet"
      emptyText={isSelf ? 'Tap the heart on any song and it will show up here.' : 'Nothing here yet.'}>
      <div className="space-y-0.5">
        {list.items.map((s) => (
          <SongRow key={s.id} song={s} active={currentSong?.id === s.id} playing={isPlaying} onPlay={() => playSong(s, list.items)} />
        ))}
      </div>
    </ListShell>
  );
};

export default LikedTab;
