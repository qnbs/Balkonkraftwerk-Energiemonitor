/// <reference lib="WebWorker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & typeof globalThis & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

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
