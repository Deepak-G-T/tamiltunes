/**
 * Geometry for the avatar cropper: a square viewport over an image that can be zoomed and dragged.
 * Pure functions so they can be unit-tested without a canvas.
 */

/** Smallest scale at which the image still covers the square viewport. */
export const minScale = (imgW, imgH, view) => Math.max(view / imgW, view / imgH);

/**
 * Keep the image covering the viewport.
 * offset = position of the image's top-left corner relative to the viewport's top-left.
 */
export function clampOffset({ x, y }, imgW, imgH, scale, view) {
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: Math.min(0, Math.max(view - w, x)), y: Math.min(0, Math.max(view - h, y)) };
}

/** Centered offset for a given scale. */
export const centerOffset = (imgW, imgH, scale, view) => ({
  x: (view - imgW * scale) / 2,
  y: (view - imgH * scale) / 2,
});

/** Zoom keeping the viewport center fixed. */
export function zoomAround(offset, oldScale, newScale, imgW, imgH, view) {
  const cx = (view / 2 - offset.x) / oldScale;
  const cy = (view / 2 - offset.y) / oldScale;
  return clampOffset({ x: view / 2 - cx * newScale, y: view / 2 - cy * newScale }, imgW, imgH, newScale, view);
}

/** Source rectangle (in image pixels) that is visible in the viewport. */
export function sourceRect(offset, scale, view) {
  return { sx: -offset.x / scale, sy: -offset.y / scale, size: view / scale };
}
