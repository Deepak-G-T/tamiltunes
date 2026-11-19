import { useEffect, useState } from 'react';
import { isNativeApp } from '../lib/platform';

/** true while the device has a connection. Uses the Capacitor Network plugin in the app, the browser's online / offline events elsewhere. */
export function useOnlineStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);

  useEffect(() => {
    let off = () => {};
    let cancelled = false;
    if (isNativeApp()) {
      import('@capacitor/network').then(async ({ Network }) => {
        if (cancelled) return;
        setOnline((await Network.getStatus()).connected);
        const handle = await Network.addListener('networkStatusChange', (s) => setOnline(s.connected));
        if (cancelled) handle.remove(); else off = () => handle.remove();
      }).catch(() => { /* plugin unavailable: assume online */ });
    } else {
      const up = () => setOnline(true);
      const down = () => setOnline(false);
      window.addEventListener('online', up);
      window.addEventListener('offline', down);
      off = () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
    }
    return () => { cancelled = true; off(); };
  }, []);

  return online;
}
