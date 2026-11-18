// Sleep timer: pause playback after a set time, or when the current song ends. Pure, so it is easy to test.
export const SLEEP_OPTIONS = [
  { id: '15', label: '15 minutes', minutes: 15 },
  { id: '30', label: '30 minutes', minutes: 30 },
  { id: '60', label: '60 minutes', minutes: 60 },
  { id: 'song', label: 'End of this song', minutes: null },
];

/** @returns {{ id: string, endsAt: number | null } | null} */
export function startSleep(id, now = Date.now()) {
  const opt = SLEEP_OPTIONS.find((o) => o.id === id);
  if (!opt) return null;
  return { id: opt.id, endsAt: opt.minutes ? now + opt.minutes * 60000 : null };
}

export const msUntilSleep = (timer, now = Date.now()) => (timer?.endsAt ? Math.max(0, timer.endsAt - now) : null);
export const sleepExpired = (timer, now = Date.now()) => Boolean(timer?.endsAt) && now >= timer.endsAt;

/** "12 min left", "45 s left", or "End of song". */
export function sleepLabel(timer, now = Date.now()) {
  if (!timer) return '';
  const ms = msUntilSleep(timer, now);
  if (ms === null) return 'End of song';
  if (ms >= 60000) return `${Math.ceil(ms / 60000)} min left`;
  return `${Math.ceil(ms / 1000)} s left`;
}
