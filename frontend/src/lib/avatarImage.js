import { sourceRect } from './cropMath';
import { AVATAR_MAX_BYTES } from './validate';

const OUT = 256;

export const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });

/**
 * Render the cropped square to a 256px data URL under the server limit.
 * Tries WebP first, then JPEG, lowering quality until it fits.
 */
export async function renderAvatar(img, offset, scale, view) {
  const { sx, sy, size } = sourceRect(offset, scale, view);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = OUT;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, size, size, 0, 0, OUT, OUT);

  for (const type of ['image/webp', 'image/jpeg']) {
    for (const q of [0.9, 0.8, 0.7, 0.55, 0.4]) {
      const url = canvas.toDataURL(type, q);
      if (!url.startsWith(`data:${type}`)) break; // browser lacks this encoder
      const bytes = (url.length - url.indexOf(',') - 1) * 0.75;
      if (bytes <= AVATAR_MAX_BYTES) return url;
    }
  }
  throw new Error('Could not shrink that image enough. Try a simpler picture.');
}
