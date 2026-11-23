import { describe, it, expect } from 'vitest';
import { formatTimestamp, parseTimestamp, timeAgo, compactCount, charLength } from './format';

describe('timestamps', () => {
  it('formats and parses', () => {
    expect(formatTimestamp(83)).toBe('1:23');
    expect(formatTimestamp(3723)).toBe('1:02:03');
    expect(formatTimestamp(-5)).toBe('0:00');
    expect(formatTimestamp(NaN)).toBe('0:00');
    expect(parseTimestamp('1:23')).toBe(83);
    expect(parseTimestamp('1:02:03')).toBe(3723);
    expect(parseTimestamp('1:75')).toBeNull();
    expect(parseTimestamp('abc')).toBeNull();
  });
});

describe('display helpers', () => {
  const now = new Date('2026-11-18T12:00:00Z').getTime();
  it('timeAgo', () => {
    expect(timeAgo(now - 10_000, now)).toBe('Just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5m');
    expect(timeAgo(now - 3 * 3600_000, now)).toBe('3h');
    expect(timeAgo(now - 2 * 86400_000, now)).toBe('2d');
    expect(timeAgo('garbage', now)).toBe('');
  });
  it('compactCount', () => {
    expect(compactCount(999)).toBe('999');
    expect(compactCount(1200)).toBe('1.2K');
    expect(compactCount(15000)).toBe('15K');
    expect(compactCount(2_500_000)).toBe('2.5M');
  });
  it('counts Tamil clusters and emoji as single characters', () => {
    expect(charLength('தமிழ்')).toBe(3);
    expect(charLength('👍🏽')).toBe(1);
  });
});
