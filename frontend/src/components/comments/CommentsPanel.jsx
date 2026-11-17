import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Loader2 } from 'lucide-react';
import BottomSheet from '../common/BottomSheet';
import { CommentSkeleton, SkeletonList } from '../common/Skeleton';
import { ErrorState, EmptyState } from '../common/StateViews';
import CommentComposer from './CommentComposer';
import CommentItem from './CommentItem';
import { useComments } from '../../hooks/useComments';
import { useAudio } from '../../context/AudioContext';
import { useAuth } from '../../context/AuthContext';
import { haptic } from '../../lib/haptics';

const SORTS = [['newest', 'Newest'], ['top', 'Top']];

/**
 * Song comments in a bottom sheet. Timestamps and "▶ 1:23" chips seek the player.
 * @param {{ open: boolean, onClose: () => void, onNavigate?: () => void, song: { id: string, title: string, artist?: string } | null }} props
 * `onNavigate` runs when a link inside the sheet is followed (e.g. to close a full-screen player too).
 */
const CommentsPanel = ({ open, onClose, song, onNavigate }) => {
  const { user, isAuthenticated } = useAuth();
  const { currentTime, duration, seek, showToast } = useAudio();
  const c = useComments(song?.id, { active: open && Boolean(song), user });
  const { post: cPost, edit, remove, toggleLike, togglePin, report: cReport, loadReplies, hasMore, loadMore } = c;
  const sentinel = useRef(null);

  const onSeek = useCallback((sec) => {
    haptic(8);
    seek(duration > 0 ? Math.min(sec, duration) : sec);
  }, [seek, duration]);

  const needLogin = useCallback(() => showToast?.('Sign in to join the conversation.'), [showToast]);

  // Stable action bag so memoised items don't re-render on unrelated state changes
  const actions = useMemo(() => ({
    post: cPost, edit, remove, toggleLike, togglePin, loadReplies, needLogin,
    report: async (id, reason) => { const r = await cReport(id, reason); showToast?.(r.ok ? (r.already ? 'You already reported this.' : 'Thanks, we will review it.') : r.error); },
  }), [cPost, edit, remove, toggleLike, togglePin, cReport, loadReplies, needLogin, showToast]);

  // Infinite scroll
  useEffect(() => {
    const el = sentinel.current;
    if (!open || !el || !hasMore || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore(); }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [open, hasMore, loadMore, c.state.items.length]);

  if (!song) return null;
  const leave = onNavigate || onClose;
  const { items, pinned, replies } = c.state;
  const post = async (body) => {
    const r = await cPost(body);
    if (r.ok) haptic(10);
    return r;
  };

  const footer = isAuthenticated ? (
    <CommentComposer user={user} onSubmit={post} currentTime={currentTime} placeholder="Add a comment…" />
  ) : (
    <p className="text-sm text-zinc-300 text-center py-1">
      <Link to="/login" onClick={onNavigate || onClose} className="text-brand-400 font-bold hover:underline">Sign in</Link> to comment, reply and like.
    </p>
  );

  return (
    <BottomSheet open={open} onClose={onClose} tall title="Comments" subtitle={song.title} footer={footer}>
      <div className="flex items-center gap-1.5 py-2 sticky top-0 bg-surface-2 z-10" role="group" aria-label="Sort comments">
        {SORTS.map(([value, label]) => (
          <button key={value} type="button" onClick={() => c.setSort(value)} aria-pressed={c.sort === value}
            className={`press px-3 py-1.5 rounded-full text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ${c.sort === value ? 'bg-white text-black' : 'bg-white/10 text-zinc-200 hover:bg-white/15'}`}>
            {label}
          </button>
        ))}
      </div>

      {c.status === 'loading' && (
        <SkeletonList label="Loading comments">{[0, 1, 2, 3].map((i) => <CommentSkeleton key={i} />)}</SkeletonList>
      )}
      {c.status === 'error' && <ErrorState message={c.error} onRetry={c.reload} />}
      {c.status === 'ready' && !pinned && items.length === 0 && (
        <EmptyState icon={MessageCircle} title="No comments yet" text="Be the first to share what this song means to you. Add a timestamp like 1:23 to point at a moment." />
      )}
      {c.status === 'ready' && (
        <div className="divide-y divide-white/5" data-testid="comment-list">
          {pinned && <CommentItem comment={pinned} viewer={user} actions={actions} onSeek={onSeek} onNavigate={leave} replies={replies[pinned.id]} repliesLoading={c.repliesLoading[pinned.id]} />}
          {items.map((it) => (
            <CommentItem key={it.id} comment={it} viewer={user} actions={actions} onSeek={onSeek} onNavigate={leave} replies={replies[it.id]} repliesLoading={c.repliesLoading[it.id]} />
          ))}
        </div>
      )}
      {c.status === 'ready' && c.hasMore && (
        <div ref={sentinel} className="py-4 text-center">
          <button type="button" onClick={c.loadMore} disabled={c.loadingMore} className="press px-5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-zinc-200 inline-flex items-center gap-2">
            {c.loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {c.loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </BottomSheet>
  );
};

export default CommentsPanel;
