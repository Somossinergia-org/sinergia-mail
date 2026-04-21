"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText, AlertTriangle, Shield, Search, RefreshCw,
  ChevronRight, User, Clock,
} from "lucide-react";

// ─── Constants ──────────────────────────────────────────────────────────

const AGENT_NAMES: Record<string, string> = {
  ceo: "CEO",
  recepcion: "Recepción",
  "comercial-principal": "Comercial Principal",
  "comercial-junior": "Comercial Junior",
  fiscal: "Fiscal",
  "consultor-servicios": "Consultor Servicios",
  "consultor-digital": "Consultor Digital",
  "legal-rgpd": "Legal RGPD",
  "bi-scoring": "BI Scoring",
  "marketing-automation": "Marketing",
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: "bg-blue-500/10", text: "text-blue-400", label: "Abierto" },
  active: { bg: "bg-green-500/10", text: "text-green-400", label: "Activo" },
  waiting: { bg: "bg-amber-500/10", text: "text-amber-400", label: "En espera" },
  closed: { bg: "bg-slate-500/10", text: "text-slate-500", label: "Cerrado" },
};

interface CaseRow {
  id: number;
  clientIdentifier: string;
  visibleOwnerId: string | null;
  status: string;
  subject: string | null;
  channel: string | null;
  interactionCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  alerts: { blocks: number; violations: number; delegations: number };
}

interface Props {
  onSelectCase: (caseId: number) => void;
}

export default function OperationsCaseListPanel({ onSelectCase }: Props) {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const limit = 25;

  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/operations/cases?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setCases(data.cases || []);
      setTotal(data.pagination?.total || 0);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [offset, statusFilter, search]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const handleSearch = () => {
    setOffset(0);
    setSearch(searchInput);
  };

  const timeAgo = (dateStr: string | null): string => {
    if (!dateStr) return "—";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  return (
    <div className="space-y-4">
      {/* Header + Search */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <FileText className="w-5 h-5 text-cyan-400" />
          Casos ({total})
        </h2>
        <div className="flex items-center gap-2">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
            className="px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs"
          >
            <option value="">Todos</option>
            <option value="open,active">Abiertos/Activos</option>
            <option value="open">Abiertos</option>
            <option value="active">Activos</option>
            <option value="waiting">En espera</option>
            <option value="closed">Cerrados</option>
          </select>

          {/* Search */}
          <div className="flex items-center gap-1">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-7 pr-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs w-40"
              />
            </div>
          </div>

          <button onClick={fetchCases} className="p-1.5 rounded-lg hover:bg-white/5 transition">
            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Table */}
      {loading && cases.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Cargando casos...
        </div>
      ) : cases.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
          <FileText className="w-8 h-8 opacity-30" />
          <p className="text-sm">Sin casos encontrados</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-slate-500 border-b border-[var(--border)]">
                  <th className="py-2 px-3 text-left">ID</th>
                  <th className="py-2 px-3 text-left">Estado</th>
                  <th className="py-2 px-3 text-left">Owner</th>
                  <th className="py-2 px-3 text-left">Cliente</th>
                  <th className="py-2 px-3 text-left">Asunto</th>
                  <th className="py-2 px-3 text-left">Canal</th>
                  <th className="py-2 px-3 text-center">Interacc.</th>
                  <th className="py-2 px-3 text-center">Alertas</th>
                  <th className="py-2 px-3 text-right">Última act.</th>
                  <th className="py-2 px-3 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => {
                  const s = STATUS_STYLES[c.status] || STATUS_STYLES.closed;
                  const hasAlerts = c.alerts.blocks > 0 || c.alerts.violations > 0;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => onSelectCase(c.id)}
                      className="border-b border-[var(--border)] hover:bg-white/[0.02] cursor-pointer transition group"
                    >
                      <td className="py-2.5 px-3 font-mono text-slate-400">#{c.id}</td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.bg} ${s.text}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {c.visibleOwnerId ? (
                          <span className="flex items-center gap-1 text-slate-300">
                            <User className="w-3 h-3" />
                            {AGENT_NAMES[c.visibleOwnerId] || c.visibleOwnerId}
                          </span>
                        ) : (
                          <span className="text-slate-600 italic">Sin asignar</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-400 max-w-[120px] truncate">
                        {c.clientIdentifier}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 max-w-[200px] truncate">
                        {c.subject || <span className="text-slate-600 italic">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">{c.channel || "—"}</td>
                      <td className="py-2.5 px-3 text-center text-slate-400">{c.interactionCount}</td>
                      <td className="py-2.5 px-3 text-center">
                        {hasAlerts ? (
                          <div className="flex items-center justify-center gap-1">
                            {c.alerts.blocks > 0 && (
                              <span className="flex items-center gap-0.5 text-red-400" title={`${c.alerts.blocks} bloqueo(s)`}>
                                <Shield className="w-3 h-3" />{c.alerts.blocks}
                              </span>
                            )}
                            {c.alerts.violations > 0 && (
                              <span className="flex items-center gap-0.5 text-amber-400" title={`${c.alerts.violations} violación(es)`}>
                                <AlertTriangle className="w-3 h-3" />{c.alerts.violations}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="flex items-center justify-end gap-1 text-slate-500">
                          <Clock className="w-3 h-3" />
                          {timeAgo(c.updatedAt)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                Mostrando {offset + 1}–{Math.min(offset + limit, total)} de {total}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  className="px-3 py-1 rounded border border-[var(--border)] hover:bg-white/5 disabled:opacity-30 transition"
                >
                  ← Anterior
                </button>
                <button
                  disabled={offset + limit >= total}
                  onClick={() => setOffset(offset + limit)}
                  className="px-3 py-1 rounded border border-[var(--border)] hover:bg-white/5 disabled:opacity-30 transition"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
