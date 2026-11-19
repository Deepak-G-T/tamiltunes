/** The last update check, kept in this browser view (not secret): shared by the Profile card and the "Update available" dot. */
import { useSyncExternalStore } from 'react';

const KEY = 'tamiltunes_update_check';
const EVT = 'tamiltunes-update-changed';
const read = () => { try { const v = JSON.parse(globalThis.localStorage?.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : { lastChecked: 0, latest: null }; } catch { return { lastChecked: 0, latest: null }; } };
let snapshot = read();

export const getUpdateState = () => snapshot;
export function saveUpdateState(next) {
  snapshot = { ...snapshot, ...next };
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(snapshot)); } catch { /* private mode: keep it in memory */ }
  globalThis.dispatchEvent?.(new Event(EVT));
}
const subscribe = (cb) => { globalThis.addEventListener?.(EVT, cb); return () => globalThis.removeEventListener?.(EVT, cb); };
export const useUpdateState = () => useSyncExternalStore(subscribe, getUpdateState, getUpdateState);
