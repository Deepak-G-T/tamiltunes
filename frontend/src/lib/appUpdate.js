/**
 * In-app update (Android app only): pure rules. The app reads `version.json` from the newest GitHub Release and downloads the signed APK from the
 * same Release. No token is ever in the app: the repository's releases are public. The Java side (AppUpdaterPlugin.java) repeats the host list
 * and the path rule; appUpdate.test.js fails when the two drift apart.
 */
export const UPDATE_REPO = 'Deepak-G-T/tamiltunes';
/** github.com serves the release, GitHub's own download hosts serve the file after a redirect. Nothing else is ever contacted. */
export const UPDATE_HOSTS = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];
export const AUTO_CHECK_MS = 12 * 60 * 60 * 1000;

export const versionJsonUrl = (repo = UPDATE_REPO) => `https://github.com/${repo}/releases/latest/download/version.json`;
export const apkUrl = (repo = UPDATE_REPO) => `https://github.com/${repo}/releases/latest/download/app-release.apk`;

const parse = (u) => { try { return new URL(u); } catch { return null; } };

/** The address we START from: https, github.com, inside this repository's releases. */
export function isAllowedStartUrl(url, repo = UPDATE_REPO) {
  const u = parse(url);
  return Boolean(u && u.protocol === 'https:' && u.hostname === 'github.com' && !u.port && !u.username && !u.password && u.pathname.startsWith(`/${repo}/releases/`));
}
/** Every redirect hop must be https on one of the known hosts (GitHub sends release files to its download hosts). */
export function isAllowedHop(url) {
  const u = parse(url);
  return Boolean(u && u.protocol === 'https:' && UPDATE_HOSTS.includes(u.hostname) && !u.port && !u.username && !u.password);
}

/** 1 when `latest` is newer than `installed`, 0 when equal, -1 when older. Only whole numbers count (versionCode). */
const whole = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' ? NaN : Number(v));
export function compareVersionCode(installed, latest) {
  const a = whole(installed);
  const b = whole(latest);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return 0;
  return b > a ? 1 : b < a ? -1 : 0;
}

/** versionCode from a tag like v1.2.3 (major*10000 + minor*100 + patch); bigger than every debug build number. null when the tag is not x.y.z. */
export function versionCodeFromTag(tag) {
  const m = /^v?(\d{1,3})\.(\d{1,2})\.(\d{1,2})$/.exec(String(tag || '').trim());
  if (!m) return null;
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (min > 99 || pat > 99) return null;
  return maj * 10000 + min * 100 + pat;
}

/** Validates version.json (never trust a downloaded file). Returns { ok, info } or { ok: false, reason }. */
export function parseVersionInfo(raw) {
  let j = raw;
  if (typeof raw === 'string') { try { j = JSON.parse(raw); } catch { return { ok: false, reason: 'bad_json' }; } }
  if (!j || typeof j !== 'object') return { ok: false, reason: 'bad_json' };
  const code = Number(j.versionCode);
  if (!Number.isInteger(code) || code <= 0 || code > 2100000000) return { ok: false, reason: 'bad_version_code' };
  if (typeof j.versionName !== 'string' || !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(j.versionName)) return { ok: false, reason: 'bad_version_name' };
  const sha = String(j.sha256 || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) return { ok: false, reason: 'bad_hash' };
  const size = j.size === undefined ? 0 : Number(j.size);
  if (!Number.isFinite(size) || size < 0 || size > 200 * 1024 * 1024) return { ok: false, reason: 'bad_size' };
  const lines = (Array.isArray(j.changelog) ? j.changelog : String(j.changelog || '').split('\n')).map((l) => String(l).trim()).filter(Boolean).slice(0, 12).map((l) => l.slice(0, 200));
  return { ok: true, info: { versionName: j.versionName, versionCode: code, sha256: sha, size, changelog: lines } };
}

/** Messages for the error codes the Java side (and our own checks) produce. */
export function updateErrorMessage(code) {
  switch (code) {
    case 'offline': return 'No internet connection. Try again when you are online.';
    case 'rate_limited': return 'GitHub is busy right now. Try again in a few minutes.';
    case 'no_release': return 'No update has been published yet.';
    case 'low_storage': return 'Not enough free space on the phone to download the update.';
    case 'hash_mismatch': return 'The download was damaged, so it was deleted. Try again.';
    case 'not_allowed': return 'The update address is not allowed.';
    case 'cancelled': return 'Update cancelled.';
    case 'need_permission': return 'Allow TamilTunes to install apps, then tap Update now again.';
    case 'bad_json': case 'bad_version_code': case 'bad_version_name': case 'bad_hash': case 'bad_size': return 'The update information is not valid. Try again later.';
    default: return 'The update could not be completed. Try again.';
  }
}

/** The quiet automatic check: native app only, at most every 12 hours, never while music plays. */
export function shouldAutoCheck({ native, lastChecked, now = Date.now(), isPlaying }) {
  if (!native || isPlaying) return false;
  const last = Number(lastChecked);
  return !Number.isFinite(last) || last <= 0 || now - last >= AUTO_CHECK_MS || last > now;
}

export const formatBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

export function describeLastChecked(ts, now = Date.now()) {
  const t = Number(ts);
  if (!Number.isFinite(t) || t <= 0) return 'Never checked';
  const min = Math.floor((now - t) / 60000);
  if (min < 1) return 'Last checked just now';
  if (min < 60) return `Last checked ${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Last checked ${h} h ago`;
  return `Last checked ${new Date(t).toLocaleDateString()}`;
}
