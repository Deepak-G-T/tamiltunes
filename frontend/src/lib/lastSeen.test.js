import { describe, it, expect } from 'vitest';
import { formatLastSeen, sameText } from './lastSeen';

describe('admin: last seen', () => {
  const now = 1_800_000_000_000;
  it('online beats everything', () => { expect(formatLastSeen(now - 9e9, { online: true, now })).toBe('Online now'); });
  it('never, just now, minutes, hours, days', () => {
    expect(formatLastSeen(null, { now })).toBe('Never');
    expect(formatLastSeen(undefined, { now })).toBe('Never');
    expect(formatLastSeen(now - 20_000, { now })).toBe('Just now');
    expect(formatLastSeen(now - 7 * 60_000, { now })).toBe('7 min ago');
    expect(formatLastSeen(now - 5 * 3600_000, { now })).toBe('5 h ago');
    expect(formatLastSeen(now - 24 * 3600_000, { now })).toBe('1 day ago');
    expect(formatLastSeen(now - 3 * 24 * 3600_000, { now })).toBe('3 days ago');
  });
  it('a time in the future (clock difference) is just now, never negative', () => { expect(formatLastSeen(now + 5000, { now })).toBe('Just now'); });
});
describe('typed confirmations', () => {
  it('match without caring about capitals or spaces, but never when empty', () => {
    expect(sameText(' Person@Example.com ', 'person@example.com')).toBe(true);
    expect(sameText('other@example.com', 'person@example.com')).toBe(false);
    expect(sameText('', '')).toBe(false);
    expect(sameText(undefined, undefined)).toBe(false);
  });
});
