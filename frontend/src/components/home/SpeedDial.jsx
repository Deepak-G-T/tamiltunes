import React, { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Pause, ListPlus, ListStart, Pin, PinOff, Trash2, ChevronLeft, ChevronRight, User as UserIcon, Info } from 'lucide-react';
import SpeedDialTile from './SpeedDialTile';
import BottomSheet from '../common/BottomSheet';
import { ErrorState } from '../common/StateViews';
import { useAudio } from '../../context/AudioContext';
import { useStartRadio } from '../../hooks/useStartRadio';

const SLOTS = 9;

const Skeleton = () => (
  <ul aria-hidden="true" className="grid grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3 max-w-xl lg:max-w-4xl">
    {Array.from({ length: SLOTS }, (_, i) => ( // 9 tiles: 3x3 on phones, 5 + 4 on wide screens
      <li key={i} className="aspect-square rounded-xl shimmer" />
    ))}
  </ul>
);

const Row = ({ icon: Icon, children, onClick, disabled, danger = false }) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    onClick={onClick}
    className={`press w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left text-[15px] font-medium hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent ${danger ? 'text-rose-400' : 'text-white'}`}
  >
    <Icon className="w-5 h-5 flex-shrink-0" />
    <span className="flex-1">{children}</span>
  </button>
);

/**
 * The home-page Speed Dial: your most-played songs as a 3x3 grid of one-tap tiles.
 * @param {ReturnType<import('../../hooks/useSpeedDial').useSpeedDial> & { loadingHome?: boolean }} props
 */
const SpeedDial = ({ items, status, error, reload, isAuthenticated, noPlays, actions, loadingHome = false }) => {
  const navigate = useNavigate();
  const { currentSong, isPlaying, togglePlay, addToQueue, playNext } = useAudio();
  const startRadio = useStartRadio();
  const [menu, setMenu] = useState(null); // { item, index }
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const play = useCallback((song) => {
    if (currentSong?.id === song.id) togglePlay();
    else startRadio(song, items.filter((i) => i.id !== song.id)); // if the radio is unavailable, play on through the grid
  }, [currentSong?.id, togglePlay, startRadio, items]);

  const openMenu = useCallback((item, index) => setMenu({ item, index }), []);
  const close = () => setMenu(null);
  const finishDrag = () => { setDragFrom(null); setDragOver(null); };
  const onDrop = (to) => {
    if (dragFrom != null && dragFrom !== to) actions?.move(dragFrom, to);
    finishDrag();
  };

  const loading = status === 'loading' || (loadingHome && items.length === 0);

  return (
    <section aria-label="Speed dial" className="space-y-3">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">Speed dial</h2>
      </div>

      {status === 'error' && <ErrorState compact message={error || 'Could not load your Speed Dial.'} onRetry={reload} />}

      {status !== 'error' && (
        <div className="min-h-[1px]">
          {loading ? (
            <Skeleton />
          ) : (
            <ul className="grid grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3 max-w-xl lg:max-w-4xl animate-in fade-in duration-300" data-testid="speed-dial-grid">
              {items.slice(0, SLOTS).map((item, i) => (
                <SpeedDialTile
                  key={item.id}
                  item={item}
                  index={i}
                  isCurrent={currentSong?.id === item.id}
                  isPlaying={isPlaying}
                  onPlay={play}
                  onOpenMenu={openMenu}
                  draggable={Boolean(actions)}
                  dragOver={dragOver === i && dragFrom !== i}
                  onDragStart={setDragFrom}
                  onDragOver={setDragOver}
                  onDrop={onDrop}
                  onDragEnd={finishDrag}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {!loading && status !== 'error' && noPlays && (
        <p className="flex items-start gap-2 text-xs md:text-sm text-zinc-400 max-w-xl">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-brand-400" aria-hidden="true" />
          <span>
            Play songs and your favorites will appear here.
            {!isAuthenticated && <> <Link to="/login" className="text-brand-400 font-semibold hover:underline">Sign in</Link> to keep them on every device.</>}
          </span>
        </p>
      )}

      <BottomSheet open={Boolean(menu)} onClose={close} title={menu?.item.title || ''} subtitle={menu?.item.artist}>
        {menu && (
          <div role="menu" aria-label={`Actions for ${menu.item.title}`} className="py-2">
            <Row icon={currentSong?.id === menu.item.id && isPlaying ? Pause : Play} onClick={() => { close(); play(menu.item); }}>
              {currentSong?.id === menu.item.id && isPlaying ? 'Pause' : 'Play'}
            </Row>
            <Row icon={ListStart} onClick={() => { close(); playNext(menu.item); }}>Play next</Row>
            <Row icon={ListPlus} onClick={() => { close(); addToQueue(menu.item); }}>Add to queue</Row>
            <Row icon={UserIcon} onClick={() => { close(); navigate(`/search?q=${encodeURIComponent(String(menu.item.artist).split(',')[0].trim())}`); }}>Go to artist</Row>
            {actions ? (
              <>
                {menu.item.pinned ? (
                  <Row icon={PinOff} onClick={() => { close(); actions.unpin(menu.item); }}>Unpin (back to automatic)</Row>
                ) : (
                  <Row icon={Pin} onClick={() => { close(); actions.pin(menu.item, menu.index); }}>Pin to this spot</Row>
                )}
                <Row icon={ChevronLeft} disabled={menu.index === 0} onClick={() => { close(); actions.move(menu.index, menu.index - 1); }}>Move earlier</Row>
                <Row icon={ChevronRight} disabled={menu.index >= items.length - 1} onClick={() => { close(); actions.move(menu.index, menu.index + 1); }}>Move later</Row>
                <Row icon={Trash2} danger onClick={() => { close(); actions.remove(menu.item); }}>Remove from Speed dial</Row>
              </>
            ) : (
              <p className="px-3 py-3 text-sm text-zinc-400">
                <Link to="/login" onClick={close} className="text-brand-400 font-semibold hover:underline">Sign in</Link> to pin, move or remove songs.
              </p>
            )}
          </div>
        )}
      </BottomSheet>
    </section>
  );
};

export default SpeedDial;
