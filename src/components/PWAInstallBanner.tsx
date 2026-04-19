"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, X } from "lucide-react";
import { isAppInstalled } from "@/lib/pwa";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "sinergia-pwa-install-dismissed";
const DISMISS_DAYS = 7;

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already installed
    if (isAppInstalled()) return;

    // Don't show if dismissed recently
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setVisible(false);
      }
    } catch (_) {
      // Prompt failed
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setVisible(false);
    setDeferredPrompt(null);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-[#0a1628] border border-[#1a2d4a] rounded-2xl p-4 shadow-2xl shadow-cyan-500/10">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center"
            style={{ boxShadow: "0 0 16px rgba(6, 182, 212, 0.2)" }}
          >
            <Download className="w-5 h-5 text-cyan-400" />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">
              Instalar Sinergia Mail como app
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Acceso rapido desde tu pantalla de inicio con soporte offline
            </p>
          </div>

          {/* Close */}
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/5 transition"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-3 ml-[52px]">
          <button
            onClick={handleInstall}
            className="flex-1 px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25 transition"
          >
            Instalar
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-500 hover:bg-white/5 transition"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
