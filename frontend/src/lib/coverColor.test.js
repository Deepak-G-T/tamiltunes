import { describe, it, expect } from 'vitest';
import { colorFromSeed, dominantFromPixels, tame, hashString, rgbVar } from './coverColor';

const px = (arr) => Uint8ClampedArray.from(arr.flatMap(([r, g, b, a = 255]) => [r, g, b, a]));

describe('colorFromSeed', () => {
  it('is deterministic for the same seed', () => expect(colorFromSeed('song_1')).toEqual(colorFromSeed('song_1')));
  it('differs across seeds', () => expect(colorFromSeed('song_1')).not.toEqual(colorFromSeed('song_2')));
  it('always returns 3 channels in 0..255 and never a bright colour', () => {
    for (const seed of ['a', 'leo', 'saavn_x9', '', undefined, 12345]) {
      const c = colorFromSeed(seed);
      expect(c).toHaveLength(3);
      for (const v of c) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(255); }
      expect(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]).toBeLessThan(140);
    }
  });
  it('hashString is stable', () => expect(hashString('x')).toBe(hashString('x')));
});

describe('dominantFromPixels', () => {
  it('averages saturated pixels and ignores dark, white, grey and transparent ones', () => {
    const data = px([
      ...Array(20).fill([200, 40, 40]),   // red, counts
      ...Array(50).fill([5, 5, 5]),       // near black, ignored
      ...Array(50).fill([250, 250, 250]), // white, ignored
      ...Array(50).fill([120, 120, 120]), // grey, ignored
      ...Array(50).fill([0, 255, 0, 10])  // transparent, ignored
    ]);
    expect(dominantFromPixels(data)).toEqual([200, 40, 40]);
  });
  it('returns null when there is not enough usable colour', () => {
    expect(dominantFromPixels(px(Array(100).fill([10, 10, 10])))).toBeNull();
  });
});

describe('tame', () => {
  it('darkens bright colours', () => {
    const [r, g, b] = tame([255, 230, 90]);
    expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeLessThanOrEqual(91);
  });
  it('keeps dark colours unchanged', () => expect(tame([30, 60, 40])).toEqual([30, 60, 40]));
});

describe('rgbVar', () => it('formats for rgb(var(--cover-rgb) / a)', () => expect(rgbVar([1, 2, 3])).toBe('1 2 3')));
