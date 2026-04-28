"use client";

import { Sparkles } from "lucide-react";

interface Props {
  onClick: () => void;
}

/**
 * MobileChatFab — botón flotante secundario para abrir el asistente IA.
 * Posicionado encima del QuickActionFab para acceso rápido sin saturar
 * el header.
 *
 * Sólo visible en móvil. En desktop el chat IA se accede por shortcut "c".
 */
export default function MobileChatFab({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden fixed z-40 right-4 bottom-[152px] w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500/90 to-fuchsia-600/90 text-white border border-purple-400/40 active:scale-90 transition-transform"
      style={{
        boxShadow: "0 4px 16px rgba(168,85,247,0.4), 0 0 30px rgba(168,85,247,0.15)",
      }}
      aria-label="Asistente IA"
    >
      <Sparkles className="w-5 h-5" strokeWidth={2.25} />
    </button>
  );
}
