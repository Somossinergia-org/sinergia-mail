"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Building2, Target, TrendingUp, Briefcase,
  AlertTriangle, CheckSquare, Bell, Zap, BarChart3,
  ArrowUp, ArrowDown, Flame, Clock, Users, ShieldAlert,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────

interface ExecutiveKPIs {
  totalCompanies: number;
  totalOpportunities: number;
  totalActiveOpportunities: number;
  totalPipelineValueEur: number;
  totalServicesContracted: number;
  totalServicesOffered: number;
  hotOpportunities: number;
  staleOpportunities: number;
  crossSellCandidates: number;
  renewalsUpcoming: number;
  tasksOverdue: number;
  followupsOverdue: number;
  alertsNew: number;
  alertsUrgent: number;
}

interface PipelineMetrics {
  byStatus: { status: string; count: number; totalValue: number }[];
  byTemperature: { temperature: string; count: number }[];
  totalActive: number;
  closingSoon: number;
  hotValue: number;
  wonValue: number;
  lostCount: number;
}

interface VerticalBreakdown {
  vertical: string;
  label: string;
  contracted: number;
  offered: number;
  prospecting: number;
  cancelled: number;
  total: number;
  currentSpendEur: number;
  estimatedSavingsEur: number;
}

interface VerticalMetrics {
  byVertical: VerticalBreakdown[];
  topVertical: string | null;
  worstCovered: string | null;
  totalCurrentSpend: number;
  totalEstimatedSavings: number;
}

interface OperationalMetrics {
  tasks: { totalActive: number; overdue: number; dueToday: number; upcoming7d: number; alta: number };
  notifications: { totalNew: number; totalUrgent: number; totalWarning: number; totalActive: number };
  recentActivityCount: number;
  staleOpportunitiesCount: number;
  expiringServicesCount: number;
  crossSellCount: number;
}

interface EnergyMetrics {
  totalSupplyPoints: number;
  totalBillsParsed: number;
  totalBilledEur: number;
  avgMonthlyEur: number;
  totalEstimatedSavings: number;
}

interface ExecutiveSummary {
  generatedAt: string;
  kpis: ExecutiveKPIs;
  pipeline: PipelineMetrics;
  verticals: VerticalMetrics;
  operational: OperationalMetrics;
  energy: EnergyMetrics;
  recentActivitySummary: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────

function fmtEur(v: number): string {
  return v.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function fmtNum(v: number): string {
  return v.toLocaleString("es-ES");
}

const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  contactado: "Contactado",
  interesado: "Interesado",
  visita_programada: "Visita prog.",
  visitado: "Visitado",
  oferta_enviada: "Oferta env.",
  negociacion: "Negociacion",
  contrato_firmado: "Firmado",
  cliente_activo: "Cliente activo",
  perdido: "Perdido",
};

const TEMP_COLORS: Record<string, string> = {
  caliente: "text-red-600 bg-red-50",
  tibio: "text-amber-600 bg-amber-50",
  frio: "text-blue-600 bg-blue-50",
  sin_definir: "text-gray-500 bg-gray-50",
};

const VERTICAL_ICONS: Record<string, string> = {
  energia: "⚡",
  telecomunicaciones: "📡",
  alarmas: "🔒",
  seguros: "🛡️",
  agentes_ia: "🤖",
  web: "🌐",
  crm: "📊",
  aplicaciones: "📱",
};

// ─── KPI Card ─────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color?: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${color ?? "bg-white"}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-gray-400">{icon}</span>
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-gray-400">{icon}</span>
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ─── Pipeline mini bar ────────────────────────────────────────────────

function PipelineBar({ pipeline }: { pipeline: PipelineMetrics }) {
  const active = pipeline.byStatus.filter(
    (r) => !["cliente_activo", "perdido"].includes(r.status),
  );
  const total = active.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-1.5">
      {active.map((r) => {
        const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
        return (
          <div key={r.status} className="flex items-center gap-2 text-xs">
            <span className="w-24 text-gray-600 truncate">{STATUS_LABELS[r.status] ?? r.status}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-6 text-right font-medium text-gray-700">{r.count}</span>
            <span className="w-16 text-right text-gray-400">{fmtEur(r.totalValue)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Vertical table ───────────────────────────────────────────────────

function VerticalTable({ verticals }: { verticals: VerticalMetrics }) {
  const active = verticals.byVertical.filter((v) => v.total > 0 || v.contracted > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b">
            <th className="text-left py-1.5 font-medium">Vertical</th>
            <th className="text-center py-1.5 font-medium">Contrat.</th>
            <th className="text-center py-1.5 font-medium">Ofert.</th>
            <th className="text-center py-1.5 font-medium">Prosp.</th>
            <th className="text-right py-1.5 font-medium">Gasto</th>
            <th className="text-right py-1.5 font-medium">Ahorro</th>
          </tr>
        </thead>
        <tbody>
          {verticals.byVertical.map((v) => (
            <tr key={v.vertical} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-1.5">
                <span className="mr-1">{VERTICAL_ICONS[v.vertical] ?? "📦"}</span>
                {v.label}
              </td>
              <td className="text-center font-medium text-green-700">{v.contracted || "-"}</td>
              <td className="text-center text-amber-600">{v.offered || "-"}</td>
              <td className="text-center text-blue-600">{v.prospecting || "-"}</td>
              <td className="text-right text-gray-600">
                {v.currentSpendEur > 0 ? fmtEur(v.currentSpendEur) : "-"}
              </td>
              <td className="text-right text-emerald-600">
                {v.estimatedSavingsEur > 0 ? fmtEur(v.estimatedSavingsEur) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold text-gray-700 border-t">
            <td className="py-1.5">Total</td>
            <td className="text-center">
              {verticals.byVertical.reduce((s, v) => s + v.contracted, 0)}
            </td>
            <td className="text-center">
              {verticals.byVertical.reduce((s, v) => s + v.offered, 0)}
            </td>
            <td className="text-center">
              {verticals.byVertical.reduce((s, v) => s + v.prospecting, 0)}
            </td>
            <td className="text-right">{fmtEur(verticals.totalCurrentSpend)}</td>
            <td className="text-right text-emerald-600">{fmtEur(verticals.totalEstimatedSavings)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── View tabs ────────────────────────────────────────────────────────

type ViewMode = "resumen" | "pipeline" | "verticales" | "operativa" | "energia";

const VIEW_TABS: { id: ViewMode; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "pipeline", label: "Pipeline" },
  { id: "verticales", label: "Verticales" },
  { id: "operativa", label: "Operativa" },
  { id: "energia", label: "Energia" },
];

// ─── Main Panel ───────────────────────────────────────────────────────

export default function CrmExecutivePanel() {
  const [data, setData] = useState<ExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("resumen");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/executive?view=full");
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      setData(json.summary);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-400">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Cargando BI ejecutivo...
      </div>
    );
  }

  if (!data) {
    return <div className="text-sm text-gray-400 py-6 text-center">Sin datos ejecutivos disponibles</div>;
  }

  const { kpis, pipeline, verticals, operational, energy, recentActivitySummary } = data;

  return (
    <div className="space-y-3">
      {/* Header + view tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {VIEW_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setViewMode(t.id)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                viewMode === t.id
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={fetchData} className="text-gray-400 hover:text-gray-600" title="Actualizar">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ─── Resumen General ─────────────────────────────── */}
      {viewMode === "resumen" && (
        <div className="space-y-3">
          {/* Top KPIs row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KpiCard label="Empresas" value={fmtNum(kpis.totalCompanies)} icon={<Building2 className="w-4 h-4" />} />
            <KpiCard label="Oportunidades" value={fmtNum(kpis.totalActiveOpportunities)}
              sub={`de ${kpis.totalOpportunities} totales`} icon={<Target className="w-4 h-4" />} />
            <KpiCard label="Pipeline" value={fmtEur(kpis.totalPipelineValueEur)} icon={<TrendingUp className="w-4 h-4" />} />
            <KpiCard label="Contratados" value={kpis.totalServicesContracted}
              sub={`${kpis.totalServicesOffered} ofertados`} icon={<Briefcase className="w-4 h-4" />} />
          </div>

          {/* Alerts row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KpiCard label="Calientes" value={kpis.hotOpportunities}
              icon={<Flame className="w-4 h-4" />} color={kpis.hotOpportunities > 0 ? "bg-red-50 border-red-200" : undefined} />
            <KpiCard label="Estancadas" value={kpis.staleOpportunities}
              icon={<Clock className="w-4 h-4" />} color={kpis.staleOpportunities > 0 ? "bg-amber-50 border-amber-200" : undefined} />
            <KpiCard label="Tareas vencidas" value={kpis.tasksOverdue}
              icon={<CheckSquare className="w-4 h-4" />} color={kpis.tasksOverdue > 0 ? "bg-orange-50 border-orange-200" : undefined} />
            <KpiCard label="Alertas" value={kpis.alertsNew}
              sub={kpis.alertsUrgent > 0 ? `${kpis.alertsUrgent} urgentes` : undefined}
              icon={<Bell className="w-4 h-4" />} color={kpis.alertsUrgent > 0 ? "bg-red-50 border-red-200" : undefined} />
          </div>

          {/* Quick reads */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Section title="Renovaciones y Cross-Sell" icon={<TrendingUp className="w-4 h-4" />}>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600">Renovaciones proximas</span>
                  <span className="font-medium">{kpis.renewalsUpcoming}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Cross-sell candidates</span>
                  <span className="font-medium">{kpis.crossSellCandidates}</span>
                </div>
              </div>
            </Section>
            <Section title="Actividad reciente" icon={<BarChart3 className="w-4 h-4" />}>
              <div className="text-xs text-gray-600 space-y-0.5 max-h-24 overflow-y-auto">
                {recentActivitySummary.length > 0 ? (
                  recentActivitySummary.map((a, i) => <div key={i} className="truncate">{a}</div>)
                ) : (
                  <span className="text-gray-400">Sin actividad reciente</span>
                )}
              </div>
            </Section>
          </div>
        </div>
      )}

      {/* ─── Pipeline ────────────────────────────────────── */}
      {viewMode === "pipeline" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KpiCard label="Activas" value={pipeline.totalActive} icon={<Target className="w-4 h-4" />} />
            <KpiCard label="Cierre pronto" value={pipeline.closingSoon}
              sub={fmtEur(pipeline.hotValue)} icon={<Flame className="w-4 h-4" />} />
            <KpiCard label="Ganadas" value={fmtEur(pipeline.wonValue)} icon={<ArrowUp className="w-4 h-4" />} />
            <KpiCard label="Perdidas" value={pipeline.lostCount} icon={<ArrowDown className="w-4 h-4" />} />
          </div>

          <Section title="Funnel por estado" icon={<BarChart3 className="w-4 h-4" />}>
            <PipelineBar pipeline={pipeline} />
          </Section>

          <Section title="Temperatura" icon={<Flame className="w-4 h-4" />}>
            <div className="flex gap-2 flex-wrap">
              {pipeline.byTemperature.map((t) => (
                <span
                  key={t.temperature}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${TEMP_COLORS[t.temperature] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {t.temperature === "caliente" ? "🔥" : t.temperature === "tibio" ? "🌤️" : "❄️"}{" "}
                  {t.temperature}: {t.count}
                </span>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* ─── Verticales ──────────────────────────────────── */}
      {viewMode === "verticales" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <KpiCard label="Gasto actual" value={fmtEur(verticals.totalCurrentSpend)} icon={<Briefcase className="w-4 h-4" />} />
            <KpiCard label="Ahorro estimado" value={fmtEur(verticals.totalEstimatedSavings)}
              icon={<TrendingUp className="w-4 h-4" />} color="bg-emerald-50 border-emerald-200" />
            {verticals.topVertical && (
              <KpiCard label="Mejor vertical" value={`${VERTICAL_ICONS[verticals.topVertical] ?? ""} ${verticals.topVertical}`}
                icon={<ArrowUp className="w-4 h-4" />} />
            )}
          </div>

          <Section title="Desglose por vertical" icon={<BarChart3 className="w-4 h-4" />}>
            <VerticalTable verticals={verticals} />
          </Section>
        </div>
      )}

      {/* ─── Operativa ───────────────────────────────────── */}
      {viewMode === "operativa" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KpiCard label="Tareas activas" value={operational.tasks.totalActive}
              sub={`${operational.tasks.alta} alta prioridad`} icon={<CheckSquare className="w-4 h-4" />} />
            <KpiCard label="Tareas vencidas" value={operational.tasks.overdue}
              icon={<AlertTriangle className="w-4 h-4" />}
              color={operational.tasks.overdue > 0 ? "bg-red-50 border-red-200" : undefined} />
            <KpiCard label="Alertas activas" value={operational.notifications.totalActive}
              sub={`${operational.notifications.totalUrgent} urgentes`}
              icon={<Bell className="w-4 h-4" />} />
            <KpiCard label="Actividad (30d)" value={operational.recentActivityCount}
              icon={<BarChart3 className="w-4 h-4" />} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Section title="Carga comercial" icon={<Briefcase className="w-4 h-4" />}>
              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-600">Hoy</span><span className="font-medium">{operational.tasks.dueToday}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Proximos 7 dias</span><span className="font-medium">{operational.tasks.upcoming7d}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Estancadas</span><span className="font-medium">{operational.staleOpportunitiesCount}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Renovaciones</span><span className="font-medium">{operational.expiringServicesCount}</span></div>
              </div>
            </Section>
            <Section title="Alertas por nivel" icon={<ShieldAlert className="w-4 h-4" />}>
              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-red-600">Urgentes</span><span className="font-bold text-red-700">{operational.notifications.totalUrgent}</span></div>
                <div className="flex justify-between"><span className="text-amber-600">Warning</span><span className="font-medium text-amber-700">{operational.notifications.totalWarning}</span></div>
                <div className="flex justify-between"><span className="text-blue-600">Nuevas</span><span className="font-medium text-blue-700">{operational.notifications.totalNew}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Cross-sell</span><span className="font-medium">{operational.crossSellCount}</span></div>
              </div>
            </Section>
          </div>
        </div>
      )}

      {/* ─── Energia ─────────────────────────────────────── */}
      {viewMode === "energia" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KpiCard label="Supply points" value={energy.totalSupplyPoints} icon={<Zap className="w-4 h-4" />} />
            <KpiCard label="Facturas" value={energy.totalBillsParsed} icon={<BarChart3 className="w-4 h-4" />} />
            <KpiCard label="Total facturado" value={fmtEur(energy.totalBilledEur)} icon={<Briefcase className="w-4 h-4" />} />
            <KpiCard label="Ahorro estimado" value={fmtEur(energy.totalEstimatedSavings)}
              icon={<TrendingUp className="w-4 h-4" />} color="bg-emerald-50 border-emerald-200" />
          </div>

          <Section title="Resumen energia" icon={<Zap className="w-4 h-4" />}>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">Media por factura</span>
                <span className="font-medium">{fmtEur(energy.avgMonthlyEur)}</span>
              </div>
              {energy.totalEstimatedSavings > 0 && energy.totalBilledEur > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Potencial ahorro</span>
                  <span className="font-medium text-emerald-600">
                    {Math.round((energy.totalEstimatedSavings / energy.totalBilledEur) * 100)}%
                  </span>
                </div>
              )}
            </div>
          </Section>
        </div>
      )}

      {/* Timestamp */}
      <div className="text-right text-[10px] text-gray-300 pr-1">
        Generado: {new Date(data.generatedAt).toLocaleString("es-ES")}
      </div>
    </div>
  );
}
