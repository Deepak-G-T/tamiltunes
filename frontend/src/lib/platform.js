/** Are we inside the native Android app (Capacitor)? False in every browser, in tests and during the build. */
export const isNativeApp = () => typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
