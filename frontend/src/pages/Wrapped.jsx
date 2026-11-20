import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, Share2, Loader2 } from 'lucide-react';
import api from '../services/api';
import { wrappedSlides, wrappedWindow, tzMinutes, cardBlob, cardDataUrl, shareText } from '../lib/wrapped';
import { canShare as canShareLink, shareLink } from '../lib/share';
import { SITE_URL } from '../config/app';
import { isNativeApp } from '../lib/platform';
import { haptic } from '../lib/haptics';
import { useQueue } from '../context/AudioContext';

const THEMES = ['from-emerald-700 to-emerald-950', 'from-teal-700 to-slate-950', 'from-lime-700 to-emerald-950', 'from-green-700 to-zinc-950', 'from-emerald-600 to-neutral-950', 'from-cyan-700 to-slate-950', 'from-emerald-800 to-black'];

/** TamilTunes Wrapped: a full-screen story of the person's year. Private: the numbers come from their own plays and go nowhere unless they share the picture. */
const Wrapped = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { showToast } = useQueue();
  const [today] = useState(() => new Date());
  const year = Number(params.get('year')) || wrappedWindow(today).year;
  const [state, setState] = useState({ status: 'loading', data: null });
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.get('/me/wrapped', { params: { year, tz: tzMinutes(today) } })
      .then(({ data }) => { if (live) setState({ status: 'ready', data: data.wrapped }); })
      .catch(() => { if (live) setState({ status: 'error', data: null }); });
    return () => { live = false; };
  }, [year, today]);

  const slides = useMemo(() => wrappedSlides(state.data), [state.data]);
  const slide = slides[index];
  const last = index === slides.length - 1;
  const go = useCallback((delta) => setIndex((i) => Math.min(slides.length - 1, Math.max(0, i + delta))), [slides.length]);
  const close = () => navigate('/', { replace: false });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') navigate(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, navigate]);

  // the picture is drawn when the last screen opens (a data URL, nothing is stored)
  const last_ = last && state.data?.ready;
  const preview = useMemo(() => (last_ ? cardDataUrl(state.data) : null), [last_, state.data]);

  const share = async () => {
    haptic(12);
    setBusy(true);
    try {
      const text = shareText(state.data);
      const blob = !isNativeApp() ? await cardBlob(state.data) : null;
      const file = blob && typeof File !== 'undefined' ? new File([blob], 'tamiltunes-wrapped.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `My ${year} on TamilTunes`, text });
      } else {
        const r = await shareLink({ title: `My ${year} on TamilTunes`, text, url: SITE_URL }); // the app's WebView cannot share a file: text and link instead
        if (r === 'copied') showToast?.('Link copied.');
      }
    } catch { /* the person closed the share sheet */ } finally { setBusy(false); }
  };

  const theme = THEMES[index % THEMES.length];
  // In a portal: the page wrapper animates with a transform, and a transform turns `position: fixed` children into content-sized boxes
  const story = (
    <div role="dialog" aria-modal="true" aria-label={`Your ${year} Wrapped`} data-testid="wrapped"
      className={`fixed inset-0 z-[99990] flex flex-col bg-gradient-to-b ${theme} text-white transition-colors duration-500 pt-[var(--safe-top)] pb-[var(--safe-bottom)]`}>
      {/* progress + close */}
      <div className="px-4 pt-3 flex items-center gap-3">
        <div className="flex-1 flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={Math.max(1, slides.length)} aria-valuenow={index + 1} aria-label="Story progress">
          {slides.map((s, i) => <span key={s.id} className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-white' : 'bg-white/30'}`} />)}
        </div>
        <button type="button" onClick={close} aria-label="Close Wrapped" className="w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-full hover:bg-white/10"><X className="w-6 h-6" /></button>
      </div>

      {state.status === 'loading' && <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" aria-label="Loading" /></div>}
      {state.status === 'error' && (
        <div role="alert" className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-lg font-bold">Could not load your Wrapped</p>
          <button type="button" onClick={() => window.location.reload()} className="min-h-11 px-5 rounded-full bg-white text-black text-sm font-bold">Try again</button>
        </div>
      )}

      {slide && (
        <div className="relative flex-1 flex flex-col px-6 pb-4 min-h-0">
          {/* tap zones: left third = back, the rest = next (also real buttons below for keyboards and screen readers) */}
          {!last && (
            <>
              <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => go(-1)} className="absolute left-0 top-0 bottom-24 w-1/3 z-10" />
              <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => go(1)} className="absolute right-0 top-0 bottom-24 w-2/3 z-10" />
            </>
          )}
          <div key={slide.id} className="flex-1 flex flex-col justify-center gap-3 min-h-0 overflow-y-auto motion-safe:animate-[fadeUp_.45s_ease-out]" data-testid={`wrapped-slide-${slide.id}`}>
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-200">{slide.eyebrow}</p>
            {slide.big && slide.id === 'minutes' && <p className="text-6xl sm:text-7xl font-extrabold tabular-nums leading-none">{slide.big}</p>}
            <h1 dir="auto" className={`${slide.id === 'minutes' ? 'text-3xl' : 'text-4xl sm:text-5xl'} font-extrabold leading-tight break-words`}>{slide.title}</h1>
            {slide.big && slide.id !== 'minutes' && <p className="text-2xl font-bold text-emerald-200 tabular-nums">{slide.big}</p>}
            {slide.lines?.map((l) => <p key={l} className="text-base text-white/85 max-w-md">{l}</p>)}
            {slide.list?.length > 0 && (
              <ol className="mt-3 space-y-2.5 max-w-md" aria-label="Runners up">
                {slide.list.map((item) => (
                  <li key={`${item.rank}-${item.label}`} className="flex items-baseline gap-3">
                    <span className="w-6 text-white/60 tabular-nums">{item.rank}</span>
                    <span className="min-w-0 flex-1"><span dir="auto" className="block font-semibold truncate">{item.label}</span>{item.sub && <span className="block text-sm text-white/70 truncate">{item.sub}</span>}</span>
                    <span className="text-sm text-white/80 tabular-nums">{item.value}</span>
                  </li>
                ))}
              </ol>
            )}
            {slide.id === 'early' && <button type="button" onClick={close} className="self-start mt-3 min-h-11 px-5 rounded-full bg-white text-black text-sm font-bold">Go and listen</button>}
            {slide.id === 'summary' && (
              <div className="flex flex-col items-center gap-4 mt-2">
                {preview ? <img src={preview} alt="Your Wrapped picture. Touch and hold to save it." className="max-h-[42svh] w-auto rounded-2xl shadow-2xl" /> : state.data?.ready ? <div className="h-[30svh] flex items-center"><Loader2 className="w-6 h-6 animate-spin" aria-label="Drawing your picture" /></div> : null}
                <div className="flex gap-3">
                  {(canShareLink() || isNativeApp()) && <button type="button" onClick={share} disabled={busy} className="min-h-11 px-5 rounded-full bg-white text-black text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50"><Share2 className="w-4 h-4" aria-hidden="true" /> Share</button>}
                </div>
                {preview && !isNativeApp() && <p className="text-xs text-white/70">Touch and hold the picture to save it.</p>}
              </div>
            )}
          </div>
          <div className="relative z-20 flex items-center justify-between pt-2">
            <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous" className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"><ChevronLeft className="w-6 h-6" /></button>
            <span className="text-xs text-white/70 tabular-nums" aria-live="polite">{index + 1} / {slides.length}</span>
            <button type="button" onClick={() => go(1)} disabled={last} aria-label="Next" className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"><ChevronRight className="w-6 h-6" /></button>
          </div>
        </div>
      )}
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(story, document.body) : story;
};

export default Wrapped;
