"use client";

import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Mail,
  FileText,
  BarChart3,
  Bot,
  LogOut,
  RefreshCw,
  Sun,
  Moon,
  Zap,
  Bell,
  Users,
  FileSpreadsheet,
  Plug,
  X,
  Receipt,
  Brain,
} from "lucide-react";

export type Tab =
  | "overview"
  | "emails"
  | "invoices"
  | "analytics"
  | "automatizacion"
  | "alertas"
  | "contactos"
  | "informes"
  | "integraciones"
  | "facturar"
  | "memoria"
  | "agent";

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onSync: () => void;
  syncing: boolean;
  darkMode: boolean;
  onToggleTheme: () => void;
  userName?: string | null;
  userImage?: string | null;
  /** Slot para renderizar el AccountSelector encima del nav */
  accountSelector?: React.ReactNode;
  /** Mobile drawer state (desktop always visible) */
  isOpen?: boolean;
  onClose?: () => void;
}

const sections: Array<{
  label?: string;
  tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; color?: string }>;
}> = [
  {
    tabs: [
      { id: "overview", label: "Resumen", icon: <LayoutDashboard className="w-5 h-5" /> },
      { id: "emails", label: "Emails", icon: <Mail className="w-5 h-5" /> },
      { id: "invoices", label: "Facturas", icon: <FileText className="w-5 h-5" /> },
      { id: "analytics", label: "Analíticas", icon: <BarChart3 className="w-5 h-5" /> },
    ],
  },
  {
    label: "Automatización IA",
    tabs: [
      { id: "automatizacion", label: "Automatización", icon: <Zap className="w-5 h-5" />, color: "indigo" },
      { id: "alertas", label: "Alertas & IVA", icon: <Bell className="w-5 h-5" />, color: "rose" },
      { id: "contactos", label: "Contactos CRM", icon: <Users className="w-5 h-5" />, color: "lime" },
      { id: "informes", label: "Informes Excel", icon: <FileSpreadsheet className="w-5 h-5" />, color: "teal" },
      { id: "facturar", label: "Facturar", icon: <Receipt className="w-5 h-5" />, color: "teal" },
    ],
  },
  {
    label: "Asistente",
    tabs: [
      { id: "agent", label: "Chat IA", icon: <Bot className="w-5 h-5" />, color: "purple" },
      { id: "memoria", label: "Memoria IA", icon: <Brain className="w-5 h-5" />, color: "purple" },
      { id: "integraciones", label: "Integraciones", icon: <Plug className="w-5 h-5" />, color: "purple" },
    ],
  },
];

export default function Sidebar({
  activeTab,
  onTabChange,
  onSync,
  syncing,
  darkMode,
  onToggleTheme,
  userName,
  userImage,
  accountSelector,
  isOpen = false,
  onClose,
}: SidebarProps) {
  const handleTabChange = (t: Tab) => {
    onTabChange(t);
    // Auto-close drawer on mobile after selection
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          glass-card p-4 flex flex-col overflow-y-auto
          fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-300 ease-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          lg:sticky lg:top-4 lg:translate-x-0 lg:w-64 lg:h-[calc(100vh-2rem)] lg:z-auto lg:rounded-2xl
        `}
      >
        {/* Mobile-only close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden absolute top-3 right-3 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center hover:bg-[var(--bg-card)] transition"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Logo */}
        <div className="flex items-center gap-3 mb-6 px-2">
          <div className="w-10 h-10 rounded-xl bg-sinergia-600/20 flex items-center justify-center">
            <Mail className="w-5 h-5 text-sinergia-400" />
          </div>
          <div>
            <h1 className="font-bold text-sm">Sinergia Mail</h1>
            <p className="text-[10px] text-[var(--text-secondary)]">Dashboard IA</p>
          </div>
        </div>

        {/* Account selector (sólo visible si hay ≥2 cuentas) */}
        {accountSelector}

        {/* Nav sections */}
        <nav className="flex-1 space-y-4">
          {sections.map((section, si) => (
            <div key={si}>
              {section.label && (
                <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-3 mb-2">
                  {section.label}
                </div>
              )}
              <div className="space-y-1">
                {section.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all min-h-[44px] ${
                      activeTab === tab.id
                        ? "bg-[var(--accent)] text-white shadow-lg"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {tab.icon}
                    <span className="truncate">{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Actions */}
        <div className="space-y-2 pt-4 border-t border-[var(--border)]">
          <button
            onClick={onSync}
            disabled={syncing}
            aria-label="Sincronizar Gmail"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition disabled:opacity-50 min-h-[44px]"
          >
            <RefreshCw className={`w-5 h-5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar Gmail"}
          </button>

          <button
            onClick={onToggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition min-h-[44px]"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {darkMode ? "Modo Claro" : "Modo Oscuro"}
          </button>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-400/10 transition min-h-[44px]"
          >
            <LogOut className="w-5 h-5" />
            Cerrar Sesión
          </button>
        </div>

        {/* User */}
        {userName && (
          <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center gap-3 px-2">
            {userImage ? (
              // Google profile image is served from variable CDN URLs; using plain img
              // here is intentional. next/image would require domain allowlisting.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userImage}
                alt={`Avatar de ${userName}`}
                className="w-8 h-8 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-sinergia-600/20 flex items-center justify-center text-xs font-bold">
                {userName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="text-xs truncate">
              <div className="font-medium truncate">{userName}</div>
              <div className="text-[var(--text-secondary)]">Gerente</div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
