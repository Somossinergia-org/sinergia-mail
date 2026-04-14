"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Calculator, Copy, TrendingUp, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Alert {
  id: number;
  issuer: string;
  totalAmount: number;
  daysOverdue?: number;
  daysUntilDue?: number;
  dueDate?: string;
  invoiceNumber?: string | null;
}

interface AlertsData {
  overdue: Alert[];
  dueSoon: Alert[];
  highValue: Alert[];
  summary: {
    totalOverdue: number;
    countOverdue: number;
    totalDueSoon: number;
    countDueSoon: number;
    countNoDueDate: number;
  };
}

interface IVAData {
  year: number;
  quarter: number;
  ivaSoportado: {
    total: number;
    byRate: Array<{ rate: string; base: number; iva: number; total: number }>;
  };
  invoices: Array<{ id: number; issuer: string; totalAmount: number; tax: number; date: string }>;
}

interface DuplicatesData {
  totalPotentialDuplicates: number;
  potentialSavings: number;
  duplicates: Array<{
    confidence: string;
    reason: string;
    invoices: Array<{ id: number; issuer: string; amount: number; date: string }>;
  }>;
}

interface ForecastData {
  forecast: {
    month: string;
    predictedTotal: number;
    confidence: string;
    byCategory: Array<{ category: string; predicted: number }>;
  };
  recurring: Array<{ issuer: string; category: string; avgAmount: number; frequency: string }>;
}

export default function AlertasPanel() {
  const [alerts, setAlerts] = useState<AlertsData | null>(null);
  const [iva, setIva] = useState<IVAData | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicatesData | null>(null);
  const [forecast, setForecast] = useState<ForecastData | null>(null);

  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [loadingIva, setLoadingIva] = useState(true);
  const [loadingDuplicates, setLoadingDuplicates] = useState(true);
  const [loadingForecast, setLoadingForecast] = useState(true);

  const loadAll = useCallback(async () => {
    setLoadingAlerts(true); setLoadingIva(true); setLoadingDuplicates(true); setLoadingForecast(true);
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    try {
      const [aRes, iRes, dRes, fRes] = await Promise.all([
        fetch("/api/agent/invoice-alerts"),
        fetch(`/api/agent/iva-quarterly?year=${now.getFullYear()}&quarter=${quarter}`),
        fetch("/api/agent/duplicates"),
        fetch("/api/agent/expense-forecast"),
      ]);
      setAlerts(await aRes.json()); setLoadingAlerts(false);
      setIva(await iRes.json()); setLoadingIva(false);
      setDuplicates(await dRes.json()); setLoadingDuplicates(false);
      setForecast(await fRes.json()); setLoadingForecast(false);
    } catch (e) {
      console.error(e);
      setLoadingAlerts(false); setLoadingIva(false); setLoadingDuplicates(false); setLoadingForecast(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const fmt = (n: number) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 mb-2">
            <Bell className="w-5 h-5" />
          </div>
          <div className="stat-number text-xl mb-1">
            {loadingAlerts ? "…" : alerts?.summary.countOverdue || 0}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">Facturas vencidas</div>
          {alerts && <div className="text-[10px] text-rose-400 mt-1">{fmt(alerts.summary.totalOverdue)} €</div>}
        </div>

        <div className="glass-card p-4">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400 mb-2">
            <Calculator className="w-5 h-5" />
          </div>
          <div className="stat-number text-xl mb-1">
            {loadingIva ? "…" : fmt(iva?.ivaSoportado.total || 0)} €
          </div>
          <div className="text-xs text-[var(--text-secondary)]">IVA soportado Q{iva?.quarter || "—"}</div>
        </div>

        <div className="glass-card p-4">
          <div className="w-8 h-8 rounded-lg bg-fuchsia-500/10 flex items-center justify-center text-fuchsia-400 mb-2">
            <Copy className="w-5 h-5" />
          </div>
          <div className="stat-number text-xl mb-1">
            {loadingDuplicates ? "…" : duplicates?.totalPotentialDuplicates || 0}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">Posibles duplicados</div>
          {duplicates && duplicates.potentialSavings > 0 && <div className="text-[10px] text-fuchsia-400 mt-1">{fmt(duplicates.potentialSavings)} € ahorro</div>}
        </div>

        <div className="glass-card p-4">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 mb-2">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="stat-number text-xl mb-1">
            {loadingForecast ? "…" : fmt(forecast?.forecast?.predictedTotal || 0)} €
          </div>
          <div className="text-xs text-[var(--text-secondary)]">Previsión {forecast?.forecast?.month || ""}</div>
        </div>
      </div>

      {/* Vencidas */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-rose-400" />
          <h3 className="font-semibold text-sm">Facturas vencidas</h3>
          {alerts && <span className="text-xs text-[var(--text-secondary)]">({alerts.overdue.length})</span>}
        </div>
        {loadingAlerts ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-rose-400" /></div>
        ) : alerts && alerts.overdue.length > 0 ? (
          <div className="space-y-2">
            {alerts.overdue.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-rose-500/5 border border-rose-500/10">
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.issuer}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {a.invoiceNumber || "Sin nº"} · Vencida hace {a.daysOverdue} días
                  </div>
                </div>
                <div className="text-sm font-mono text-rose-400">{fmt(a.totalAmount)} €</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-green-400">
            <CheckCircle2 className="w-4 h-4" /> Sin facturas vencidas
          </div>
        )}
      </div>

      {/* Próximas a vencer */}
      {alerts && alerts.dueSoon.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-amber-400" />
            <h3 className="font-semibold text-sm">Próximas a vencer (7 días)</h3>
          </div>
          <div className="space-y-2">
            {alerts.dueSoon.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.issuer}</div>
                  <div className="text-xs text-[var(--text-secondary)]">Vence en {a.daysUntilDue} días</div>
                </div>
                <div className="text-sm font-mono text-amber-400">{fmt(a.totalAmount)} €</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* IVA desglose */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="w-4 h-4 text-sky-400" />
          <h3 className="font-semibold text-sm">IVA soportado Q{iva?.quarter} {iva?.year} (Modelo 303)</h3>
        </div>
        {loadingIva ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-sky-400" /></div>
        ) : iva && iva.ivaSoportado.byRate.length > 0 ? (
          <div>
            <div className="grid grid-cols-4 gap-3 mb-4 text-xs font-semibold text-[var(--text-secondary)] uppercase">
              <div>Tipo</div>
              <div className="text-right">Base</div>
              <div className="text-right">IVA</div>
              <div className="text-right">Total</div>
            </div>
            {iva.ivaSoportado.byRate.map((r) => (
              <div key={r.rate} className="grid grid-cols-4 gap-3 py-2 border-b border-[var(--border)] last:border-0 text-sm">
                <div className="font-mono text-sky-400">{r.rate}</div>
                <div className="text-right">{fmt(r.base)} €</div>
                <div className="text-right">{fmt(r.iva)} €</div>
                <div className="text-right font-semibold">{fmt(r.total)} €</div>
              </div>
            ))}
            <div className="grid grid-cols-4 gap-3 pt-3 mt-2 border-t-2 border-sky-500/20 text-sm font-semibold">
              <div>TOTAL</div>
              <div></div>
              <div className="text-right text-sky-400">{fmt(iva.ivaSoportado.total)} €</div>
              <div></div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--text-secondary)]">Sin datos de IVA para este trimestre</p>
        )}
      </div>

      {/* Duplicados */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Copy className="w-4 h-4 text-fuchsia-400" />
          <h3 className="font-semibold text-sm">Facturas duplicadas detectadas</h3>
        </div>
        {loadingDuplicates ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-fuchsia-400" /></div>
        ) : duplicates && duplicates.duplicates.length > 0 ? (
          <div className="space-y-3">
            {duplicates.duplicates.map((group, i) => (
              <div key={i} className="p-3 rounded-lg bg-fuchsia-500/5 border border-fuchsia-500/10">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                    group.confidence === "definitive" ? "bg-red-500/20 text-red-400" :
                    group.confidence === "high" ? "bg-fuchsia-500/20 text-fuchsia-400" :
                    "bg-amber-500/20 text-amber-400"
                  }`}>{group.confidence}</span>
                  <span className="text-xs text-[var(--text-secondary)]">{group.reason}</span>
                </div>
                {group.invoices.map((inv) => (
                  <div key={inv.id} className="flex justify-between text-xs py-1">
                    <span className="truncate">{inv.issuer} · {inv.date}</span>
                    <span className="font-mono">{fmt(inv.amount)} €</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-green-400">
            <CheckCircle2 className="w-4 h-4" /> Sin duplicados detectados
          </div>
        )}
      </div>

      {/* Forecast */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-violet-400" />
          <h3 className="font-semibold text-sm">Previsión de gastos</h3>
        </div>
        {loadingForecast ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>
        ) : forecast && forecast.recurring.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs text-[var(--text-secondary)] mb-2">
              Gastos recurrentes detectados (confianza: {forecast.forecast.confidence})
            </div>
            {forecast.recurring.map((r, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-violet-500/5 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.issuer}</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">{r.category} · {r.frequency}</div>
                </div>
                <div className="font-mono text-violet-400">{fmt(r.avgAmount)} €</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-secondary)]">Sin patrones recurrentes detectados</p>
        )}
      </div>
    </div>
  );
}
