"use client";

import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Mail,
  Grid3x3,
  Users,
  Wallet,
  Send,
  Settings,
  X,
} from "lucide-react";
import type { Tab } from "./Sidebar";

interface NavItem {
  id: Tab;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const PRIMARY: NavItem[] = [
  { id: "overview", label: "Mi día", icon: <LayoutDashboard className="w-5 h-5" />, color: "sinergia" },
  { id: "crm", label: "CRM", icon: <Users className="w-5 h-5" />, color: "lime" },
  { id: "emails", label: "Emails", icon: <Mail className="w-5 h-5" />, color: "blue" },
];

const SECONDARY: NavItem[] = [
  { id: "campanas", label: "Campañas", icon: <Send className="w-6 h-6" />, color: "indigo" },
  { id: "finanzas", label: "Finanzas", icon: <Wallet className="w-6 h-6" />, color: "teal" },
  { id: "config", label: "Admin", icon: <Settings className="w-6 h-6" />, color: "sinergia" },
];

const COLOR_MAP: Record<string, { solid: string; soft: string; text: string; glow: string }> = {
  sinergia: { solid: "from-sinergia-500 to-sinergia-600", soft: "bg-sinergia-500/10", text: "text-sinergia-400", glow: "rgba(99,102,241,0.45)" },
  blue: { solid: "from-blue-500 to-indigo-600", soft: "bg-blue-500/10", text: "text-blue-400", glow: "rgba(59,130,246,0.45)" },
  amber: { solid: "from-amber-500 to-orange-600", soft: "bg-amber-500/10", text: "text-amber-400", glow: "rgba(245,158,11,0.45)" },
  purple: { solid: "from-purple-500 to-fuchsia-600", soft: "bg-purple-500/10", text: "text-purple-400", glow: "rgba(168,85,247,0.45)" },
  indigo: { solid: "from-indigo-500 to-violet-600", soft: "bg-indigo-500/10", text: "text-indigo-400", glow: "rgba(99,102,241,0.45)" },
  rose: { solid: "from-rose-500 to-red-600", soft: "bg-rose-500/10", text: "text-rose-400", glow: "rgba(244,63,94,0.45)" },
  lime: { solid: "from-lime-500 to-green-600", soft: "bg-lime-500/10", text: "text-lime-400", glow: "rgba(132,204,22,0.45)" },
  teal: { solid: "from-teal-500 to-cyan-600", soft: "bg-teal-500/10", text: "text-teal-400", glow: "rgba(20,184,166,0.45)" },
};

interface Props {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  notifCounts?: {
    emails?: number;
    crm?: number;
    finanzas?: number;
  };
}

export default function MobileBottomNav({ activeTab, onTabChange, notifCounts }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const isSecondary = SECONDARY.some((s) => s.id === activeTab);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheetOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const select = (id: Tab) => {
    onTabChange(id);
    setSheetOpen(false);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(10); } catch { /* noop */ }
    }
  };

  const getBadge = (id: Tab): number => {
    if (id === "emails") return notifCounts?.emails ?? 0;
    if (id === "crm") return notifCounts?.crm ?? 0;
    if (id === "finanzas") return notifCounts?.finanzas ?? 0;
    return 0;
  };

  const secondaryBadgeTotal =
    (notifCounts?.finanzas ?? 0) > 0 ? notifCounts!.finanzas! : 0;

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[var(--bg-primary)]/95 backdrop-blur-xl border-t border-[var(--border)] pb-[env(safe-area-inset-bottom)]"
        aria-label="Navegación móvil"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-2/3 pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.4), transparent)" }} />
        <div className="flex items-stretch px-2 pt-2 gap-1">
          {PRIMARY.map((item) => {
            const active = activeTab === item.id;
            const c = COLOR_MAP[item.color];
            const badge = getBadge(item.id);
            return (
              <button key={item.id} onClick={() => select(item.id)}
                className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all active:scale-95 min-h-[56px] ${
                  active ? `bg-gradient-to-br ${c.solid} text-white` : `${c.soft} ${c.text} hover:bg-[var(--bg-card-hover)]`
                }`}
                style={active ? { boxShadow: `0 0 18px ${c.glow}, inset 0 1px 0 rgba(255,255,255,0.12)` } : {}}
                aria-current={active ? "page" : undefined}
                aria-label={badge > 0 ? `${item.label}, ${badge} pendientes` : item.label}
              >
                {active && <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]" aria-hidden />}
                <span className="relative">
                  <span className={active ? "drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]" : ""}>{item.icon}</span>
                  {badge > 0 && (
                    <span
                      className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border-[1.5px] border-[var(--bg-primary)]"
                      style={{ boxShadow: "0 0 8px rgba(239,68,68,0.6)" }}
                    >
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-semibold tracking-tight">{item.label}</span>
              </button>
            );
          })}
          <button onClick={() => setSheetOpen(true)}
            className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all active:scale-95 min-h-[56px] ${
              isSecondary ? "bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white" : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
            }`}
            style={isSecondary ? { boxShadow: "0 0 18px rgba(168,85,247,0.45)" } : {}}
            aria-label="Abrir más secciones"
          >
            {isSecondary && <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]" aria-hidden />}
            <span className="relative">
              <Grid3x3 className="w-5 h-5" />
              {secondaryBadgeTotal > 0 && (
                <span
                  className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center border-[1.5px] border-[var(--bg-primary)]"
                  style={{ boxShadow: "0 0 8px rgba(245,158,11,0.6)" }}
                >
                  {secondaryBadgeTotal > 9 ? "9+" : secondaryBadgeTotal}
                </span>
              )}
            </span>
            <span className="text-[10px] font-semibold tracking-tight">Más</span>
          </button>
        </div>
      </nav>

      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-md flex items-end" onClick={() => setSheetOpen(false)}>
          <div className="relative bg-[var(--bg-primary)] border-t border-purple-500/30 rounded-t-3xl w-full p-4 pb-[calc(env(safe-area-inset-bottom)+20px)] max-h-[85vh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: "0 -20px 60px rgba(168,85,247,0.15), inset 0 1px 0 rgba(255,255,255,0.08)" }}
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-shimmer">Más secciones</h3>
                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Toca para navegar</p>
              </div>
              <button onClick={() => setSheetOpen(false)}
                className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition active:scale-95"
                aria-label="Cerrar"><X className="w-5 h-5" /></button>
            </div>
            <div className="stagger-children grid grid-cols-2 gap-3">
              {SECONDARY.map((item) => {
                const active = activeTab === item.id;
                const c = COLOR_MAP[item.color];
                return (
                  <button key={item.id} onClick={() => select(item.id)}
                    className={`relative aspect-square flex flex-col items-center justify-center gap-2 rounded-2xl transition-all active:scale-95 overflow-hidden ${
                      active ? `bg-gradient-to-br ${c.solid} text-white` : `${c.soft} ${c.text} border border-[var(--border)] hover:border-white/10`
                    }`}
                    style={active ? { boxShadow: `0 0 24px ${c.glow}, inset 0 1px 0 rgba(255,255,255,0.15)` } : {}}
                  >
                    <div className="absolute inset-0 opacity-60 pointer-events-none"
                      style={{ background: `radial-gradient(circle at 30% 20%, ${c.glow.replace("0.45", active ? "0.25" : "0.12")}, transparent 60%)` }} aria-hidden />
                    <span className={`relative z-10 ${active ? "drop-shadow-[0_0_6px_rgba(255,255,255,0.5)]" : ""}`}>{item.icon}</span>
                    <span className="relative z-10 text-xs font-semibold tracking-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
