"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  Mail,
  FileText,
  Bot,
  MoreHorizontal,
  Zap,
  Bell,
  Users,
  FileSpreadsheet,
  BarChart3,
  Plug,
  Receipt,
  Brain,
  X,
} from "lucide-react";
import type { Tab } from "./Sidebar";

interface NavItem {
  id: Tab;
  label: string;
  icon: React.ReactNode;
}

const PRIMARY: NavItem[] = [
  { id: "overview", label: "Resumen", icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: "emails", label: "Emails", icon: <Mail className="w-5 h-5" /> },
  { id: "invoices", label: "Facturas", icon: <FileText className="w-5 h-5" /> },
  { id: "agent", label: "Chat IA", icon: <Bot className="w-5 h-5" /> },
];

const SECONDARY: NavItem[] = [
  { id: "analytics", label: "Analíticas", icon: <BarChart3 className="w-5 h-5 text-sinergia-400" /> },
  { id: "automatizacion", label: "Automatización", icon: <Zap className="w-5 h-5 text-indigo-400" /> },
  { id: "alertas", label: "Alertas & IVA", icon: <Bell className="w-5 h-5 text-rose-400" /> },
  { id: "contactos", label: "Contactos CRM", icon: <Users className="w-5 h-5 text-lime-400" /> },
  { id: "informes", label: "Informes Excel", icon: <FileSpreadsheet className="w-5 h-5 text-teal-400" /> },
  { id: "facturar", label: "Facturar", icon: <Receipt className="w-5 h-5 text-teal-400" /> },
  { id: "memoria", label: "Memoria IA", icon: <Brain className="w-5 h-5 text-purple-400" /> },
  { id: "integraciones", label: "Integraciones", icon: <Plug className="w-5 h-5 text-purple-400" /> },
];

interface Props {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
}

/**
 * Bottom navigation bar shown only on mobile (lg:hidden).
 * 4 primary tabs reachable with the thumb + "Más" sheet for the rest.
 */
export default function MobileBottomNav({ activeTab, onTabChange }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const isSecondary = SECONDARY.some((s) => s.id === activeTab);

  const select = (id: Tab) => {
    onTabChange(id);
    setSheetOpen(false);
  };

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[var(--bg-primary)]/95 backdrop-blur-md border-t border-[var(--border)] pb-[env(safe-area-inset-bottom)]"
        aria-label="Navegación móvil"
      >
        <div className="flex items-stretch">
          {PRIMARY.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => select(item.id)}
                className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 min-h-[56px] transition ${
                  active ? "text-sinergia-400" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => setSheetOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 min-h-[56px] transition ${
              isSecondary ? "text-sinergia-400" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium">Más</span>
          </button>
        </div>
      </nav>

      {/* "Más" sheet */}
      {sheetOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="bg-[var(--bg-primary)] border-t border-[var(--border)] rounded-t-2xl w-full p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] max-h-[80vh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Más secciones</h3>
              <button
                onClick={() => setSheetOpen(false)}
                className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center hover:bg-[var(--bg-card)]"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SECONDARY.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => select(item.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left transition min-h-[56px] ${
                      active
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)]"
                    }`}
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
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
