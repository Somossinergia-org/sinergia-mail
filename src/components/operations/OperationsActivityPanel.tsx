"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, AlertTriangle, Shield, Zap, MessageCircle, RefreshCw, Filter } from "lucide-react";

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

const EVENT_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  // Case events
  case_created: { label: "Caso creado", color: "text-blue-400", icon: "+" },
  case_routed: { label: "Caso enrutado", color: "text-cyan-400", icon: "→" },
  case_escalated: { label: "Caso escalado", color: "text-amber-400", icon: "↑" },
  case_owner_changed: { label: "Owner cambiado", color: "text-purple-400", icon: "⇄" },
  case_closed: { label: "Caso cerrado", color: "text-slate-400", icon: "✓" },
  case_status_changed: { label: "Estado cambiado", color: "text-blue-300", icon: "◎" },
  // Agent events
  agent_selected: { label: "Agente seleccionado", color: "text-green-400", icon: "●" },
  agent_blocked: { label: "Agente bloqueado", color: "text-red-400", icon: "✕" },
  agent_delegated: { label: "Delegación", color: "text-blue-400", icon: "⇒" },
  agent_exception: { label: "Excepción CEO", color: "text-amber-300", icon: "!" },
  // Tool events
  tool_called: { label: "Herramienta usada", color: "text-green-300", icon: "⚡" },
  tool_blocked: { label: "Herramienta bloqueada", color: "text-red-400", icon: "🚫" },
  tool_succeeded: { label: "Herramienta OK", color: "text-green-400", icon: "✓" },
  tool_failed: { label: "Herramienta falló", color: "text-amber-400", icon: "✕" },
  // External
  external_message_attempted: { label: "Msg. externo intentado", color: "text-cyan-300", icon: "→" },
  external_message_blocked: { label: "Msg. externo bloqueado", color: "text-red-400", icon: "✕" },
  external_message_sent: { label: "Msg. externo enviado", color: "text-green-400", icon: "✓" },
  // Governance
  governance_rule_triggered: { label: "Regla gobernanza", color: "text-amber-400", icon: "⚠" },
  ownership_conflict_detected: { label: "Conflicto ownership", color: "text-red-300", icon: "⚠" },
  visibility_violation_detected: { label: "Violación visibilidad", color: "text-red-400", icon: "⚠" },
};

const RESULT_COLORS: Record<string, string> = {
  success: "bg-green-500/10 text-green-400 border-green-500/20",
  blocked: "bg-red-500/10 text-red-400 border-red-500/20",
  failed: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  info: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

interface ActivityEvent {
  id: string;
  timestamp: string;
  eventType: string;
  result: string;
  agentId: string;
  agentLayer: string | null;
  caseId: string | null;
  toolName: string | null;
  reason: string | null;
  visibleOwnerId: string | null;
  targetAgentId: string | null;
}

type FilterType = "all" | "blocked" | "violations" | "delegations" | "external";

export default function OperationsActivityPanel() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [window, setWindow] = useState(3600);

  const fetchActivity = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/operations/activity?type=${filter}&window=${window}&limit=100`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data.events || []);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [filter, window]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  const filters: { key: FilterType; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "Todo", icon: <Activity className="w-3 h-3" /> },
    { key: "blocked", label: "Bloqueos", icon: <Shield className="w-3 h-3" /> },
    { key: "violations", label: "Violaciones", icon: <AlertTriangle className="w-3 h-3" /> },
    { key: "delegations", label: "Delegaciones", icon: <Zap className="w-3 h-3" /> },
    { key: "external", label: "Externos", icon: <MessageCircle className="w-3 h-3" /> },
  ];

  const windowOptions = [
    { value: 3600, label: "1h" },
    { value: 14400, label: "4h" },
    { value: 86400, label: "24h" },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          Actividad Reciente
        </h2>
        <div className="flex items-center gap-2">
          {/* Filter buttons */}
          <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex items-center gap-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition ${
                  filter === f.key
                    ? "bg-cyan-500/15 text-cyan-400"
                    : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                }`}
              >
                {f.icon} {f.label}
              </button>
            ))}
          </div>

          {/* Window selector */}
          <select
            value={window}
            onChange={(e) => setWindow(Number(e.target.value))}
            className="px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs"
          >
            {windowOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <button onClick={fetchActivity} className="p-1.5 rounded-lg hover:bg-white/5 transition">
            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Events list */}
      {loading && events.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Cargando actividad...
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
          <Activity className="w-8 h-8 opacity-30" />
          <p className="text-sm">Sin actividad en la ventana seleccionada</p>
        </div>
      ) : (
        <div className="space-y-1 max-h-[600px] overflow-y-auto custom-scrollbar">
          {events.map((evt) => {
            const meta = EVENT_LABELS[evt.eventType] || {
              label: evt.eventType,
              color: "text-slate-400",
              icon: "·",
            };
            const resultClass = RESULT_COLORS[evt.result] || RESULT_COLORS.info;

            return (
              <div
                key={evt.id}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/[0.02] transition group"
              >
                {/* Timestamp */}
                <div className="text-[10px] text-slate-600 font-mono w-16 flex-shrink-0 pt-0.5">
                  {new Date(evt.timestamp).toLocaleTimeString("es-ES", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </div>

                {/* Icon */}
                <span className={`text-sm w-5 text-center flex-shrink-0 ${meta.color}`}>
                  {meta.icon}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${resultClass}`}>
                      {evt.result}
                    </span>
                    {evt.caseId && (
                      <span className="text-[9px] text-slate-500 font-mono">
                        caso #{evt.caseId}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {evt.agentId && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        {AGENT_NAMES[evt.agentId] || evt.agentId}
                      </span>
                    )}
                    {evt.toolName && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        → {evt.toolName}
                      </span>
                    )}
                    {evt.targetAgentId && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        → {AGENT_NAMES[evt.targetAgentId] || evt.targetAgentId}
                      </span>
                    )}
                  </div>

                  {evt.reason && (
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-md">
                      {evt.reason}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
