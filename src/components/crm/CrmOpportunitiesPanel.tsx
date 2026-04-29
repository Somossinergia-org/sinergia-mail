"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  X,
  List,
  Columns3,
  Building2,
  Thermometer,
  Flag,
  DollarSign,
  Calendar,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import CrmPipelineView from "./CrmPipelineView";
import CloseOpportunityWizard from "./CloseOpportunityWizard";

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

interface PipelineStat {
  status: string;
  count: number;
  totalValue: number;
}

interface CrmOpportunitiesPanelProps {
  onSelectCompany?: (id: number) => void;
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

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pendiente: { bg: "bg-slate-500/10", text: "text-slate-400" },
  contactado: { bg: "bg-blue-500/10", text: "text-blue-400" },
  interesado: { bg: "bg-cyan-500/10", text: "text-cyan-400" },
  visita_programada: { bg: "bg-purple-500/10", text: "text-purple-400" },
  visitado: { bg: "bg-violet-500/10", text: "text-violet-400" },
  oferta_enviada: { bg: "bg-amber-500/10", text: "text-amber-400" },
  negociacion: { bg: "bg-orange-500/10", text: "text-orange-400" },
  contrato_firmado: { bg: "bg-green-500/10", text: "text-green-400" },
  cliente_activo: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  perdido: { bg: "bg-red-500/10", text: "text-red-400" },
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

const TEMPERATURES = ["frio", "tibio", "caliente"] as const;
const PRIORITIES = ["baja", "media", "alta", "urgente"] as const;

const eurFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function CrmOpportunitiesPanel({
  onSelectCompany,
}: CrmOpportunitiesPanelProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [stats, setStats] = useState<PipelineStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"lista" | "pipeline">("lista");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterTemp, setFilterTemp] = useState("todos");
  const [filterPriority, setFilterPriority] = useState("todos");

  // Close wizard
  const [closingOpp, setClosingOpp] = useState<Opportunity | null>(null);

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    companyId: "",
    status: "pendiente",
    temperature: "tibio",
    priority: "media",
    estimatedValueEur: "",
  });

  const fetchOpportunities = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/opportunities");
      if (res.ok) {
        const data = await res.json();
        setOpportunities(data.opportunities ?? []);
      }
    } catch {
      // silently fail
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/opportunities?stats=true");
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats ?? []);
      }
    } catch {
      // silently fail
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchOpportunities(), fetchStats()]);
    setLoading(false);
  }, [fetchOpportunities, fetchStats]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered opportunities
  const filtered = opportunities
    .filter((o) => {
      if (filterStatus !== "todos" && o.status !== filterStatus) return false;
      if (filterTemp !== "todos" && o.temperature !== filterTemp) return false;
      if (filterPriority !== "todos" && o.priority !== filterPriority)
        return false;
      if (
        searchQuery &&
        !o.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        title: formData.title.trim(),
        status: formData.status,
        temperature: formData.temperature,
        priority: formData.priority,
      };
      if (formData.companyId) body.companyId = Number(formData.companyId);
      if (formData.estimatedValueEur)
        body.estimatedValueEur = Number(formData.estimatedValueEur);

      const res = await fetch("/api/crm/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowCreateForm(false);
        setFormData({
          title: "",
          companyId: "",
          status: "pendiente",
          temperature: "tibio",
          priority: "media",
          estimatedValueEur: "",
        });
        await loadData();
      }
    } catch {
      // silently fail
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await fetch(`/api/crm/opportunities`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
    } catch {
      // silently fail
    }
  };

  const activeStats = stats.filter((s) => s.count > 0);

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      {activeStats.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {activeStats.map((stat) => {
            const colors = STATUS_COLORS[stat.status];
            return (
              <div
                key={stat.status}
                className="glass-card p-3 flex-shrink-0 min-w-[140px]"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${colors?.bg} ${colors?.text}`}
                  >
                    {STATUS_LABELS[stat.status] ?? stat.status}
                  </span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {stat.count}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-[var(--text-secondary)]" />
                  <span className="text-xs text-[var(--text-secondary)]">
                    {eurFormatter.format(stat.totalValue)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder="Buscar oportunidades..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 rounded-lg"
          />
        </div>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 rounded-lg px-3 py-2"
        >
          <option value="todos">Todos los estados</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        {/* Temperature filter */}
        <select
          value={filterTemp}
          onChange={(e) => setFilterTemp(e.target.value)}
          className="bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 rounded-lg px-3 py-2"
        >
          <option value="todos">Temperatura</option>
          {TEMPERATURES.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>

        {/* Priority filter */}
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 rounded-lg px-3 py-2"
        >
          <option value="todos">Prioridad</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>

        {/* View mode toggle */}
        <div className="flex items-center border border-[var(--border)] rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode("lista")}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
              viewMode === "lista"
                ? "bg-cyan-500/15 text-cyan-400"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
            }`}
          >
            <List className="w-4 h-4" />
            Lista
          </button>
          <button
            onClick={() => setViewMode("pipeline")}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
              viewMode === "pipeline"
                ? "bg-cyan-500/15 text-cyan-400"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
            }`}
          >
            <Columns3 className="w-4 h-4" />
            Pipeline
          </button>
        </div>

        {/* Create button */}
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm hover:bg-cyan-500/25 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva Oportunidad
        </button>
      </div>

      {/* Create form modal */}
      {showCreateForm && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Nueva Oportunidad
            </h3>
            <button
              onClick={() => setShowCreateForm(false)}
              className="p-1 rounded hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                Titulo *
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, title: e.target.value }))
                }
                className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 rounded-lg"
                placeholder="Nombre de la oportunidad"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                ID Empresa
              </label>
              <input
                type="number"
                value={formData.companyId}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, companyId: e.target.value }))
                }
                className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 rounded-lg"
                placeholder="Empresa ID"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                Estado
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, status: e.target.value }))
                }
                className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 rounded-lg"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                Temperatura
              </label>
              <select
                value={formData.temperature}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, temperature: e.target.value }))
                }
                className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 rounded-lg"
              >
                {TEMPERATURES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                Prioridad
              </label>
              <select
                value={formData.priority}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, priority: e.target.value }))
                }
                className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 rounded-lg"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                Valor estimado (EUR)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.estimatedValueEur}
                onChange={(e) =>
                  setFormData((f) => ({
                    ...f,
                    estimatedValueEur: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 rounded-lg"
                placeholder="0.00"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm hover:bg-cyan-500/25 transition-colors disabled:opacity-50"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear Oportunidad
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
        </div>
      ) : viewMode === "lista" ? (
        <>
        {/* Mobile cards view (hidden on desktop) */}
        <div className="lg:hidden space-y-2">
          {filtered.length === 0 && (
            <div className="glass-card p-8 text-center text-[var(--text-secondary)] text-sm">
              No se encontraron oportunidades
            </div>
          )}
          {filtered.map((opp) => {
            const sc = STATUS_COLORS[opp.status];
            const tc = opp.temperature ? TEMP_COLORS[opp.temperature] : null;
            const pc = opp.priority ? PRIORITY_COLORS[opp.priority] : null;
            const isTerminal = opp.status === "cliente_activo" || opp.status === "perdido";
            return (
              <div key={opp.id} className="glass-card p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-[var(--text-primary)] truncate">{opp.title}</h4>
                  {opp.estimatedValueEur != null && (
                    <span className="text-xs font-mono text-cyan-400 flex-shrink-0">
                      {eurFormatter.format(opp.estimatedValueEur)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${sc?.bg} ${sc?.text}`}>
                    {STATUS_LABELS[opp.status] ?? opp.status}
                  </span>
                  {tc && (
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${tc.bg} ${tc.text}`}>
                      <Thermometer className="w-2.5 h-2.5" />
                      {opp.temperature}
                    </span>
                  )}
                  {pc && (
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${pc.bg} ${pc.text}`}>
                      <Flag className="w-2.5 h-2.5" />
                      {opp.priority}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--text-secondary)]">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(opp.createdAt)}
                  </span>
                  {opp.companyId && (
                    <button
                      onClick={() => onSelectCompany?.(opp.companyId!)}
                      className="flex items-center gap-1 text-cyan-400"
                    >
                      <Building2 className="w-3 h-3" />
                      <span>#{opp.companyId}</span>
                    </button>
                  )}
                  {!isTerminal ? (
                    <button
                      onClick={() => setClosingOpp(opp)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Cerrar
                    </button>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop table view (hidden on mobile) */}
        <div className="glass-card overflow-hidden hidden lg:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Titulo
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Empresa
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Temp.
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Prioridad
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Valor
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Creado
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-[var(--text-secondary)]"
                    >
                      No se encontraron oportunidades
                    </td>
                  </tr>
                )}
                {filtered.map((opp) => {
                  const sc = STATUS_COLORS[opp.status];
                  const tc = opp.temperature
                    ? TEMP_COLORS[opp.temperature]
                    : null;
                  const pc = opp.priority
                    ? PRIORITY_COLORS[opp.priority]
                    : null;

                  return (
                    <tr
                      key={opp.id}
                      className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors"
                    >
                      <td className="px-4 py-3 text-[var(--text-primary)] font-medium">
                        {opp.title}
                      </td>
                      <td className="px-4 py-3">
                        {opp.companyId ? (
                          <button
                            onClick={() =>
                              onSelectCompany?.(opp.companyId!)
                            }
                            className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors"
                          >
                            <Building2 className="w-4 h-4" />
                            <span className="text-xs">#{opp.companyId}</span>
                          </button>
                        ) : (
                          <span className="text-[var(--text-secondary)] text-xs">
                            --
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block text-xs px-2 py-0.5 rounded-full ${sc?.bg} ${sc?.text}`}
                        >
                          {STATUS_LABELS[opp.status] ?? opp.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {tc ? (
                          <span
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${tc.bg} ${tc.text}`}
                          >
                            <Thermometer className="w-3 h-3" />
                            {opp.temperature}
                          </span>
                        ) : (
                          <span className="text-[var(--text-secondary)] text-xs">
                            --
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {pc ? (
                          <span
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${pc.bg} ${pc.text}`}
                          >
                            <Flag className="w-3 h-3" />
                            {opp.priority}
                          </span>
                        ) : (
                          <span className="text-[var(--text-secondary)] text-xs">
                            --
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {opp.estimatedValueEur != null ? (
                          <span className="text-cyan-400 text-xs">
                            {eurFormatter.format(opp.estimatedValueEur)}
                          </span>
                        ) : (
                          <span className="text-[var(--text-secondary)] text-xs">
                            --
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="flex items-center justify-end gap-1 text-xs text-[var(--text-secondary)]">
                          <Calendar className="w-3 h-3" />
                          {formatDate(opp.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {opp.status !== "cliente_activo" && opp.status !== "perdido" ? (
                          <button
                            onClick={() => setClosingOpp(opp)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400 text-xs transition-colors"
                            title="Cerrar oportunidad"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Cerrar
                          </button>
                        ) : (
                          <span className="text-[var(--text-secondary)] text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      ) : (
        /* Pipeline view */
        <CrmPipelineView
          opportunities={filtered}
          onStatusChange={handleStatusChange}
          onRefresh={loadData}
        />
      )}

      {/* Wizard de cierre 1-tap */}
      {closingOpp && (
        <CloseOpportunityWizard
          opportunityId={closingOpp.id}
          opportunityTitle={closingOpp.title}
          estimatedValueEur={closingOpp.estimatedValueEur}
          open={true}
          onClose={() => setClosingOpp(null)}
          onClosed={() => {
            void loadData();
          }}
        />
      )}
    </div>
  );
}
