"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Thermometer,
  Flag,
  DollarSign,
} from "lucide-react";

interface Opportunity {
  id: number;
  title: string;
  companyId: number | null;
  status: string;
  temperature: string | null;
  priority: string | null;
  estimatedValueEur: number | null;
  createdAt: string;
  updatedAt: string;
}

interface CrmPipelineViewProps {
  opportunities: Opportunity[];
  onStatusChange: (id: number, newStatus: string) => void;
  onRefresh: () => void;
}

const STATUSES = [
  "pendiente",
  "contactado",
  "interesado",
  "visita_programada",
  "visitado",
  "oferta_enviada",
  "negociacion",
  "contrato_firmado",
  "cliente_activo",
  "perdido",
] as const;

const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  contactado: "Contactado",
  interesado: "Interesado",
  visita_programada: "Visita Prog.",
  visitado: "Visitado",
  oferta_enviada: "Oferta Env.",
  negociacion: "Negociación",
  contrato_firmado: "Contrato",
  cliente_activo: "Cliente Activo",
  perdido: "Perdido",
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pendiente: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/30" },
  contactado: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
  interesado: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/30" },
  visita_programada: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30" },
  visitado: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/30" },
  oferta_enviada: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  negociacion: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30" },
  contrato_firmado: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30" },
  cliente_activo: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
  perdido: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
};

const TEMP_COLORS: Record<string, { bg: string; text: string }> = {
  frio: { bg: "bg-blue-500/10", text: "text-blue-400" },
  tibio: { bg: "bg-amber-500/10", text: "text-amber-400" },
  caliente: { bg: "bg-red-500/10", text: "text-red-400" },
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  baja: { bg: "bg-slate-500/10", text: "text-slate-400" },
  media: { bg: "bg-yellow-500/10", text: "text-yellow-400" },
  alta: { bg: "bg-orange-500/10", text: "text-orange-400" },
  urgente: { bg: "bg-red-500/10", text: "text-red-400" },
};

const eurFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

export default function CrmPipelineView({
  opportunities,
  onStatusChange,
  onRefresh,
}: CrmPipelineViewProps) {
  const [changingId, setChangingId] = useState<number | null>(null);

  const groupedByStatus: Record<string, Opportunity[]> = {};
  for (const s of STATUSES) {
    groupedByStatus[s] = [];
  }
  for (const opp of opportunities) {
    if (groupedByStatus[opp.status]) {
      groupedByStatus[opp.status].push(opp);
    }
  }

  const handleMove = async (opp: Opportunity, direction: "prev" | "next") => {
    const idx = STATUSES.indexOf(opp.status as (typeof STATUSES)[number]);
    if (idx === -1) return;
    const newIdx = direction === "next" ? idx + 1 : idx - 1;
    if (newIdx < 0 || newIdx >= STATUSES.length) return;
    const newStatus = STATUSES[newIdx];
    setChangingId(opp.id);
    try {
      await onStatusChange(opp.id, newStatus);
      onRefresh();
    } finally {
      setChangingId(null);
    }
  };

  const columnTotal = (items: Opportunity[]) =>
    items.reduce((sum, o) => sum + (o.estimatedValueEur ?? 0), 0);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3" style={{ minWidth: `${STATUSES.length * 236}px` }}>
        {STATUSES.map((status) => {
          const items = groupedByStatus[status];
          const colors = STATUS_COLORS[status];
          const total = columnTotal(items);

          return (
            <div
              key={status}
              className="flex flex-col bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
              style={{ minWidth: "220px", flex: "1 0 220px" }}
            >
              {/* Column header */}
              <div
                className={`p-3 rounded-t-lg border-b ${colors.border} ${colors.bg}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-semibold ${colors.text}`}>
                    {STATUS_LABELS[status]}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text}`}
                  >
                    {items.length}
                  </span>
                </div>
                {total > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <DollarSign className={`w-3 h-3 ${colors.text}`} />
                    <span className={`text-xs ${colors.text}`}>
                      {eurFormatter.format(total)}
                    </span>
                  </div>
                )}
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2 p-2 flex-1 overflow-y-auto max-h-[60vh]">
                {items.length === 0 && (
                  <div className="text-center text-[var(--text-secondary)] text-xs py-4">
                    Sin oportunidades
                  </div>
                )}
                {items.map((opp) => {
                  const statusIdx = STATUSES.indexOf(
                    opp.status as (typeof STATUSES)[number]
                  );
                  const canPrev = statusIdx > 0;
                  const canNext = statusIdx < STATUSES.length - 1;
                  const isChanging = changingId === opp.id;

                  return (
                    <div
                      key={opp.id}
                      className={`glass-card p-3 space-y-2 ${
                        isChanging ? "opacity-50" : ""
                      }`}
                    >
                      <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {opp.title}
                      </div>

                      {/* Badges row */}
                      <div className="flex flex-wrap gap-1">
                        {opp.temperature && TEMP_COLORS[opp.temperature] && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${TEMP_COLORS[opp.temperature].bg} ${TEMP_COLORS[opp.temperature].text}`}
                          >
                            <Thermometer className="w-3 h-3" />
                            {opp.temperature}
                          </span>
                        )}
                        {opp.priority && PRIORITY_COLORS[opp.priority] && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[opp.priority].bg} ${PRIORITY_COLORS[opp.priority].text}`}
                          >
                            <Flag className="w-3 h-3" />
                            {opp.priority}
                          </span>
                        )}
                      </div>

                      {/* Value */}
                      {opp.estimatedValueEur != null && opp.estimatedValueEur > 0 && (
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3 text-cyan-400" />
                          <span className="text-xs text-cyan-400">
                            {eurFormatter.format(opp.estimatedValueEur)}
                          </span>
                        </div>
                      )}

                      {/* Navigation buttons */}
                      <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]">
                        <button
                          onClick={() => handleMove(opp, "prev")}
                          disabled={!canPrev || isChanging}
                          className={`p-1 rounded transition-colors ${
                            canPrev
                              ? "hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                              : "text-[var(--border)] cursor-not-allowed"
                          }`}
                          title={
                            canPrev
                              ? `Mover a ${STATUS_LABELS[STATUSES[statusIdx - 1]]}`
                              : undefined
                          }
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-[10px] text-[var(--text-secondary)]">
                          {STATUS_LABELS[opp.status]}
                        </span>
                        <button
                          onClick={() => handleMove(opp, "next")}
                          disabled={!canNext || isChanging}
                          className={`p-1 rounded transition-colors ${
                            canNext
                              ? "hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                              : "text-[var(--border)] cursor-not-allowed"
                          }`}
                          title={
                            canNext
                              ? `Mover a ${STATUS_LABELS[STATUSES[statusIdx + 1]]}`
                              : undefined
                          }
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
