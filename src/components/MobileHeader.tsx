"use client";

import { Menu, RefreshCw, Search } from "lucide-react";

interface MobileHeaderProps {
  onToggleSidebar: () => void;
  onSync: () => void;
  syncing: boolean;
  title: string;
  onOpenSearch?: () => void;
  notifTotal?: number;
}

/**
 * MobileHeader — minimalista. 3 zonas:
 *   [≡ con badge]   [TÍTULO grande]   [⌕] [↻]
 *
 * Eliminado intencionalmente:
 * - Brand pulsante con icono Mail (redundante con título y bottom nav)
 * - Botón chat IA (ahora vive en FAB long-press)
 *
 * Resultado: header mucho más respirado, título legible, sin competencia visual.
 * Altura fija 56px (4px menos que antes) — más espacio para contenido.
 */
export default function MobileHeader({
  onToggleSidebar,
  onSync,
  syncing,
  title,
  onOpenSearch,
  notifTotal = 0,
}: MobileHeaderProps) {
  return (
    <header className="lg:hidden sticky top-0 z-30 h-14 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border)] px-3 flex items-center gap-2">
      <button
        onClick={onToggleSidebar}
        className="relative w-11 h-11 rounded-xl flex items-center justify-center hover:bg-[var(--bg-card)] transition active:scale-95 -ml-1"
        aria-label={notifTotal > 0 ? `Menú (${notifTotal} pendientes)` : "Menú"}
      >
        <Menu className="w-5 h-5" strokeWidth={2.25} />
        {notifTotal > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[var(--bg-primary)]"
            aria-hidden
          >
            {notifTotal > 9 ? "9+" : notifTotal}
          </span>
        )}
      </button>

      <h1 className="flex-1 min-w-0 text-base font-bold truncate text-[var(--text-primary)] tracking-tight">
        {title}
      </h1>

      {onOpenSearch && (
        <button
          onClick={onOpenSearch}
          className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-[var(--bg-card)] transition active:scale-95"
          aria-label="Buscar"
        >
          <Search className="w-5 h-5" strokeWidth={2} />
        </button>
      )}

      <button
        onClick={onSync}
        disabled={syncing}
        className={`w-11 h-11 rounded-xl flex items-center justify-center transition active:scale-95 disabled:opacity-50 -mr-1 ${
          syncing ? "text-cyan-400" : "hover:bg-[var(--bg-card)]"
        }`}
        aria-label={syncing ? "Sincronizando…" : "Sincronizar"}
      >
        <RefreshCw
          className={`w-5 h-5 ${syncing ? "animate-spin" : ""}`}
          strokeWidth={2}
        />
      </button>
    </header>
  );
}
