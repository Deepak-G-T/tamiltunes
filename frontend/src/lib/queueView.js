// What the queue panel shows, as plain data (no React): rows, windowing for long queues, total time, screen-reader text.
export const VIRTUAL_THRESHOLD = 100; // above this many upcoming songs the list is windowed
export const ROW_HEIGHT = 72; // room for a two-line title, the artists line and 44px touch targets
export const HEADER_HEIGHT = 40;
export const NOTE_HEIGHT = 72; // skeleton / error / empty rows

/** m:ss, or h:mm:ss for an hour or more. Unknown lengths show a dash. */
export function formatClock(sec) {
  const n = Math.floor(Number(sec));
  if (!Number.isFinite(n) || n <= 0) return '–:––';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Time left: the rest of the playing song plus everything queued. `approximate` when some songs have no length. */
export function remainingTime({ current, currentTime = 0, upcoming = [] }) {
  let seconds = 0;
  let approximate = false;
  if (current) {
    const d = Number(current.duration) || 0;
    if (d > 0) seconds += Math.max(0, d - currentTime);
    else approximate = true;
  }
  for (const s of upcoming) {
    const d = Number(s.duration) || 0;
    if (d > 0) seconds += d;
    else approximate = true;
  }
  return { seconds: Math.round(seconds), approximate };
}

/** "1 hr 12 min left", "8 min left", "Less than a minute left". A leading "about" when some lengths are unknown. */
export function formatRemaining({ seconds, approximate }) {
  const mins = Math.round(seconds / 60);
  let text;
  if (seconds < 60) text = 'Less than a minute left';
  else if (mins < 60) text = `${mins} min left`;
  else {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    text = m ? `${h} hr ${m} min left` : `${h} hr left`;
  }
  return approximate && seconds >= 60 ? `About ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

/**
 * The scrolling part of the Queue tab as one flat list: section headers, song rows and note rows.
 * Fixed heights let a very long queue be windowed.
 * @param {{ nextInQueueEntries: object[], nextFrom: { label: string, entries: object[], kind: string }, refill: { pending: boolean, failed: boolean } }} sections
 */
export function buildRows(sections, { autoplay = true } = {}) {
  const rows = [];
  const user = sections.nextInQueueEntries;
  const source = sections.nextFrom.entries;
  let index = 0;

  rows.push({ type: 'header', key: 'h-user', section: 'user', title: 'Next in queue', height: HEADER_HEIGHT });
  if (!user.length) rows.push({ type: 'note', key: 'n-user', text: 'Songs you add with "Play next" or "Add to queue" appear here and play first.', height: NOTE_HEIGHT });
  for (const entry of user) rows.push({ type: 'row', key: entry.uid, uid: entry.uid, entry, index: index++, section: 'user', height: ROW_HEIGHT });

  rows.push({ type: 'header', key: 'h-source', section: 'source', title: sections.nextFrom.label, canRefresh: sections.nextFrom.kind === 'radio', height: HEADER_HEIGHT });
  for (const entry of source) rows.push({ type: 'row', key: entry.uid, uid: entry.uid, entry, index: index++, section: 'source', height: ROW_HEIGHT });

  const { pending, failed } = sections.refill;
  if (sections.nextFrom.kind === 'radio' && autoplay) {
    if (pending) {
      rows.push({ type: 'skeleton', key: 's1', height: ROW_HEIGHT }, { type: 'skeleton', key: 's2', height: ROW_HEIGHT });
    } else if (failed && !source.length) {
      rows.push({ type: 'error', key: 'e1', text: "Couldn't load recommendations right now.", height: NOTE_HEIGHT });
    }
  } else if (sections.nextFrom.kind === 'radio' && !autoplay && !source.length) {
    rows.push({ type: 'note', key: 'n-off', text: 'Autoplay is off. When your songs run out, playback stops.', height: NOTE_HEIGHT });
  }
  return rows;
}

/** Offsets for windowing: top of each row, and the whole height. */
export function layout(rows) {
  const tops = [];
  let y = 0;
  for (const r of rows) { tops.push(y); y += r.height; }
  return { tops, total: y };
}

/** Which rows to render for a scroll position. Short lists render everything. */
export function windowRows(rows, { scrollTop = 0, viewport = 480, overscan = 8, virtual = false } = {}) {
  if (!virtual) return { start: 0, end: rows.length, padTop: 0, padBottom: 0 };
  const { tops, total } = layout(rows);
  let start = 0;
  while (start < rows.length - 1 && tops[start + 1] <= scrollTop) start++;
  let end = start;
  while (end < rows.length && tops[end] < scrollTop + viewport) end++;
  start = Math.max(0, start - overscan);
  end = Math.min(rows.length, end + overscan);
  const padTop = tops[start] ?? 0;
  const last = rows[end - 1];
  const padBottom = last ? Math.max(0, total - (tops[end - 1] + last.height)) : 0;
  return { start, end, padTop, padBottom };
}

/** Text read aloud by a screen reader for drag and keyboard moves. `pos` is 1-based. */
export const announce = {
  picked: (title, pos, n) => `Picked up ${title}. Position ${pos} of ${n}. Use the arrow keys to move it, space to drop it, escape to cancel.`,
  over: (title, pos, n) => `${title} is now at position ${pos} of ${n}.`,
  dropped: (title, pos, n) => `${title} dropped at position ${pos} of ${n}.`,
  cancelled: (title) => `Move cancelled. ${title} is back where it was.`,
  moved: (title, pos, n) => `${title} moved to position ${pos} of ${n}.`,
  removed: (title) => `${title} removed from the queue.`,
  removedMany: (n) => `${n} songs removed from the queue.`,
};
