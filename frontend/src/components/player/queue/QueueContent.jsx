import React, { useEffect, useMemo, useRef, useState, useCallback, Profiler } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToFirstScrollableAncestor } from '@dnd-kit/modifiers';
import {
  X, Ban, Trash2, ListPlus, ListStart, MoreHorizontal, RefreshCw, Radio, ListMusic, CheckSquare, Timer, Square, Play, ChevronsDown, Save, Loader2,
} from 'lucide-react';
import BottomSheet from '../../common/BottomSheet';
import SafeImage from '../../common/SafeImage';
import Equalizer from '../../common/Equalizer';
import QueueItem from './QueueItem';
import QueueMenu from './QueueMenu';
import { useFlip } from '../../../hooks/useFlip';
import { haptic } from '../../../lib/haptics';
import { useAudio, useQueue } from '../../../context/AudioContext';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../services/api';
import { sleepLabel, SLEEP_OPTIONS } from '../../../lib/sleepTimer';
import {
  buildRows, windowRows, remainingTime, formatRemaining, formatClock, announce, VIRTUAL_THRESHOLD,
} from '../../../lib/queueView';

const Tab = ({ id, active, onSelect, children }) => (
  <button type="button" role="tab" id={`queue-tab-${id}`} aria-selected={active} aria-controls={`queue-panel-${id}`} tabIndex={active ? 0 : -1} onClick={() => onSelect(id)}
    onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); onSelect(id === 'queue' ? 'history' : 'queue'); } }}
    className={`min-h-9 px-4 rounded-full text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ${active ? 'bg-white text-black' : 'bg-white/10 text-zinc-200 hover:bg-white/15'}`}>
    {children}
  </button>
);

const ToolButton = ({ icon: Icon, children, short, onClick, disabled, pressed }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-pressed={pressed} aria-label={short ? children : undefined}
    className={`press min-h-9 px-3 inline-flex items-center gap-1.5 rounded-full text-xs font-semibold disabled:opacity-40 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ${pressed ? 'bg-brand-500 text-black' : 'bg-white/10 text-zinc-100 hover:bg-white/15'}`}>
    <Icon className="w-4 h-4" aria-hidden="true" />
    {short ? (<><span aria-hidden="true" className="sm:hidden">{short}</span><span aria-hidden="true" className="hidden sm:inline">{children}</span></>) : children}
  </button>
);

/** The only part of the panel that follows the song clock: "12 min left". */
const TimeLeft = ({ current, upcoming }) => {
  const { currentTime } = useAudio();
  return <>{formatRemaining(remainingTime({ current, currentTime, upcoming }))}</>;
};

/**
 * The play queue: Now playing, Next in queue (added by you, plays first), Next from [source], and a History tab.
 * Used as a right-side panel (desktop), a bottom sheet (phone) and a tab inside the full-screen player.
 */
const QueueContent = ({ onClose, embedded = false }) => {
  const {
    queueSections, autoplay, setAutoplay, currentSong, isPlaying, offerRadio, continueWithRadio, startRadio, exhausted, refillError, retryMore, blockSong,
    jumpToUid, removeUids, moveUidsToQueue, reorderByUid, clearQueue, refreshRecommendations, removeCurrentSong,
    playFromHistoryAt, saveQueueAsPlaylist, toggleStopAfter, sleepTimer, startSleepTimer, cancelSleepTimer, showToast,
  } = useQueue(); // steady: does not re-render on every tick of the song clock
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('queue');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [menu, setMenu] = useState(null); // { kind: 'row' | 'more', uid?, anchor }
  const [saveOpen, setSaveOpen] = useState(false);
  const [live, setLive] = useState('');
  const [tabUid, setTabUid] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(480);
  const [dragging, setDragging] = useState(false);
  const [, tick] = useState(0);
  const scrollRef = useRef(null);
  const focusUid = useRef(null);

  const rows = useMemo(() => buildRows(queueSections, { autoplay }), [queueSections, autoplay]);
  const songRows = useMemo(() => rows.filter((r) => r.type === 'row'), [rows]);
  const total = songRows.length;
  const virtual = total > VIRTUAL_THRESHOLD;
  const win = windowRows(rows, { scrollTop, viewport, virtual });
  const visible = rows.slice(win.start, win.end);
  const visibleIds = visible.filter((r) => r.type === 'row').map((r) => r.uid);
  const byUid = useMemo(() => new Map(songRows.map((r) => [r.uid, r])), [songRows]);

  // keep "selected" limited to songs that are still queued
  useEffect(() => {
    setSelected((prev) => { const next = new Set([...prev].filter((u) => byUid.has(u))); return next.size === prev.size ? prev : next; });
  }, [byUid]);
  useEffect(() => { if (!selectMode) setSelected(new Set()); }, [selectMode]);

  // measure the scroll area (for windowing long queues)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const measure = () => setViewport(el.clientHeight || 480);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [tab]);

  // the sleep timer label counts down
  useEffect(() => {
    if (!sleepTimer?.endsAt) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, [sleepTimer]);

  // after a keyboard move or removal, put focus back on the song that was moved
  useEffect(() => {
    if (!focusUid.current) return;
    const el = scrollRef.current?.querySelector(`[data-uid="${CSS.escape(focusUid.current)}"]`);
    if (el) { el.focus(); setTabUid(focusUid.current); }
    focusUid.current = null;
  }, [rows]);

  // Rows slide to their new place instead of jumping; the scroll position stays put when rows above the viewport go away
  useFlip(scrollRef, rows, {
    enabled: !virtual && !dragging && tab === 'queue',
    onRemovedAbove: (px) => { if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, scrollRef.current.scrollTop - px); },
  });

  const upcomingSongs = useMemo(() => songRows.map((r) => r.entry.song), [songRows]);
  const userCount = queueSections.nextInQueueEntries.length;

  // ---- last played song (for the empty state's "Start radio")
  const [lastFromApi, setLastFromApi] = useState(null);
  const lastPlayed = currentSong || queueSections.history[0] || lastFromApi;
  useEffect(() => {
    if (currentSong || queueSections.history[0] || !isAuthenticated || lastFromApi) return;
    api.get('/history', { params: { limit: 1 } }).then(({ data }) => {
      const s = data?.items?.[0]?.song;
      if (s) setLastFromApi({ ...s, artist: s.artist });
    }).catch(() => {});
  }, [currentSong, queueSections.history, isAuthenticated, lastFromApi]);

  // ---- drag and drop (mouse, touch via the handle, keyboard via the handle)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const titleOf = (id) => byUid.get(id)?.entry.song.title || 'Song';
  const posOf = (id) => (byUid.get(id)?.index ?? 0) + 1;
  const accessibility = {
    screenReaderInstructions: { draggable: 'To pick up a song, press space. Use the arrow keys to move it, space to drop it, escape to cancel.' },
    announcements: {
      onDragStart: ({ active }) => announce.picked(titleOf(active.id), posOf(active.id), total),
      onDragOver: ({ active, over }) => (over ? announce.over(titleOf(active.id), posOf(over.id), total) : undefined),
      onDragEnd: ({ active, over }) => announce.dropped(titleOf(active.id), posOf(over?.id ?? active.id), total),
      onDragCancel: ({ active }) => announce.cancelled(titleOf(active.id)),
    },
  };
  const onDragEnd = ({ active, over }) => {
    setDragging(false);
    if (over && active.id !== over.id) { haptic(12); reorderByUid(active.id, over.id); }
  };

  // ---- actions
  const remove = useCallback((uids) => {
    const list = Array.isArray(uids) ? uids : [uids];
    // keep focus near where the removed song was
    const first = byUid.get(list[0]);
    const neighbour = first && (songRows[first.index + 1] || songRows[first.index - 1]);
    focusUid.current = neighbour && !list.includes(neighbour.uid) ? neighbour.uid : null;
    setLive(list.length === 1 ? announce.removed(titleOf(list[0])) : announce.removedMany(list.length));
    removeUids(list);
  }, [byUid, songRows, removeUids]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (uid, delta) => {
    const row = byUid.get(uid);
    const other = row && songRows[row.index + delta];
    if (!other) return;
    reorderByUid(uid, other.uid);
    focusUid.current = uid;
    setLive(announce.moved(row.entry.song.title, row.index + delta + 1, total));
  };

  const onListKeyDown = (e) => {
    if (dragging || e.defaultPrevented) return;
    const li = e.target.closest?.('[data-queue-row]');
    if (!li || e.target.closest('[role=menu]')) return;
    const uid = li.dataset.uid;
    const lis = [...scrollRef.current.querySelectorAll('[data-queue-row]')];
    const i = lis.indexOf(li);
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(uid, e.key === 'ArrowUp' ? -1 : 1); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = lis[i + (e.key === 'ArrowDown' ? 1 : -1)];
      next?.focus();
    } else if (e.key === 'Enter' && e.target === li) { e.preventDefault(); if (selectMode) toggleSelect(uid); else jumpToUid(uid); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !selectMode) { e.preventDefault(); remove(uid); }
    else if (e.key === ' ' && e.target === li && selectMode) { e.preventDefault(); toggleSelect(uid); }
  };

  const toggleSelect = (uid) => setSelected((prev) => { const n = new Set(prev); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });
  const selectedList = [...selected];
  const allSelected = total > 0 && selected.size === total;

  const rowMenuItems = (uid) => {
    const row = byUid.get(uid);
    if (!row) return [];
    const isSource = row.section === 'source';
    return [
      { label: 'Play now', icon: Play, onSelect: () => jumpToUid(uid) },
      { label: 'Play next', icon: ListStart, onSelect: () => { moveUidsToQueue([uid], 'next'); setLive(`${row.entry.song.title} will play next.`); } },
      ...(isSource ? [{ label: 'Move to my queue', icon: ListPlus, onSelect: () => moveUidsToQueue([uid], 'end') }] : []),
      { label: 'Select', icon: CheckSquare, onSelect: () => { setSelectMode(true); setSelected(new Set([uid])); } },
      { label: "Don't recommend this", icon: Ban, onSelect: () => blockSong(uid) },
      { label: 'Remove from queue', icon: X, danger: true, onSelect: () => remove(uid) },
    ];
  };
  const moreMenuItems = () => [
    { label: 'Stop after this song', icon: Square, checked: queueSections.stopAfter && sleepTimer?.id !== 'song', onSelect: toggleStopAfter, disabled: !currentSong },
    ...SLEEP_OPTIONS.map((o) => ({ label: `Sleep timer: ${o.label}`, icon: Timer, checked: sleepTimer?.id === o.id, onSelect: () => startSleepTimer(o.id), disabled: !currentSong })),
    ...(sleepTimer ? [{ label: 'Turn off sleep timer', icon: X, onSelect: cancelSleepTimer }] : []),
    ...(currentSong ? [{ label: 'Remove playing song', icon: Trash2, danger: true, onSelect: removeCurrentSong }] : []),
  ];

  const onSave = () => {
    if (!isAuthenticated) { showToast('Sign in to save your queue as a playlist.', { label: 'Sign in', onClick: () => navigate('/login') }); return; }
    setSaveOpen(true);
  };

  const history = queueSections.history;
  const empty = !currentSong;

  const body = (
    <div className="flex flex-col h-full min-h-0" data-testid="queue-content">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-2 sm:pt-4 pb-2 space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div role="tablist" aria-label="Queue views" className="flex items-center gap-2">
            <Tab id="queue" active={tab === 'queue'} onSelect={setTab}>Queue</Tab>
            <Tab id="history" active={tab === 'history'} onSelect={setTab}>History</Tab>
          </div>
          {onClose && !embedded && (
            <button type="button" onClick={onClose} aria-label="Close queue" className="press p-2 rounded-full bg-white/10 hover:bg-white/15 text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"><X className="w-5 h-5" /></button>
          )}
        </div>

        {tab === 'queue' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ToolButton icon={Trash2} short="Clear" onClick={clearQueue} disabled={!userCount}>Clear queue</ToolButton>
              <ToolButton icon={Save} short="Save" onClick={onSave} disabled={empty}>Save as playlist</ToolButton>
              <ToolButton icon={CheckSquare} onClick={() => setSelectMode((s) => !s)} pressed={selectMode} disabled={!total}>Select</ToolButton>
              <button type="button" aria-haspopup="menu" aria-label="More queue options" onClick={(e) => setMenu({ kind: 'more', anchor: e.currentTarget })}
                className="press min-h-9 min-w-9 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/15 text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"><MoreHorizontal className="w-4 h-4" /></button>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-zinc-400">
              <span data-testid="queue-remaining" aria-live="off">
                {currentSong ? <TimeLeft current={currentSong} upcoming={upcomingSongs} /> : 'Nothing queued'}
                {sleepTimer && <span className="ml-2 text-accent-300">· Sleep: {sleepLabel(sleepTimer)}</span>}
                {queueSections.stopAfter && sleepTimer?.id !== 'song' && <span className="ml-2 text-accent-300">· Stops after this song</span>}
              </span>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <span className="font-semibold text-zinc-200">Autoplay</span>
                <button type="button" role="switch" aria-checked={autoplay} aria-label="Autoplay similar songs" onClick={() => setAutoplay(!autoplay)}
                  className={`relative w-10 h-6 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 ${autoplay ? 'bg-brand-500' : 'bg-zinc-600'}`}>
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${autoplay ? 'translate-x-4' : ''}`} />
                </button>
              </label>
            </div>
          </>
        )}
      </div>

      {tab === 'queue' && (
        <div id="queue-panel-queue" role="tabpanel" aria-labelledby="queue-tab-queue" className="flex-1 min-h-0 flex flex-col">
          {/* Now playing */}
          {currentSong && (
            <div className="flex-shrink-0 mx-4 mb-2 flex items-center gap-3 p-2 sm:p-3 rounded-xl bg-brand-500/10 ring-1 ring-brand-500/40" data-testid="queue-now-playing" aria-label="Now playing">
              <SafeImage src={currentSong.image} alt="" className="w-14 h-14 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0 bg-surface-4 shadow-lg" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider font-bold text-brand-300 mb-0.5">Now playing</p>
                <p dir="auto" className="text-base font-bold text-white truncate">{currentSong.title}</p>
                <p dir="auto" className="text-sm text-zinc-300 truncate">{currentSong.artist || currentSong.singers}</p>
              </div>
              <Equalizer playing={isPlaying} className="mr-1" />
            </div>
          )}

          {/* A small banner, not a card. "Out of new songs" only when nothing is left that is not already queued; a failed request offers Retry. */}
          {exhausted && (
            <p role="status" data-testid="queue-banner-exhausted" className="flex-shrink-0 mx-4 mb-2 px-3 py-2 rounded-lg bg-white/5 text-xs text-zinc-300">Out of new songs</p>
          )}
          {!exhausted && refillError && (
            <div role="alert" data-testid="queue-banner-error" className="flex-shrink-0 mx-4 mb-2 pl-3 pr-1 min-h-11 rounded-lg bg-white/5 flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-300">Couldn't load more songs</span>
              <button type="button" onClick={retryMore} className="press min-h-11 px-3 text-xs font-bold text-brand-300 hover:text-brand-200">Retry</button>
            </div>
          )}

          {offerRadio && (
            <div className="flex-shrink-0 mx-4 mb-2 flex items-center gap-3 rounded-xl bg-white/5 p-3">
              <Radio className="w-5 h-5 text-brand-400 flex-shrink-0" aria-hidden="true" />
              <p className="flex-1 text-sm text-zinc-200">That list has finished. Keep going with similar songs?</p>
              <button type="button" onClick={continueWithRadio} className="press px-3 py-1.5 rounded-full bg-brand-500 text-black text-xs font-bold">Start radio</button>
            </div>
          )}

          {empty ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 px-8 pb-10" data-testid="queue-empty">
              <ListMusic className="w-10 h-10 text-zinc-500" aria-hidden="true" />
              <p className="text-sm text-zinc-300">Queue is empty - play something or add songs</p>
              {lastPlayed && (
                <button type="button" onClick={() => startRadio(lastPlayed)} className="press inline-flex items-center gap-2 min-h-11 px-5 rounded-full bg-brand-500 hover:bg-brand-400 text-black text-sm font-bold">
                  <Radio className="w-4 h-4" aria-hidden="true" /> Start radio from "{lastPlayed.title}"
                </button>
              )}
            </div>
          ) : (
            <>
              {selectMode && (
                <div className="flex-shrink-0 mx-4 mb-1 flex flex-wrap items-center gap-2 rounded-xl bg-white/5 p-2" role="toolbar" aria-label="Actions for selected songs">
                  <span className="text-xs font-semibold text-white px-1" aria-live="polite">{selected.size} selected</span>
                  <button type="button" onClick={() => setSelected(allSelected ? new Set() : new Set(songRows.map((r) => r.uid)))} className="text-xs text-brand-300 font-semibold px-1">{allSelected ? 'None' : 'All'}</button>
                  <span className="flex-1" />
                  <ToolButton icon={ListStart} disabled={!selected.size} onClick={() => { moveUidsToQueue(selectedList, 'next'); setLive(`${selected.size} songs will play next.`); setSelectMode(false); }}>Play next</ToolButton>
                  <ToolButton icon={ChevronsDown} disabled={!selected.size} onClick={() => { moveUidsToQueue(selectedList, 'end'); setSelectMode(false); }}>Play last</ToolButton>
                  <ToolButton icon={Trash2} disabled={!selected.size} onClick={() => { remove(selectedList); setSelectMode(false); }}>Remove</ToolButton>
                  <ToolButton icon={X} onClick={() => setSelectMode(false)}>Done</ToolButton>
                </div>
              )}

              <div ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} onKeyDown={onListKeyDown}
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-4" data-testid="queue-list">
                <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
                  accessibility={accessibility} onDragStart={() => { setDragging(true); haptic(8); }} onDragCancel={() => setDragging(false)} onDragEnd={onDragEnd}>
                  <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
                    <ul role="list" aria-label="Upcoming songs" style={virtual ? { paddingTop: win.padTop, paddingBottom: win.padBottom } : undefined}>
                      {visible.map((r) => {
                        if (r.type === 'header') {
                          return (
                            <li key={r.key} role="presentation" style={{ height: r.height, listStyle: 'none' }} className="flex items-end justify-between px-1.5 pb-1.5">
                              <h3 title={r.title} className="min-w-0 text-[11px] uppercase tracking-wider font-bold text-zinc-400 truncate">{r.title}</h3>
                              {r.canRefresh && (
                                <button type="button" onClick={refreshRecommendations} disabled={queueSections.refill.pending} aria-label="Refresh recommendations"
                                  className="flex-shrink-0 ml-2 inline-flex items-center gap-1 min-h-11 px-1 text-[11px] font-semibold text-zinc-300 hover:text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 rounded">
                                  <RefreshCw className={`w-3 h-3 ${queueSections.refill.pending ? 'animate-spin' : ''}`} aria-hidden="true" /> <span className="hidden min-[400px]:inline">Refresh recommendations</span><span className="min-[400px]:hidden">Refresh</span>
                                </button>
                              )}
                            </li>
                          );
                        }
                        if (r.type === 'note') return <li key={r.key} style={{ height: r.height, listStyle: 'none' }} className="px-2 py-2 text-xs text-zinc-500">{r.text}</li>;
                        if (r.type === 'skeleton') return (
                          <li key={r.key} style={{ height: r.height, listStyle: 'none' }} className="flex items-center gap-3 px-2" aria-hidden="true">
                            <div className="w-11 h-11 rounded-md shimmer" /><div className="flex-1 space-y-2"><div className="h-3 w-2/3 rounded shimmer" /><div className="h-3 w-1/3 rounded shimmer" /></div>
                          </li>
                        );
                        if (r.type === 'error') return (
                          <li key={r.key} role="alert" style={{ height: r.height, listStyle: 'none' }} className="flex items-center gap-3 px-2 text-xs text-zinc-300">
                            <span className="flex-1">{r.text}</span>
                            <button type="button" onClick={refreshRecommendations} className="press px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-semibold">Try again</button>
                          </li>
                        );
                        return (
                          <QueueItem key={r.key} entry={r.entry} index={r.index} tabStop={(tabUid && byUid.has(tabUid) ? tabUid : songRows[0]?.uid) === r.uid}
                            selectMode={selectMode} selected={selected.has(r.uid)} onPlay={jumpToUid} onRemove={remove} onToggleSelect={toggleSelect}
                            onOpenMenu={(uid, anchor) => setMenu({ kind: 'row', uid, anchor })} onFocusRow={setTabUid} />
                        );
                      })}
                    </ul>
                  </SortableContext>
                </DndContext>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div id="queue-panel-history" role="tabpanel" aria-labelledby="queue-tab-history" className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-4" data-testid="queue-history">
          {history.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-zinc-400">Songs you play in this session appear here.</p>
          ) : (
            <ul>
              {history.map((song, i) => (
                <li key={`${song.id}-${i}`} style={{ listStyle: 'none' }}>
                  <button type="button" onClick={() => playFromHistoryAt(history.length - 1 - i)} aria-label={`Play ${song.title} again`}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
                    <SafeImage src={song.image} alt="" className="w-11 h-11 rounded-md object-cover flex-shrink-0 bg-surface-4" />
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block text-sm font-semibold text-white truncate leading-[1.4]">{song.title}</span>
                      <span dir="auto" className="block text-xs text-zinc-400 truncate leading-[1.4]">{song.artist || song.singers}</span>
                    </span>
                    <span className="text-xs tabular-nums text-zinc-500">{formatClock(song.duration)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="queue-live">{live}</div>

      {menu && (
        <QueueMenu anchor={menu.anchor} label={menu.kind === 'row' ? 'Song options' : 'Queue options'} onClose={() => setMenu(null)}
          heading={menu.kind === 'row' && byUid.get(menu.uid) ? { title: byUid.get(menu.uid).entry.song.title, subtitle: byUid.get(menu.uid).entry.song.artist || byUid.get(menu.uid).entry.song.singers } : null}
          items={menu.kind === 'row' ? rowMenuItems(menu.uid) : moreMenuItems()} />
      )}
      <SaveQueueDialog open={saveOpen} onClose={() => setSaveOpen(false)} onSave={saveQueueAsPlaylist} count={(currentSong ? 1 : 0) + total} />
    </div>
  );
  // Only for the audit: counts how often the panel is redrawn (window.__queueRenders), to prove it does not redraw on every tick of the song clock
  if (typeof window !== 'undefined' && window.__QUEUE_PROFILE__) {
    return <Profiler id="queue" onRender={() => { window.__queueRenders = (window.__queueRenders || 0) + 1; }}>{body}</Profiler>;
  }
  return body;
};

const SaveQueueDialog = ({ open, onClose, onSave, count }) => {
  const [name, setName] = useState('My queue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useAudio();
  const navigate = useNavigate();
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await onSave(name.trim());
      onClose();
      showToast(`Saved ${data.added} song${data.added === 1 ? '' : 's'} to "${name.trim()}".`, { label: 'Open', onClick: () => navigate(`/playlist/${data.playlist.id}`) });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the playlist. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet open={open} onClose={onClose} title="Save queue as playlist" subtitle={`${count} song${count === 1 ? '' : 's'}`}>
      <form onSubmit={submit} className="py-3 space-y-3">
        <label className="block text-sm font-semibold text-white" htmlFor="queue-playlist-name">Playlist name</label>
        <input id="queue-playlist-name" data-autofocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required
          className="w-full min-h-11 px-3 rounded-lg bg-surface-4 text-white text-sm outline-none focus:ring-2 focus:ring-brand-400" />
        {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
        <button type="submit" disabled={busy || !name.trim()} className="press w-full min-h-11 rounded-full bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-black text-sm font-bold inline-flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Save playlist
        </button>
      </form>
    </BottomSheet>
  );
};

export default QueueContent;
