"use client";

import { Camera } from "lucide-react";

interface Props {
  visible: boolean;
}

/**
 * MobileFinanzasFab — FAB contextual de cámara para subir facturas por foto.
 * Solo aparece cuando activeTab === "finanzas". Posicionado encima del
 * MobileChatFab y QuickActionFab.
 *
 * Al tap → dispatch window event "sinergia:open-invoice-photo" que el
 * InvoicePanel escucha para abrir el capturador.
 */
export default function MobileFinanzasFab({ visible }: Props) {
  if (!visible) return null;

  const handleClick = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("sinergia:open-invoice-photo"));
    if ("vibrate" in navigator) {
      try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(15); } catch { /* noop */ }
    }
  };

  return (
    <button
      onClick={handleClick}
      className="lg:hidden fixed z-30 right-4 bottom-[200px] w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-teal-500/90 to-emerald-600/90 text-white border border-teal-400/40 active:scale-90 transition-transform"
      style={{
        boxShadow: "0 4px 16px rgba(20,184,166,0.4), 0 0 30px rgba(20,184,166,0.15)",
      }}
      aria-label="Capturar factura por foto"
    >
      <Camera className="w-5 h-5" strokeWidth={2.25} />
    </button>
  );
}
