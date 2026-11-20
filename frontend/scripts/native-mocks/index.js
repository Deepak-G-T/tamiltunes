// Recording stand-ins for the Capacitor plugins, used ONLY by the `nativetest` build (vite build --mode nativetest) that scripts/native-audit.mjs
// runs in Chromium. They let the audit check what OUR code asks the plugins to do. They say nothing about the real plugins on a phone.
const n = (window.__native ||= { log: [], listeners: {}, online: true });
const log = (name, arg) => n.log.push({ name, arg: arg === undefined ? undefined : JSON.parse(JSON.stringify(arg)) });
const prefs = () => { try { return JSON.parse(sessionStorage.getItem('__native_prefs') || '{}'); } catch { return {}; } };
const savePrefs = (p) => sessionStorage.setItem('__native_prefs', JSON.stringify(p)); // survives a reload, like private storage does

const asPlugin = (name, target) => new Proxy(target, {
  get(obj, prop, receiver) {
    if (prop === 'then') {
      return () => {
        throw new Error(`"${name}.then()" is not implemented on android`);
      };
    }
    return Reflect.get(obj, prop, receiver);
  },
});

export const App = asPlugin('App', {
  addListener: async (event, cb) => { n.listeners[event] = cb; return { remove: () => { delete n.listeners[event]; } }; },
  exitApp: async () => { log('App.exitApp'); },
});
export const Preferences = asPlugin('Preferences', {
  get: async ({ key }) => ({ value: prefs()[key] ?? null }),
  set: async ({ key, value }) => { const p = prefs(); p[key] = value; savePrefs(p); log('Preferences.set', { key }); },
  remove: async ({ key }) => { const p = prefs(); delete p[key]; savePrefs(p); log('Preferences.remove', { key }); },
});
export const Network = asPlugin('Network', {
  getStatus: async () => ({ connected: n.online !== false }),
  addListener: async (event, cb) => { n.listeners[event] = cb; return { remove: () => { delete n.listeners[event]; } }; },
});
export const Share = asPlugin('Share', { share: async (o) => { log('Share.share', o); return {}; } });
export const Haptics = asPlugin('Haptics', { vibrate: async (o) => { log('Haptics.vibrate', o); } });
export const Style = { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' };
export const StatusBar = asPlugin('StatusBar', {
  setStyle: async (o) => { log('StatusBar.setStyle', o); },
  setBackgroundColor: async (o) => { log('StatusBar.setBackgroundColor', o); },
});
export const SplashScreen = asPlugin('SplashScreen', { hide: async (o) => { log('SplashScreen.hide', o); } });
let notificationPermission = 'prompt';
export const CapacitorMusicControls = asPlugin('CapacitorMusicControls', {
  create: async (o) => { log('MusicControls.create', o); },
  updateElapsed: async (o) => { log('MusicControls.updateElapsed', o); },
  destroy: async () => { log('MusicControls.destroy'); },
  checkPermissions: async () => ({ notifications: notificationPermission }),
  requestPermissions: async (p) => {
    log('MusicControls.requestPermissions', p);
    notificationPermission = 'granted';
    return { notifications: 'granted' };
  },
  openNotificationSettings: async () => { log('MusicControls.openNotificationSettings'); },
  openBatterySettings: async () => { log('MusicControls.openBatterySettings'); },
});

// Native Google sign-in: window.__native.google = { idToken: '...' } or { cancel: true } or { error: '...' } picks what the account chooser returns
export const SocialLogin = asPlugin('SocialLogin', {
  initialize: async (o) => { log('SocialLogin.initialize', { webClientId: o?.google?.webClientId, mode: o?.google?.mode }); },
  login: async (o) => {
    log('SocialLogin.login', { provider: o?.provider });
    const g = n.google || {};
    if (g.cancel) { const e = new Error('User cancelled the login'); e.code = 'USER_CANCELLED'; throw e; }
    if (g.error) throw new Error(g.error);
    return { provider: 'google', result: { idToken: g.idToken || 'TEST_GOOGLE_ID_TOKEN' } };
  },
  logout: async (o) => { log('SocialLogin.logout', { provider: o?.provider }); },
});
