import { describe, it, expect } from 'vitest';
import { minScale, clampOffset, centerOffset, zoomAround, sourceRect } from './cropMath';

describe('avatar crop geometry', () => {
  const view = 280;
  it('min scale makes the image cover the viewport', () => {
    expect(minScale(1000, 500, view)).toBeCloseTo(0.56);
    expect(minScale(200, 400, view)).toBeCloseTo(1.4);
  });
  it('clamps so no empty edge is ever visible', () => {
    const s = minScale(1000, 500, view);
    expect(clampOffset({ x: 50, y: 50 }, 1000, 500, s, view)).toEqual({ x: 0, y: 0 });
    const c = clampOffset({ x: -9999, y: -9999 }, 1000, 500, s, view);
    expect(c.x).toBeCloseTo(view - 1000 * s);
    expect(c.y).toBeCloseTo(0);
  });
  it('centers and maps back to source pixels', () => {
    const s = minScale(1000, 500, view);
    const o = centerOffset(1000, 500, s, view);
    const r = sourceRect(o, s, view);
    expect(r.size).toBeCloseTo(500); // full height of the image
    expect(r.sx).toBeCloseTo(250);
    expect(r.sy).toBeCloseTo(0);
  });
  it('zooming keeps the center point stable', () => {
    const s = minScale(1000, 1000, view);
    const o = centerOffset(1000, 1000, s, view);
    const before = sourceRect(o, s, view);
    const z = zoomAround(o, s, s * 2, 1000, 1000, view);
    const after = sourceRect(z, s * 2, view);
    expect(after.sx + after.size / 2).toBeCloseTo(before.sx + before.size / 2);
    expect(after.size).toBeCloseTo(before.size / 2);
  });
});
