/**
 * Sinergia Mail — Service Worker
 *
 * Strategy:
 *   - HTML pages + Next.js JS/CSS chunks → NETWORK-FIRST (always pick up new
 *     deploys; fall back to cache only if offline)
 *   - Static brand assets (icons, manifest, fonts) → CACHE-FIRST (rarely change)
 *   - API requests → never intercepted (handled by network)
 *
 * Cache name versioned via timestamp so each new SW deploy wipes the old cache.
 */
const CACHE_VERSION = "v3-2026-04-14";
const CACHE = `sinergia-${CACHE_VERSION}`;

// Precache only stable assets — NOT /dashboard or JS chunks (those would lock
// the user into the version cached at install time).
const PRECACHE = ["/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}),
  );
  self.skipWaiting(); // activate new SW immediately
});

// Allow page to nudge a waiting SW to take over
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/manifest.json" ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".ttf")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Skip cross-origin and APIs entirely
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Static assets: cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        });
      }),
    );
    return;
  }

  // Everything else (HTML, JS, CSS): network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request)),
  );
});
