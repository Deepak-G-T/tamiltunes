import { describe, it, expect } from 'vitest';
import { shouldAutoApply, readLastAuto, writeLastAuto, JUST_OPENED_MS, MIN_GAP_MS } from './autoUpdate';

const base = { pending: true, isPlaying: false, pageAgeMs: 5000, hidden: false, lastAutoAt: 0, now: 1_000_000 };

describe('shouldAutoApply', () => {
  it('applies right after the page was opened, when nothing is playing', () => {
    expect(shouldAutoApply(base)).toBe(true);
    expect(shouldAutoApply({ ...base, pageAgeMs: JUST_OPENED_MS })).toBe(true);
  });
  it('applies when the person has left the tab or the app', () => {
    expect(shouldAutoApply({ ...base, pageAgeMs: 3_600_000, hidden: true })).toBe(true);
  });
  it('never interrupts music, even right after opening or when hidden', () => {
    expect(shouldAutoApply({ ...base, isPlaying: true })).toBe(false);
    expect(shouldAutoApply({ ...base, isPlaying: true, hidden: true })).toBe(false);
  });
  it('waits while the person is using a page that has been open for a while', () => {
    expect(shouldAutoApply({ ...base, pageAgeMs: JUST_OPENED_MS + 1 })).toBe(false);
  });
  it('does nothing without a pending update', () => {
    expect(shouldAutoApply({ ...base, pending: false })).toBe(false);
  });
  it('never reloads twice within two minutes (no reload loop)', () => {
    expect(shouldAutoApply({ ...base, lastAutoAt: base.now - (MIN_GAP_MS - 1) })).toBe(false);
    expect(shouldAutoApply({ ...base, lastAutoAt: base.now - MIN_GAP_MS })).toBe(true);
  });
  it('an unknown page age does not count as "just opened"', () => {
    expect(shouldAutoApply({ ...base, pageAgeMs: NaN })).toBe(false);
  });
});

describe('last auto update memory', () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };
  it('remembers the time and survives blocked storage', () => {
    const s = mem();
    expect(readLastAuto(s)).toBe(0);
    writeLastAuto(s, 1234);
    expect(readLastAuto(s)).toBe(1234);
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    expect(readLastAuto(broken)).toBe(0);
    expect(() => writeLastAuto(broken, 1)).not.toThrow();
  });
});
