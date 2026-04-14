"use client";

import { X, Keyboard } from "lucide-react";
import { SHORTCUT_CHEATSHEET } from "@/lib/hooks/useShortcuts";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ShortcutsHelp({ open, onClose }: Props) {
  if (!open) return null;
  const groups = Array.from(new Set(SHORTCUT_CHEATSHEET.map((s) => s.group)));

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <Keyboard className="w-5 h-5 text-sinergia-400" />
            <h2 className="font-semibold">Atajos de teclado</h2>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center hover:bg-[var(--bg-card-hover)] transition"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {groups.map((group) => (
            <div key={group}>
              <h3 className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                {group}
              </h3>
              <div className="space-y-1">
                {SHORTCUT_CHEATSHEET.filter((s) => s.group === group).map((s) => (
                  <div
                    key={s.combo}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--bg-card)] transition"
                  >
                    <span className="text-sm">{s.label}</span>
                    <kbd className="font-mono text-xs px-2 py-1 rounded bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]">
                      {s.combo}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-[var(--text-secondary)] pt-2">
            Tip: los atajos están desactivados mientras escribes en un campo de texto.
          </p>
        </div>
      </div>
    </div>
  );
}
