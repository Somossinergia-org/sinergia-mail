"use client";

import { useState, useEffect } from "react";
import {
  Bot,
  Zap,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Settings2,
  MessageSquarePlus,
  Sparkles,
  Download,
  Trash2,
  ShieldAlert,
  FileSpreadsheet,
  AlertTriangle,
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
  chat: { label: "Chat", color: "text-cyan-400" },
  report: { label: "Informe", color: "text-orange-400" },
};

const REPORT_TYPES = [
  { value: "executive", label: "Resumen Ejecutivo", desc: "Vista general de emails + facturas + top proveedores" },
  { value: "invoices", label: "Informe de Facturas", desc: "Listado completo con desglose IVA y totales por categoría" },
  { value: "expenses", label: "Análisis de Gastos", desc: "Gastos recurrentes, por categoría y tendencia mensual" },
  { value: "emails", label: "Informe de Emails", desc: "Listado de emails con estadísticas por categoría y prioridad" },
];

export default function AgentPanel() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [categorizing, setCategorizing] = useState(false);
  const [catResult, setCatResult] = useState<{ processed: number; categorized: number } | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<{ processed: number; extracted: number } | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<string | null>(null);

  // Excel reports state
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [generatingExcel, setGeneratingExcel] = useState<string | null>(null);

  // Cleanup state
  const [cleanupAnalysis, setCleanupAnalysis] = useState<CleanupAnalysis | null>(null);
  const [analyzingCleanup, setAnalyzingCleanup] = useState(false);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [selectedCleanupGroups, setSelectedCleanupGroups] = useState<Set<number>>(new Set());

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

  // ═══ CATEGORIZE ═══
  const handleCategorize = async () => {
    setCategorizing(true);
    setCatResult(null);
    try {
      const res = await fetch("/api/agent/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setCatResult({ processed: data.processed, categorized: data.categorized });
      await refreshLogs();
    } catch (e) {
      console.error("Error categorizing:", e);
    } finally {
      setCategorizing(false);
    }
  };

  // ═══ EXTRACT INVOICES ═══
  const handleExtractInvoices = async () => {
    setExtracting(true);
    setExtractResult(null);
    try {
      const res = await fetch("/api/agent/invoice-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: true }),
      });
      const data = await res.json();
      setExtractResult({ processed: data.processed || 0, extracted: data.extracted || 0 });
      await refreshLogs();
    } catch (e) {
      console.error("Error extracting invoices:", e);
    } finally {
      setExtracting(false);
    }
  };

  // ═══ FULL REPAIR ═══
  const handleRepair = async () => {
    setRepairing(true);
    setRepairResult(null);
    try {
      setRepairResult("Paso 1/4: Descargando bodies...");
      const r1 = await fetch("/api/sync/refetch-bodies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "FACTURA" }) });
      const d1 = await r1.json();

      setRepairResult(`Paso 2/4: ${d1.updated || 0} bodies. Limpiando...`);
      await fetch("/api/agent/invoice-extract", { method: "DELETE" });

      setRepairResult("Paso 3/4: Extrayendo de emails...");
      const r3 = await fetch("/api/agent/invoice-extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch: true }) });
      const d3 = await r3.json();

      setRepairResult("Paso 4/4: Procesando PDFs adjuntos...");
      const r4 = await fetch("/api/agent/invoice-pdf-extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d4 = await r4.json();

      setRepairResult(`${d1.updated || 0} bodies + ${d3.extracted || 0} emails + ${d4.extracted || 0} PDFs`);
      await refreshLogs();
    } catch {
      setRepairResult("Error durante la reparación");
    } finally {
      setRepairing(false);
    }
  };

  // ═══ WEEKLY REPORT (AI) ═══
  const handleReport = async () => {
    setReportLoading(true);
    try {
      const res = await fetch("/api/agent/report");
      const data = await res.json();
      setReport(data.report);
    } catch (e) {
      console.error(e);
    } finally {
      setReportLoading(false);
    }
  };

  // ═══ EXCEL REPORTS ═══
  const handleExcelReport = async (type: string) => {
    setGeneratingExcel(type);
    try {
      const res = await fetch("/api/agent/report-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error("Error generando Excel");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sinergia-${type}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await refreshLogs();
    } catch (e) {
      console.error("Error generating Excel:", e);
    } finally {
      setGeneratingExcel(null);
    }
  };

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
      // Pre-select all groups with score >= 70
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
    setCleaningUp(true);
    try {
      const emailIds: number[] = [];
      cleanupAnalysis.groups.forEach((g, i) => {
        if (selectedCleanupGroups.has(i)) emailIds.push(...g.emailIds);
      });

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

  // ═══ CONFIG ═══
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

      {/* ═══ SECTION: Procesamiento ═══ */}
      <div>
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Procesamiento IA</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Categorizar */}
          <button onClick={handleCategorize} disabled={categorizing}
            className="glass-card p-5 text-left hover:border-sinergia-500/30 transition-all group">
            <div className="flex items-center gap-3 mb-2">
              {categorizing ? <Loader2 className="w-5 h-5 animate-spin text-sinergia-400" /> : <Zap className="w-5 h-5 text-sinergia-400 group-hover:scale-110 transition" />}
              <span className="font-semibold text-sm">{categorizing ? "Categorizando..." : "Categorizar emails"}</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">Procesar emails sin categorizar con Gemini AI</p>
            {catResult && <div className="mt-2 text-xs text-green-400">{catResult.categorized}/{catResult.processed} categorizados</div>}
          </button>

          {/* Extraer facturas */}
          <button onClick={handleExtractInvoices} disabled={extracting}
            className="glass-card p-5 text-left hover:border-yellow-500/30 transition-all group">
            <div className="flex items-center gap-3 mb-2">
              {extracting ? <Loader2 className="w-5 h-5 animate-spin text-yellow-400" /> : <FileText className="w-5 h-5 text-yellow-400 group-hover:scale-110 transition" />}
              <span className="font-semibold text-sm">{extracting ? "Extrayendo..." : "Extraer facturas"}</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">Extraer datos de facturas (email + PDFs adjuntos)</p>
            {extractResult && <div className="mt-2 text-xs text-green-400">{extractResult.extracted}/{extractResult.processed} extraídas</div>}
          </button>

          {/* Reparar */}
          <button onClick={handleRepair} disabled={repairing}
            className="glass-card p-5 text-left hover:border-emerald-500/30 transition-all group">
            <div className="flex items-center gap-3 mb-2">
              {repairing ? <Loader2 className="w-5 h-5 animate-spin text-emerald-400" /> : <Sparkles className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition" />}
              <span className="font-semibold text-sm">{repairing ? "Reparando..." : "Reparación completa"}</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">Re-descargar + re-categorizar + re-extraer todo</p>
            {repairResult && <div className="mt-2 text-xs text-emerald-400">{repairResult}</div>}
          </button>
        </div>
      </div>

      {/* ═══ SECTION: Informes y Exportación ═══ */}
      <div>
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Informes y Exportación</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Excel Reports */}
          <div className="glass-card p-5 text-left hover:border-teal-500/30 transition-all relative">
            <button onClick={() => setShowReportMenu(!showReportMenu)} className="w-full text-left group">
              <div className="flex items-center gap-3 mb-2">
                <FileSpreadsheet className="w-5 h-5 text-teal-400 group-hover:scale-110 transition" />
                <span className="font-semibold text-sm">Generar Excel</span>
                <Download className="w-3.5 h-3.5 text-[var(--text-secondary)] ml-auto" />
              </div>
              <p className="text-xs text-[var(--text-secondary)]">Descargar informe profesional en .xlsx</p>
            </button>

            {showReportMenu && (
              <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                {REPORT_TYPES.map((rt) => (
                  <button key={rt.value} onClick={() => handleExcelReport(rt.value)}
                    disabled={generatingExcel !== null}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-[var(--bg-card)] transition text-left">
                    {generatingExcel === rt.value ? (
                      <Loader2 className="w-4 h-4 animate-spin text-teal-400 flex-shrink-0" />
                    ) : (
                      <Download className="w-4 h-4 text-teal-400 flex-shrink-0" />
                    )}
                    <div>
                      <div className="text-xs font-medium">{rt.label}</div>
                      <div className="text-[10px] text-[var(--text-secondary)]">{rt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Informe AI */}
          <button onClick={handleReport} disabled={reportLoading}
            className="glass-card p-5 text-left hover:border-orange-500/30 transition-all group">
            <div className="flex items-center gap-3 mb-2">
              {reportLoading ? <Loader2 className="w-5 h-5 animate-spin text-orange-400" /> : <Sparkles className="w-5 h-5 text-orange-400 group-hover:scale-110 transition" />}
              <span className="font-semibold text-sm">{reportLoading ? "Generando..." : "Informe IA semanal"}</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">Resumen narrativo generado por Gemini</p>
          </button>

          {/* Chat */}
          <button onClick={() => setShowChat(!showChat)}
            className="glass-card p-5 text-left hover:border-purple-500/30 transition-all group">
            <div className="flex items-center gap-3 mb-2">
              <MessageSquarePlus className="w-5 h-5 text-purple-400 group-hover:scale-110 transition" />
              <span className="font-semibold text-sm">{showChat ? "Cerrar chat" : "Chat con el agente"}</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">Pregunta lo que quieras sobre tus emails y facturas</p>
          </button>
        </div>
      </div>

      {/* ═══ SECTION: Mantenimiento ═══ */}
      <div>
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Mantenimiento</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Limpieza inteligente */}
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

          {/* Protected notice */}
          <div className="glass-card p-5 text-left border-[var(--border)]">
            <div className="flex items-center gap-3 mb-2">
              <ShieldAlert className="w-5 h-5 text-blue-400" />
              <span className="font-semibold text-sm">Protección activa</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Los emails de Facturas, Clientes, Proveedores, Legal y RRHH <strong className="text-[var(--text-primary)]">nunca se eliminan</strong>. Solo se mueven a la papelera de Gmail (recuperable 30 días).
            </p>
          </div>
        </div>
      </div>

      {/* ═══ CLEANUP MODAL ═══ */}
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

      {/* Chat panel */}
      {showChat && (
        <div className="animate-fade-in">
          <AgentChat />
        </div>
      )}

      {/* Weekly report */}
      {report && (
        <div className="glass-card p-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-orange-400" />
            <h3 className="font-semibold text-sm">Informe Semanal IA</h3>
          </div>
          <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
            {report}
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
    </div>
  );
}
