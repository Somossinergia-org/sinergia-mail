"use client";

import { useState, useEffect } from "react";
import {
  ArrowLeft, FileText, User, Clock, Shield, AlertTriangle,
  Zap, MessageCircle, RefreshCw, ChevronDown, ChevronUp,
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

const EVENT_CONFIG: Record<string, { label: string; color: string; category: string }> = {
  case_created: { label: "Caso creado", color: "border-blue-500", category: "case" },
  case_routed: { label: "Caso enrutado", color: "border-cyan-500", category: "case" },
  case_escalated: { label: "Caso escalado", color: "border-amber-500", category: "case" },
  case_owner_changed: { label: "Owner cambiado", color: "border-purple-500", category: "ownership" },
  case_closed: { label: "Caso cerrado", color: "border-slate-500", category: "case" },
  case_status_changed: { label: "Estado cambiado", color: "border-blue-400", category: "case" },
  agent_selected: { label: "Agente seleccionado", color: "border-green-500", category: "agent" },
  agent_blocked: { label: "Agente bloqueado", color: "border-red-500", category: "block" },
  agent_delegated: { label: "Delegación", color: "border-blue-400", category: "delegation" },
  agent_exception: { label: "Excepción CEO", color: "border-amber-400", category: "governance" },
  tool_available: { label: "Tool disponible", color: "border-slate-400", category: "tool" },
  tool_called: { label: "Herramienta usada", color: "border-green-400", category: "tool" },
  tool_blocked: { label: "Herramienta bloqueada", color: "border-red-500", category: "block" },
  tool_succeeded: { label: "Herramienta OK", color: "border-green-400", category: "tool" },
  tool_failed: { label: "Herramienta falló", color: "border-amber-500", category: "tool" },
  external_message_attempted: { label: "Msg. externo intentado", color: "border-cyan-400", category: "external" },
  external_message_blocked: { label: "Msg. externo bloqueado", color: "border-red-500", category: "block" },
  external_message_sent: { label: "Msg. externo enviado", color: "border-green-400", category: "external" },
  governance_rule_triggered: { label: "Regla gobernanza", color: "border-amber-500", category: "governance" },
  ownership_conflict_detected: { label: "Conflicto ownership", color: "border-red-400", category: "governance" },
  visibility_violation_detected: { label: "Violación visibilidad", color: "border-red-500", category: "governance" },
  legacy_alias_resolved: { label: "Alias resuelto", color: "border-slate-400", category: "case" },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: "bg-blue-500/10", text: "text-blue-400", label: "Abierto" },
  active: { bg: "bg-green-500/10", text: "text-green-400", label: "Activo" },
  waiting: { bg: "bg-amber-500/10", text: "text-amber-400", label: "En espera" },
  closed: { bg: "bg-slate-500/10", text: "text-slate-500", label: "Cerrado" },
};

const RESULT_STYLES: Record<string, string> = {
  success: "text-green-400",
  blocked: "text-red-400",
  failed: "text-amber-400",
  info: "text-slate-400",
};

interface TimelineEvent {
  id: string;
  timestamp: string;
  eventType: string;
  result: string;
  agentId: string;
  agentLayer: string | null;
  toolName: string | null;
  reason: string | null;
  visibleOwnerId: string | null;
  targetAgentId: string | null;
  metadata: Record<string, unknown> | null;
}

interface CaseDetail {
  case: {
    id: number;
    clientIdentifier: string;
    visibleOwnerId: string | null;
    status: string;
    subject: string | null;
    channel: string | null;
    interactionCount: number;
    createdAt: string | null;
    updatedAt: string | null;
    closedAt: string | null;
    metadata: Record<string, unknown> | null;
  };
  timeline: TimelineEvent[];
  blockedEvents: TimelineEvent[];
  violations: TimelineEvent[];
  delegations: TimelineEvent[];
  ownerTransitions: TimelineEvent[];
  externalComms: TimelineEvent[];
  agentsInvolved: string[];
  stats: {
    totalEvents: number;
    totalBlocks: number;
    totalViolations: number;
    totalDelegations: number;
    totalExternalComms: number;
  };
}

interface Props {
  caseId: number;
  onBack: () => void;
}

export default function OperationsCaseDetailPanel({ caseId, onBack }: Props) {
  const [data, setData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<string>("all");
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/operations/cases/${caseId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDetail(); }, [caseId]);

  const toggleEvent = (id: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando caso #{caseId}...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
        <p className="text-sm text-slate-400">{error}</p>
        <button onClick={onBack} className="text-xs text-cyan-400 hover:underline">Volver</button>
      </div>
    );
  }

  if (!data) return null;

  const c = data.case;
  const s = STATUS_STYLES[c.status] || STATUS_STYLES.closed;

  // Filter timeline
  const filteredTimeline = timelineFilter === "all"
    ? data.timeline
    : data.timeline.filter((e) => {
        const cfg = EVENT_CONFIG[e.eventType];
        return cfg?.category === timelineFilter;
      });

  const timelineCategories = [
    { key: "all", label: "Todo" },
    { key: "block", label: "Bloqueos" },
    { key: "governance", label: "Gobernanza" },
    { key: "delegation", label: "Delegaciones" },
    { key: "external", label: "Externos" },
    { key: "ownership", label: "Ownership" },
    { key: "case", label: "Caso" },
    { key: "tool", label: "Tools" },
  ];

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-white/5 transition"
        >
          <ArrowLeft className="w-5 h-5 text-slate-400" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            Caso #{c.id}
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.bg} ${s.text}`}>
              {s.label}
            </span>
          </h2>
          {c.subject && (
            <p className="text-sm text-slate-400 mt-0.5">{c.subject}</p>
          )}
        </div>
        <button onClick={fetchDetail} className="p-1.5 rounded-lg hover:bg-white/5 transition">
          <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Case Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Owner */}
        <div className="glass-card p-4 rounded-xl">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 flex items-center gap-1">
            <User className="w-3 h-3" /> Owner visible
          </div>
          <div className="text-sm font-semibold">
            {c.visibleOwnerId ? AGENT_NAMES[c.visibleOwnerId] || c.visibleOwnerId : (
              <span className="text-slate-600 italic">Sin asignar</span>
            )}
          </div>
          {data.ownerTransitions.length > 0 && (
            <div className="text-[10px] text-purple-400 mt-1">
              {data.ownerTransitions.length} cambio(s) de owner
            </div>
          )}
        </div>

        {/* Client */}
        <div className="glass-card p-4 rounded-xl">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Cliente</div>
          <div className="text-sm font-mono text-slate-300 truncate">{c.clientIdentifier}</div>
          <div className="text-[10px] text-slate-500 mt-1">
            Canal: {c.channel || "—"} · {c.interactionCount} interacc.
          </div>
        </div>

        {/* Fechas */}
        <div className="glass-card p-4 rounded-xl">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Fechas
          </div>
          <div className="text-[10px] text-slate-400 space-y-0.5">
            <div>Creado: {c.createdAt ? new Date(c.createdAt).toLocaleString("es-ES") : "—"}</div>
            <div>Última act.: {c.updatedAt ? new Date(c.updatedAt).toLocaleString("es-ES") : "—"}</div>
            {c.closedAt && <div>Cerrado: {new Date(c.closedAt).toLocaleString("es-ES")}</div>}
          </div>
        </div>

        {/* Stats */}
        <div className="glass-card p-4 rounded-xl">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Estadísticas</div>
          <div className="text-[10px] space-y-0.5">
            <div className="text-slate-400">{data.stats.totalEvents} eventos</div>
            {data.stats.totalBlocks > 0 && (
              <div className="text-red-400 flex items-center gap-1">
                <Shield className="w-3 h-3" /> {data.stats.totalBlocks} bloqueo(s)
              </div>
            )}
            {data.stats.totalViolations > 0 && (
              <div className="text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {data.stats.totalViolations} violación(es)
              </div>
            )}
            {data.stats.totalDelegations > 0 && (
              <div className="text-blue-400 flex items-center gap-1">
                <Zap className="w-3 h-3" /> {data.stats.totalDelegations} delegación(es)
              </div>
            )}
            {data.stats.totalExternalComms > 0 && (
              <div className="text-cyan-400 flex items-center gap-1">
                <MessageCircle className="w-3 h-3" /> {data.stats.totalExternalComms} msg. externo(s)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Agents Involved */}
      {data.agentsInvolved.length > 0 && (
        <div className="glass-card p-4 rounded-xl">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Agentes implicados</div>
          <div className="flex flex-wrap gap-2">
            {data.agentsInvolved.map((id) => (
              <span
                key={id}
                className={`px-2.5 py-1 rounded-full text-[10px] font-mono border ${
                  id === c.visibleOwnerId
                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                    : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                }`}
              >
                {AGENT_NAMES[id] || id}
                {id === c.visibleOwnerId && " (owner)"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">Timeline ({filteredTimeline.length})</h3>
          <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
            {timelineCategories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setTimelineFilter(cat.key)}
                className={`px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider transition ${
                  timelineFilter === cat.key
                    ? "bg-cyan-500/15 text-cyan-400"
                    : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {filteredTimeline.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-slate-500 text-sm">
            Sin eventos en esta categoría
          </div>
        ) : (
          <div className="space-y-0 max-h-[500px] overflow-y-auto custom-scrollbar">
            {filteredTimeline.map((evt) => {
              const cfg = EVENT_CONFIG[evt.eventType] || {
                label: evt.eventType,
                color: "border-slate-500",
                category: "other",
              };
              const isExpanded = expandedEvents.has(evt.id);
              const resultColor = RESULT_STYLES[evt.result] || RESULT_STYLES.info;

              return (
                <div
                  key={evt.id}
                  className={`flex items-start gap-3 py-2.5 px-3 border-l-2 ${cfg.color} hover:bg-white/[0.02] transition cursor-pointer`}
                  onClick={() => toggleEvent(evt.id)}
                >
                  {/* Time */}
                  <div className="text-[10px] text-slate-600 font-mono w-28 flex-shrink-0 pt-0.5">
                    {new Date(evt.timestamp).toLocaleString("es-ES", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-200">{cfg.label}</span>
                      <span className={`text-[9px] font-mono ${resultColor}`}>
                        [{evt.result}]
                      </span>
                      {evt.agentId && (
                        <span className="text-[10px] text-slate-500">
                          {AGENT_NAMES[evt.agentId] || evt.agentId}
                        </span>
                      )}
                      {evt.toolName && (
                        <span className="text-[10px] text-slate-600 font-mono">
                          {evt.toolName}
                        </span>
                      )}
                      {evt.targetAgentId && (
                        <span className="text-[10px] text-slate-500">
                          → {AGENT_NAMES[evt.targetAgentId] || evt.targetAgentId}
                        </span>
                      )}
                    </div>

                    {evt.reason && (
                      <p className={`text-[10px] text-slate-500 mt-0.5 ${isExpanded ? "" : "truncate max-w-lg"}`}>
                        {evt.reason}
                      </p>
                    )}

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-2 p-2 rounded bg-slate-900/50 text-[10px] font-mono text-slate-500 space-y-0.5">
                        <div>ID: {evt.id}</div>
                        <div>Capa: {evt.agentLayer || "—"}</div>
                        <div>Owner visible: {evt.visibleOwnerId ? AGENT_NAMES[evt.visibleOwnerId] || evt.visibleOwnerId : "—"}</div>
                        {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                          <div className="mt-1">
                            Metadata: {JSON.stringify(evt.metadata, null, 2)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Expand indicator */}
                  <div className="flex-shrink-0 pt-0.5">
                    {isExpanded ? (
                      <ChevronUp className="w-3 h-3 text-slate-600" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-slate-600" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
