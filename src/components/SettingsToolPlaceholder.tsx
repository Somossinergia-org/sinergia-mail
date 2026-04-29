"use client";

import type { ReactNode } from "react";

interface SettingsToolPlaceholderProps {
  title: string;
  description: string;
  buttonLabel: string;
  buttonIcon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Card sencilla para herramientas globales accesibles desde Ajustes >
 * Herramientas (Sincronizar Gmail, Limpieza inteligente, Papelera interna,
 * Migrar BBDD, Apariencia). El botón dispara la acción real (callback o
 * evento window que escucha el componente correspondiente).
 */
export default function SettingsToolPlaceholder({
  title,
  description,
  buttonLabel,
  buttonIcon,
  onClick,
  disabled = false,
}: SettingsToolPlaceholderProps) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
          {description}
        </p>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-500/60 text-cyan-300 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {buttonIcon}
        {buttonLabel}
      </button>
    </div>
  );
}
