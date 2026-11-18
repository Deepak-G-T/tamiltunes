/// <reference lib="webworker" />
/**
 * TamilTunes service worker (Workbox, injectManifest).
 *  - precaches the app shell (JS, CSS, icons, the offline page);
 *  - public music API GETs and images use stale-while-revalidate;
 *  - NEVER cached: audio and video streams (any Range request, /stream, audio and video requests, the CDN and YouTube hosts),
 *    sign-in and every personal endpoint (auth, me, admin, home, history, favorites, playlists, comments, profile ...).
 *    Only an allow-list of PUBLIC music endpoints is cached, so one person's data can never be shown to another on a shared phone.
 *  - a page load while offline shows /offline.html;
 *  - a new version waits until the person taps "Reload" (never a silent reload: it would stop the music).
 */
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkOnly, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { PUBLIC_API, isStreamRequest } from './lib/swRules';

const sw = self;
precacheAndRoute(self.__WB_MANIFEST); // the literal `self.__WB_MANIFEST` is what the build replaces
cleanupOutdatedCaches();

// 1. Streams first, so no later rule can ever catch them
registerRoute(({ request, url }) => isStreamRequest(request, url), new NetworkOnly());

// 2. Public music API GETs: show the saved copy at once, refresh it in the background
registerRoute(
  ({ request, url }) => request.method === 'GET' && PUBLIC_API.test(url.pathname),
  new StaleWhileRevalidate({
    cacheName: 'api-public-v1',
    plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 24 * 60 * 60, purgeOnQuotaError: true })],
  }),
);

// 3. Every other API call (auth, personal data, writes): network only, never stored
registerRoute(({ url }) => /\/api\//.test(url.pathname), new NetworkOnly());

// 4. Pictures (covers, avatars): stale-while-revalidate, including cross-origin ones
registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'images-v1',
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true })],
  }),
);

// 5. Page loads: the network first (so a new deploy is seen), the offline page when there is none.
const pages = new NetworkFirst({ cacheName: 'pages-v1', networkTimeoutSeconds: 4, plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 10 })] });
registerRoute(({ request, url }) => request.mode === 'navigate' && !/\/api\//.test(url.pathname), pages);

setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') return (await matchPrecache('/offline.html')) || Response.error();
  return Response.error();
});

// A new version waits; the page asks it to take over when the person taps "Reload".
sw.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') sw.skipWaiting();
});
