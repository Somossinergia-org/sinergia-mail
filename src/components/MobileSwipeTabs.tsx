"use client";

import { useEffect, useRef, ReactNode } from "react";
import type { Tab } from "./Sidebar";

interface Props {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  children: ReactNode;
  /** Orden de las tabs primarias para el swipe horizontal. */
  order?: Tab[];
  /** Si está deshabilitado, no detecta gestos. */
  disabled?: boolean;
}

const DEFAULT_ORDER: Tab[] = ["overview", "crm", "emails", "campanas", "finanzas", "config"];

const SWIPE_THRESHOLD = 60; // px mínimos para considerar swipe
const SWIPE_MAX_VERTICAL = 80; // si Y mueve más, no es swipe horizontal
const SWIPE_TIMEOUT = 600; // ms — gestos más lentos no cuentan

/**
 * Detecta swipe-left / swipe-right SOLO desde los bordes de la pantalla en
 * móvil para cambiar de tab principal. No interfiere con scroll horizontal
 * de SubTabs o tablas porque sólo escucha gestos que empiezan en los
 * 24px laterales (edge-swipe, patrón nativo iOS/Android).
 *
 * Vibración háptica al cambiar.
 */
export default function MobileSwipeTabs({
  activeTab,
  onTabChange,
  children,
  order = DEFAULT_ORDER,
  disabled = false,
}: Props) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const startT = useRef<number>(0);

  useEffect(() => {
    if (disabled) return;
    if (typeof window === "undefined") return;
    const isTouch = "ontouchstart" in window;
    if (!isTouch) return;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      // Sólo detectar gesto si comienza cerca de los bordes (edge-swipe).
      const w = window.innerWidth;
      const isEdgeLeft = t.clientX < 28;
      const isEdgeRight = t.clientX > w - 28;
      if (!isEdgeLeft && !isEdgeRight) {
        startX.current = null;
        return;
      }
      startX.current = t.clientX;
      startY.current = t.clientY;
      startT.current = Date.now();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (startX.current === null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX.current;
      const dy = Math.abs(t.clientY - (startY.current ?? 0));
      const dt = Date.now() - startT.current;
      startX.current = null;
      startY.current = null;
      if (dt > SWIPE_TIMEOUT) return;
      if (dy > SWIPE_MAX_VERTICAL) return; // gesto más vertical que horizontal
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;

      const idx = order.indexOf(activeTab);
      if (idx < 0) return;
      let next: Tab | null = null;
      if (dx < 0 && idx < order.length - 1) {
        next = order[idx + 1]; // swipe izquierda → siguiente tab
      } else if (dx > 0 && idx > 0) {
        next = order[idx - 1]; // swipe derecha → tab anterior
      }
      if (next) {
        onTabChange(next);
        if ("vibrate" in navigator) {
          try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(15); } catch { /* noop */ }
        }
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [activeTab, onTabChange, order, disabled]);

  return <>{children}</>;
}
