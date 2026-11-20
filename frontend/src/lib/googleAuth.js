/**
 * Google sign-in, the only way to sign in.
 *   website / PWA   Google's own button (Google Identity Services) gives an ID token
 *   Android app     native Google sign-in (Credential Manager, via @capgo/capacitor-social-login): Google refuses sign-in inside an embedded web view
 * Either way the ID token goes to POST /api/auth/google, which checks it and returns OUR session token. The client id is a public value.
 * Never resolve a promise with a Capacitor plugin object (see CLAUDE.md): the plugin is kept in a module variable.
 */
import { isNativeApp } from './platform';

// The client id is a public value, set at build time (VITE_GOOGLE_CLIENT_ID). Test hook: an automated browser (the audits) may supply one with
// window.__TT_GOOGLE_CLIENT_ID; a real visitor's browser ignores it. The server still checks the token's audience against ITS own list.
const fromTestHook = () => (typeof navigator !== 'undefined' && navigator.webdriver === true && typeof window !== 'undefined' && window.__TT_GOOGLE_CLIENT_ID) || '';
export const getGoogleClientId = () => import.meta.env.VITE_GOOGLE_CLIENT_ID || fromTestHook();
export const GIS_SRC = 'https://accounts.google.com/gsi/client';
export const googleConfigured = () => Boolean(getGoogleClientId());

let gisPromise = null;
export function loadGoogleScript() {
  if (typeof window !== 'undefined' && window.google?.accounts?.id) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => { gisPromise = null; reject(new Error('Could not load Google sign-in. Check your connection.')); };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

/** Draws Google's button inside `el`. Calls onCredential(idToken) after the person picks an account. */
export async function renderGoogleButton(el, { onCredential, width = 280 }) {
  await loadGoogleScript();
  const gid = window.google.accounts.id;
  gid.initialize({ client_id: getGoogleClientId(), callback: (r) => r?.credential && onCredential(r.credential), ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true });
  el.innerHTML = '';
  gid.renderButton(el, { type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'left', width });
}

let socialLogin = null;
let nativeReady = false;
async function ensureNative() {
  if (!socialLogin) {
    const mod = await import('@capgo/capacitor-social-login');
    socialLogin = mod.SocialLogin;
  }
  if (!nativeReady) {
    // webClientId must be the WEB client id (the Android client id only lives in Google Cloud: package name + signing SHA-1)
    await socialLogin.initialize({ google: { webClientId: getGoogleClientId(), mode: 'online', skipAuthOnlyAuthorizationAfterSignIn: true } });
    nativeReady = true;
  }
}

/** Android app: opens the Google account chooser and returns the ID token. */
export async function nativeGoogleIdToken() {
  await ensureNative();
  const res = await socialLogin.login({ provider: 'google', options: {} });
  const idToken = res?.result?.idToken;
  if (!idToken) throw new Error('Google did not return a sign-in token');
  return idToken;
}

/** Best effort: forget the Google account on this phone so the next sign-in asks which account to use. */
export async function nativeGoogleSignOut() {
  if (!isNativeApp() || !nativeReady) return;
  try { await socialLogin.logout({ provider: 'google' }); } catch { /* nothing to sign out */ }
}

/** A person closing the Google chooser is not an error worth showing. */
export const isGoogleCancel = (e) => /cancel|closed|dismiss|user_cancel|12501|-5/i.test(`${e?.code || ''} ${e?.message || ''}`);

export function describeGoogleError(e) {
  if (isGoogleCancel(e)) return '';
  const m = String(e?.message || '');
  if (/network|connection/i.test(m)) return 'No internet connection. Try again when you are online.';
  if (/developer_error|10:|SHA|webClientId|credential/i.test(m)) return 'Google sign-in is not set up for this version of the app yet.';
  return e?.response?.data?.message || 'Google sign-in did not complete. Please try again.';
}
