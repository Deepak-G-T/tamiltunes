/** Talks to the Android AppUpdater plugin. Native app only. Errors carry a `code` (see updateErrorMessage in appUpdate.js). */
import { AppUpdater } from '@tamiltunes/app-updater';
import { apkUrl, compareVersionCode, parseVersionInfo, versionJsonUrl } from './appUpdate';
import { saveUpdateState } from './updateState';

const err = (code) => Object.assign(new Error(code), { code });
const codeOf = (e) => e?.code || (typeof e?.message === 'string' && /^[a-z_]+$/.test(e.message) ? e.message : 'failed');

export const getInstalled = async () => {
  const r = await AppUpdater.getInstalled();
  return { versionName: String(r?.versionName || ''), versionCode: Number(r?.versionCode) || 0 };
};

/** Looks for a newer release. Returns { state: 'available' | 'latest', installed, latest } or throws an Error with a code. */
export async function checkForUpdate() {
  let text;
  try { text = (await AppUpdater.fetchText({ url: versionJsonUrl() })).text; } catch (e) { throw err(codeOf(e)); }
  const parsed = parseVersionInfo(text);
  if (!parsed.ok) throw err(parsed.reason);
  const installed = await getInstalled();
  return { state: compareVersionCode(installed.versionCode, parsed.info.versionCode) === 1 ? 'available' : 'latest', installed, latest: parsed.info };
}

/** Downloads and verifies the APK (progress: { received, total }). Throws an Error with a code. */
export async function downloadUpdate(info, onProgress) {
  let handle = null;
  try {
    handle = await AppUpdater.addListener('progress', (p) => onProgress?.({ received: Number(p?.received) || 0, total: Number(p?.total) || info.size || 0 }));
    await AppUpdater.download({ url: apkUrl(), sha256: info.sha256, size: info.size });
  } catch (e) {
    throw err(codeOf(e));
  } finally {
    handle?.remove?.();
  }
}

export const cancelDownload = () => AppUpdater.cancel().catch(() => {});
export const cleanupDownloads = () => AppUpdater.cleanup().catch(() => {});

/** Opens Android's installer. If the person has not allowed installs from TamilTunes yet, opens that settings page and throws need_permission. */
export async function installUpdate() {
  const { allowed } = await AppUpdater.canInstall();
  if (!allowed) { await AppUpdater.openInstallSettings().catch(() => {}); throw err('need_permission'); }
  try { await AppUpdater.install(); } catch (e) { throw err(codeOf(e)); }
}

/** A check that also remembers the result (time, newest version) for the Profile card and the dot. A failed check does not count as checked. */
export async function runUpdateCheck() {
  const r = await checkForUpdate();
  saveUpdateState({ lastChecked: Date.now(), installedCode: r.installed.versionCode, installedName: r.installed.versionName, latest: r.state === 'available' ? r.latest : null });
  return r;
}
