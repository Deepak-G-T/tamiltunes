/**
 * What the service worker may and may not cache. Kept apart from sw.js so it can be unit tested.
 */

// The public, user-independent music endpoints that are safe to cache. Everything else under /api goes straight to the network.
export const PUBLIC_API = /\/api\/music\/(home|search|albums\/[^/]+|artists\/[^/]+)$/;
const STREAM_HOSTS = /(?:^|\.)(?:saavncdn\.com|googlevideo\.com|youtube\.com|ytimg\.com|ggpht\.com)$/;

/** True for anything that must never be stored: media streams, ranged requests, the stream proxy. `request` is a Request-like { headers, destination }. */
export const isStreamRequest = (request, url) =>
  request.headers.has('range') ||
  ['audio', 'video'].includes(request.destination) ||
  /\/(stream|audio|local-songs)(\/|$)/.test(url.pathname) ||
  (STREAM_HOSTS.test(url.hostname) && request.destination !== 'image');

/** Only these GETs are stored by the API cache. */
export const isCacheableApi = (method, url) => method === 'GET' && PUBLIC_API.test(url.pathname) && !isStreamRequest({ headers: new Headers(), destination: '' }, url);
