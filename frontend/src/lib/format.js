/**
 * Small formatting helpers for timestamps, numbers, and profile UI.
 */

/** 83 -> "1:23", 3723 -> "1:02:03". Invalid input -> "0:00". */
export function formatTimestamp(sec) {
  const n = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "1:23" / "1:02:03" -> seconds, or null when it is not a valid timestamp. */
export function parseTimestamp(text) {
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):([0-5]\d)$/.exec(String(text).trim());
  if (!m) return null;
  if (m[1] && Number(m[2]) > 59) return null;
  return (m[1] ? Number(m[1]) : 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

const TS_RE = /(?<![\d:])(\d{1,2}:[0-5]\d(?::[0-5]\d)?)(?![\d:])/g;

/** "Just now", "5m", "3h", "2d", then a short date. */
export function timeAgo(date, now = Date.now()) {
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 45) return 'Just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** 1200 -> "1.2K". */
export function compactCount(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1e6) return `${(v / 1000).toFixed(v < 10000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
}

/** Perceived-character length (Tamil clusters and emoji count once), matching the server. */
export function charLength(s) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    let n = 0;
    for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) n++;
    return n;
  }
  return [...s].length;
}
