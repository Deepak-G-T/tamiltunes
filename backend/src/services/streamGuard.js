import net from 'net';

// Only these upstream hosts may be proxied (JioSaavn CDN). Exact match or subdomain.
export const ALLOWED_STREAM_HOST_SUFFIXES = ['saavncdn.com'];

export const MAX_STREAM_BYTES = 40 * 1024 * 1024; // hard cap per response
export const STREAM_TIMEOUT_MS = 15000; // time to receive upstream headers

const isPrivateIp = (host) => {
  const ver = net.isIP(host);
  if (ver === 4) {
    const [a, b] = host.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (ver === 6) return true; // refuse all IPv6 literals
  return false;
};

/**
 * Returns a validated URL object, or null when the target is not allowed.
 * https only, no credentials, no custom port, no IP literals, host must be allowlisted.
 */
export const validateStreamUrl = (raw) => {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '443') return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (net.isIP(host) || isPrivateIp(host) || host === 'localhost') return null;
  const ok = ALLOWED_STREAM_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  return ok ? u : null;
};
