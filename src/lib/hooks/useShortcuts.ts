"use client";

import { useEffect, useRef } from "react";

/**
 * Global keyboard shortcuts manager.
 *
 * Supports:
 *  - Single-key triggers: "z", "/", "?"
 *  - "g" + letter sequences (vim-style): "gr", "ge", "gf", "ga"
 *  - Modifier combos: "cmd+k" (handled by CommandPalette directly)
 *
 * Skips when focus is on inputs/textareas/contenteditable to avoid hijacking typing.
 */

export type ShortcutHandler = () => void;

export interface ShortcutMap {
  [combo: string]: ShortcutHandler;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  // Command palette input is also a text target — avoid conflict
  if (el.closest("[cmdk-root]")) return true;
  return false;
}

export function useShortcuts(shortcuts: ShortcutMap): void {
  // Track the "g" leader state for 2-key sequences
  const leaderRef = useRef<{ key: string | null; ts: number }>({ key: null, ts: 0 });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      // Ignore when modifier combos are active (command palette handles cmd+k)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key;

      const keyLower = key.toLowerCase();

      // Two-key sequences: "g" + letter/symbol within 1 second
      if (leaderRef.current.key === "g" && Date.now() - leaderRef.current.ts < 1000) {
        // Try exact key first (for symbols like "$"), then lowercase
        const comboExact = `g${key}`;
        const comboLower = `g${keyLower}`;
        leaderRef.current = { key: null, ts: 0 };
        if (shortcuts[comboExact]) {
          e.preventDefault();
          shortcuts[comboExact]();
          return;
        }
        if (comboExact !== comboLower && shortcuts[comboLower]) {
          e.preventDefault();
          shortcuts[comboLower]();
          return;
        }
      }

      if (keyLower === "g") {
        leaderRef.current = { key: "g", ts: Date.now() };
        return;
      }

      // Single-key shortcuts
      if (shortcuts[keyLower]) {
        e.preventDefault();
        shortcuts[keyLower]();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}

/** Reference cheatsheet shown in the help modal. */
export const SHORTCUT_CHEATSHEET: Array<{ combo: string; label: string; group: string }> = [
  { combo: "g r", label: "Ir a Resumen", group: "Navegación" },
  { combo: "g e", label: "Ir a Emails", group: "Navegación" },
  { combo: "g f", label: "Ir a Facturas", group: "Navegación" },
  { combo: "g a", label: "Ir a Analíticas", group: "Navegación" },
  { combo: "g u", label: "Ir a Automatización", group: "Navegación" },
  { combo: "g l", label: "Ir a Alertas & IVA", group: "Navegación" },
  { combo: "g c", label: "Ir a Contactos CRM", group: "Navegación" },
  { combo: "g i", label: "Ir a Informes Excel", group: "Navegación" },
  { combo: "g t", label: "Ir a Integraciones", group: "Navegación" },
  { combo: "g v", label: "Ir a Facturar (venta)", group: "Navegación" },
  { combo: "g x", label: "Ir a Chat IA", group: "Navegación" },
  { combo: "g p", label: "Ir a Scoring Predictivo", group: "Navegación" },
  { combo: "g w", label: "Ir a Forecast / Tesorería", group: "Navegación" },
  { combo: "g 5", label: "Ir a Agente Super (GPT-5)", group: "Navegación" },
  { combo: "g d", label: "Ir a RGPD / Data Protection", group: "Navegación" },
  { combo: "⌘ K", label: "Paleta de comandos", group: "Acciones" },
  { combo: "/", label: "Enfocar búsqueda", group: "Acciones" },
  { combo: "s", label: "Sincronizar Gmail", group: "Acciones" },
  { combo: "z", label: "Modo Inbox Zero", group: "Acciones" },
  { combo: "f", label: "Buscador universal (texto / voz / imagen)", group: "Acciones" },
  { combo: "c", label: "Abrir Sinergia AI flotante (chat / voz / drop)", group: "Acciones" },
  { combo: "?", label: "Mostrar atajos (esta ventana)", group: "Ayuda" },
  { combo: "Esc", label: "Cerrar modal / paleta", group: "Ayuda" },
];
