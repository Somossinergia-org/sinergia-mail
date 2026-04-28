"use client";

import {
  LayoutDashboard,
  Mail,
  Users,
  Wallet,
  Settings,
} from "lucide-react";
import type { Tab } from "./Sidebar";

interface NavItem {
  id: Tab;
  label: string;
  icon: React.ReactNode;
}

/**
 * 5 tabs visibles en una sola fila — sin "Más" sheet, sin gradients
 * compitiendo con el contenido. Diseño plano estilo native:
 *  - Activo: icon + label en color accent + indicador superior
 *  - Inactivo: icon gris, sin label opcional
 *
 * Los 6 tabs originales se reducen a 5 — campañas se accede desde
 * sidebar (es uso menos frecuente). Si en el futuro hay 6 visibles,
 * usaremos icon-only en mobile pequeño.
 */
const ITEMS: NavItem[] = [
  { id: "overview", label: "Inicio", icon: <LayoutDashboard className="w-[22px] h-[22px]" strokeWidth={2} /> },
  { id: "crm", label: "CRM", icon: <Users className="w-[22px] h-[22px]" strokeWidth={2} /> },
  { id: "emails", label: "Emails", icon: <Mail className="w-[22px] h-[22px]" strokeWidth={2} /> },
  { id: "finanzas", label: "Finanzas", icon: <Wallet className="w-[22px] h-[22px]" strokeWidth={2} /> },
  { id: "config", label: "Ajustes", icon: <Settings className="w-[22px] h-[22px]" strokeWidth={2} /> },
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
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full bg-cyan-400"
                  style={{ boxShadow: "0 0 8px rgba(6,182,212,0.6)" }}
                  aria-hidden
                />
              )}

              {/* Icon + badge */}
              <span className="relative">
                {item.icon}
                {badge > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[var(--bg-primary)]"
                  >
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>

              <span className="text-[10px] font-medium tracking-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
