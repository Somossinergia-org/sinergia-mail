"use client";

import { useState, useRef, useEffect } from "react";

interface SubTabDef {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
}

interface SubTabsProps {
  tabs: SubTabDef[];
  defaultTab?: string;
  children: (activeSubTab: string) => React.ReactNode;
}

/**
 * SubTabs — pestañas internas de un tab principal.
 *
 * Mobile-first improvements:
 *   - Chip compacto (px-3 vs px-4) — cabe más en pantalla pequeña
 *   - Auto-scroll del chip activo al centro (visible al cambiar)
 *   - Fade gradients laterales cuando hay overflow horizontal
 *   - Sticky bar (queda visible al hacer scroll del contenido)
 *   - Badge opcional para contadores (notificaciones, pendientes)
 */
export default function SubTabs({ tabs, defaultTab, children }: SubTabsProps) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.id || "");
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeBtnRef = useRef<HTMLButtonElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  // Auto-scroll the active chip into view (centered) when it changes.
  useEffect(() => {
    if (!activeBtnRef.current || !scrollRef.current) return;
    const btn = activeBtnRef.current;
    const container = scrollRef.current;
    const btnLeft = btn.offsetLeft;
    const btnWidth = btn.offsetWidth;
    const containerWidth = container.clientWidth;
    const targetScroll = btnLeft - containerWidth / 2 + btnWidth / 2;
    container.scrollTo({ left: targetScroll, behavior: "smooth" });
  }, [active]);

  // Track horizontal scroll to show/hide fade gradients.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setShowLeftFade(el.scrollLeft > 8);
      setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [tabs.length]);

  return (
    <div className="space-y-3 lg:space-y-4">
      {/* Tab bar — sticky on mobile (top-14 = 56px = altura MobileHeader),
          scrollable horizontalmente. -mx-3 px-3 compensa el padding del main. */}
      <div className="relative sticky top-14 lg:top-0 z-10 -mx-3 lg:mx-0 px-3 lg:px-0 bg-[var(--bg-primary)]/80 backdrop-blur-md lg:bg-transparent lg:backdrop-blur-none">
        <div
          ref={scrollRef}
          className="flex gap-1 p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] overflow-x-auto scrollbar-hide -webkit-overflow-scrolling-touch"
          style={{ scrollbarWidth: "none" }}
        >
          {tabs.map((tab) => {
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                ref={isActive ? activeBtnRef : null}
                onClick={() => {
                  setActive(tab.id);
                  // Haptic feedback en móvil
                  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                    try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(8); } catch { /* noop */ }
                  }
                }}
                className={`relative flex items-center gap-1.5 px-3 lg:px-4 py-2 rounded-lg text-xs lg:text-sm font-medium transition-all whitespace-nowrap min-h-[40px] active:scale-95 ${
                  isActive
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] border border-transparent"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {tab.icon && <span className="shrink-0">{tab.icon}</span>}
                <span>{tab.label}</span>
                {typeof tab.badge === "number" && tab.badge > 0 && (
                  <span
                    className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                      isActive
                        ? "bg-cyan-400 text-black"
                        : "bg-red-500/20 text-red-400 border border-red-500/30"
                    }`}
                    aria-label={`${tab.badge} pendientes`}
                  >
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* Left fade */}
        {showLeftFade && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 left-0 lg:left-0 w-8 rounded-l-xl"
            style={{ background: "linear-gradient(90deg, var(--bg-primary) 0%, transparent 100%)" }}
            aria-hidden
          />
        )}
        {/* Right fade */}
        {showRightFade && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 right-0 lg:right-0 w-8 rounded-r-xl"
            style={{ background: "linear-gradient(270deg, var(--bg-primary) 0%, transparent 100%)" }}
            aria-hidden
          />
        )}
      </div>
      {/* Content */}
      {children(active)}
    </div>
  );
}
