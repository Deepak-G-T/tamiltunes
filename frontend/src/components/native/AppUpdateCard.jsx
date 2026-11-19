import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import { isNativeApp } from '../../lib/platform';
import { describeLastChecked, updateErrorMessage } from '../../lib/appUpdate';
import { getInstalled, runUpdateCheck } from '../../lib/updater';
import { useUpdateState } from '../../lib/updateState';
import UpdateSheet from './UpdateSheet';

/** Profile: "Version 1.0.0" and a "Check for updates" button. Only inside the Android app (nothing on the website or the PWA). */
const AppUpdateCardInner = () => {
  const { showToast } = useAudio();
  const saved = useUpdateState();
  const [installed, setInstalled] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState(false);

  useEffect(() => { getInstalled().then(setInstalled).catch(() => {}); }, []);

  const installedCode = installed?.versionCode ?? saved.installedCode ?? 0;
  const latest = saved.latest && saved.latest.versionCode > installedCode ? saved.latest : null;

  const check = async () => {
    setChecking(true); setError('');
    try {
      const r = await runUpdateCheck();
      setInstalled(r.installed);
      if (r.state === 'available') setSheet(true); else showToast?.("You're on the latest version");
    } catch (e) {
      setError(updateErrorMessage(e.code));
    } finally {
      setChecking(false);
    }
  };

  return (
    <section aria-label="App version" data-testid="app-update-card" className="mt-4 rounded-xl bg-black/30 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white" data-testid="app-version">Version {installed?.versionName || '…'}</p>
          <p className="text-xs text-zinc-400" data-testid="update-last-checked">{describeLastChecked(saved.lastChecked)}</p>
        </div>
        <button type="button" onClick={check} disabled={checking} data-testid="check-updates"
          className="press inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex-shrink-0 disabled:opacity-60">
          {checking ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4" aria-hidden="true" />}
          Check for updates
        </button>
      </div>
      {latest && !checking && (
        <button type="button" onClick={() => setSheet(true)} className="mt-2 text-xs font-semibold text-brand-300 underline" data-testid="update-available">Version {latest.versionName} is available</button>
      )}
      {error && <p role="alert" data-testid="update-check-error" className="mt-2 text-xs text-rose-400">{error}</p>}
      <UpdateSheet open={sheet} onClose={() => setSheet(false)} info={latest} installedName={installed?.versionName} />
    </section>
  );
};

/** Nothing at all on the website and the PWA: the inner card (and its plugin calls) only exists inside the Android app. */
const AppUpdateCard = () => (isNativeApp() ? <AppUpdateCardInner /> : null);

export default AppUpdateCard;
