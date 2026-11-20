import React, { useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import BottomSheet from '../common/BottomSheet';
import { cancelDownload, cleanupDownloads, downloadUpdate, installUpdate } from '../../lib/updater';
import { formatBytes, updateErrorMessage } from '../../lib/appUpdate';

/** The "new version" sheet: changelog, Update now / Later, a progress bar while the APK downloads, then Android's installer opens. */
const UpdateSheetInner = ({ open, onClose, info, installedName }) => {
  const [phase, setPhase] = useState('idle'); // idle | downloading | downloaded | error
  const [progress, setProgress] = useState({ received: 0, total: 0 });
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const busy = useRef(false);

  const close = () => {
    if (phase === 'downloading') cancelDownload();
    cleanupDownloads(); // Later / closing deletes anything downloaded
    onClose();
  };

  const install = async () => {
    try {
      await installUpdate();
      setNote("Android's installer is open. If you cancelled it, tap Install again.");
      setPhase('downloaded');
    } catch (e) {
      setPhase('downloaded');
      setError(updateErrorMessage(e.code));
    }
  };

  const start = async () => {
    if (busy.current) return;
    busy.current = true;
    setError(''); setNote('');
    try {
      if (phase !== 'downloaded') {
        setPhase('downloading');
        await downloadUpdate(info, setProgress);
      }
      await install();
    } catch (e) {
      setPhase('error');
      setError(updateErrorMessage(e.code));
    } finally {
      busy.current = false;
    }
  };

  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : 0;
  return (
    <BottomSheet open={open} onClose={close} title={`Version ${info.versionName} is available`} subtitle={installedName ? `You have version ${installedName}` : undefined} testId="update-sheet"
      footer={(
        <div className="flex gap-2">
          <button type="button" onClick={close} className="press flex-1 py-3 rounded-full bg-white/10 text-white text-sm font-semibold">Later</button>
          <button type="button" onClick={start} disabled={phase === 'downloading'} data-testid="update-now"
            className="press flex-1 py-3 rounded-full bg-brand-500 text-black text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {phase === 'downloading' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
            {phase === 'downloaded' ? 'Install now' : phase === 'downloading' ? 'Downloading…' : 'Update now'}
          </button>
        </div>
      )}>
      <div className="space-y-3">
        {info.changelog?.length > 0 && (
          <div>
            <h3 className="text-xs uppercase tracking-wider font-bold text-zinc-500 mb-1">What is new</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-200" data-testid="update-changelog">{info.changelog.map((l, i) => <li key={i}>{l.replace(/^[-*]\s*/, '')}</li>)}</ul>
          </div>
        )}
        {info.size > 0 && phase === 'idle' && <p className="text-xs text-zinc-400">Download size: {formatBytes(info.size)}. Your login and data stay on the phone.</p>}
        {phase === 'downloading' && (
          <div>
            <div role="progressbar" aria-label="Downloading the update" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} data-testid="update-progress" className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-brand-400 transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-zinc-400">{pct}%{progress.total ? ` of ${formatBytes(progress.total)}` : ''}</p>
          </div>
        )}
        {note && <p role="status" className="text-sm text-brand-300">{note}</p>}
        {error && <p role="alert" data-testid="update-error" className="text-sm text-rose-400">{error}</p>}
      </div>
    </BottomSheet>
  );
};

/** Mounted only while open, so every opening starts fresh (no leftover progress or errors). */
const UpdateSheet = (props) => (props.open && props.info ? <UpdateSheetInner {...props} /> : null);

export default UpdateSheet;
