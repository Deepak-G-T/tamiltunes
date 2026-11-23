import React, { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { applyUpdate, setPlayingProbe, getInstallEvent, isNativeApp, isStandalone, promptInstall, rememberDismissed, wasDismissed } from '../../lib/pwa';
import { useAudio } from '../../context/AudioContext';

/**
 * A slim bar above the page: "A new version is ready" (Reload) takes priority; otherwise an install prompt for browsers that offer one
 * (`beforeinstallprompt`). Dismissing the install prompt is remembered for 30 days. Not shown in the installed app or the native app.
 * Safe update rule: update prompt is shown only when music isn't actively playing, so listening is never interrupted.
 * The site also switches to the new version by itself when that is safe: right after it was opened or when the tab is hidden, never while music plays (lib/autoUpdate.js).
 */
const PwaBar = () => {
  const audio = useAudio();
  const isPlaying = Boolean(audio?.isPlaying);
  const [hasPendingUpdate, setHasPendingUpdate] = useState(false);
  const playingRef = useRef(false);
  playingRef.current = isPlaying;
  useEffect(() => { setPlayingProbe(() => playingRef.current); return () => setPlayingProbe(null); }, []); // lets the automatic update see whether music is playing
  const [canInstall, setCanInstall] = useState(() => Boolean(getInstallEvent())); // the offer may have arrived before this bar mounted
  const [hidden, setHidden] = useState(() => isNativeApp() || isStandalone() || wasDismissed(window.localStorage));

  useEffect(() => {
    const onUpdate = () => setHasPendingUpdate(true);
    const onAvailable = () => setCanInstall(true);
    const onInstalled = () => { setCanInstall(false); setHidden(true); };
    window.addEventListener('tamiltunes:pwa-update', onUpdate);
    window.addEventListener('tamiltunes:install-available', onAvailable);
    window.addEventListener('tamiltunes:installed', onInstalled);
    return () => {
      window.removeEventListener('tamiltunes:pwa-update', onUpdate);
      window.removeEventListener('tamiltunes:install-available', onAvailable);
      window.removeEventListener('tamiltunes:installed', onInstalled);
    };
  }, []);

  // Show update prompt only when not playing music
  const showUpdatePrompt = hasPendingUpdate && !isPlaying;

  const bar = 'flex-shrink-0 relative z-30 flex items-center gap-3 px-4 py-2 text-sm border-b';
  if (showUpdatePrompt) {
    return (
      <div role="status" data-testid="pwa-update" className={`${bar} bg-brand-950 border-brand-700/50 text-brand-100`}>
        <RefreshCw className="w-4 h-4 text-brand-400 flex-shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0">A new version of TamilTunes is ready.</span>
        <button type="button" onClick={() => applyUpdate()} className="press min-h-11 px-4 rounded-full bg-brand-500 text-black text-xs font-bold">Reload</button>
      </div>
    );
  }
  if (!canInstall || hidden) return null;
  return (
    <div role="region" aria-label="Install TamilTunes" data-testid="pwa-install" className={`${bar} bg-surface-2 border-white/10 text-zinc-100`}>
      <Download className="w-4 h-4 text-brand-400 flex-shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0 truncate">Install TamilTunes on this device <Link to="/install" className="underline text-zinc-400 hover:text-white ml-1">More ways</Link></span>
      <button type="button" onClick={async () => { const r = await promptInstall(); setCanInstall(false); if (r !== 'accepted') { rememberDismissed(window.localStorage); setHidden(true); } }}
        className="press min-h-11 px-4 rounded-full bg-brand-500 text-black text-xs font-bold">Install</button>
      <button type="button" onClick={() => { rememberDismissed(window.localStorage); setHidden(true); setCanInstall(false); }} aria-label="Not now" className="press w-11 h-11 inline-flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10">
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export default PwaBar;
