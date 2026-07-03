/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { clientsClaim } from "workbox-core";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { BackgroundSyncPlugin } from "workbox-background-sync";

declare const self: ServiceWorkerGlobalScope;

const CACHE_VERSION = "v1";
const OFFLINE_URL = "/offline.html";

// ── Take control immediately ──────────────────────────────────────────────
self.skipWaiting();
clientsClaim();

// ── Precache all build assets (injected by vite-plugin-pwa) ─────────────
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── SPA navigation fallback ───────────────────────────────────────────────
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//, /^\/icons\//, /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/i],
  })
);

// ── Google Fonts — CacheFirst (long-lived) ────────────────────────────────
registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: `${CACHE_VERSION}-google-fonts`,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);

registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new StaleWhileRevalidate({
    cacheName: `${CACHE_VERSION}-google-fonts-stylesheets`,
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  })
);

// ── App Icons / Images — CacheFirst ──────────────────────────────────────
registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: `${CACHE_VERSION}-images`,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
);

// ── JS / CSS — StaleWhileRevalidate (fast + fresh) ───────────────────────
registerRoute(
  ({ request }) =>
    request.destination === "script" || request.destination === "style",
  new StaleWhileRevalidate({
    cacheName: `${CACHE_VERSION}-static-resources`,
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  })
);

// ── API GET requests — NetworkFirst with fallback ────────────────────────
const bgSyncPlugin = new BackgroundSyncPlugin("api-queue", {
  maxRetentionTime: 60 * 24,
});

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/"),
  new NetworkFirst({
    cacheName: `${CACHE_VERSION}-api-responses`,
    networkTimeoutSeconds: 8,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 5 }),
    ],
  }),
  "GET"
);

// ── Offline fallback for navigation ──────────────────────────────────────
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r ?? Response.error())
      )
    );
  }
});

// ── Push Notifications ────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data: { title?: string; body?: string; icon?: string; url?: string } = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: "SIMIX", body: event.data.text() };
  }

  const options: NotificationOptions & { vibrate?: number[]; actions?: Array<{ action: string; title: string }> } = {
    body: data.body ?? "",
    icon: data.icon ?? "/icons/icon-192x192.png",
    badge: "/icons/icon-96x96.png",
    vibrate: [100, 50, 100],
    data: { url: data.url ?? "/" },
    actions: [
      { action: "open", title: "Ouvrir" },
      { action: "dismiss", title: "Ignorer" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title ?? "SIMIX", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url: string = (event.notification.data as { url?: string })?.url ?? "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url === url);
        if (existing) return existing.focus();
        return self.clients.openWindow(url);
      })
  );
});

// ── Background Sync ───────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-pending-requests") {
    event.waitUntil(syncPendingRequests());
  }
});

async function syncPendingRequests(): Promise<void> {
  const db = await openIDB();
  const requests = await getAllRequests(db);
  await Promise.allSettled(
    requests.map(async (req) => {
      try {
        await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
        await deleteRequest(db, req.id);
      } catch {
        /* retry next sync */
      }
    })
  );
}

// Minimal IDB helpers for background sync queue
function openIDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open("simix-sync-queue", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("requests", { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

interface SyncRequest {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function getAllRequests(db: IDBDatabase): Promise<SyncRequest[]> {
  return new Promise((res, rej) => {
    const tx = db.transaction("requests", "readonly");
    const req = tx.objectStore("requests").getAll();
    req.onsuccess = () => res(req.result as SyncRequest[]);
    req.onerror = () => rej(req.error);
  });
}

function deleteRequest(db: IDBDatabase, id: number | undefined): Promise<void> {
  return new Promise((res, rej) => {
    if (id == null) return res();
    const tx = db.transaction("requests", "readwrite");
    const req = tx.objectStore("requests").delete(id);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

// ── Message: skip waiting (from update prompt) ────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
