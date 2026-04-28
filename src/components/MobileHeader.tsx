"use client";

import { Menu, RefreshCw, Mail, Search, MessageSquare } from "lucide-react";

interface MobileHeaderProps {
  onToggleSidebar: () => void;
  onSync: () => void;
  syncing: boolean;
  title: string;
  onOpenSearch?: () => void;
  onOpenAgent?: () => void;
  notifTotal?: number;
}

/**
 * Top bar móvil: hamburguesa con badge total, brand pulsante, búsqueda
 * rápida, chat IA, y sync glow.
 *
 * El badge sobre la hamburguesa muestra el total de notificaciones (suma de
 * emails+crm+finanzas) — pista visual de que hay algo nuevo pendiente.
 */
export default function MobileHeader({
  onToggleSidebar,
  onSync,
  syncing,
  title,
  onOpenSearch,
  onOpenAgent,
  notifTotal = 0,
}: MobileHeaderProps) {
  return (
    <header className="lg:hidden sticky top-0 z-30 bg-[var(--bg-primary)]/85 backdrop-blur-xl border-b border-[var(--border)] px-3 py-2.5 flex items-center gap-2">
      <div
        className="absolute bottom-0 left-1/4 right-1/4 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.35), transparent)" }}
      />

      <button
        onClick={onToggleSidebar}
        className="relative min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition active:scale-95"
        aria-label={notifTotal > 0 ? `Abrir menú, ${notifTotal} notificaciones` : "Abrir menú"}
      >
        <Menu className="w-5 h-5" />
        {notifTotal > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[var(--bg-primary)]"
            style={{ boxShadow: "0 0 8px rgba(239,68,68,0.6)" }}
          >
            {notifTotal > 99 ? "99+" : notifTotal}
          </span>
        )}
      </button>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div
          className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-sinergia-500/30 to-purple-500/20 flex items-center justify-center border border-sinergia-500/30 flex-shrink-0"
          style={{ boxShadow: "0 0 14px rgba(99,102,241,0.35)" }}
        >
          <span className="absolute inset-0 rounded-xl bg-sinergia-500/20 animate-ping opacity-20" aria-hidden />
          <Mail className="w-4 h-4 text-sinergia-300 relative z-10" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold truncate text-shimmer">{title}</h1>
          <p className="text-[10px] text-[var(--text-secondary)] truncate">Sinergia Mail</p>
        </div>
      </div>

      {onOpenAgent && (
        <button
          onClick={onOpenAgent}
          className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-sinergia-500/20 border border-purple-500/30 hover:from-purple-500/30 hover:to-sinergia-500/30 transition active:scale-95"
          style={{ boxShadow: "0 0 12px rgba(168,85,247,0.25)" }}
          aria-label="Abrir asistente IA"
        >
          <MessageSquare className="w-4 h-4 text-purple-300" />
        </button>
      )}

      {onOpenSearch && (
        <button
          onClick={onOpenSearch}
          className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition active:scale-95"
          aria-label="Buscar"
        >
          <Search className="w-5 h-5" />
        </button>
      )}

      <button
        onClick={onSync}
        disabled={syncing}
        className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center transition active:scale-95 disabled:opacity-50 ${
          syncing
            ? "bg-sinergia-500/20 text-sinergia-400"
            : "bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]"
        }`}
        style={syncing ? { boxShadow: "0 0 14px rgba(99,102,241,0.45)" } : {}}
        aria-label="Sincronizar Gmail"
      >
        <RefreshCw className={`w-5 h-5 ${syncing ? "animate-spin" : ""}`} />
      </button>
    </header>
  );
}
