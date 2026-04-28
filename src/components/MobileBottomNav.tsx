"use client";

import {
  LayoutDashboard,
  Mail,
  Users,
  Wallet,
  Settings,
  Send,
} from "lucide-react";
import type { Tab } from "./Sidebar";

interface NavItem {
  id: Tab;
  label: string;
  icon: React.ReactNode;
}

/**
 * 6 tabs visibles, icon + label compacto. Optimizado para 360px+.
 * Cada tab ~60px de ancho, label de 9-10px (legible pero compacto).
 *
 * Diseño plano nativo: indicador top + accent cyan cuando activo.
 * Sin gradients ni sheet "Más" — todo es 1 tap.
 */
const ITEMS: NavItem[] = [
  { id: "overview", label: "Inicio", icon: <LayoutDashboard className="w-[20px] h-[20px]" strokeWidth={2} /> },
  { id: "crm", label: "CRM", icon: <Users className="w-[20px] h-[20px]" strokeWidth={2} /> },
  { id: "emails", label: "Emails", icon: <Mail className="w-[20px] h-[20px]" strokeWidth={2} /> },
  { id: "campanas", label: "Campañas", icon: <Send className="w-[20px] h-[20px]" strokeWidth={2} /> },
  { id: "finanzas", label: "Finanzas", icon: <Wallet className="w-[20px] h-[20px]" strokeWidth={2} /> },
  { id: "config", label: "Ajustes", icon: <Settings className="w-[20px] h-[20px]" strokeWidth={2} /> },
];

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
  const select = (id: Tab) => {
    onTabChange(id);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(8); } catch { /* noop */ }
    }
  };

  const getBadge = (id: Tab): number => {
    if (id === "emails") return notifCounts?.emails ?? 0;
    if (id === "crm") return notifCounts?.crm ?? 0;
    if (id === "finanzas") return notifCounts?.finanzas ?? 0;
    return 0;
  };

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[var(--bg-primary)]/95 backdrop-blur-xl border-t border-[var(--border)] pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegación"
    >
      <div className="flex items-stretch">
        {ITEMS.map((item) => {
          const active = activeTab === item.id;
          const badge = getBadge(item.id);
          return (
            <button
              key={item.id}
              onClick={() => select(item.id)}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[58px] active:bg-[var(--bg-card)] transition-colors ${
                active ? "text-cyan-400" : "text-[var(--text-secondary)]"
              }`}
              aria-current={active ? "page" : undefined}
              aria-label={badge > 0 ? `${item.label}, ${badge} pendientes` : item.label}
            >
              {/* Indicador superior cuando activo */}
              {active && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[3px] rounded-b-full bg-cyan-400"
                  style={{ boxShadow: "0 0 8px rgba(6,182,212,0.6)" }}
                  aria-hidden
                />
              )}

              {/* Icon + badge */}
              <span className="relative">
                {item.icon}
                {badge > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-[var(--bg-primary)]"
                  >
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>

              <span className="text-[9px] font-medium tracking-tight leading-none">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
