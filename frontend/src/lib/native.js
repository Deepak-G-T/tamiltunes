import { isNativeApp } from './platform';

/**
 * One-time setup inside the Android app: dark status bar to match the page, then hide the splash screen once the first screen is drawn.
 * Does nothing in a browser. Never throws (a missing plugin must not leave the splash screen on forever).
 */
export async function initNative() {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark }); // light icons on the dark page
    await StatusBar.setBackgroundColor({ color: '#09090B' }).catch(() => { /* edge-to-edge Android ignores this */ });
  } catch { /* plugin unavailable: carry on */ }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch { /* plugin unavailable: carry on */ }
}

/** Only these pages may be opened from a link that arrives while the app is running (App Links). */
export const DEEP_LINK_PREFIXES = ['/u/', '/album/', '/artist/', '/playlist/', '/search', '/explore', '/install', '/song'];

/** The in-app path for a link like https://<our site>/u/name?x=1 (or null when it is not one of ours / not allowed). */
export function pathFromLink(url, siteHost) {
  try {
    const u = new URL(url);
    if (siteHost && u.host !== siteHost) return null;
    const path = u.pathname || '/';
    if (path === '/') return '/';
    if (!DEEP_LINK_PREFIXES.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`))) return null;
    if (path === '/song' || path.startsWith('/song/')) return '/'; // there is no song page: open the app at home
    return `${path}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}
