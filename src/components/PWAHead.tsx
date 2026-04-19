"use client";

import { useEffect } from "react";
import { registerServiceWorker, requestNotificationPermission } from "@/lib/pwa";

/**
 * PWAHead — Client component that handles PWA initialization on mount.
 *
 * In Next.js App Router, static metadata (manifest, theme-color, apple-web-app)
 * is already exported from layout.tsx via the `metadata` object. This component
 * handles runtime-only tasks:
 *
 * 1. Registers the service worker (with periodic sync setup)
 * 2. Dynamically injects any additional meta tags not covered by layout metadata
 * 3. Sets up auto-update + controller-change reload flow
 */
export default function PWAHead() {
  useEffect(() => {
    // Register service worker with all bells and whistles
    registerServiceWorker();

    // Ensure apple-touch-startup-image and mobile-web-app-capable tags exist
    const metaTags: Array<{ name: string; content: string }> = [
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Sinergia" },
      { name: "msapplication-TileColor", content: "#050a14" },
      { name: "msapplication-tap-highlight", content: "no" },
    ];

    const addedElements: HTMLMetaElement[] = [];

    for (const tag of metaTags) {
      if (!document.querySelector(`meta[name="${tag.name}"]`)) {
        const meta = document.createElement("meta");
        meta.name = tag.name;
        meta.content = tag.content;
        document.head.appendChild(meta);
        addedElements.push(meta);
      }
    }

    // Ensure theme-color meta exists with correct value
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute("content", "#06b6d4");
    } else {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = "#06b6d4";
      document.head.appendChild(meta);
      addedElements.push(meta);
    }

    // Ensure manifest link exists
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/manifest.json";
      document.head.appendChild(link);
    }

    // Handle controller changes (new SW activated)
    let refreshing = false;
    const controllerHandler = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        controllerHandler
      );
    }

    return () => {
      // Cleanup dynamically added elements
      for (const el of addedElements) {
        el.remove();
      }
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          controllerHandler
        );
      }
    };
  }, []);

  // Request notification permission after a delay (UX best practice)
  useEffect(() => {
    const timer = setTimeout(() => {
      requestNotificationPermission();
    }, 30000); // 30 seconds after mount

    return () => clearTimeout(timer);
  }, []);

  return null;
}
