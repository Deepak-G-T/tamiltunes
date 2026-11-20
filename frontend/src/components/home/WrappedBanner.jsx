import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { wrappedWindow } from '../../lib/wrapped';
import { useAuth } from '../../context/AuthContext';

const keyFor = (year) => `tamiltunes_wrapped_seen_${year}`;
const read = (year) => { try { return localStorage.getItem(keyFor(year)) === '1'; } catch { return false; } };

/** "Your 2026 Wrapped is ready": on Home from 1 December to the end of January, for signed-in people. Can be dismissed (the Profile link stays). */
const WrappedBanner = ({ now: nowProp }) => {
  const { isAuthenticated } = useAuth();
  const [fallbackNow] = useState(() => new Date()); // read once, not on every draw
  const now = nowProp || fallbackNow;
  const navigate = useNavigate();
  const { open, year } = wrappedWindow(now);
  const [hidden, setHidden] = useState(() => read(year));
  if (!open || !isAuthenticated || hidden) return null;
  const dismiss = () => { try { localStorage.setItem(keyFor(year), '1'); } catch { /* the banner just comes back next time */ } setHidden(true); };
  return (
    <div data-testid="wrapped-banner" className="relative flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-700 to-emerald-900 p-4 pr-12">
      <Sparkles className="w-6 h-6 text-emerald-200 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white">Your {year} Wrapped is ready</p>
        <p className="text-xs text-emerald-100/80">Your year in Tamil music.</p>
      </div>
      <button type="button" onClick={() => navigate(`/wrapped?year=${year}`)} className="press min-h-11 px-4 rounded-full bg-white text-black text-xs font-bold flex-shrink-0">See it</button>
      <button type="button" onClick={dismiss} aria-label="Hide this" className="absolute top-1 right-1 w-11 h-11 inline-flex items-center justify-center rounded-full text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
    </div>
  );
};

export default WrappedBanner;
