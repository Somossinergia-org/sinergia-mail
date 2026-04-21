"use client";

import { useState, useEffect } from "react";
import { Activity, AlertTriangle, Shield, Users, Clock, Zap, RefreshCw } from "lucide-react";

// ─── Agent name map ─────────────────────────────────────────────────────

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

interface HealthData {
  cases: {
    byStatus: Record<string, number>;
    total: number;
    stale: number;
    withBlocks: number;
    withViolations: number;
  };
  agents: {
    activeLastHour: string[];
    blockedLast24h: string[];
  };
  lastHour: {
    blocks: number;
    violations: number;
    delegations: number;
    externalMessages: number;
  };
  generatedAt: string;
}

export default function OperationsHealthPanel() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/operations/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHealth(); }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando salud operativa...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
        <p className="text-sm text-slate-400">No se pudo cargar: {error}</p>
        <button onClick={fetchHealth} className="text-xs text-cyan-400 hover:underline">Reintentar</button>
      </div>
    );
  }

  if (!data) return null;

  const statusColors: Record<string, string> = {
    open: "text-blue-400",
    active: "text-green-400",
    waiting: "text-amber-400",
    closed: "text-slate-500",
  };

  const statusLabels: Record<string, string> = {
    open: "Abiertos",
    active: "Activos",
    waiting: "En espera",
    closed: "Cerrados",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          Salud Operativa
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500 font-mono">
            {new Date(data.generatedAt).toLocaleTimeString("es-ES")}
          </span>
          <button
            onClick={fetchHealth}
            className="p-1.5 rounded-lg hover:bg-white/5 transition"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Cases total */}
        <div className="glass-card p-4 rounded-xl">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Casos totales</div>
          <div className="text-2xl font-bold">{data.cases.total}</div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {Object.entries(data.cases.byStatus).map(([status, count]) => (
              <span key={status} className={`text-[10px] font-mono ${statusColors[status] || "text-slate-400"}`}>
                {statusLabels[status] || status}: {count}
              </span>
            ))}
          </div>
        </div>

        {/* Blocks */}
        <div className={`glass-card p-4 rounded-xl ${data.lastHour.blocks > 0 ? "border-red-500/30" : ""}`}>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Bloqueos (1h)</div>
          <div className={`text-2xl font-bold ${data.lastHour.blocks > 0 ? "text-red-400" : ""}`}>
            {data.lastHour.blocks}
          </div>
          <div className="text-[10px] text-slate-500 mt-2">
            {data.cases.withBlocks} caso(s) afectados (24h)
          </div>
        </div>

        {/* Violations */}
        <div className={`glass-card p-4 rounded-xl ${data.lastHour.violations > 0 ? "border-amber-500/30" : ""}`}>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Violaciones (1h)</div>
          <div className={`text-2xl font-bold ${data.lastHour.violations > 0 ? "text-amber-400" : ""}`}>
            {data.lastHour.violations}
          </div>
          <div className="text-[10px] text-slate-500 mt-2">
            {data.cases.withViolations} caso(s) afectados (24h)
          </div>
        </div>

        {/* Delegations */}
        <div className="glass-card p-4 rounded-xl">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Delegaciones (1h)</div>
          <div className="text-2xl font-bold text-blue-400">{data.lastHour.delegations}</div>
          <div className="text-[10px] text-slate-500 mt-2">
            {data.lastHour.externalMessages} msgs. externos
          </div>
        </div>
      </div>

      {/* Alerts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Stale cases */}
        <div className={`glass-card p-4 rounded-xl ${data.cases.stale > 0 ? "border-amber-500/20" : ""}`}>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold">Casos estancados</span>
          </div>
          {data.cases.stale > 0 ? (
            <p className="text-sm text-amber-300">{data.cases.stale} caso(s) sin actividad en 24h</p>
          ) : (
            <p className="text-sm text-slate-500">Todos los casos activos tienen actividad reciente</p>
          )}
        </div>

        {/* Active agents */}
        <div className="glass-card p-4 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-green-400" />
            <span className="text-xs font-semibold">Agentes activos (1h)</span>
          </div>
          {data.agents.activeLastHour.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {data.agents.activeLastHour.map((id) => (
                <span key={id} className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-green-500/10 text-green-400 border border-green-500/20">
                  {AGENT_NAMES[id] || id}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Sin actividad en la última hora</p>
          )}
        </div>

        {/* Blocked agents */}
        <div className={`glass-card p-4 rounded-xl ${data.agents.blockedLast24h.length > 0 ? "border-red-500/20" : ""}`}>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-red-400" />
            <span className="text-xs font-semibold">Agentes bloqueados (24h)</span>
          </div>
          {data.agents.blockedLast24h.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {data.agents.blockedLast24h.map((id) => (
                <span key={id} className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-red-500/10 text-red-400 border border-red-500/20">
                  {AGENT_NAMES[id] || id}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Ningún agente bloqueado</p>
          )}
        </div>
      </div>
    </div>
  );
}
