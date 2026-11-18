/**
 * Where the login token (the 7-day JWT) is kept.
 *   website         localStorage (unchanged)
 *   Android app     @capacitor/preferences, which is private to this app (not readable by other apps)
 * The rest of the app reads it synchronously (`getToken`), so the app loads the saved value into memory once at start (`initTokenStore`,
 * awaited before anything renders). A token an older version left in localStorage is moved into private storage and removed.
 */
import { isNativeApp } from './platform';

export const TOKEN_KEY = 'tamiltunes_token';
let cache = null;
let ready = false;

const local = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export async function initTokenStore() {
  if (ready) return cache;
  if (isNativeApp()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const stored = (await Preferences.get({ key: TOKEN_KEY })).value;
      const legacy = local()?.getItem(TOKEN_KEY) || null;
      if (!stored && legacy) await Preferences.set({ key: TOKEN_KEY, value: legacy });
      if (legacy) local()?.removeItem(TOKEN_KEY);
      cache = stored || legacy || null;
    } catch {
      cache = local()?.getItem(TOKEN_KEY) || null; // plugin unavailable: fall back rather than lose the login
    }
  } else {
    cache = local()?.getItem(TOKEN_KEY) || null;
  }
  ready = true;
  return cache;
}

/** The current token, or null. Safe to call before init: it then reads the browser's localStorage (website behaviour). */
export const getToken = () => (ready ? cache : (local()?.getItem(TOKEN_KEY) || null));

export async function setToken(token) {
  cache = token || null;
  if (isNativeApp()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      if (token) await Preferences.set({ key: TOKEN_KEY, value: token }); else await Preferences.remove({ key: TOKEN_KEY });
      return;
    } catch { /* fall through to localStorage */ }
  }
  if (token) local()?.setItem(TOKEN_KEY, token); else local()?.removeItem(TOKEN_KEY);
}

export const clearToken = () => setToken(null);

/** For tests only. */
export const __resetTokenStore = () => { cache = null; ready = false; };
