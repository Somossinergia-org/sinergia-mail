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
    ],
  },
  {
    label: "Asistente",
    tabs: [
      { id: "agent", label: "Chat IA", icon: <Bot className="w-5 h-5" />, color: "purple" },
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
}: SidebarProps) {
  return (
    <aside className="w-64 glass-card p-4 flex flex-col h-[calc(100vh-2rem)] sticky top-4 overflow-y-auto">
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
                  onClick={() => onTabChange(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
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
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando..." : "Sincronizar Gmail"}
        </button>

        <button
          onClick={onToggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition"
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          {darkMode ? "Modo Claro" : "Modo Oscuro"}
        </button>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-400/10 transition"
        >
          <LogOut className="w-5 h-5" />
          Cerrar Sesión
        </button>
      </div>

      {/* User */}
      {userName && (
        <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center gap-3 px-2">
          {userImage ? (
            <img src={userImage} alt="" className="w-8 h-8 rounded-full" />
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
  );
}
