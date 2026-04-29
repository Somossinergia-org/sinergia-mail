"use client";

/**
 * PendingPaymentsWidget — resumen de cobros pendientes en panel Finanzas.
 *
 * - totalPending: total a cobrar (no pagado, no cancelado)
 * - overdueTotal + count: vencidas (rojo)
 * - dueThisWeek + count: vencen en 7 días (naranja)
 * - top 5 más antiguas con badge "Vencida" si aplica
 */

import { useEffect, useState, useCallback } from "react";
import { AlertCircle, Clock, Euro, Receipt, ArrowRight } from "lucide-react";

interface PendingItem {
  id: number;
  number: string;
  clientName: string;
  total: number;
  issueDate: string;
  dueDate: string | null;
  status: string;
  isOverdue: boolean;
}

interface PendingResponse {
  totalPending: number;
  overdueTotal: number;
  dueThisWeek: number;
  overdueCount: number;
  dueThisWeekCount: number;
  count: number;
  top: PendingItem[];
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-ES") : "—");

interface PendingPaymentsWidgetProps {
  /** Optional click handler to navigate to a specific invoice. */
  onOpenInvoice?: (id: number) => void;
}

export default function PendingPaymentsWidget({ onOpenInvoice }: PendingPaymentsWidgetProps = {}) {
  const [data, setData] = useState<PendingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/issued-invoices/pending");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4 animate-pulse">
        <div className="h-4 w-32 bg-[#1a2d4a] rounded mb-3" />
        <div className="h-8 w-48 bg-[#1a2d4a] rounded mb-4" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-12 bg-[#1a2d4a] rounded" />
          <div className="h-12 bg-[#1a2d4a] rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-[#0a1628] border border-red-500/30 p-4 text-sm text-red-400">
        Error cargando cobros: {error}
      </div>
    );
  }

  if (!data || data.count === 0) {
    return (
      <div className="rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4">
        <div className="flex items-center gap-2 mb-2">
          <Receipt className="w-4 h-4 text-emerald-400" />
          <span className="text-xs uppercase tracking-wider text-slate-400">Cobros pendientes</span>
        </div>
        <p className="text-sm text-slate-300">Sin facturas pendientes. Estás al día. 🎯</p>
      </div>
    );
  }

  const hasOverdue = data.overdueCount > 0;
  const hasUpcoming = data.dueThisWeekCount > 0;

  return (
    <div className="rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-cyan-400" />
          <span className="text-xs uppercase tracking-wider text-slate-400">Cobros pendientes</span>
        </div>
        <span className="text-[10px] text-slate-500">{data.count} factura{data.count === 1 ? "" : "s"}</span>
      </div>

      <div>
        <p className="text-2xl font-black font-mono text-cyan-300">
          {fmt(data.totalPending)} €
        </p>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Total por cobrar</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div
          className={`rounded-lg border p-2.5 ${
            hasOverdue ? "bg-red-500/5 border-red-500/30" : "bg-[#050a14] border-[#1a2d4a]"
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <AlertCircle className={`w-3 h-3 ${hasOverdue ? "text-red-400" : "text-slate-500"}`} />
            <span className="text-[9px] uppercase tracking-wider text-slate-400">Vencidas</span>
          </div>
          <p className={`text-sm font-bold font-mono ${hasOverdue ? "text-red-400" : "text-slate-300"}`}>
            {fmt(data.overdueTotal)} €
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">{data.overdueCount} factura{data.overdueCount === 1 ? "" : "s"}</p>
        </div>

        <div
          className={`rounded-lg border p-2.5 ${
            hasUpcoming ? "bg-amber-500/5 border-amber-500/30" : "bg-[#050a14] border-[#1a2d4a]"
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className={`w-3 h-3 ${hasUpcoming ? "text-amber-400" : "text-slate-500"}`} />
            <span className="text-[9px] uppercase tracking-wider text-slate-400">Esta semana</span>
          </div>
          <p className={`text-sm font-bold font-mono ${hasUpcoming ? "text-amber-400" : "text-slate-300"}`}>
            {fmt(data.dueThisWeek)} €
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">{data.dueThisWeekCount} factura{data.dueThisWeekCount === 1 ? "" : "s"}</p>
        </div>
      </div>

      {data.top.length > 0 && (
        <div className="border-t border-[#1a2d4a] pt-3 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Más antiguas</p>
          {data.top.map((inv) => (
            <button
              key={inv.id}
              onClick={() => onOpenInvoice?.(inv.id)}
              className="w-full text-left flex items-center justify-between gap-2 rounded-lg bg-[#050a14] border border-[#1a2d4a]/40 px-2.5 py-2 hover:border-cyan-500/30 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono text-cyan-300 truncate">{inv.number}</span>
                  {inv.isOverdue && (
                    <span className="text-[8px] uppercase tracking-wider px-1 py-0.5 rounded bg-red-500/15 text-red-400 font-bold">
                      Vencida
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 truncate">{inv.clientName}</p>
                <p className="text-[10px] text-slate-500">Vence: {fmtDate(inv.dueDate)}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Euro className="w-3 h-3 text-slate-500" />
                <span className="text-xs font-mono text-slate-300">{fmt(inv.total)}</span>
                <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-cyan-400 transition-colors" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
