"use client";

import { useState, useEffect } from "react";
import {
  Bot,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Settings2,
  Trash2,
  ShieldAlert,
  AlertTriangle,
  X,
} from "lucide-react";
import AgentChat from "./AgentChat";

interface AgentLog {
  id: number;
  action: string;
  inputSummary: string | null;
  outputSummary: string | null;
  durationMs: number | null;
  success: boolean | null;
  error: string | null;
  createdAt: string | null;
}

interface AgentConfig {
  autoCategorizeOnSync: boolean;
  autoSummarize: boolean;
  defaultDraftTone: string;
  weeklyReportEnabled: boolean;
  weeklyReportDay: number;
}

interface CleanupGroup {
  reason: string;
  count: number;
  emailIds: number[];
  score: number;
}

interface CleanupAnalysis {
  totalEmails: number;
  deletable: number;
  groups: CleanupGroup[];
  protected: string[];
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  categorize: { label: "Categorizar", color: "text-blue-400" },
  summarize: { label: "Resumir", color: "text-green-400" },
  draft: { label: "Borrador", color: "text-purple-400" },
  extract: { label: "Factura", color: "text-yellow-400" },
  "pdf-extract": { label: "PDF", color: "text-amber-400" },
  cleanup: { label: "Limpieza", color: "text-red-400" },
  "report-excel": { label: "Excel", color: "text-teal-400" },
  "auto-draft": { label: "Borrador", color: "text-indigo-400" },
  "template-apply": { label: "Plantilla", color: "text-pink-400" },
  contacts: { label: "Contactos", color: "text-lime-400" },
  chat: { label: "Chat", color: "text-cyan-400" },
  report: { label: "Informe", color: "text-orange-400" },
};

export default function AgentPanel() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agent")
      .then((r) => r.json())
      .then((data) => {
        setConfig(data.config);
        setLogs(data.recentActivity || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleConfig = async (key: keyof AgentConfig) => {
    if (!config) return;
    const newValue = !config[key];
    setConfig({ ...config, [key]: newValue });
    await fetch("/api/agent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: newValue }),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-sinergia-400" />
      </div>
    );
  }

  const successCount = logs.filter((l) => l.success).length;
  const errorCount = logs.filter((l) => !l.success).length;
  const avgDuration = logs.length > 0
    ? Math.round(logs.reduce((s, l) => s + (l.durationMs || 0), 0) / logs.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Bot, value: logs.length, label: "Acciones recientes", bg: "bg-sinergia-600/15", text: "text-sinergia-400" },
          { icon: CheckCircle2, value: successCount, label: "Exitosas", bg: "bg-green-400/10", text: "text-green-400" },
          { icon: XCircle, value: errorCount, label: "Errores", bg: "bg-red-400/10", text: "text-red-400" },
          { icon: Clock, value: `${avgDuration}ms`, label: "Tiempo medio", bg: "bg-cyan-400/10", text: "text-cyan-400" },
        ].map((s, i) => (
          <div key={i} className="glass-card p-4 animate-fade-in">
            <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center ${s.text} mb-2`}>
              <s.icon className="w-5 h-5" />
            </div>
            <div className="stat-number text-xl mb-1">{s.value}</div>
            <div className="text-xs text-[var(--text-secondary)]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Chat — main feature */}
      <AgentChat />

      {/* Config */}
      {config && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="w-4 h-4 text-[var(--text-secondary)]" />
            <h3 className="font-semibold text-sm">Configuración del agente</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { key: "autoCategorizeOnSync" as const, label: "Auto-categorizar al sincronizar" },
              { key: "autoSummarize" as const, label: "Auto-resumir emails nuevos" },
              { key: "weeklyReportEnabled" as const, label: "Informe semanal automático (lunes 9:00)" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer group">
                <div onClick={() => toggleConfig(key)}
                  className={`w-10 h-5 rounded-full transition-all relative cursor-pointer ${
                    config[key] ? "bg-sinergia-500" : "bg-[var(--bg-card)] border border-[var(--border)]"
                  }`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    config[key] ? "translate-x-5" : "translate-x-0.5"
                  }`} />
                </div>
                <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition">{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Activity log */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-sm mb-4">Actividad reciente</h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {logs.map((log) => {
            const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: "text-gray-400" };
            return (
              <div key={log.id} className="flex items-start gap-3 py-2 border-b border-[var(--border)] last:border-0">
                <div className="flex-shrink-0 mt-0.5">
                  {log.success ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${actionInfo.color}`}>{actionInfo.label}</span>
                    {log.durationMs && <span className="text-[10px] text-[var(--text-secondary)]">{log.durationMs}ms</span>}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] truncate">{log.outputSummary || log.inputSummary || "—"}</div>
                  {log.error && <div className="text-xs text-red-400 truncate">{log.error}</div>}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] flex-shrink-0">
                  {log.createdAt ? new Date(log.createdAt).toLocaleString("es-ES", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : ""}
                </div>
              </div>
            );
          })}
          {logs.length === 0 && (
            <div className="text-center py-8 text-[var(--text-secondary)]">
              <Bot className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-xs">El agente aún no ha realizado ninguna acción</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
