"use client";

import { Menu, RefreshCw, Mail } from "lucide-react";

interface MobileHeaderProps {
  onToggleSidebar: () => void;
  onSync: () => void;
  syncing: boolean;
  title: string;
}

/**
 * Top bar shown only on mobile (lg:hidden).
 * Contains the hamburger button, product identity, and quick sync trigger.
 */
export default function MobileHeader({
  onToggleSidebar,
  onSync,
  syncing,
  title,
}: MobileHeaderProps) {
  return (
    <header className="lg:hidden sticky top-0 z-30 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border)] px-4 py-3 flex items-center gap-3">
      <button
        onClick={onToggleSidebar}
        className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center hover:bg-[var(--bg-card)] transition"
        aria-label="Abrir menú"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-sinergia-600/20 flex items-center justify-center flex-shrink-0">
          <Mail className="w-4 h-4 text-sinergia-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold truncate">{title}</h1>
          <p className="text-[10px] text-[var(--text-secondary)] truncate">Sinergia Mail</p>
        </div>
      </div>

      <button
        onClick={onSync}
        disabled={syncing}
        className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center hover:bg-[var(--bg-card)] transition disabled:opacity-50"
        aria-label="Sincronizar Gmail"
      >
        <RefreshCw className={`w-5 h-5 ${syncing ? "animate-spin text-sinergia-400" : ""}`} />
      </button>
    </header>
  );
}
