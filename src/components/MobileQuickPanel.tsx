"use client";

import { useEffect, ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * MobileQuickPanel — full-screen modal para mostrar Calendario / Drive /
 * Importar / etc desde el atajo en Inicio sin tener que navegar a Ajustes.
 *
 * - Slide-up animation desde abajo
 * - Header sticky con título y X
 * - Body scrollable
 * - Backdrop click para cerrar
 * - Escape key para cerrar
 */
export default function MobileQuickPanel({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Bloquear scroll del body cuando el panel está abierto
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-[var(--bg-primary)]" role="dialog" aria-modal="true" aria-label={title}>
      {/* Header sticky */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-3 h-14 bg-[var(--bg-primary)]/95 backdrop-blur-xl border-b border-[var(--border)]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <button
          onClick={onClose}
          className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-[var(--bg-card)] transition active:scale-95 -ml-1"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" strokeWidth={2.25} />
        </button>
        <h2 className="flex-1 text-base font-bold truncate text-[var(--text-primary)]">{title}</h2>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {children}
      </div>
    </div>
  );
}
