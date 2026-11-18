import { describe, it, expect } from 'vitest';
import { startSleep, msUntilSleep, sleepExpired, sleepLabel, SLEEP_OPTIONS } from './sleepTimer';

describe('sleep timer', () => {
  it('offers 15, 30, 60 minutes and end of song', () => {
    expect(SLEEP_OPTIONS.map((o) => o.id)).toEqual(['15', '30', '60', 'song']);
  });
  it('counts down and expires', () => {
    const t = startSleep('15', 1000);
    expect(t.endsAt).toBe(1000 + 15 * 60000);
    expect(msUntilSleep(t, 1000 + 60000)).toBe(14 * 60000);
    expect(sleepExpired(t, 1000 + 14 * 60000)).toBe(false);
    expect(sleepExpired(t, 1000 + 15 * 60000)).toBe(true);
    expect(msUntilSleep(t, 10 ** 9)).toBe(0);
  });
  it('"end of this song" has no clock', () => {
    const t = startSleep('song');
    expect(t.endsAt).toBeNull();
    expect(msUntilSleep(t)).toBeNull();
    expect(sleepExpired(t, 10 ** 12)).toBe(false);
    expect(sleepLabel(t)).toBe('End of song');
  });
  it('rejects unknown options and labels the time left', () => {
    expect(startSleep('99')).toBeNull();
    expect(sleepLabel(null)).toBe('');
    expect(sleepLabel(startSleep('30', 0), 60000)).toBe('30 min left'.replace('30', '29'));
    expect(sleepLabel({ id: '15', endsAt: 45000 }, 0)).toBe('45 s left');
  });
});
