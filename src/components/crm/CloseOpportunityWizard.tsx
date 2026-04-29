"use client";

/**
 * CloseOpportunityWizard — modal de "1-tap" para cerrar una oportunidad.
 *
 * UX: dos botones grandes (Ganada / Perdida) y, si "Perdida", un dropdown de
 * razones predefinidas + textarea opcional. El backend valida el status y
 * normaliza lostReason.
 */

import { useState, useCallback, useEffect } from "react";
import { Trophy, X, AlertCircle, Loader2 } from "lucide-react";

const LOST_REASONS = [
  { value: "precio", label: "Precio demasiado alto" },
  { value: "competencia", label: "Eligió a competencia" },
  { value: "no_interesa", label: "Ya no le interesa" },
  { value: "no_contacta", label: "No responde / no contacta" },
  { value: "presupuesto", label: "Sin presupuesto ahora" },
  { value: "timing", label: "Mal momento" },
  { value: "otro", label: "Otro motivo" },
];

interface CloseOpportunityWizardProps {
  opportunityId: number;
  opportunityTitle: string;
  estimatedValueEur?: number | null;
  open: boolean;
  onClose: () => void;
  /** Called after the API responds OK with the updated opp. */
  onClosed?: (status: "cliente_activo" | "perdido") => void;
}

export default function CloseOpportunityWizard({
  opportunityId,
  opportunityTitle,
  estimatedValueEur,
  open,
  onClose,
  onClosed,
}: CloseOpportunityWizardProps) {
  const [step, setStep] = useState<"choose" | "lost">("choose");
  const [lostReason, setLostReason] = useState<string>("precio");
  const [lostNotes, setLostNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setStep("choose");
      setLostReason("precio");
      setLostNotes("");
      setError(null);
    }
  }, [open]);

  const submit = useCallback(
    async (status: "cliente_activo" | "perdido") => {
      setSubmitting(true);
      setError(null);
      try {
        const body: Record<string, unknown> = { status };
        if (status === "perdido") {
          const reasonLabel = LOST_REASONS.find((r) => r.value === lostReason)?.label || lostReason;
          body.lostReason = lostNotes.trim()
            ? `${reasonLabel} — ${lostNotes.trim().slice(0, 500)}`
            : reasonLabel;
        }
        const res = await fetch(`/api/crm/opportunities/${opportunityId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody?.error || `HTTP ${res.status}`);
        }
        onClosed?.(status);
        onClose();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSubmitting(false);
      }
    },
    [opportunityId, lostReason, lostNotes, onClose, onClosed],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl bg-[#0a1628] border border-[#1a2d4a] shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-[#1a2d4a]">
          <div>
            <h3 className="text-sm font-bold text-white">Cerrar oportunidad</h3>
            <p className="text-xs text-slate-400 truncate max-w-[300px]">{opportunityTitle}</p>
            {estimatedValueEur != null && estimatedValueEur > 0 && (
              <p className="text-[10px] text-slate-500">
                Valor estimado: {Number(estimatedValueEur).toLocaleString("es-ES")} €
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg hover:bg-[#1a2d4a] text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === "choose" && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => submit("cliente_activo")}
                disabled={submitting}
                className="flex flex-col items-center justify-center gap-2 rounded-xl p-5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 hover:border-emerald-500/70 transition-all disabled:opacity-50 group"
              >
                {submitting ? (
                  <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
                ) : (
                  <Trophy className="w-7 h-7 text-emerald-400 group-hover:scale-110 transition-transform" />
                )}
                <span className="text-sm font-bold text-emerald-300">GANADA</span>
                <span className="text-[10px] text-emerald-400/70">Cliente activo</span>
              </button>

              <button
                onClick={() => setStep("lost")}
                disabled={submitting}
                className="flex flex-col items-center justify-center gap-2 rounded-xl p-5 bg-red-500/5 hover:bg-red-500/15 border border-red-500/30 hover:border-red-500/60 transition-all disabled:opacity-50 group"
              >
                <X className="w-7 h-7 text-red-400 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-bold text-red-300">PERDIDA</span>
                <span className="text-[10px] text-red-400/70">Anotar motivo</span>
              </button>
            </div>
          )}

          {step === "lost" && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1.5">
                  Motivo
                </label>
                <select
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-lg bg-[#050a14] border border-[#1a2d4a] focus:border-cyan-500/50 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {LOST_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1.5">
                  Notas adicionales (opcional)
                </label>
                <textarea
                  value={lostNotes}
                  onChange={(e) => setLostNotes(e.target.value.slice(0, 500))}
                  disabled={submitting}
                  rows={3}
                  placeholder="Ej: Le pareció caro tras comparar con Iberdrola"
                  className="w-full rounded-lg bg-[#050a14] border border-[#1a2d4a] focus:border-cyan-500/50 px-3 py-2 text-sm text-white placeholder:text-slate-600 disabled:opacity-50 resize-none"
                />
                <p className="text-[10px] text-slate-500 mt-1 text-right">{lostNotes.length}/500</p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setStep("choose")}
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-[#1a2d4a]/50 hover:bg-[#1a2d4a] border border-[#1a2d4a] px-3 py-2 text-xs text-slate-300 transition-colors disabled:opacity-50"
                >
                  Atrás
                </button>
                <button
                  onClick={() => submit("perdido")}
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                  Marcar perdida
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
