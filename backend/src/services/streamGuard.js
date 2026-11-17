import net from 'net';

// Only these upstream hosts may be proxied (JioSaavn CDN). Exact match or subdomain.
export const ALLOWED_STREAM_HOST_SUFFIXES = ['saavncdn.com'];

export const MAX_STREAM_BYTES = 50 * 1024 * 1024; // hard cap per response (matches the pre-existing 50MB limit)
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
 * Validates a proxy target. Returns { url } when allowed, otherwise { status, error }:
 *   400 = missing / malformed, 403 = well-formed but not permitted (not https, credentials, port, IP, host not allow-listed).
 */
export const checkStreamUrl = (raw) => {
  if (typeof raw !== 'string' || !raw || raw.length > 2048) return { status: 400, error: 'Invalid audio URL' };
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { status: 400, error: 'Malformed audio URL' };
  }
  const forbid = (why) => ({ status: 403, error: `Forbidden: ${why}` });
  if (u.protocol !== 'https:') return forbid('only https stream URLs are permitted.');
  if (u.username || u.password) return forbid('credentials in URL are not permitted.');
  if (u.port && u.port !== '443') return forbid('custom ports are not permitted.');
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (net.isIP(host) || isPrivateIp(host) || host === 'localhost') return forbid('IP and local hosts are not permitted.');
  const ok = ALLOWED_STREAM_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  if (!ok) return forbid(`Host "${host}" is not permitted for stream proxying.`);
  return { url: u };
};

/** Back-compat helper: the validated URL object, or null. */
export const validateStreamUrl = (raw) => checkStreamUrl(raw).url || null;
