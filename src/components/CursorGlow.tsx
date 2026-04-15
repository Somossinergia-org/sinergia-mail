"use client";

import { useEffect } from "react";

/**
 * Global cursor-tracking: delega mousemove al document y actualiza las
 * variables --x, --y en el elemento `.cursor-spot` que está bajo el cursor.
 * Dramáticamente más barato que poner un listener en cada card.
 *
 * Respeta prefers-reduced-motion.
 */
export default function CursorGlow() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;

    let rafId = 0;
    let lastEl: HTMLElement | null = null;

    const onMove = (e: MouseEvent) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const target = e.target;
        const spot =
          target instanceof Element
            ? target.closest<HTMLElement>(".cursor-spot, .glass-card")
            : null;
        if (!spot) {
          if (lastEl) {
            lastEl.style.removeProperty("--x");
            lastEl.style.removeProperty("--y");
            lastEl = null;
          }
          return;
        }
        const rect = spot.getBoundingClientRect();
        spot.style.setProperty("--x", `${e.clientX - rect.left}px`);
        spot.style.setProperty("--y", `${e.clientY - rect.top}px`);
        lastEl = spot;
      });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return null;
}
