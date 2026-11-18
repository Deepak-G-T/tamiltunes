import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, ListStart, ListPlus, ListMusic, User as UserIcon, Radio } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { useAudio } from '../../context/AudioContext';

const Ctx = createContext({ open: () => {} });

/** `const { open } = useSongActions(); open(song, { onAddToPlaylist })` shows the actions menu for a song. */
export const useSongActions = () => useContext(Ctx);

const Row = ({ icon: Icon, children, onClick }) => (
  <button
    type="button" role="menuitem" onClick={onClick}
    className="press w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left text-[15px] font-medium text-white hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
  >
    <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
    <span className="flex-1">{children}</span>
  </button>
);

const SongActionsSheet = ({ target, onClose }) => {
  const navigate = useNavigate();
  const { startRadio, playNext, addToQueue } = useAudio();
  if (!target) return null;
  const { song, onAddToPlaylist } = target;
  const go = (fn) => () => { onClose(); fn(); };

  return (
    <BottomSheet open onClose={onClose} title={song.title} subtitle={song.artist || song.singers}>
      <div role="menu" aria-label={`Actions for ${song.title}`} className="py-2">
        <Row icon={Play} onClick={go(() => startRadio(song))}>Play now</Row>
        <Row icon={Radio} onClick={go(() => startRadio(song))}>Start radio from this song</Row>
        <Row icon={ListStart} onClick={go(() => { playNext(song); })}>Play next</Row>
        <Row icon={ListPlus} onClick={go(() => { addToQueue(song); })}>Add to queue</Row>
        {onAddToPlaylist && <Row icon={ListMusic} onClick={go(() => onAddToPlaylist(song))}>Add to playlist</Row>}
        <Row icon={UserIcon} onClick={go(() => navigate(`/search?q=${encodeURIComponent(String(song.artist || song.singers || '').split(',')[0].trim())}`))}>Go to artist</Row>
      </div>
    </BottomSheet>
  );
};

export function SongActionsProvider({ children }) {
  const [target, setTarget] = useState(null);
  const open = useCallback((song, opts = {}) => setTarget({ song, ...opts }), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <SongActionsSheet target={target} onClose={() => setTarget(null)} />
    </Ctx.Provider>
  );
}
