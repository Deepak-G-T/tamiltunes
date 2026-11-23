import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { adminApi } from '../../services/adminApi';
import { parseYouTubeId, watchUrl, looksLikeNotAVideoSong, explainFailure } from '../../lib/youtubeLink';

const SOURCE_TEXT = {
  admin: 'A video you chose',
  automatic: 'Found automatically',
  hidden: 'Hidden: people could not play it (restore it to show it again)',
  none: 'No video yet',
};

/**
 * Admin: choose the YouTube video for one song. Paste a link (or the 11-character id), Check it (title, channel, can it be embedded), Save.
 * The player only ever embeds YouTube's own player; nothing is downloaded or stored. Rendered in a portal (fixed screen).
 */
const SongVideoModal = ({ song, onClose, onChanged }) => {
  const [state, setState] = useState({ status: 'loading', item: null });
  const [text, setText] = useState('');
  const [check, setCheck] = useState(null); // { videoId, embeddable, reason, title, channel } | { error }
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const videoId = useMemo(() => parseYouTubeId(text), [text]);

  const load = () => adminApi.videoGet(song.id).then((d) => setState({ status: 'ready', item: d.item })).catch((e) => { setState({ status: 'error', item: null }); setError(explainFailure(e)); });
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [song.id]);

  const run = async (name, fn, done) => {
    setBusy(name); setError('');
    try { const r = await fn(); await load(); onChanged?.(done); return r; } catch (e) { setError(explainFailure(e)); return null; } finally { setBusy(''); }
  };
  const doCheck = async () => {
    if (!videoId) return;
    setBusy('check'); setError('');
    try { setCheck(await adminApi.videoCheck(videoId)); } catch (e) { setCheck({ error: explainFailure(e) }); } finally { setBusy(''); }
  };
  const save = () => run('save', () => adminApi.videoSet(song.id, videoId), 'Video saved.').then((r) => { if (r) setText(''); });
  const item = state.item;
  const blocked = check && check.embeddable === false;
  const hint = check?.title && looksLikeNotAVideoSong(check.title);

  const dialog = (
    <div role="dialog" aria-modal="true" aria-label="Song video" data-testid="song-video-modal" className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl bg-[#18181B] border border-zinc-800 p-6 shadow-2xl relative">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 w-11 h-11 inline-flex items-center justify-center rounded-full text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        <h3 className="text-base font-bold text-white pr-10">YouTube video</h3>
        <p className="text-xs text-zinc-400 mt-0.5 truncate" data-testid="video-song-name">{song.title} · {song.artist}</p>

        <div className="mt-4 rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-xs" data-testid="video-current">
          {state.status === 'loading' && <span className="inline-flex items-center gap-2 text-zinc-400"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Looking up the current video</span>}
          {state.status === 'ready' && item && (
            <>
              <p className="font-semibold text-zinc-200">{SOURCE_TEXT[item.source] || item.source}</p>
              {item.servedVideoId && <p className="mt-1 text-zinc-400">Plays: <a className="text-brand-300 underline" href={watchUrl(item.servedVideoId)} target="_blank" rel="noopener noreferrer">{item.servedVideoId}</a></p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {item.chosenVideoId && <button type="button" disabled={Boolean(busy)} onClick={() => run('clear', () => adminApi.videoClear(song.id), 'Your video choice was removed.')} data-testid="video-clear" className="min-h-11 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold disabled:opacity-50">Remove my choice</button>}
                {item.hidden && <button type="button" disabled={Boolean(busy)} onClick={() => run('restore', () => adminApi.videoRestore(song.id), 'The video is shown again.')} data-testid="video-restore" className="min-h-11 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold disabled:opacity-50">Show the video again</button>}
              </div>
            </>
          )}
        </div>

        <label htmlFor="song-video-input" className="mt-4 block text-xs font-semibold text-zinc-400">Paste a YouTube link (or the 11-character video id)</label>
        <input id="song-video-input" data-testid="video-input" type="text" inputMode="url" autoComplete="off" spellCheck={false} value={text} onChange={(e) => { setText(e.target.value); setCheck(null); setError(''); }} placeholder="https://www.youtube.com/watch?v=..."
          className="mt-1 w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm" />
        {text.trim() && !videoId && <p role="alert" data-testid="video-parse-error" className="mt-1.5 text-xs text-amber-400">That is not a link to one YouTube video (a playlist, channel or another website does not work).</p>}
        {videoId && <p className="mt-1.5 text-xs text-zinc-400" data-testid="video-parsed">Video id: <span className="font-mono text-zinc-200">{videoId}</span> · <a className="text-brand-300 underline inline-flex items-center gap-1" href={watchUrl(videoId)} target="_blank" rel="noopener noreferrer">Open on YouTube <ExternalLink className="w-3 h-3" aria-hidden="true" /></a></p>}

        {check && !check.error && (
          <div role="status" data-testid="video-check" className={`mt-3 rounded-xl p-3 text-xs border ${blocked ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
            <p className="flex items-center gap-1.5 font-semibold text-white">{blocked ? <AlertTriangle className="w-4 h-4 text-rose-400" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />}{blocked ? 'This video cannot be played inside the app' : check.embeddable ? 'This video can be played inside the app' : 'Could not confirm if it can be embedded'}</p>
            {check.title && <p className="mt-1 text-zinc-200">{check.title}</p>}
            {check.channel && <p className="text-zinc-400">Channel: {check.channel}</p>}
            {blocked && <p className="mt-1 text-rose-300">{check.reason === 'not-found-or-private' ? 'It was not found or it is private.' : check.reason === 'embedding-disabled' ? 'The owner turned embedding off.' : 'YouTube says it cannot be embedded.'}</p>}
            {hint && <p data-testid="video-hint" className="mt-1 text-amber-300">The title looks like a lyric, audio or live video. The app prefers the official video song. Check it on YouTube before saving.</p>}
          </div>
        )}
        {check?.error && <p role="alert" className="mt-3 text-xs text-rose-400">{check.error}</p>}
        {error && <p role="alert" data-testid="video-error" className="mt-3 text-xs text-rose-400">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={doCheck} disabled={!videoId || Boolean(busy)} data-testid="video-check-button" className="min-h-11 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center gap-2">{busy === 'check' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}Check</button>
          <button type="button" onClick={save} disabled={!videoId || blocked || Boolean(busy)} data-testid="video-save" className="min-h-11 px-4 rounded-xl bg-brand-500 hover:bg-brand-400 text-black text-sm font-bold disabled:opacity-40 inline-flex items-center gap-2">{busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}Save video</button>
        </div>
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(dialog, document.body) : dialog;
};

export default SongVideoModal;
