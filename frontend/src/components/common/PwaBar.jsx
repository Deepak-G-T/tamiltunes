import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { applyUpdate, isNativeApp, isStandalone, rememberDismissed, wasDismissed } from '../../lib/pwa';

/**
 * A slim bar above the page: "A new version is ready" (Reload) takes priority; otherwise an install prompt for browsers that offer one
 * (`beforeinstallprompt`). Dismissing the install prompt is remembered for 30 days. Not shown in the installed app or the native app.
 */
const PwaBar = () => {
  const [update, setUpdate] = useState(false);
  const [installEvent, setInstallEvent] = useState(null);
  const [hidden, setHidden] = useState(() => isNativeApp() || isStandalone() || wasDismissed(window.localStorage));

  useEffect(() => {
    const onUpdate = () => setUpdate(true);
    const onBefore = (e) => { e.preventDefault(); if (!isNativeApp() && !isStandalone() && !wasDismissed(window.localStorage)) setInstallEvent(e); };
    const onInstalled = () => { setInstallEvent(null); setHidden(true); };
    window.addEventListener('tamiltunes:pwa-update', onUpdate);
    window.addEventListener('beforeinstallprompt', onBefore);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('tamiltunes:pwa-update', onUpdate); window.removeEventListener('beforeinstallprompt', onBefore); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  const bar = 'flex-shrink-0 relative z-30 flex items-center gap-3 px-4 py-2 text-sm border-b';
  if (update) {
    return (
      <div role="status" data-testid="pwa-update" className={`${bar} bg-brand-950 border-brand-700/50 text-brand-100`}>
        <RefreshCw className="w-4 h-4 text-brand-400 flex-shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0">A new version of TamilTunes is ready.</span>
        <button type="button" onClick={() => applyUpdate()} className="press min-h-11 px-4 rounded-full bg-brand-500 text-black text-xs font-bold">Reload</button>
      </div>
    );
  }
  if (!installEvent || hidden) return null;
  return (
    <div role="region" aria-label="Install TamilTunes" data-testid="pwa-install" className={`${bar} bg-surface-2 border-white/10 text-zinc-100`}>
      <Download className="w-4 h-4 text-brand-400 flex-shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0 truncate">Install TamilTunes on this device</span>
      <button type="button" onClick={async () => { installEvent.prompt(); const r = await installEvent.userChoice.catch(() => null); setInstallEvent(null); if (r?.outcome !== 'accepted') { rememberDismissed(window.localStorage); setHidden(true); } }}
        className="press min-h-11 px-4 rounded-full bg-brand-500 text-black text-xs font-bold">Install</button>
      <button type="button" onClick={() => { rememberDismissed(window.localStorage); setHidden(true); setInstallEvent(null); }} aria-label="Not now" className="press w-11 h-11 inline-flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10">
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export default PwaBar;
