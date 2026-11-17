// Dominant "cover colour" for gradients. Real pixels are used when the image host allows canvas access (CORS);
// otherwise a stable colour is derived from a seed (song/album id), so the UI never depends on the image loading.

const cache = new Map();

// Nice dark-ish hues that stay readable under white text
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const hashString = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const hslToRgb = (h, s, l) => {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
};

/** Deterministic colour from a seed. Always returns [r, g, b] in 0..255. */
export const colorFromSeed = (seed) => {
  const h = hashString(String(seed || 'tamiltunes')) % 360;
  return hslToRgb(h, 0.55, 0.32);
};

/** Pull a readable colour out of raw RGBA pixel data (skips near-black, near-white and grey pixels). */
export const dominantFromPixels = (data) => {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i], pg = data[i + 1], pb = data[i + 2], pa = data[i + 3];
    if (pa < 200) continue;
    const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
    if (max < 40 || min > 225 || max - min < 24) continue; // too dark, too white, or grey
    r += pr; g += pg; b += pb; n++;
  }
  if (n < 8) return null;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
};

/** Darken so white text and the black page stay readable (target luminance band). */
export const tame = ([r, g, b]) => {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b; // 0..255
  const target = 90; // never brighter than this after taming
  const k = lum > target ? target / lum : 1;
  return [clamp(Math.round(r * k), 0, 255), clamp(Math.round(g * k), 0, 255), clamp(Math.round(b * k), 0, 255)];
};

export const rgbVar = (rgb) => rgb.join(' '); // "r g b" for rgb(var(--cover-rgb) / alpha)

const loadPixels = (url) =>
  new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    const done = (v) => resolve(v);
    const timer = setTimeout(() => done(null), 4000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const c = document.createElement('canvas');
        c.width = 24;
        c.height = 24;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 24, 24);
        done(ctx.getImageData(0, 0, 24, 24).data); // throws if the canvas is tainted (no CORS)
      } catch {
        done(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    img.src = url;
  });

/** Resolves to [r, g, b]. Never rejects; caches per image/seed. */
export const getCoverColor = async (imageUrl, seed) => {
  const key = `${imageUrl || ''}|${seed || ''}`;
  if (cache.has(key)) return cache.get(key);
  let rgb = null;
  if (imageUrl && !imageUrl.startsWith('data:')) {
    const pixels = await loadPixels(imageUrl);
    if (pixels) {
      const dom = dominantFromPixels(pixels);
      if (dom) rgb = tame(dom);
    }
  }
  if (!rgb) rgb = colorFromSeed(seed || imageUrl);
  cache.set(key, rgb);
  return rgb;
};
