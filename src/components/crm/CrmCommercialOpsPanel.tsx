"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertTriangle, Clock, Target, TrendingUp, Briefcase, ChevronRight } from "lucide-react";

// ─── Types (matching backend) ───────────────────────────────────────────

interface ExpiringService {
  id: number;
  companyId: number;
  companyName: string;
  type: string;
  status: string | null;
  currentProvider: string | null;
  currentSpendEur: number | null;
  expiryDate: string;
  daysUntilExpiry: number;
  urgency: "overdue" | "urgent" | "soon";
}

interface StaleOpportunity {
  id: number;
  companyId: number;
  companyName: string;
  title: string;
  status: string;
  temperature: string | null;
  priority: string | null;
  estimatedValueEur: number | null;
  updatedAt: string | null;
  daysSinceUpdate: number;
}

interface HotOpportunity {
  id: number;
  companyId: number;
  companyName: string;
  title: string;
  status: string;
  temperature: string | null;
  estimatedValueEur: number | null;
  expectedCloseDate: string;
  daysUntilClose: number;
  isOverdue: boolean;
}

interface CrossSellCandidate {
  companyId: number;
  companyName: string;
  activeVerticals: string[];
  missingVerticals: string[];
  missingCount: number;
  totalCurrentSpend: number;
  contractedCount: number;
  priority: "alta" | "media" | "baja";
  reasons: string[];
}

interface DailyBrief {
  date: string;
  summary: {
    expiringCount: number;
    overdueCount: number;
    staleOpportunitiesCount: number;
    hotOpportunitiesCount: number;
    crossSellCandidatesCount: number;
  };
  expiring: ExpiringService[];
  overdue: ExpiringService[];
  staleOpportunities: StaleOpportunity[];
  hotOpportunities: HotOpportunity[];
  crossSellCandidates: CrossSellCandidate[];
}

// ─── Vertical display ───────────────────────────���───────────────────────

const VERTICAL_ICONS: Record<string, string> = {
  energia: "⚡", telecomunicaciones: "📡", alarmas: "🔒", seguros: "🛡️",
  agentes_ia: "🤖", web: "🌐", crm: "📊", aplicaciones: "📱",
};

const VERTICAL_LABELS: Record<string, string> = {
  energia: "Energía", telecomunicaciones: "Telecom", alarmas: "Alarmas",
  seguros: "Seguros", agentes_ia: "Agentes IA", web: "Web",
  crm: "CRM", aplicaciones: "Apps",
};

// ─── Helpers ────────────────────────────────────────────────────────────

function fmtEur(n: number | null): string {
  if (n == null) return "—";
  return `${n.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€`;
}

function urgencyBadge(urgency: "overdue" | "urgent" | "soon") {
  const map = {
    overdue: { bg: "bg-red-100 text-red-800", label: "Vencido" },
    urgent: { bg: "bg-orange-100 text-orange-800", label: "Urgente" },
    soon: { bg: "bg-yellow-100 text-yellow-800", label: "Próximo" },
  };
  const { bg, label } = map[urgency];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bg}`}>{label}</span>;
}

function priorityBadge(priority: "alta" | "media" | "baja") {
  const map = {
    alta: "bg-red-100 text-red-800",
    media: "bg-yellow-100 text-yellow-800",
    baja: "bg-gray-100 text-gray-600",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[priority]}`}>{priority.toUpperCase()}</span>;
}

// ─── Section Component ──────────────────────────────────────────────────

function OpsSection({ title, icon, count, color, children }: {
  title: string;
  icon: React.ReactNode;
  count: number;
  color: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(count > 0);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-4 py-3 text-left ${color}`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm">{title}</span>
          {count > 0 && (
            <span className="bg-white/80 text-xs px-2 py-0.5 rounded-full font-bold">{count}</span>
          )}
        </div>
        <ChevronRight className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="p-3 space-y-2 bg-white">{children}</div>}
    </div>
  );
}

// ─��─ Summary Cards ──────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: DailyBrief["summary"] }) {
  const cards = [
    { label: "Vencidos", value: summary.overdueCount, color: "text-red-600", bg: "bg-red-50" },
    { label: "Venciendo", value: summary.expiringCount, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "Opp. calientes", value: summary.hotOpportunitiesCount, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Estancadas", value: summary.staleOpportunitiesCount, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Cross-sell", value: summary.crossSellCandidatesCount, color: "text-emerald-600", bg: "bg-emerald-50" },
  ];

  return (
    <div className="grid grid-cols-5 gap-2">
      {cards.map((c) => (
        <div key={c.label} className={`${c.bg} rounded-lg px-3 py-2 text-center`}>
          <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
          <div className="text-xs text-gray-600">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────

export default function CrmCommercialOpsPanel() {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBrief = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/commercial-ops?view=brief");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setBrief(data.brief);
    } catch (err: any) {
      setError(err.message || "Error cargando brief");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBrief(); }, [fetchBrief]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando operativa comercial...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-red-500 text-sm">{error}</p>
        <button onClick={fetchBrief} className="mt-2 text-blue-600 text-sm underline">Reintentar</button>
      </div>
    );
  }

  if (!brief) return null;

  const totalActions = brief.summary.overdueCount + brief.summary.expiringCount +
    brief.summary.hotOpportunitiesCount + brief.summary.staleOpportunitiesCount;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Operativa Comercial</h2>
          <p className="text-xs text-gray-500">
            {brief.date} — {totalActions === 0 ? "Todo al día" : `${totalActions} acción(es) pendiente(s)`}
          </p>
        </div>
        <button
          onClick={fetchBrief}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition"
          title="Actualizar"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Summary KPIs */}
      <SummaryCards summary={brief.summary} />

      {/* Overdue Services */}
      <OpsSection
        title="Servicios vencidos"
        icon={<AlertTriangle className="w-4 h-4" />}
        count={brief.overdue.length}
        color="bg-red-50 text-red-800"
      >
        {brief.overdue.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">Sin servicios vencidos</p>
        ) : (
          brief.overdue.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
              <div className="flex items-center gap-2">
                <span>{VERTICAL_ICONS[s.type] || "📦"}</span>
                <span className="font-medium">{s.companyName}</span>
                <span className="text-gray-500">{VERTICAL_LABELS[s.type] || s.type}</span>
                {urgencyBadge(s.urgency)}
              </div>
              <div className="text-right text-xs text-gray-500">
                {s.currentProvider && <span className="mr-2">{s.currentProvider}</span>}
                {fmtEur(s.currentSpendEur)}
              </div>
            </div>
          ))
        )}
      </OpsSection>

      {/* Expiring Soon */}
      <OpsSection
        title="Renovaciones próximas"
        icon={<Clock className="w-4 h-4" />}
        count={brief.expiring.length}
        color="bg-orange-50 text-orange-800"
      >
        {brief.expiring.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">Sin renovaciones próximas</p>
        ) : (
          brief.expiring.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
              <div className="flex items-center gap-2">
                <span>{VERTICAL_ICONS[s.type] || "📦"}</span>
                <span className="font-medium">{s.companyName}</span>
                <span className="text-gray-500">{VERTICAL_LABELS[s.type] || s.type}</span>
                {urgencyBadge(s.urgency)}
              </div>
              <div className="text-right text-xs">
                <span className="text-gray-600">{s.daysUntilExpiry}d</span>
                {s.currentSpendEur && <span className="ml-2 text-gray-500">{fmtEur(s.currentSpendEur)}</span>}
              </div>
            </div>
          ))
        )}
      </OpsSection>

      {/* Hot Opportunities */}
      <OpsSection
        title="Oportunidades calientes"
        icon={<Target className="w-4 h-4" />}
        count={brief.hotOpportunities.length}
        color="bg-amber-50 text-amber-800"
      >
        {brief.hotOpportunities.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">Sin oportunidades con cierre próximo</p>
        ) : (
          brief.hotOpportunities.map((o) => (
            <div key={o.id} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
              <div>
                <span className="font-medium">{o.companyName}</span>
                <span className="text-gray-500 ml-2">{o.title}</span>
                {o.isOverdue && <span className="ml-2 text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded">Pasado</span>}
              </div>
              <div className="text-right text-xs text-gray-500">
                {o.isOverdue ? `${Math.abs(o.daysUntilClose)}d pasado` : `${o.daysUntilClose}d`}
                {o.estimatedValueEur && <span className="ml-2">{fmtEur(o.estimatedValueEur)}</span>}
              </div>
            </div>
          ))
        )}
      </OpsSection>

      {/* Stale Opportunities */}
      <OpsSection
        title="Oportunidades estancadas"
        icon={<Briefcase className="w-4 h-4" />}
        count={brief.staleOpportunities.length}
        color="bg-blue-50 text-blue-800"
      >
        {brief.staleOpportunities.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">Sin oportunidades estancadas</p>
        ) : (
          brief.staleOpportunities.map((o) => (
            <div key={o.id} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
              <div>
                <span className="font-medium">{o.companyName}</span>
                <span className="text-gray-500 ml-2">{o.title}</span>
                <span className="text-xs text-gray-400 ml-2">({o.status})</span>
              </div>
              <div className="text-right text-xs text-gray-500">
                {o.daysSinceUpdate}d sin actividad
                {o.estimatedValueEur && <span className="ml-2">{fmtEur(o.estimatedValueEur)}</span>}
              </div>
            </div>
          ))
        )}
      </OpsSection>

      {/* Cross-sell Candidates */}
      <OpsSection
        title="Oportunidades de cross-sell"
        icon={<TrendingUp className="w-4 h-4" />}
        count={brief.crossSellCandidates.length}
        color="bg-emerald-50 text-emerald-800"
      >
        {brief.crossSellCandidates.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">Sin candidatos de cross-sell</p>
        ) : (
          brief.crossSellCandidates.map((c) => (
            <div key={c.companyId} className="py-2 border-b last:border-0">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.companyName}</span>
                  {priorityBadge(c.priority)}
                </div>
                <span className="text-xs text-gray-500">{c.contractedCount} contratado(s) · {fmtEur(c.totalCurrentSpend)}</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {c.missingVerticals.map((v) => (
                  <span key={v} className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                    {VERTICAL_ICONS[v] || ""} {VERTICAL_LABELS[v] || v}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </OpsSection>
    </div>
  );
}
