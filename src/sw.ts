/// <reference lib="WebWorker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

declare const self: ServiceWorkerGlobalScope & typeof globalThis & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// ---------------------------------------------------------------------------
// Precache all static assets (JS, CSS, HTML, images)
// ---------------------------------------------------------------------------
precacheAndRoute(self.__WB_MANIFEST);

// ---------------------------------------------------------------------------
// Runtime caching strategies
// ---------------------------------------------------------------------------

// 1. CacheFirst for static image/font assets (long-lived)
registerRoute(
  ({ request }) => request.destination === 'image' || request.destination === 'font',
  new CacheFirst({
    cacheName: 'bkw-assets-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
);

// 2. NetworkFirst for Open-Meteo weather API (fresh data preferred, fall back to cache)
registerRoute(
  ({ url }) => url.hostname === 'api.open-meteo.com',
  new NetworkFirst({
    cacheName: 'bkw-weather-api-v1',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 }),
    ],
  }),
);

// 3. NetworkFirst for aWATTar electricity price API
registerRoute(
  ({ url }) => url.hostname === 'api.awattar.de',
  new NetworkFirst({
    cacheName: 'bkw-electricity-api-v1',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 }),
    ],
  }),
);

// 4. NetworkFirst for Gemini API (AI responses) – no caching of sensitive data
registerRoute(
  ({ url }) => url.hostname.includes('generativelanguage.googleapis.com'),
  new NetworkFirst({
    cacheName: 'bkw-gemini-api-v1',
    networkTimeoutSeconds: 30,
    plugins: [
      new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 30 * 60 }),
    ],
  }),
);

// 5. StaleWhileRevalidate for Google Fonts (if ever used)
registerRoute(
  ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
  new StaleWhileRevalidate({ cacheName: 'bkw-fonts-v1' }),
);

// ---------------------------------------------------------------------------
// Background Sync – prepared for future cloud sync (no cloud endpoint yet)
// ---------------------------------------------------------------------------
const bgSyncPlugin = new BackgroundSyncPlugin('bkw-sync-queue', {
  maxRetentionTime: 24 * 60, // 24 hours in minutes
});
// To enable: registerRoute('/api/sync', new NetworkOnly({ plugins: [bgSyncPlugin] }), 'POST');
void bgSyncPlugin; // mark as used

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

/** Handle server-sent Web Push notifications (VAPID) */
self.addEventListener('push', (event: PushEvent) => {
  let payload: { title?: string; body?: string; tag?: string; url?: string } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }

  const title = payload.title ?? 'BKW Monitor';
  const options: NotificationOptions = {
    body: payload.body ?? '',
    icon: '/Balkonkraftwerk-Energiemonitor/pwa-192.png',
    badge: '/Balkonkraftwerk-Energiemonitor/pwa-192.png',
    tag: payload.tag ?? 'bkw',
    data: { url: payload.url ?? '/Balkonkraftwerk-Energiemonitor/' },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/** Focus or open window when notification is clicked */
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl: string = event.notification.data?.url ?? '/Balkonkraftwerk-Energiemonitor/';
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.includes('Balkonkraftwerk') && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })(),
  );
});

