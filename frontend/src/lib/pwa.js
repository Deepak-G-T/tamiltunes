/**
 * Service worker registration, the "new version" prompt and the install prompt. Everything here is skipped inside the native Android
 * app (it ships its own files), in development and where service workers are not supported.
 */
export const DISMISS_KEY = 'tamiltunes_install_dismissed_v1';
export const DISMISS_DAYS = 30;

import { isNativeApp } from './platform';
import { shouldAutoApply, readLastAuto, writeLastAuto } from './autoUpdate';
export { isNativeApp };
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
let pendingUpdate = false;
let isPlayingProbe = () => false;
/** The player tells us whether a song is playing, so an automatic update never interrupts the music. */
export const setPlayingProbe = (fn) => { isPlayingProbe = typeof fn === 'function' ? fn : () => false; };

/** Switch to the new version by itself when that is safe (see lib/autoUpdate.js). Called when an update arrives and again later. */
export function tryAutoApply() {
  if (!pendingUpdate || !updateSW) return false;
  const ok = shouldAutoApply({
    pending: pendingUpdate,
    isPlaying: Boolean(isPlayingProbe()),
    pageAgeMs: typeof performance !== 'undefined' ? performance.now() : NaN,
    hidden: document.visibilityState === 'hidden',
    lastAutoAt: readLastAuto(window.sessionStorage),
  });
  if (!ok) return false;
  writeLastAuto(window.sessionStorage);
  reloadWhenNewWorkerTakesOver();
  updateSW(false); // tell the waiting worker to take over; we reload ourselves below (the library only reloads in some cases)
  return true;
}

let reloading = false;
function reloadWhenNewWorkerTakesOver() {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  }, { once: true });
}

const UPDATE_CHECK_EVERY_MS = 60 * 60 * 1000; // look for a new version at least hourly in a long-lived tab
const UPDATE_CHECK_MIN_GAP_MS = 10 * 60 * 1000; // and when the tab comes back, but not more often than every 10 minutes

/** Register the worker. A new version raises `tamiltunes:pwa-update` (the bar offers Reload) and is also applied by itself when safe. */
export async function registerServiceWorker() {
  if (typeof window === 'undefined' || isNativeApp() || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  let lastCheck = Date.now();
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => { pendingUpdate = true; window.dispatchEvent(new CustomEvent('tamiltunes:pwa-update')); tryAutoApply(); },
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      const check = () => { lastCheck = Date.now(); registration.update().catch(() => { /* offline: try again later */ }); };
      setInterval(check, UPDATE_CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - lastCheck > UPDATE_CHECK_MIN_GAP_MS) check();
      });
    },
  });
  document.addEventListener('visibilitychange', tryAutoApply); // the person left the tab: a good moment
  setInterval(tryAutoApply, 60 * 1000); // playback may have stopped while the tab was hidden
}
export const applyUpdate = () => updateSW?.(true);
