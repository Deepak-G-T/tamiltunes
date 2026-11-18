/**
 * Service worker registration, the "new version" prompt and the install prompt. Everything here is skipped inside the native Android
 * app (it ships its own files), in development and where service workers are not supported.
 */
export const DISMISS_KEY = 'tamiltunes_install_dismissed_v1';
export const DISMISS_DAYS = 30;

export const isNativeApp = () => typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

/** Was "Not now" tapped recently? Broken storage means "not dismissed". */
export function wasDismissed(storage, now = Date.now()) {
  try {
    const at = Number(storage?.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && now - at < DISMISS_DAYS * 86400e3;
  } catch {
    return false;
  }
}
export function rememberDismissed(storage, now = Date.now()) {
  try { storage?.setItem(DISMISS_KEY, String(now)); } catch { /* storage blocked: the banner may come back next visit */ }
}

// The browser's install offer. It can arrive before any component is on screen, so it is captured at startup and kept here.
let installEvent = null;
export const getInstallEvent = () => installEvent;
export function captureInstallPrompt() {
  if (typeof window === 'undefined' || isNativeApp()) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button
    installEvent = e;
    window.dispatchEvent(new CustomEvent('tamiltunes:install-available'));
  });
  window.addEventListener('appinstalled', () => { installEvent = null; window.dispatchEvent(new CustomEvent('tamiltunes:installed')); });
}
/** Show the browser's install dialog. Resolves to 'accepted', 'dismissed' or null (nothing to install). */
export async function promptInstall() {
  const e = installEvent;
  if (!e) return null;
  installEvent = null;
  e.prompt();
  const choice = await e.userChoice?.catch?.(() => null);
  return choice?.outcome ?? null;
}

let updateSW = null;
/** Register the worker. A new version raises `tamiltunes:pwa-update`; `applyUpdate()` then reloads on the new one. */
export async function registerServiceWorker() {
  if (typeof window === 'undefined' || isNativeApp() || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => window.dispatchEvent(new CustomEvent('tamiltunes:pwa-update')),
  });
}
export const applyUpdate = () => updateSW?.(true);
