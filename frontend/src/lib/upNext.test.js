import { describe, it, expect } from 'vitest';
import { getUpNext } from './upNext';

const q = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('getUpNext', () => {
  it('returns the following song', () => expect(getUpNext(q, 0)).toEqual({ id: 'b' }));
  it('returns null at the end unless repeat-all', () => {
    expect(getUpNext(q, 2)).toBeNull();
    expect(getUpNext(q, 2, { repeatMode: 'all' })).toEqual({ id: 'a' });
  });
  it('is unknown when shuffling or repeating one', () => {
    expect(getUpNext(q, 0, { isShuffle: true })).toBeNull();
    expect(getUpNext(q, 0, { repeatMode: 'one' })).toBeNull();
  });
  it('handles empty, single and invalid input', () => {
    expect(getUpNext([], 0)).toBeNull();
    expect(getUpNext([{ id: 'a' }], 0)).toBeNull();
    expect(getUpNext(q, -1)).toBeNull();
    expect(getUpNext(q, 9)).toBeNull();
    expect(getUpNext(null, 0)).toBeNull();
  });
});
