import React, { memo, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MoreHorizontal, Pin, BadgeCheck, CornerDownRight, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import Avatar from '../common/Avatar';
import CommentComposer from './CommentComposer';
import { tokenizeComment, timeAgo, compactCount, formatTimestamp } from '../../lib/format';
import { isTemp } from '../../lib/commentsReducer';

const REPORT_REASONS = [['spam', 'Spam'], ['abuse', 'Harassment or abuse'], ['hate', 'Hate speech'], ['sexual', 'Sexual content'], ['other', 'Something else']];

const CommentBody = ({ body, onSeek }) => (
  <p dir="auto" lang="ta" className="text-[15px] leading-relaxed text-zinc-100 whitespace-pre-wrap break-words">
    {tokenizeComment(body).map((t, i) =>
      t.type === 'time' ? (
        <button key={i} type="button" onClick={() => onSeek(t.seconds)} aria-label={`Jump to ${t.value}`}
          className="inline-flex items-center px-1.5 mx-0.5 rounded-md bg-brand-500/15 text-brand-300 font-semibold text-sm hover:bg-brand-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
          {t.value}
        </button>
      ) : (
        <span key={i}>{t.value}</span>
      )
    )}
  </p>
);

const Menu = ({ comment, isOwn, canDelete, canPin, onEdit, onDelete, onPin, onReport }) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('menu'); // menu | report | confirm
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const close = () => { setOpen(false); setMode('menu'); };
  const item = 'w-full text-left px-3 py-2 text-sm hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none';

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="More actions"
        className="press p-1.5 rounded-full text-zinc-500 hover:text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
        <MoreHorizontal className="w-5 h-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-52 rounded-xl bg-surface-4 border border-white/10 shadow-2xl overflow-hidden">
          {mode === 'menu' && (
            <>
              {isOwn && <button role="menuitem" className={item} onClick={() => { close(); onEdit(); }}>Edit</button>}
              {canPin && !comment.parentId && <button role="menuitem" className={item} onClick={() => { close(); onPin(); }}>{comment.isPinned ? 'Unpin' : 'Pin to top'}</button>}
              {canDelete && <button role="menuitem" className={`${item} text-rose-400`} onClick={() => setMode('confirm')}>Delete</button>}
              {!isOwn && <button role="menuitem" className={item} onClick={() => setMode('report')}>Report</button>}
            </>
          )}
          {mode === 'confirm' && (
            <div className="p-3 space-y-2">
              <p className="text-sm text-white">Delete this comment{comment.replyCount ? ' and its replies' : ''}?</p>
              <div className="flex gap-2">
                <button className="press flex-1 py-1.5 rounded-full bg-rose-500 text-white text-xs font-bold" onClick={() => { close(); onDelete(); }}>Delete</button>
                <button className="press flex-1 py-1.5 rounded-full bg-white/10 text-white text-xs font-semibold" onClick={close}>Keep</button>
              </div>
            </div>
          )}
          {mode === 'report' && (
            <div>
              <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-zinc-400 font-bold">Why are you reporting this?</p>
              {REPORT_REASONS.map(([value, label]) => (
                <button key={value} role="menuitem" className={item} onClick={() => { close(); onReport(value); }}>{label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * One comment (top-level or reply).
 * Memoised: the parent passes stable callbacks so only changed comments re-render.
 */
const CommentItem = ({ comment, viewer, actions, onSeek, onNavigate, replies, repliesLoading, isReply = false }) => {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const author = comment.author;
  const isOwn = Boolean(viewer && author.id === viewer.id);
  const isMod = viewer && ['admin', 'artist'].includes(viewer.role);
  const pending = isTemp(comment.id);
  const profilePath = author.username ? `/u/${author.username}` : null;

  const toggleReplies = () => {
    const next = !showReplies;
    setShowReplies(next);
    if (next && !replies?.loaded) actions.loadReplies(comment.id);
  };

  const submitReply = async (body) => {
    const res = await actions.post(body, { parentId: comment.id });
    if (res.ok) { setReplying(false); setShowReplies(true); }
    return res;
  };

  const Name = profilePath ? Link : 'span';
  const nameProps = profilePath ? { to: profilePath, onClick: onNavigate } : {};

  return (
    <article className={`py-3 ${pending ? 'opacity-60' : ''}`} aria-label={`Comment by ${author.name}`} data-testid="comment">
      <div className="flex gap-3">
        {profilePath ? (
          <Link to={profilePath} onClick={onNavigate} aria-label={`${author.name}'s profile`} className="flex-shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
            <Avatar user={author} size={isReply ? 28 : 36} />
          </Link>
        ) : (
          <Avatar user={author} size={isReply ? 28 : 36} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 text-xs">
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 min-w-0 flex-1">
              <Name {...nameProps} className="font-bold text-white hover:underline truncate max-w-[10rem]">{author.name}</Name>
              {profilePath && <span className="text-zinc-500 truncate max-w-[8rem]">@{author.username}</span>}
              {author.role === 'artist' && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-accent-500/15 text-accent-300 font-bold text-[10px]"><BadgeCheck className="w-3 h-3" /> Artist</span>
              )}
              {comment.isPinned && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-300 font-bold text-[10px]"><Pin className="w-3 h-3" /> Pinned</span>
              )}
              <span className="text-zinc-500">{pending ? 'Posting…' : timeAgo(comment.createdAt)}{comment.editedAt && !pending ? ' · edited' : ''}</span>
            </div>
            {viewer && !pending && (
              <div className="flex-shrink-0 -mt-1.5 -mr-1.5">
                <Menu comment={comment} isOwn={isOwn} canDelete={isOwn || viewer.role === 'admin'} canPin={isMod}
                  onEdit={() => setEditing(true)} onDelete={() => actions.remove(comment.id)}
                  onPin={() => actions.togglePin(comment.id)} onReport={(r) => actions.report(comment.id, r)} />
              </div>
            )}
          </div>

          {editing ? (
            <div className="mt-2">
              <CommentComposer compact autoFocus initialValue={comment.body} submitLabel="Save" onCancel={() => setEditing(false)}
                onSubmit={async (body) => { const r = await actions.edit(comment.id, body); if (r.ok) setEditing(false); return r; }} />
            </div>
          ) : (
            <div className="mt-1"><CommentBody body={comment.body} onSeek={onSeek} /></div>
          )}

          {comment.likedByArtist && (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent-300 font-semibold"><Heart className="w-3 h-3 fill-accent-300" /> Liked by artist</p>
          )}

          {!editing && !pending && (
            <div className="flex items-center gap-1 mt-1 -ml-2 text-xs text-zinc-400">
              <button type="button" onClick={() => viewer ? actions.toggleLike(comment.id) : actions.needLogin()} aria-pressed={comment.likedByMe}
                aria-label={`${comment.likedByMe ? 'Unlike' : 'Like'}, ${comment.likeCount} likes`}
                className="press inline-flex items-center gap-1 px-2 py-1.5 rounded-full hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
                <Heart className={`w-4 h-4 ${comment.likedByMe ? 'fill-rose-500 text-rose-500 heart-pop' : ''}`} />
                <span className="tabular-nums">{compactCount(comment.likeCount)}</span>
              </button>
              {!isReply && (
                <button type="button" onClick={() => viewer ? setReplying((v) => !v) : actions.needLogin()}
                  className="press inline-flex items-center gap-1 px-2 py-1.5 rounded-full hover:bg-white/10 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
                  <CornerDownRight className="w-4 h-4" /> Reply
                </button>
              )}
              {comment.timestampSec != null && (
                <button type="button" onClick={() => onSeek(comment.timestampSec)} className="press ml-auto px-2 py-1 rounded-full text-brand-300 hover:bg-brand-500/10 font-semibold tabular-nums">
                  ▶ {formatTimestamp(comment.timestampSec)}
                </button>
              )}
            </div>
          )}

          {replying && (
            <div className="mt-2">
              <CommentComposer compact autoFocus placeholder={`Reply to ${author.name}…`} submitLabel="Reply" onCancel={() => setReplying(false)} onSubmit={submitReply} />
            </div>
          )}

          {!isReply && comment.replyCount > 0 && (
            <button type="button" onClick={toggleReplies} aria-expanded={showReplies}
              className="press mt-1 -ml-2 inline-flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-bold text-brand-300 hover:bg-brand-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
              {showReplies ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showReplies ? 'Hide replies' : `View ${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}`}
            </button>
          )}

          {!isReply && showReplies && (
            <div className="mt-1 pl-1 border-l border-white/10">
              {repliesLoading && !replies?.items?.length && <Loader2 className="w-4 h-4 animate-spin text-brand-400 my-3 ml-3" aria-label="Loading replies" />}
              {(replies?.items ?? []).map((r) => (
                <div key={r.id} className="pl-3">
                  <CommentItem comment={r} viewer={viewer} actions={actions} onSeek={onSeek} onNavigate={onNavigate} isReply />
                </div>
              ))}
              {replies?.hasMore && (
                <button type="button" onClick={() => actions.loadReplies(comment.id, { more: true })} disabled={repliesLoading}
                  className="press ml-3 my-1 px-3 py-1.5 rounded-full text-xs font-semibold text-zinc-300 hover:bg-white/10">
                  {repliesLoading ? 'Loading…' : 'Show more replies'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

export default memo(CommentItem);
