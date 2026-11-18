import React, { useState } from 'react';
import { Trash2, Radio, ListMusic } from 'lucide-react';
import BottomSheet from '../common/BottomSheet';
import SafeImage from '../common/SafeImage';
import Equalizer from '../common/Equalizer';
import QueueRow from './QueueRow';
import { useAudio } from '../../context/AudioContext';

const Section = ({ title, action, children, empty }) => (
  <section className="py-2">
    <div className="flex items-center justify-between px-1 mb-1.5">
      <h3 className="text-[11px] uppercase tracking-wider font-bold text-zinc-400">{title}</h3>
      {action}
    </div>
    {children}
    {empty}
  </section>
);

/**
 * The play queue: Now playing, Next in queue (songs you added, they play first), then Next from radio / the list.
 * Drag rows (desktop), use the arrows, or swipe a row left to remove it.
 */
const QueueDrawer = ({ isOpen, onClose }) => {
  const {
    queueSections, autoplay, setAutoplay, offerRadio, continueWithRadio, isPlaying,
    jumpToUpcoming, removeFromUpcomingAt, reorderUpcomingAt, playNext, clearQueue,
  } = useAudio();
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const { nowPlaying, nextInQueue, nextFrom } = queueSections;
  const userCount = nextInQueue.length;
  const total = userCount + nextFrom.items.length;
  const finishDrag = () => { setDragFrom(null); setDragOver(null); };
  const drop = (to) => { if (dragFrom != null && dragFrom !== to) reorderUpcomingAt(dragFrom, to); finishDrag(); };
  const promote = (i, list) => { const song = list[i - (list === nextInQueue ? 0 : userCount)]; removeFromUpcomingAt(i); playNext(song); }; // "Play next" for a radio song

  const rowProps = (list, offset) => (song, i) => {
    const index = offset + i;
    return (
      <QueueRow
        key={`${song.id}-${index}`}
        song={song}
        index={index}
        last={index === total - 1}
        dragOver={dragOver === index && dragFrom !== index}
        onPlay={jumpToUpcoming}
        onRemove={removeFromUpcomingAt}
        onMove={reorderUpcomingAt}
        onPlayNext={offset > 0 || list === nextFrom.items ? (idx) => promote(idx, nextFrom.items) : undefined}
        onDragStart={setDragFrom}
        onDragOver={setDragOver}
        onDrop={drop}
        onDragEnd={finishDrag}
      />
    );
  };

  const footer = (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <p id="autoplay-label" className="text-sm font-semibold text-white">Autoplay similar songs</p>
        <p className="text-xs text-zinc-400">When your songs run out, keep playing songs like them.</p>
      </div>
      <button
        type="button" role="switch" aria-checked={autoplay} aria-labelledby="autoplay-label" onClick={() => setAutoplay(!autoplay)}
        className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 ${autoplay ? 'bg-brand-500' : 'bg-zinc-600'}`}
      >
        <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${autoplay ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );

  return (
    <BottomSheet open={isOpen} onClose={onClose} tall title="Play queue" subtitle={total ? `${total} coming up` : 'Nothing queued'} footer={footer}>
      <div className="pb-2">
        {nowPlaying && (
          <Section title="Now playing">
            <div className="flex items-center gap-3 p-2 rounded-xl bg-brand-500/10 border border-brand-500/20" data-testid="queue-now-playing">
              <SafeImage src={nowPlaying.image} alt="" className="w-12 h-12 rounded-lg object-cover bg-surface-4" />
              <div className="min-w-0 flex-1">
                <p dir="auto" className="text-sm font-bold text-white truncate leading-[1.4]">{nowPlaying.title}</p>
                <p dir="auto" className="text-xs text-brand-300 truncate leading-[1.4]">{nowPlaying.artist || nowPlaying.singers}</p>
              </div>
              {isPlaying && <Equalizer />}
            </div>
          </Section>
        )}

        {offerRadio && (
          <div className="my-2 flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <Radio className="w-5 h-5 text-brand-400 flex-shrink-0" aria-hidden="true" />
            <p className="flex-1 text-sm text-zinc-200">That list has finished. Keep going with similar songs?</p>
            <button type="button" onClick={continueWithRadio} className="press px-3 py-1.5 rounded-full bg-brand-500 text-black text-xs font-bold">Start radio</button>
          </div>
        )}

        <Section
          title="Next in queue"
          action={userCount > 0 && (
            <button type="button" onClick={clearQueue} className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-rose-400">
              <Trash2 className="w-3 h-3" aria-hidden="true" /> Clear
            </button>
          )}
          empty={userCount === 0 && <p className="px-1 py-2 text-xs text-zinc-500">Songs you add with "Add to queue" or "Play next" appear here and play first.</p>}
        >
          {userCount > 0 && <ul>{nextInQueue.map(rowProps(nextInQueue, 0))}</ul>}
        </Section>

        <Section
          title={nextFrom.label}
          empty={nextFrom.items.length === 0 && (
            <p className="px-1 py-2 text-xs text-zinc-500 flex items-center gap-2">
              <ListMusic className="w-4 h-4" aria-hidden="true" />
              {nowPlaying ? (autoplay ? 'Finding songs like this one…' : 'Autoplay is off. Turn it on to keep the music going.') : 'Play a song to start.'}
            </p>
          )}
        >
          {nextFrom.items.length > 0 && <ul>{nextFrom.items.map(rowProps(nextFrom.items, userCount))}</ul>}
        </Section>
      </div>
    </BottomSheet>
  );
};

export default QueueDrawer;
