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

  // Cleanup state
  const [cleanupAnalysis, setCleanupAnalysis] = useState<CleanupAnalysis | null>(null);
  const [analyzingCleanup, setAnalyzingCleanup] = useState(false);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [selectedCleanupGroups, setSelectedCleanupGroups] = useState<Set<number>>(new Set());

  // Papelera interna (soft-deleted)
  interface TrashItem {
    id: number;
    subject: string | null;
    fromName: string | null;
    fromEmail: string | null;
    category: string | null;
    date: string | null;
    deletedAt: string | null;
  }
  const [showTrash, setShowTrash] = useState(false);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [trashBusy, setTrashBusy] = useState(false);

  const loadTrash = async () => {
    setTrashBusy(true);
    try {
      const res = await fetch("/api/agent/cleanup?trash=list");
      const data = await res.json();
      setTrashItems(data.trash || []);
    } finally {
      setTrashBusy(false);
    }
  };

  const restoreEmails = async (ids?: number[]) => {
    if (!confirm(ids ? `¿Restaurar ${ids.length} emails?` : "¿Restaurar TODOS los emails de la papelera interna?")) return;
    setTrashBusy(true);
    try {
      const res = await fetch("/api/agent/cleanup", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { emailIds: ids } : {}),
      });
      const data = await res.json();
      setCleanupResult(`${data.restored} emails restaurados`);
      await loadTrash();
    } finally {
      setTrashBusy(false);
    }
  };

  const purgeOld = async () => {
    if (!confirm("¿Purgar permanentemente los emails con más de 30 días en la papelera?\n\nEsta acción NO se puede deshacer.")) return;
    setTrashBusy(true);
    try {
      const res = await fetch("/api/agent/cleanup?purge=1", { method: "PUT" });
      const data = await res.json();
      setCleanupResult(`${data.purged} emails purgados permanentemente`);
      await loadTrash();
    } finally {
      setTrashBusy(false);
    }
  };

  const refreshLogs = async () => {
    const agentRes = await fetch("/api/agent");
    const agentData = await agentRes.json();
    setLogs(agentData.recentActivity || []);
  };

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

  // ═══ CLEANUP ═══
  const handleAnalyzeCleanup = async () => {
    setAnalyzingCleanup(true);
    setCleanupAnalysis(null);
    setCleanupResult(null);
    try {
      const res = await fetch("/api/agent/cleanup");
      const data = await res.json();
      setCleanupAnalysis(data.analysis);
      setShowCleanupModal(true);
      const autoSelected = new Set<number>();
      data.analysis.groups.forEach((g: CleanupGroup, i: number) => {
        if (g.score >= 70) autoSelected.add(i);
      });
      setSelectedCleanupGroups(autoSelected);
    } catch (e) {
      console.error("Error analyzing cleanup:", e);
    } finally {
      setAnalyzingCleanup(false);
    }
  };

  const handleExecuteCleanup = async () => {
    if (!cleanupAnalysis) return;
    const emailIds: number[] = [];
    cleanupAnalysis.groups.forEach((g, i) => {
      if (selectedCleanupGroups.has(i)) emailIds.push(...g.emailIds);
    });
    if (emailIds.length === 0) {
      setCleanupResult("Selecciona al menos un grupo");
      return;
    }
    if (
      !confirm(
        `¿Mover ${emailIds.length} emails a papelera?\n\nPodrás recuperarlos desde Gmail durante 30 días.`,
      )
    ) {
      return;
    }
    setCleaningUp(true);
    try {
      const res = await fetch("/api/agent/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds, action: "trash" }),
      });
      const data = await res.json();
      setCleanupResult(`${data.trashed} emails movidos a papelera`);
      setShowCleanupModal(false);
      setCleanupAnalysis(null);
      await refreshLogs();
    } catch (e) {
      console.error("Error cleaning up:", e);
      setCleanupResult("Error durante la limpieza");
    } finally {
      setCleaningUp(false);
    }
  };

  const toggleCleanupGroup = (index: number) => {
    setSelectedCleanupGroups((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

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

      {/* Cleanup (kept here as mantenimiento del agente) */}
      <div>
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Mantenimiento</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button onClick={handleAnalyzeCleanup} disabled={analyzingCleanup}
            className="glass-card p-5 text-left hover:border-red-500/30 transition-all group">
            <div className="flex items-center gap-3 mb-2">
              {analyzingCleanup ? <Loader2 className="w-5 h-5 animate-spin text-red-400" /> : <Trash2 className="w-5 h-5 text-red-400 group-hover:scale-110 transition" />}
              <span className="font-semibold text-sm">{analyzingCleanup ? "Analizando..." : "Limpieza inteligente"}</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Detectar SPAM, marketing leído y notificaciones antiguas. Tú confirmas antes de borrar.
            </p>
            {cleanupResult && <div className="mt-2 text-xs text-green-400">{cleanupResult}</div>}
          </button>

          <button
            onClick={() => {
              setShowTrash(true);
              loadTrash();
            }}
            className="glass-card p-5 text-left hover:border-amber-500/30 transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <Trash2 className="w-5 h-5 text-amber-400 group-hover:scale-110 transition" />
              <span className="font-semibold text-sm">Papelera interna</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Restaura emails borrados o purga los que llevan &gt;30 días en la papelera.
            </p>
          </button>

          <div className="glass-card p-5 text-left border-[var(--border)]">
            <div className="flex items-center gap-3 mb-2">
              <ShieldAlert className="w-5 h-5 text-blue-400" />
              <span className="font-semibold text-sm">Protección activa</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Facturas, Clientes, Proveedores, Legal y RRHH <strong className="text-[var(--text-primary)]">nunca se eliminan</strong>. Solo van a papelera de Gmail (recuperable 30 días).
            </p>
          </div>
        </div>
      </div>

      {/* Cleanup modal */}
      {showCleanupModal && cleanupAnalysis && (
        <div className="glass-card p-6 animate-fade-in border-red-500/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h3 className="font-semibold text-sm">
                Limpieza: {cleanupAnalysis.deletable} emails eliminables de {cleanupAnalysis.totalEmails}
              </h3>
            </div>
            <button onClick={() => setShowCleanupModal(false)} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Cancelar
            </button>
          </div>

          <div className="space-y-2 mb-4">
            {cleanupAnalysis.groups.map((group, i) => (
              <label key={i} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-card)] cursor-pointer hover:bg-[var(--bg-card)]/80 transition">
                <input
                  type="checkbox"
                  checked={selectedCleanupGroups.has(i)}
                  onChange={() => toggleCleanupGroup(i)}
                  className="w-4 h-4 rounded border-[var(--border)] accent-red-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{group.reason}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {group.count} emails — Confianza: {group.score}%
                  </div>
                </div>
                <div className={`text-xs font-mono px-2 py-0.5 rounded ${
                  group.score >= 80 ? "bg-red-500/10 text-red-400" :
                  group.score >= 60 ? "bg-amber-500/10 text-amber-400" :
                  "bg-gray-500/10 text-gray-400"
                }`}>
                  {group.score}
                </div>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-[var(--text-secondary)]">
              Seleccionados: {Array.from(selectedCleanupGroups).reduce((sum, i) => sum + (cleanupAnalysis.groups[i]?.count || 0), 0)} emails
            </div>
            <button
              onClick={handleExecuteCleanup}
              disabled={cleaningUp || selectedCleanupGroups.size === 0}
              className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition disabled:opacity-50"
            >
              {cleaningUp ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Limpiando...</span>
              ) : (
                "Mover a papelera"
              )}
            </button>
          </div>
        </div>
      )}

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

      {/* Papelera interna modal */}
      {showTrash && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => !trashBusy && setShowTrash(false)}
        >
          <div
            className="glass-card max-w-2xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-amber-400" /> Papelera interna
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  {trashItems.length} email{trashItems.length === 1 ? "" : "s"} soft-deleted. En Gmail siguen 30 días.
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => restoreEmails()}
                  disabled={trashBusy || trashItems.length === 0}
                  className="text-xs px-3 py-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-40 min-h-[36px]"
                >
                  Restaurar todos
                </button>
                <button
                  onClick={purgeOld}
                  disabled={trashBusy}
                  title="Borrar permanentemente los >30d"
                  className="text-xs px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40 min-h-[36px]"
                >
                  Purgar &gt;30d
                </button>
                <button
                  onClick={() => setShowTrash(false)}
                  aria-label="Cerrar"
                  className="min-w-[36px] min-h-[36px] rounded-lg hover:bg-[var(--bg-card)] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 divide-y divide-[var(--border)]">
              {trashBusy && trashItems.length === 0 ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                </div>
              ) : trashItems.length === 0 ? (
                <div className="text-center py-12 text-[var(--text-secondary)]">
                  <Trash2 className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-xs">Papelera interna vacía</p>
                </div>
              ) : (
                trashItems.map((t) => (
                  <div key={t.id} className="flex items-start gap-3 p-3 hover:bg-[var(--bg-card-hover)]">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.subject || "(sin asunto)"}</div>
                      <div className="text-[11px] text-[var(--text-secondary)] truncate">
                        {t.fromName || t.fromEmail} · {t.category || "OTROS"}
                      </div>
                      {t.deletedAt && (
                        <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                          Eliminado: {new Date(t.deletedAt).toLocaleString("es-ES")}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => restoreEmails([t.id])}
                      disabled={trashBusy}
                      title="Restaurar"
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-40"
                    >
                      Restaurar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
