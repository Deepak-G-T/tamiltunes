/**
 * Avatars are stored as small data URLs. The client crops/resizes to ~256px WebP;
 * the server re-validates type, magic bytes and size so nothing else gets stored
 * (SVG and anything scriptable is rejected).
 */
export const AVATAR_MAX_BYTES = 80 * 1024;

const MAGIC = {
  'image/png': (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
};

/** @returns {{ ok: true, value: string } | { ok: false, message: string }} */
export function validateAvatarDataUrl(input) {
  if (typeof input !== 'string') return { ok: false, message: 'Invalid image.' };
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
  if (!m) return { ok: false, message: 'Use a PNG, JPEG or WebP image.' };
  if (m[2].length > Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 4) {
    return { ok: false, message: `Image is too large (max ${Math.round(AVATAR_MAX_BYTES / 1024)} KB after resizing).` };
  }
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > AVATAR_MAX_BYTES) return { ok: false, message: 'Image is too large.' };
  if (!MAGIC[m[1]](bytes)) return { ok: false, message: 'File content does not match its type.' };
  return { ok: true, value: input };
}
