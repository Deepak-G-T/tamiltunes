// Recording stand-in for our AppUpdater plugin, used only by the `nativetest` build (see vite.config.js). The audit picks the scenario with
// window.__native.update = { installed, versionJson, fetchError, downloadError, needPermission }. It says nothing about the real plugin on a phone.
const n = (window.__native ||= { log: [], listeners: {}, online: true });
const log = (name, arg) => n.log.push({ name, arg: arg === undefined ? undefined : JSON.parse(JSON.stringify(arg)) });
const cfg = () => (n.update ||= { installed: { versionName: '1.0.0', versionCode: 4 }, versionJson: null, fetchError: null, downloadError: null, needPermission: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (code) => { const e = new Error(code); e.code = code; return e; };

const plugin = {
  getInstalled: async () => cfg().installed,
  fetchText: async (o) => { log('AppUpdater.fetchText', o); if (cfg().fetchError) throw fail(cfg().fetchError); return { text: JSON.stringify(cfg().versionJson) }; },
  download: async (o) => {
    log('AppUpdater.download', o);
    if (cfg().downloadError) throw fail(cfg().downloadError);
    const l = n.listeners.progress;
    for (const f of [0.25, 0.6, 1]) { await sleep(120); l?.({ received: Math.round(8000000 * f), total: 8000000 }); }
    return { bytes: 8000000, sha256: o.sha256 };
  },
  cancel: async () => { log('AppUpdater.cancel'); },
  canInstall: async () => ({ allowed: !cfg().needPermission }),
  openInstallSettings: async () => { log('AppUpdater.openInstallSettings'); cfg().needPermission = false; },
  install: async () => { log('AppUpdater.install'); if (cfg().needPermission) throw fail('need_permission'); },
  cleanup: async () => { log('AppUpdater.cleanup'); },
  addListener: async (event, cb) => { n.listeners[event] = cb; return { remove: () => { delete n.listeners[event]; } }; },
};
// like Capacitor's real plugin object: any property, "then" included, is treated as a native method that does not exist
export const AppUpdater = new Proxy(plugin, { get: (t, k) => (k === 'then' ? () => { throw new Error('"AppUpdater.then()" is not implemented on android'); } : t[k]) });
