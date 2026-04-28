"use client";

import { Calendar, HardDrive, FileSpreadsheet, Sparkles } from "lucide-react";

interface Props {
  onCalendar: () => void;
  onDrive: () => void;
  onImport: () => void;
  onAgent: () => void;
}

/**
 * MobileQuickActions — fila de 4 atajos visibles en Inicio.
 *
 * Reemplaza la antigua sección "Herramientas" enterrada dentro de Ajustes.
 * Los items que aquí se muestran son herramientas de uso DIARIO:
 *   - Calendario (Google Calendar)
 *   - Drive (Google Drive)
 *   - Importar (CSV/XLSX de empresas, contactos, contratos)
 *   - IA (chat con el swarm)
 *
 * En desktop el sidebar/SectionNav ya las ofrece — este componente es
 * mobile-only.
 */
export default function MobileQuickActions({ onCalendar, onDrive, onImport, onAgent }: Props) {
  const items = [
    { id: "calendar", label: "Calendario", icon: <Calendar className="w-5 h-5" />, onClick: onCalendar, color: "from-blue-500/20 to-cyan-500/20", text: "text-cyan-300", border: "border-cyan-500/30" },
    { id: "drive", label: "Drive", icon: <HardDrive className="w-5 h-5" />, onClick: onDrive, color: "from-emerald-500/20 to-teal-500/20", text: "text-emerald-300", border: "border-emerald-500/30" },
    { id: "import", label: "Importar", icon: <FileSpreadsheet className="w-5 h-5" />, onClick: onImport, color: "from-amber-500/20 to-orange-500/20", text: "text-amber-300", border: "border-amber-500/30" },
    { id: "agent", label: "Asistente IA", icon: <Sparkles className="w-5 h-5" />, onClick: onAgent, color: "from-purple-500/20 to-fuchsia-500/20", text: "text-purple-300", border: "border-purple-500/30" },
  ];

  return (
    <div className="lg:hidden grid grid-cols-4 gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => {
            item.onClick();
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(8); } catch { /* noop */ }
            }
          }}
          className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl bg-gradient-to-br ${item.color} ${item.text} ${item.border} border active:scale-95 transition-transform`}
          aria-label={item.label}
        >
          {item.icon}
          <span className="text-[10px] font-semibold tracking-tight">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
