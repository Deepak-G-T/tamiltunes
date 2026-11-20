import { useEffect, useRef } from 'react';
import { useAudio } from '../../context/AudioContext';
import { isNativeApp } from '../../lib/platform';
import { shouldAutoCheck } from '../../lib/appUpdate';
import { cleanupDownloads, runUpdateCheck } from '../../lib/updater';
import { getUpdateState } from '../../lib/updateState';

/** Android app only (renders nothing). At start it deletes any leftover downloaded APK, then checks for a new version quietly: at most every
 *  12 hours, never while music plays, never more than once per start, and failures are ignored (no toast, no interruption). */
const UpdateChecker = () => {
  const { isPlaying } = useAudio();
  const native = isNativeApp();
  const cleaned = useRef(false);
  const tried = useRef(false);

  useEffect(() => {
    if (!native) return;
    if (!cleaned.current) { cleaned.current = true; cleanupDownloads(); }
    if (tried.current || !shouldAutoCheck({ native, lastChecked: getUpdateState().lastChecked, isPlaying })) return;
    tried.current = true;
    runUpdateCheck().catch(() => {});
  }, [native, isPlaying]);

  return null;
};

export default UpdateChecker;
