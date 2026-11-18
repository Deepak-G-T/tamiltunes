import { isNativeApp } from '../lib/platform';

// Where the Android app can be downloaded. Change it here (or set VITE_APK_URL in Vercel) if the file moves.
export const APK_URL = import.meta.env.VITE_APK_URL || 'https://github.com/Deepak-G-T/tamiltunes/releases/latest/download/TamilTunes.apk';
export const RELEASES_URL = 'https://github.com/Deepak-G-T/tamiltunes/releases/latest';

// The website calls its own `/api` (Vercel forwards it to Render). The native app is served from https://localhost, so `/api` would point at the
// phone: it must call the Render server directly (that server allows https://localhost and capacitor://localhost through CORS_ORIGIN).
export const NATIVE_API_URL = 'https://tamiltunes-backend.onrender.com/api';
export const SITE_URL = 'https://frontend-eosin-five-11.vercel.app';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (isNativeApp() ? NATIVE_API_URL : '/api');
