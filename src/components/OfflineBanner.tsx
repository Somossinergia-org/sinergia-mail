"use client";

import { useState, useEffect } from "react";
import { WifiOff, Wifi } from "lucide-react";

/**
 * OfflineBanner — detecta cuando el navegador pierde conexión y muestra un
 * banner sutil al usuario. Cuando vuelve la conexión muestra un toast
 * efímero "Conectado de nuevo" y se oculta.
 *
 * Se renderiza fixed top, debajo del MobileHeader (z-20 para no taparlo).
 * Sólo visible en mobile + cuando hay un cambio de estado real (no flash al cargar).
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState<boolean>(true);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(navigator.onLine);
    setHydrated(true);

    const onOnline = () => {
      setOnline(true);
      setShowBackOnline(true);
      setTimeout(() => setShowBackOnline(false), 3000);
    };
    const onOffline = () => {
      setOnline(false);
      setShowBackOnline(false);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!hydrated) return null;
  if (online && !showBackOnline) return null;

  return (
    <div
      className="fixed top-[58px] lg:top-2 left-2 right-2 lg:left-1/2 lg:-translate-x-1/2 lg:right-auto lg:max-w-md z-40 pointer-events-none"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      aria-live="polite"
    >
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium backdrop-blur-md transition-all ${
          online
            ? "bg-green-500/15 border border-green-500/30 text-green-300"
            : "bg-red-500/15 border border-red-500/30 text-red-300"
        }`}
        style={{
          boxShadow: online
            ? "0 0 14px rgba(34,197,94,0.3)"
            : "0 0 14px rgba(239,68,68,0.4)",
          animation: "fadeSlideIn 0.3s ease",
        }}
      >
        {online ? (
          <>
            <Wifi className="w-3.5 h-3.5" />
            <span>Conectado de nuevo</span>
          </>
        ) : (
          <>
            <WifiOff className="w-3.5 h-3.5" />
            <span>Sin conexión — los cambios se guardarán cuando vuelvas a estar online</span>
          </>
        )}
      </div>
      <style jsx>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
