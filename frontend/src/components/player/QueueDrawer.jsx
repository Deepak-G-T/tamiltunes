import React, { useEffect, useState } from 'react';
import BottomSheet from '../common/BottomSheet';
import QueueContent from './queue/QueueContent';

const useWide = () => {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(min-width: 768px)');
    if (!mq) return undefined;
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
};

/**
 * The play queue. A right-hand panel next to the player bar on desktop, a bottom sheet on phones (swipe the handle down to close).
 */
const QueueDrawer = ({ isOpen, onClose }) => {
  const wide = useWide();

  useEffect(() => {
    if (!isOpen || !wide) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, wide, onClose]);

  if (!isOpen) return null;
  if (wide) {
    return (
      <aside data-testid="queue-sheet" aria-label="Play queue"
        className="queue-panel-in hidden md:flex fixed right-2 top-2 bottom-[6.25rem] w-[min(400px,36vw)] min-w-[340px] z-40 flex-col bg-surface-2 rounded-xl border border-white/10 shadow-2xl overflow-hidden">
        <QueueContent onClose={onClose} />
      </aside>
    );
  }
  return (
    <BottomSheet open onClose={onClose} tall testId="queue-sheet" title="Play queue" bare>
      <QueueContent onClose={onClose} />
    </BottomSheet>
  );
};

export default QueueDrawer;
