import { describe, it, expect } from 'vitest';
import { loadHidden, rememberHidden, HIDE_KEY, HIDE_DAYS } from './videoHides';

const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

describe('per-person video hides (this browser only)', () => {
  it('remembers a failed video for 7 days, then forgets it', () => {
    const s = store();
    rememberHidden(s, 'AbCdEfGhIj1', 1000);
    expect(loadHidden(s, 1000 + 86400e3)).toEqual(['AbCdEfGhIj1']);
    expect(loadHidden(s, 1000 + (HIDE_DAYS + 1) * 86400e3)).toEqual([]);
  });
  it('ignores bad ids and broken storage', () => {
    const s = store();
    rememberHidden(s, 'not a video id');
    expect(loadHidden(s)).toEqual([]);
    s.setItem(HIDE_KEY, '{oops');
    expect(loadHidden(s)).toEqual([]);
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(() => rememberHidden(bad, 'AbCdEfGhIj1')).not.toThrow();
    expect(loadHidden(bad)).toEqual([]);
  });
});
