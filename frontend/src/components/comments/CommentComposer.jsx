import React, { useRef, useState, useId, useEffect } from 'react';
import { Send, Smile, Clock, Loader2 } from 'lucide-react';
import Avatar from '../common/Avatar';
import EmojiPicker from './EmojiPicker';
import { COMMENT_MAX, commentError } from '../../lib/validate';
import { charLength, formatTimestamp } from '../../lib/format';

/**
 * Text box for new comments, replies and edits.
 * @param {{
 *   user?: object, onSubmit: (body: string) => Promise<{ ok: boolean, error?: string }>,
 *   placeholder?: string, initialValue?: string, submitLabel?: string, autoFocus?: boolean,
 *   currentTime?: number, onCancel?: () => void, compact?: boolean
 * }} props
 */
const CommentComposer = ({ user, onSubmit, placeholder = 'Add a comment…', initialValue = '', submitLabel = 'Post', autoFocus = false, currentTime = 0, onCancel, compact = false }) => {
  const [text, setText] = useState(initialValue);
  const [showEmoji, setShowEmoji] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);
  const id = useId();

  useEffect(() => { if (autoFocus) ref.current?.focus({ preventScroll: true }); }, [autoFocus]);

  const used = charLength(text);
  const over = used > COMMENT_MAX;
  const near = used >= COMMENT_MAX * 0.9;

  const insert = (snippet) => {
    const el = ref.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${snippet}${text.slice(end)}`;
    setText(next);
    requestAnimationFrame(() => {
      el?.focus({ preventScroll: true });
      el?.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (busy) return;
    const problem = commentError(text);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    const res = await onSubmit(text.trim());
    setBusy(false);
    if (res?.ok) { setText(''); setShowEmoji(false); } else setError(res?.error || 'Could not post. Please try again.');
  };

  return (
    <form onSubmit={submit} className="flex gap-2.5 items-start" aria-label="Write a comment">
      {!compact && <Avatar user={user} size={36} className="mt-1" />}
      <div className="flex-1 min-w-0">
        <label htmlFor={id} className="sr-only">{placeholder}</label>
        <textarea
          id={id}
          ref={ref}
          dir="auto"
          lang="ta"
          value={text}
          onChange={(e) => { setText(e.target.value); if (error) setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); }}
          placeholder={placeholder}
          rows={compact ? 2 : 2}
          autoComplete="off"
          aria-invalid={over || Boolean(error)}
          aria-describedby={`${id}-count ${error ? `${id}-err` : ''}`}
          className="w-full resize-none rounded-xl bg-surface-3 border border-white/10 focus:border-brand-400 focus:outline-none text-[15px] leading-relaxed text-white placeholder:text-zinc-500 px-3 py-2"
        />
        <div className="flex items-center gap-1 mt-1">
          <button type="button" onClick={() => setShowEmoji((v) => !v)} aria-expanded={showEmoji} aria-label="Emoji picker"
            className="press p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
            <Smile className="w-5 h-5" />
          </button>
          {currentTime > 0 && (
            <button type="button" onClick={() => insert(`${formatTimestamp(currentTime)} `)} aria-label={`Insert current time ${formatTimestamp(currentTime)}`}
              className="press inline-flex items-center gap-1 px-2 py-1.5 rounded-full text-[11px] font-semibold text-zinc-400 hover:text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
              <Clock className="w-4 h-4" /> {formatTimestamp(currentTime)}
            </button>
          )}
          <span id={`${id}-count`} aria-live={near ? 'polite' : 'off'} data-testid="comment-counter"
            className={`ml-auto mr-1 text-[11px] tabular-nums ${over ? 'text-rose-400 font-bold' : near ? 'text-accent-400' : 'text-zinc-500'}`}>
            {used}/{COMMENT_MAX}
          </span>
          {onCancel && (
            <button type="button" onClick={onCancel} className="press px-3 py-1.5 rounded-full text-xs font-semibold text-zinc-300 hover:bg-white/10">Cancel</button>
          )}
          <button type="submit" disabled={busy || over || !text.trim()}
            className="press inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-brand-500 hover:bg-brand-400 disabled:opacity-40 disabled:hover:bg-brand-500 text-black text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} {submitLabel}
          </button>
        </div>
        {showEmoji && <div className="mt-1"><EmojiPicker onPick={insert} /></div>}
        {error && <p id={`${id}-err`} role="alert" className="mt-1.5 text-xs text-rose-400">{error}</p>}
      </div>
    </form>
  );
};

export default CommentComposer;
