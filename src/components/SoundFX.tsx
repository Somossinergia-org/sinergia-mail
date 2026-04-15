"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { uiSound } from "@/lib/ui-sound";

/**
 * Delegación global de sonidos UI:
 *   - click en <button> o [role=button] → sound "click"
 *   - hover en .btn-accent o .glass-card > button → sound "hover" (throttled)
 *   - Eventos custom window.dispatchEvent(new Event("sinergia:sound-success")) etc.
 *
 * Además renderiza un toggle 🔊/🔇 en la esquina inferior-izquierda.
 */
export default function SoundFX() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(uiSound.isEnabled());
  }, []);

  // Delegación global
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const btn = t.closest<HTMLElement>('button, [role="button"], a.btn-accent');
      if (!btn) return;
      if (btn.hasAttribute("data-no-sound")) return;
      uiSound.play("click");
    };
    const onPointerOver = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const hover = t.closest<HTMLElement>(".btn-accent, [data-sound-hover]");
      if (!hover) return;
      uiSound.play("hover");
    };
    const onSuccess = () => uiSound.play("success");
    const onError = () => uiSound.play("error");
    const onSend = () => uiSound.play("send");
    const onReceive = () => uiSound.play("receive");
    const onOpen = () => uiSound.play("open");
    const onClose = () => uiSound.play("close");

    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerover", onPointerOver);
    window.addEventListener("sinergia:sound-success", onSuccess);
    window.addEventListener("sinergia:sound-error", onError);
    window.addEventListener("sinergia:sound-send", onSend);
    window.addEventListener("sinergia:sound-receive", onReceive);
    window.addEventListener("sinergia:sound-open", onOpen);
    window.addEventListener("sinergia:sound-close", onClose);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerover", onPointerOver);
      window.removeEventListener("sinergia:sound-success", onSuccess);
      window.removeEventListener("sinergia:sound-error", onError);
      window.removeEventListener("sinergia:sound-send", onSend);
      window.removeEventListener("sinergia:sound-receive", onReceive);
      window.removeEventListener("sinergia:sound-open", onOpen);
      window.removeEventListener("sinergia:sound-close", onClose);
    };
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    uiSound.setEnabled(next);
    if (next) uiSound.play("success");
  };

  return (
    <button
      onClick={toggle}
      data-no-sound
      aria-label={enabled ? "Silenciar sonidos UI" : "Activar sonidos UI"}
      title={enabled ? "Sonido UI activo" : "Sonido UI silenciado"}
      className="fixed bottom-4 left-4 z-30 w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--bg-card)] backdrop-blur border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition"
    >
      {enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
    </button>
  );
}
