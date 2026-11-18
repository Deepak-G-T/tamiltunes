// Recording stand-ins for the Capacitor plugins, used ONLY by the `nativetest` build (vite build --mode nativetest) that scripts/native-audit.mjs
// runs in Chromium. They let the audit check what OUR code asks the plugins to do. They say nothing about the real plugins on a phone.
const n = (window.__native ||= { log: [], listeners: {}, online: true });
const log = (name, arg) => n.log.push({ name, arg: arg === undefined ? undefined : JSON.parse(JSON.stringify(arg)) });
const prefs = () => { try { return JSON.parse(sessionStorage.getItem('__native_prefs') || '{}'); } catch { return {}; } };
const savePrefs = (p) => sessionStorage.setItem('__native_prefs', JSON.stringify(p)); // survives a reload, like private storage does

export const App = {
  addListener: async (event, cb) => { n.listeners[event] = cb; return { remove: () => { delete n.listeners[event]; } }; },
  exitApp: async () => { log('App.exitApp'); },
};
export const Preferences = {
  get: async ({ key }) => ({ value: prefs()[key] ?? null }),
  set: async ({ key, value }) => { const p = prefs(); p[key] = value; savePrefs(p); log('Preferences.set', { key }); },
  remove: async ({ key }) => { const p = prefs(); delete p[key]; savePrefs(p); log('Preferences.remove', { key }); },
};
export const Network = {
  getStatus: async () => ({ connected: n.online !== false }),
  addListener: async (event, cb) => { n.listeners[event] = cb; return { remove: () => { delete n.listeners[event]; } }; },
};
export const Share = { share: async (o) => { log('Share.share', o); return {}; } };
export const Haptics = { vibrate: async (o) => { log('Haptics.vibrate', o); } };
export const Style = { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' };
export const StatusBar = {
  setStyle: async (o) => { log('StatusBar.setStyle', o); },
  setBackgroundColor: async (o) => { log('StatusBar.setBackgroundColor', o); },
};
export const SplashScreen = { hide: async (o) => { log('SplashScreen.hide', o); } };
export const CapacitorMusicControls = {
  create: async (o) => { log('MusicControls.create', o); },
  updateElapsed: async (o) => { log('MusicControls.updateElapsed', o); },
  destroy: async () => { log('MusicControls.destroy'); },
};
