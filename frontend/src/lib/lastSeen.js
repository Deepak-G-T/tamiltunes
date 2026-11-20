/** Admin panel: how to say when someone was last active. `online` comes from the server (any request in the last 5 minutes). */
export function formatLastSeen(ts, { online = false, now = Date.now() } = {}) {
  if (online) return 'Online now';
  const t = ts ? new Date(ts).getTime() : NaN;
  if (!Number.isFinite(t)) return 'Never';
  const min = Math.max(0, Math.floor((now - t) / 60000));
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d} day${d === 1 ? '' : 's'} ago` : new Date(t).toLocaleDateString();
}
/** The typed confirmations are compared without caring about capitals or spaces around the text. */
export const sameText = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase() && String(a ?? '').trim() !== '';
