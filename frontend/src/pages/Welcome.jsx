import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, X, Loader2 } from 'lucide-react';
import { loadTaste, saveTaste } from '../lib/tasteApi';
import { STEPS, RECOMMENDED, toggleChoice, picksPayload, totalPicks, stepProgress } from '../lib/taste';
import { haptic } from '../lib/haptics';
import { useQueue } from '../context/AudioContext';

/**
 * First-login picker: favourite singers, music directors and eras. Optional at every step ("Skip for now"), editable later from Settings (?edit=1).
 * Rendered in a portal: the page wrapper animates with a transform, which would make this fixed screen collapse.
 */
const Welcome = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editing = params.get('edit') === '1';
  const { showToast } = useQueue();
  const [data, setData] = useState({ status: 'loading', options: null });
  const [picks, setPicks] = useState({ artists: [], composers: [], eras: [] });
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [limitNote, setLimitNote] = useState('');

  useEffect(() => {
    let live = true;
    loadTaste()
      .then((d) => {
        if (!live) return;
        setData({ status: 'ready', options: d.options });
        if (d.taste) setPicks({ artists: d.taste.artists, composers: d.taste.composers, eras: d.taste.eras });
      })
      .catch(() => { if (live) setData({ status: 'error', options: null }); });
    return () => { live = false; };
  }, []);

  const current = STEPS[step];
  const options = data.options;
  const choices = useMemo(() => {
    if (!options) return [];
    if (current.id === 'eras') return options.eras.map((e) => ({ value: e.id, label: e.label }));
    return options[current.id].map((n) => ({ value: n, label: n }));
  }, [options, current.id]);
  const max = options?.limits?.[current.id] ?? 12;
  const chosen = picks[current.id];
  const last = step === STEPS.length - 1;

  const toggle = (value) => {
    haptic(8);
    const r = toggleChoice(chosen, value, max);
    setPicks((p) => ({ ...p, [current.id]: r.list }));
    setLimitNote(r.atLimit ? `You can pick up to ${max}.` : '');
  };

  const done = (message) => { if (message) showToast?.(message); navigate('/', { replace: true }); };

  const save = async (skip = false) => {
    setSaving(true); setError('');
    try {
      await saveTaste(skip ? { artists: [], composers: [], eras: [], skipped: true } : picksPayload(picks, options));
      done(skip ? '' : totalPicks(picks) ? 'Your Daily Mixes are being built from your picks.' : '');
    } catch {
      if (skip) done(''); // never trap someone in the picker
      else { setError('Could not save. Check your connection and try again.'); setSaving(false); }
    }
  };

  const next = () => (last ? save(false) : setStep((s) => s + 1));
  const screen = (
    <div role="dialog" aria-modal="true" aria-label="Choose your favourites" data-testid="welcome"
      className="fixed inset-0 z-[99990] flex flex-col bg-[#09090B] text-white pt-[var(--safe-top)]">
      <div className="px-4 pt-3 flex items-center gap-3">
        <div className="flex-1 flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={`Step ${stepProgress(step, STEPS.length)}`}>
          {STEPS.map((s, i) => <span key={s.id} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-brand-400' : 'bg-white/20'}`} />)}
        </div>
        {editing
          ? <button type="button" onClick={() => navigate(-1)} aria-label="Close" className="w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-full hover:bg-white/10"><X className="w-6 h-6" /></button>
          : <button type="button" onClick={() => save(true)} disabled={saving} className="min-h-11 px-2 -mr-2 text-sm font-semibold text-zinc-300 hover:text-white disabled:opacity-50">Skip for now</button>}
      </div>

      {data.status === 'loading' && <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-brand-400" aria-label="Loading" /></div>}
      {data.status === 'error' && (
        <div role="alert" className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-lg font-bold">Could not load the choices</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => window.location.reload()} className="min-h-11 px-5 rounded-full bg-brand-500 text-black text-sm font-bold">Try again</button>
            <button type="button" onClick={() => navigate('/', { replace: true })} className="min-h-11 px-5 rounded-full bg-white/10 text-sm font-semibold">Continue without</button>
          </div>
        </div>
      )}

      {data.status === 'ready' && (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-4" data-testid={`welcome-step-${current.id}`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">{editing ? 'Your favourites' : `Welcome · ${stepProgress(step, STEPS.length)}`}</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold leading-tight">{current.title}</h1>
            <p className="mt-1 text-sm text-zinc-400">{current.hint}{current.id === 'artists' && chosen.length < RECOMMENDED ? ` We suggest at least ${RECOMMENDED}.` : ''}</p>
            <ul role="list" className="mt-5 flex flex-wrap gap-2.5" aria-label={current.title}>
              {choices.map((c) => {
                const on = chosen.includes(c.value);
                const blocked = !on && chosen.length >= max;
                return (
                  <li key={c.value}>
                    <button type="button" onClick={() => toggle(c.value)} aria-pressed={on} aria-disabled={blocked || undefined} data-testid="choice"
                      className={`min-h-11 px-4 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 border transition-colors ${on ? 'bg-brand-500 text-black border-brand-500' : blocked ? 'bg-white/5 text-zinc-500 border-white/10' : 'bg-white/10 text-white border-white/10 hover:bg-white/15'}`}>
                      {on && <Check className="w-4 h-4" aria-hidden="true" />}{c.label}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p role="status" aria-live="polite" className="mt-4 text-xs text-zinc-400" data-testid="choice-count">{chosen.length} of {max} picked{limitNote ? `. ${limitNote}` : ''}</p>
            {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
          </div>
          <div className="px-5 pt-3 pb-[max(1rem,var(--safe-bottom))] flex items-center gap-3 border-t border-white/10 bg-[#09090B]">
            {step > 0 && <button type="button" onClick={() => setStep((s) => s - 1)} disabled={saving} className="min-h-12 px-5 rounded-full bg-white/10 hover:bg-white/15 text-sm font-semibold">Back</button>}
            <button type="button" onClick={next} disabled={saving} data-testid="welcome-next" className="flex-1 min-h-12 rounded-full bg-brand-500 hover:bg-brand-400 text-black text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60">
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}{last ? (editing ? 'Save' : 'Finish') : 'Next'}
            </button>
          </div>
        </>
      )}
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(screen, document.body) : screen;
};

export default Welcome;
