import { isNativeApp } from './platform';

let isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
const listeners = new Set();
let initialized = false;

function notify(status) {
  if (isOnline === status) return;
  isOnline = status;
  for (const fn of listeners) {
    try {
      fn(isOnline);
    } catch (e) {
      console.warn('[networkStatus] listener error:', e);
    }
  }
}

export function initNetworkStatus() {
  if (initialized) return;
  initialized = true;

  // Window online/offline events work in browsers and Android WebView
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => notify(true));
    window.addEventListener('offline', () => notify(false));
  }

  // Capacitor Network plugin for native Android/iOS
  if (isNativeApp()) {
    import('@capacitor/network').then(async ({ Network }) => {
      try {
        const status = await Network.getStatus();
        if (typeof status?.connected === 'boolean') {
          notify(status.connected);
        }
        await Network.addListener('networkStatusChange', (s) => {
          if (typeof s?.connected === 'boolean') {
            notify(s.connected);
          }
        });
      } catch (err) {
        console.warn('[networkStatus] Capacitor Network init error:', err);
      }
    }).catch(() => { /* plugin unavailable */ });
  }
}

export function getOnlineStatus() {
  initNetworkStatus();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  return isOnline;
}

export function subscribeOnlineStatus(cb) {
  initNetworkStatus();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function _resetNetworkStatusForTest(status = true) {
  isOnline = status;
  listeners.clear();
  initialized = false;
}

export function _setOnlineForTest(status) {
  notify(status);
}
