/**
 * What the service worker may and may not cache. Kept apart from sw.js so it can be unit tested.
 */

// The public, user-independent music endpoints that are safe to cache. Everything else under /api goes straight to the network.
export const PUBLIC_API = /\/api\/music\/(home|search|albums\/[^/]+|artists\/[^/]+)$/;
// Nothing from YouTube is ever intercepted or stored by the service worker, thumbnails included (the browser's normal cache applies to them).
const YOUTUBE_HOSTS = /(?:^|\.)(?:googlevideo\.com|youtube\.com|youtube-nocookie\.com|ytimg\.com|ggpht\.com)$/;
// The audio CDN also serves album covers: those pictures may be cached, its audio never.
const AUDIO_CDN_HOSTS = /(?:^|\.)saavncdn\.com$/;

/** True for anything the service worker must never touch: media streams, ranged requests, the stream proxy, and anything from YouTube. `request` is a Request-like { headers, destination }. */
export const isStreamRequest = (request, url) =>
  request.headers.has('range') ||
  ['audio', 'video'].includes(request.destination) ||
  /\/(stream|audio|local-songs)(\/|$)/.test(url.pathname) ||
  YOUTUBE_HOSTS.test(url.hostname) ||
  (AUDIO_CDN_HOSTS.test(url.hostname) && request.destination !== 'image');

/** Only these GETs are stored by the API cache. */
export const isCacheableApi = (method, url) => method === 'GET' && PUBLIC_API.test(url.pathname) && !isStreamRequest({ headers: new Headers(), destination: '' }, url);
