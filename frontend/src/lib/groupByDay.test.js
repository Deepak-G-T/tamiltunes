import { describe, it, expect } from 'vitest';
import { dayLabel, groupByDay } from './groupByDay';

const NOW = new Date(2026, 10, 17, 15, 0, 0).getTime(); // 17 Nov 2026, 15:00 local
const at = (daysAgo, hour = 10) => new Date(2026, 10, 17 - daysAgo, hour, 0, 0).toISOString();

describe('dayLabel', () => {
  it('labels calendar days, not 24h windows', () => {
    expect(dayLabel(at(0, 1), NOW)).toBe('Today');
    expect(dayLabel(at(1, 23), NOW)).toBe('Yesterday');
    expect(dayLabel(at(3), NOW)).toBe('Earlier this week');
    expect(dayLabel(at(6), NOW)).toBe('Earlier this week');
    expect(dayLabel(at(7), NOW)).toBe('Older');
    expect(dayLabel(at(60), NOW)).toBe('Older');
  });
  it('treats bad or missing dates as Older and future ones as Today', () => {
    expect(dayLabel(undefined, NOW)).toBe('Older');
    expect(dayLabel('not a date', NOW)).toBe('Older');
    expect(dayLabel(new Date(NOW + 3600e3).toISOString(), NOW)).toBe('Today');
  });
});

describe('groupByDay', () => {
  it('groups in first-seen order and keeps original indexes', () => {
    const items = [{ id: 'a', playedAt: at(0) }, { id: 'b', playedAt: at(0, 8) }, { id: 'c', playedAt: at(1) }, { id: 'd', createdAt: at(30) }];
    const g = groupByDay(items, NOW);
    expect(g.map((x) => x.label)).toEqual(['Today', 'Yesterday', 'Older']);
    expect(g[0].items.map((x) => x.item.id)).toEqual(['a', 'b']);
    expect(g[2].items[0]).toEqual({ item: items[3], index: 3 });
  });
  it('handles empty input', () => {
    expect(groupByDay([], NOW)).toEqual([]);
    expect(groupByDay(null, NOW)).toEqual([]);
  });
});
