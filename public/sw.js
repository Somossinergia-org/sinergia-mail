/**
 * Sinergia Mail — Service Worker v4
 *
 * Features:
 *   - Cache-first for static assets (CSS, JS, images, fonts)
 *   - Network-first for API calls with offline fallback
 *   - Background sync queue for actions taken offline (drafts, categorizations)
 *   - Push notification handler (email alerts, invoice due dates)
 *   - Periodic sync for email check every 15 min
 *   - Offline fallback page
 *   - Cache versioning with auto-cleanup of old caches
 */

const CACHE_VERSION = "v12-2026-04-28-oauth-via-nextauth";
const STATIC_CACHE = `sinergia-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `sinergia-dynamic-${CACHE_VERSION}`;
const API_CACHE = `sinergia-api-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

// Precache stable assets
const PRECACHE_URLS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  OFFLINE_URL,
];

// ─── Background Sync Queue ───
const SYNC_QUEUE_KEY = "sinergia-sync-queue";

async function getSyncQueue() {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const response = await cache.match(SYNC_QUEUE_KEY);
    if (response) {
      return await response.json();
    }
  } catch (_) {}
  return [];
}

async function saveSyncQueue(queue) {
  const cache = await caches.open(STATIC_CACHE);
  await cache.put(
    SYNC_QUEUE_KEY,
    new Response(JSON.stringify(queue), {
      headers: { "Content-Type": "application/json" },
    })
  );
}

async function addToSyncQueue(request) {
  const queue = await getSyncQueue();
  const body = await request.clone().text();
  queue.push({
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body: body,
    timestamp: Date.now(),
  });
  await saveSyncQueue(queue);
}

async function processSyncQueue() {
  const queue = await getSyncQueue();
  if (queue.length === 0) return;

  const remaining = [];
  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.method !== "GET" ? item.body : undefined,
      });
      if (!response.ok && response.status >= 500) {
        remaining.push(item);
      }
    } catch (_) {
      // Still offline, keep in queue
      if (Date.now() - item.timestamp < 7 * 24 * 60 * 60 * 1000) {
        remaining.push(item);
      }
    }
  }
  await saveSyncQueue(remaining);
}

// ─── Install ───
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
  );
  self.skipWaiting();
});

// ─── Activate: cleanup old caches ───
self.addEventListener("activate", (event) => {
  const currentCaches = [STATIC_CACHE, DYNAMIC_CACHE, API_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !currentCaches.includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Message handler ───
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ─── Helpers ───
function isStaticAsset(url) {
  const staticExts = [".css", ".js", ".woff2", ".woff", ".ttf", ".otf", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp"];
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/manifest.json" ||
    staticExts.some((ext) => url.pathname.endsWith(ext))
  );
}

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

// ─── Fetch strategy ───
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" && request.method !== "HEAD") {
    // For mutating requests (POST/PUT/DELETE), try network; queue on failure
    if (request.method === "POST" || request.method === "PUT" || request.method === "PATCH") {
      event.respondWith(
        fetch(request.clone()).catch(async () => {
          await addToSyncQueue(request);
          return new Response(
            JSON.stringify({
              queued: true,
              message: "Guardado offline. Se sincronizara automaticamente.",
            }),
            {
              status: 202,
              headers: { "Content-Type": "application/json" },
            }
          );
        })
      );
    }
    return;
  }

  const url = new URL(request.url);

  // Skip cross-origin
  if (url.origin !== self.location.origin) return;

  // API requests: network-first with cache fallback
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return new Response(
              JSON.stringify({ error: "Sin conexion", offline: true }),
              {
                status: 503,
                headers: { "Content-Type": "application/json" },
              }
            );
          });
        })
    );
    return;
  }

  // Static assets: cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone)).catch(() => {});
            }
            return response;
          })
          .catch(() => caches.match(request));
      })
    );
    return;
  }

  // Navigation requests (HTML pages): network-first with offline fallback
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // Everything else: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ─── Push Notifications ───
self.addEventListener("push", (event) => {
  let data = {
    title: "Sinergia Mail",
    body: "Tienes nuevas notificaciones",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "sinergia-notification",
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (_) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag || "sinergia-notification",
    vibrate: [100, 50, 100],
    data: {
      url: data.url || "/dashboard",
      dateOfArrival: Date.now(),
    },
    actions: data.actions || [
      { action: "open", title: "Abrir" },
      { action: "dismiss", title: "Cerrar" },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ─── Notification click ───
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : "/dashboard";

  if (event.action === "dismiss") return;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes("/dashboard") && "focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// ─── Background Sync ───
self.addEventListener("sync", (event) => {
  if (event.tag === "sinergia-sync-queue") {
    event.waitUntil(processSyncQueue());
  }
});

// ─── Periodic Sync (email check every 15 min) ───
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "sinergia-email-check") {
    event.waitUntil(
      fetch("/api/sync?background=true", { method: "POST" }).catch(() => {})
    );
  }
  if (event.tag === "sinergia-process-queue") {
    event.waitUntil(processSyncQueue());
  }
});
