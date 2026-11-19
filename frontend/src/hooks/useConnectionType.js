import { useEffect, useState } from 'react';
import { isNativeApp } from '../lib/platform';

/** 'wifi', 'cellular', 'none', ... or undefined when the browser cannot tell (most desktop browsers). */
export function useConnectionType() {
  const [type, setType] = useState(() => (typeof navigator === 'undefined' ? undefined : navigator.connection?.type));
  useEffect(() => {
    let off = () => {};
    let cancelled = false;
    if (isNativeApp()) {
      import('@capacitor/network').then(async ({ Network }) => {
        if (cancelled) return;
        setType((await Network.getStatus()).connectionType);
        const h = await Network.addListener('networkStatusChange', (s) => setType(s.connectionType));
        if (cancelled) h.remove(); else off = () => h.remove();
      }).catch(() => { /* unknown */ });
    } else if (typeof navigator !== 'undefined' && navigator.connection?.addEventListener) {
      const c = navigator.connection;
      const on = () => setType(c.type);
      c.addEventListener('change', on);
      off = () => c.removeEventListener('change', on);
    }
    return () => { cancelled = true; off(); };
  }, []);
  return type;
}
