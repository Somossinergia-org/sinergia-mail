"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Calculator, Copy, TrendingUp, Loader2, AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";

interface AlertItem {
  type: string;
  severity: string;
  invoiceId: number;
  issuer: string;
  amount: number;
  dueDate?: string;
  daysOverdue?: number;
  daysUntilDue?: number;
}

interface AlertsData {
  alerts: AlertItem[];
  summary: {
    totalOverdue: number;
    countOverdue: number;
    totalDueSoon: number;
    countDueSoon: number;
    countNoDueDate: number;
  };
}

interface IVARate {
  rate: string;
  base: number;
  iva: number;
  total: number;
}

interface IVAData {
  year: number;
  quarter: number;
  ivaSoportado: {
    total: number;
    byRate: IVARate[];
  };
}

interface DuplicateInvoice {
  id: number;
  issuer: string;
  amount: number;
  date: string;
  invoiceNumber?: string | null;
}

interface DuplicateGroup {
  confidence: string;
  reason: string;
  invoices: DuplicateInvoice[];
}

interface DuplicatesData {
  totalPotentialDuplicates: number;
  potentialSavings: number;
  duplicates: DuplicateGroup[];
}

interface ForecastItem {
  issuer: string;
  category: string;
  avgAmount: number;
  frequency: string;
  confidence: string;
}

interface ForecastData {
  forecast: {
    month: string;
    predictedTotal: number;
    confidence: string;
    recurring: ForecastItem[];
  };
}

interface Anomaly {
  invoiceId: number;
  issuer: string;
  latestAmount: number;
  previousMean: number;
  deviationPct: number;
  direction: "up" | "down";
  category: string | null;
  date: string | null;
  severity: "high" | "medium";
  samplesCount: number;
}
interface AnomaliesData {
  count: number;
  anomalies: Anomaly[];
}

export default function AlertasPanel() {
  const [alerts, setAlerts] = useState<AlertsData | null>(null);
  const [iva, setIva] = useState<IVAData | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicatesData | null>(null);
  const [anomalies, setAnomalies] = useState<AnomaliesData | null>(null);
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
      const [aRes, iRes, dRes, fRes, anRes] = await Promise.all([
        fetch("/api/agent/invoice-alerts"),
        fetch(`/api/agent/iva-quarterly?year=${now.getFullYear()}&quarter=${quarter}`),
        fetch("/api/agent/duplicates"),
        fetch("/api/agent/expense-forecast"),
        fetch("/api/agent/anomalies"),
      ]);
      setAlerts(await aRes.json());
      setIva(await iRes.json());
      setDuplicates(await dRes.json());
      setForecast(await fRes.json());
      setAnomalies(await anRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAlerts(false);
      setLoadingIva(false);
      setLoadingDuplicates(false);
      setLoadingForecast(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const fmt = (n: number) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const overdueList = alerts?.alerts?.filter((a) => a.type === "overdue") || [];
  const dueSoonList = alerts?.alerts?.filter((a) => a.type === "dueSoon" || a.type === "due_soon") || [];
  const highValueList = alerts?.alerts?.filter((a) => a.type === "highValue" || a.type === "high_value") || [];
  const recurringList = forecast?.forecast?.recurring || [];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 mb-2">
            <Bell className="w-5 h-5" />
          </div>
          <div className="stat-number text-xl mb-1">
            {loadingAlerts ? "…" : alerts?.summary?.countOverdue ?? 0}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">Facturas vencidas</div>
          {alerts?.summary && <div className="text-[10px] text-rose-400 mt-1">{fmt(alerts.summary.totalOverdue)} €</div>}
        </div>

        <div className="glass-card p-4">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400 mb-2">
            <Calculator className="w-5 h-5" />
          </div>
          <div className="stat-number text-xl mb-1">
            {loadingIva ? "…" : fmt(iva?.ivaSoportado?.total ?? 0)} €
          </div>
          <div className="text-xs text-[var(--text-secondary)]">IVA soportado Q{iva?.quarter ?? "—"}</div>
        </div>

        <div className="glass-card p-4">
          <div className="w-8 h-8 rounded-lg bg-fuchsia-500/10 flex items-center justify-center text-fuchsia-400 mb-2">
            <Copy className="w-5 h-5" />
          </div>
          <div className="stat-number text-xl mb-1">
            {loadingDuplicates ? "…" : duplicates?.totalPotentialDuplicates ?? 0}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">Posibles duplicados</div>
          {duplicates && duplicates.potentialSavings > 0 && <div className="text-[10px] text-fuchsia-400 mt-1">{fmt(duplicates.potentialSavings)} € ahorro</div>}
        </div>

        <div className="glass-card p-4">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 mb-2">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="stat-number text-xl mb-1">
            {loadingForecast ? "…" : fmt(forecast?.forecast?.predictedTotal ?? 0)} €
          </div>
          <div className="text-xs text-[var(--text-secondary)]">Previsión {forecast?.forecast?.month ?? ""}</div>
        </div>
      </div>

      {/* Vencidas */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-rose-400" />
          <h3 className="font-semibold text-sm">Facturas vencidas</h3>
          <span className="text-xs text-[var(--text-secondary)]">({overdueList.length})</span>
        </div>
        {loadingAlerts ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-rose-400" /></div>
        ) : overdueList.length > 0 ? (
          <div className="space-y-2">
            {overdueList.map((a) => (
              <div key={a.invoiceId} className="flex items-center gap-3 p-3 rounded-lg bg-rose-500/5 border border-rose-500/10">
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.issuer}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    Vencida hace {a.daysOverdue} días · {a.dueDate}
                  </div>
                </div>
                <div className="text-sm font-mono text-rose-400">{fmt(a.amount)} €</div>
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
      {dueSoonList.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-amber-400" />
            <h3 className="font-semibold text-sm">Próximas a vencer (7 días)</h3>
          </div>
          <div className="space-y-2">
            {dueSoonList.map((a) => (
              <div key={a.invoiceId} className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.issuer}</div>
                  <div className="text-xs text-[var(--text-secondary)]">Vence en {a.daysUntilDue} días</div>
                </div>
                <div className="text-sm font-mono text-amber-400">{fmt(a.amount)} €</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alto valor */}
      {highValueList.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-orange-400" />
            <h3 className="font-semibold text-sm">Facturas de alto valor</h3>
          </div>
          <div className="space-y-2">
            {highValueList.map((a) => (
              <div key={a.invoiceId} className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.issuer}</div>
                </div>
                <div className="text-sm font-mono text-orange-400">{fmt(a.amount)} €</div>
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
        ) : iva?.ivaSoportado?.byRate && iva.ivaSoportado.byRate.length > 0 ? (
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

      {/* Anomalías de importe */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-orange-400" />
          <h3 className="font-semibold text-sm">Anomalías en importes</h3>
          {anomalies && anomalies.count > 0 && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-500/15 text-orange-400">
              {anomalies.count}
            </span>
          )}
        </div>
        {!anomalies ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-orange-400" /></div>
        ) : anomalies.anomalies.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-green-400">
            <CheckCircle2 className="w-4 h-4" /> Sin anomalías detectadas (variación &lt; 30%)
          </div>
        ) : (
          <div className="space-y-2">
            {anomalies.anomalies.map((a) => (
              <div
                key={a.invoiceId}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  a.severity === "high"
                    ? "bg-red-500/5 border-red-500/20"
                    : "bg-orange-500/5 border-orange-500/20"
                }`}
              >
                {a.direction === "up" ? (
                  <ArrowUpRight className={`w-4 h-4 ${a.severity === "high" ? "text-red-400" : "text-orange-400"} flex-shrink-0`} />
                ) : (
                  <ArrowDownRight className="w-4 h-4 text-sky-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.issuer}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    Media anterior: {fmt(a.previousMean)} € ({a.samplesCount} facturas) · {a.date || "sin fecha"}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${a.direction === "up" ? (a.severity === "high" ? "text-red-400" : "text-orange-400") : "text-sky-400"}`}>
                    {fmt(a.latestAmount)} €
                  </div>
                  <div className={`text-[10px] font-mono ${a.direction === "up" ? "text-red-400" : "text-sky-400"}`}>
                    {a.deviationPct > 0 ? "+" : ""}{a.deviationPct}%
                  </div>
                </div>
              </div>
            ))}
          </div>
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
        ) : duplicates?.duplicates && duplicates.duplicates.length > 0 ? (
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
          <h3 className="font-semibold text-sm">Previsión de gastos (recurrentes)</h3>
        </div>
        {loadingForecast ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>
        ) : recurringList.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs text-[var(--text-secondary)] mb-2">
              Gastos recurrentes detectados (confianza global: {forecast?.forecast?.confidence})
            </div>
            {recurringList.map((r, i) => (
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
