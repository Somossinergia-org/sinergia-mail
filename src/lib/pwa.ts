/**
 * PWA Utilities for Sinergia Mail
 *
 * - Service worker registration
 * - Push notification management
 * - Local notifications
 * - PWA install detection
 * - Offline data caching with TTL
 */

// ─── Service Worker Registration ───

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");

    // Check for updates every 60 seconds
    setInterval(() => {
      registration.update().catch(() => {});
    }, 60000);

    // Handle new SW installation
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          newWorker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });

    // Register periodic sync for email checks (every 15 min)
    if ("periodicSync" in registration) {
      try {
        const periodicSync = registration as ServiceWorkerRegistration & {
          periodicSync: { register: (tag: string, opts: { minInterval: number }) => Promise<void> };
        };
        await periodicSync.periodicSync.register("sinergia-email-check", {
          minInterval: 15 * 60 * 1000, // 15 minutes
        });
        await periodicSync.periodicSync.register("sinergia-process-queue", {
          minInterval: 5 * 60 * 1000, // 5 minutes
        });
      } catch (_) {
        // Periodic sync not supported or permission denied
      }
    }

    return registration;
  } catch (error) {
    console.error("[PWA] Service worker registration failed:", error);
    return null;
  }
}

// ─── Push Notifications ───

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  if (Notification.permission === "denied") {
    return "denied";
  }

  return await Notification.requestPermission();
}

export async function subscribeToPush(
  userId: string
): Promise<PushSubscription | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const permission = await requestNotificationPermission();
    if (permission !== "granted") return null;

    const registration = await navigator.serviceWorker.ready;
    const existingSub = await registration.pushManager.getSubscription();
    if (existingSub) return existingSub;

    // Get VAPID public key from server
    const response = await fetch("/api/push/vapid-key");
    if (!response.ok) return null;
    const { publicKey } = await response.json();

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });

    // Send subscription to server
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, subscription }),
    });

    return subscription;
  } catch (error) {
    console.error("[PWA] Push subscription failed:", error);
    return null;
  }
}

export function showLocalNotification(
  title: string,
  body: string,
  options?: {
    icon?: string;
    badge?: string;
    tag?: string;
    url?: string;
    actions?: Array<{ action: string; title: string }>;
  }
): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification(title, {
        body,
        icon: options?.icon || "/icon-192.png",
        badge: options?.badge || "/icon-192.png",
        tag: options?.tag || "sinergia-local",
        data: { url: options?.url || "/dashboard" },
      });
    });
  } else {
    new Notification(title, {
      body,
      icon: options?.icon || "/icon-192.png",
      tag: options?.tag || "sinergia-local",
    });
  }
}

// ─── PWA Install Detection ───

export function isAppInstalled(): boolean {
  if (typeof window === "undefined") return false;

  // Check display-mode
  if (window.matchMedia("(display-mode: standalone)").matches) return true;

  // iOS Safari
  if ((navigator as unknown as { standalone?: boolean }).standalone === true) return true;

  return false;
}

// ─── Offline Data Cache (IndexedDB-backed via Cache API) ───

const DATA_CACHE_NAME = "sinergia-data-cache";

interface CachedEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export async function setCachedData<T>(
  key: string,
  data: T,
  ttlMs: number = 5 * 60 * 1000
): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const cache = await caches.open(DATA_CACHE_NAME);
    const entry: CachedEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    };
    await cache.put(
      new Request(`/_cache/${key}`),
      new Response(JSON.stringify(entry), {
        headers: { "Content-Type": "application/json" },
      })
    );
  } catch (_) {
    // Cache API not available
  }
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  if (typeof window === "undefined") return null;

  try {
    const cache = await caches.open(DATA_CACHE_NAME);
    const response = await cache.match(new Request(`/_cache/${key}`));
    if (!response) return null;

    const entry: CachedEntry<T> = await response.json();
    const age = Date.now() - entry.timestamp;

    if (age > entry.ttl) {
      // Expired — delete and return null
      await cache.delete(new Request(`/_cache/${key}`));
      return null;
    }

    return entry.data;
  } catch (_) {
    return null;
  }
}

// ─── Helpers ───

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
