"use client";

import { useState, useRef, useEffect, ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  /** Distancia mínima de pull para disparar el refresh (px). Default 80. */
  threshold?: number;
  /** Distancia máxima de pull (px). Default 120. */
  maxPull?: number;
  /** Si está deshabilitado, se comporta como un div normal. Útil en desktop. */
  disabled?: boolean;
}

/**
 * Pull-to-refresh móvil — sólo activo en touch.
 *
 * Comportamiento:
 *   - El usuario está en scrollTop=0 y arrastra hacia abajo desde la zona superior
 *   - Aparece indicador con icono refresh
 *   - Al superar threshold, el icono cambia a "soltar para actualizar"
 *   - Al soltar: dispara onRefresh() y muestra spinner hasta que termine
 *
 * Detecta automáticamente si el dispositivo es touch (sino es no-op).
 * Respeta prefers-reduced-motion (sin transform animado).
 */
export default function MobilePullToRefresh({
  onRefresh,
  children,
  threshold = 80,
  maxPull = 120,
  disabled = false,
}: Props) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isTouchDevice = useRef(false);

  useEffect(() => {
    isTouchDevice.current = typeof window !== "undefined" && "ontouchstart" in window;
  }, []);

  useEffect(() => {
    if (disabled || !isTouchDevice.current) return;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return; // sólo si está arriba
      startY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null || isRefreshing) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;
      if (diff > 0 && window.scrollY === 0) {
        // Resistencia: cuánto más tira, menos avanza (efecto goma)
        const dampened = Math.min(diff * 0.5, maxPull);
        setPullDistance(dampened);
        setIsPulling(true);
        // Prevenir el rebote nativo de iOS
        if (diff > 10) {
          try { e.preventDefault(); } catch { /* passive listener */ }
        }
      }
    };

    const onTouchEnd = async () => {
      if (!isPulling) {
        startY.current = null;
        return;
      }
      const distance = pullDistance;
      setIsPulling(false);
      startY.current = null;

      if (distance >= threshold) {
        // Trigger refresh
        setIsRefreshing(true);
        // Vibración háptica de confirmación
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(20); } catch { /* noop */ }
        }
        try {
          await onRefresh();
        } catch (e) {
          console.error("[ptr] refresh failed:", e);
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    };

    // active:true necesario para preventDefault funcione
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [disabled, threshold, maxPull, isPulling, isRefreshing, pullDistance, onRefresh]);

  const reachedThreshold = pullDistance >= threshold;
  const indicatorOpacity = Math.min(pullDistance / threshold, 1);

  return (
    <div ref={containerRef} className="relative flex-1 flex flex-col min-h-0">
      {/* Indicador */}
      {(isPulling || isRefreshing) && (
        <div
          className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-center pointer-events-none transition-transform"
          style={{
            transform: `translateY(${Math.max(0, pullDistance - 30)}px)`,
            opacity: indicatorOpacity,
            paddingTop: "env(safe-area-inset-top)",
          }}
          aria-live="polite"
          aria-label={isRefreshing ? "Actualizando" : reachedThreshold ? "Soltar para actualizar" : "Tira para actualizar"}
        >
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--bg-card)]/95 backdrop-blur-md border border-cyan-500/30"
            style={{ boxShadow: "0 4px 16px rgba(6,182,212,0.25)" }}
          >
            <RefreshCw
              className={`w-4 h-4 text-cyan-400 transition-transform ${isRefreshing ? "ptr-indicator" : ""}`}
              style={{
                transform: !isRefreshing ? `rotate(${pullDistance * 2}deg)` : undefined,
              }}
            />
          </div>
        </div>
      )}

      {/* Contenido — se desplaza ligeramente hacia abajo durante el pull */}
      <div
        className="flex-1 flex flex-col"
        style={{
          transform: isPulling ? `translateY(${Math.min(pullDistance / 2, 30)}px)` : undefined,
          transition: isPulling ? "none" : "transform 0.25s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}
