import { describe, it, expect } from 'vitest';
import { formatClock, remainingTime, formatRemaining, buildRows, layout, windowRows, announce, ROW_HEIGHT, HEADER_HEIGHT, NOTE_HEIGHT } from './queueView';

const E = (uid, origin = 'radio') => ({ uid, origin, song: { id: uid, title: `T ${uid}` } });
const sections = (user = [], source = [], extra = {}) => ({
  nextInQueueEntries: user,
  nextFrom: { kind: 'radio', label: 'Next from radio', entries: source },
  refill: { pending: false, failed: false },
  ...extra,
});

describe('clock and total time', () => {
  it('formats m:ss and h:mm:ss, dash when unknown', () => {
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(0)).toBe('–:––');
    expect(formatClock(undefined)).toBe('–:––');
    expect(formatClock(-5)).toBe('–:––');
  });
  it('adds the rest of the playing song and the queued songs', () => {
    expect(remainingTime({ current: { duration: 200 }, currentTime: 50, upcoming: [{ duration: 100 }, { duration: 60 }] })).toEqual({ seconds: 310, approximate: false });
  });
  it('is approximate when a song has no length', () => {
    expect(remainingTime({ current: { duration: 100 }, currentTime: 0, upcoming: [{ duration: 0 }, {}] })).toEqual({ seconds: 100, approximate: true });
    expect(remainingTime({ current: null, upcoming: [] })).toEqual({ seconds: 0, approximate: false });
    expect(remainingTime({ current: { duration: 100 }, currentTime: 500, upcoming: [] }).seconds).toBe(0);
  });
  it('words the time left', () => {
    expect(formatRemaining({ seconds: 30, approximate: false })).toBe('Less than a minute left');
    expect(formatRemaining({ seconds: 480, approximate: false })).toBe('8 min left');
    expect(formatRemaining({ seconds: 4320, approximate: false })).toBe('1 hr 12 min left');
    expect(formatRemaining({ seconds: 7200, approximate: false })).toBe('2 hr left');
    expect(formatRemaining({ seconds: 480, approximate: true })).toBe('About 8 min left');
  });
});

describe('queue rows', () => {
  it('lists the sections in order with running positions', () => {
    const rows = buildRows(sections([E('u1', 'user')], [E('r1'), E('r2')]));
    expect(rows.map((r) => r.type)).toEqual(['header', 'row', 'header', 'row', 'row']);
    expect(rows.filter((r) => r.type === 'row').map((r) => [r.uid, r.index, r.section])).toEqual([['u1', 0, 'user'], ['r1', 1, 'source'], ['r2', 2, 'source']]);
    expect(rows[2].title).toBe('Next from radio');
    expect(rows[2].canRefresh).toBe(true);
  });
  it('explains an empty "Next in queue"', () => {
    const rows = buildRows(sections([], [E('r1')]));
    expect(rows[1].type).toBe('note');
  });
  it('shows skeleton rows while loading and an error row when nothing could be loaded', () => {
    expect(buildRows(sections([], [], { refill: { pending: true, failed: false } })).filter((r) => r.type === 'skeleton')).toHaveLength(2);
    expect(buildRows(sections([], [], { refill: { pending: false, failed: true } })).some((r) => r.type === 'error')).toBe(true);
    expect(buildRows(sections([], [E('r1')], { refill: { pending: false, failed: true } })).some((r) => r.type === 'error')).toBe(false);
  });
  it('says so when autoplay is off and nothing is queued; playlists have no refresh button', () => {
    expect(buildRows(sections(), { autoplay: false }).some((r) => r.type === 'note' && /Autoplay is off/.test(r.text))).toBe(true);
    const list = buildRows({ ...sections(), nextFrom: { kind: 'context', label: 'Next from My mix', entries: [E('c1', 'context')] } });
    expect(list.find((r) => r.section === 'source').canRefresh).toBe(false);
  });
});

describe('windowing long queues', () => {
  const many = Array.from({ length: 400 }, (_, i) => E(`r${i}`));
  const rows = buildRows(sections([], many));
  it('renders everything when not virtual', () => {
    expect(windowRows(rows, { virtual: false })).toEqual({ start: 0, end: rows.length, padTop: 0, padBottom: 0 });
  });
  it('renders only what is on screen plus a margin, and keeps the scroll height', () => {
    const w = windowRows(rows, { scrollTop: 6000, viewport: 480, overscan: 6, virtual: true });
    const rendered = w.end - w.start;
    expect(rendered).toBeLessThan(30);
    const { total } = layout(rows);
    const renderedHeight = rows.slice(w.start, w.end).reduce((s, r) => s + r.height, 0);
    expect(w.padTop + renderedHeight + w.padBottom).toBe(total);
    expect(w.start).toBeGreaterThan(50);
  });
  it('handles the top and bottom ends', () => {
    expect(windowRows(rows, { scrollTop: 0, virtual: true }).start).toBe(0);
    const { total } = layout(rows);
    const end = windowRows(rows, { scrollTop: total, virtual: true });
    expect(end.end).toBe(rows.length);
    expect(end.padBottom).toBe(0);
  });
  it('uses fixed heights', () => {
    expect([ROW_HEIGHT, HEADER_HEIGHT, NOTE_HEIGHT]).toEqual([72, 40, 72]);
  });
});

describe('screen reader text', () => {
  it('describes picking up, moving, dropping, cancelling and removing', () => {
    expect(announce.picked('Vaathi', 2, 9)).toMatch(/Picked up Vaathi\. Position 2 of 9/);
    expect(announce.over('Vaathi', 3, 9)).toBe('Vaathi is now at position 3 of 9.');
    expect(announce.dropped('Vaathi', 3, 9)).toBe('Vaathi dropped at position 3 of 9.');
    expect(announce.cancelled('Vaathi')).toMatch(/cancelled/);
    expect(announce.moved('Vaathi', 1, 9)).toBe('Vaathi moved to position 1 of 9.');
    expect(announce.removed('Vaathi')).toBe('Vaathi removed from the queue.');
    expect(announce.removedMany(3)).toBe('3 songs removed from the queue.');
  });
});
