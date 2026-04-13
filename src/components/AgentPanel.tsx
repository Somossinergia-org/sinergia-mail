"use client";

import { useState, useEffect } from "react";
import {
  Bot,
  Zap,
  FileSearch,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Settings2,
  MessageSquarePlus,
  Sparkles,
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

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  categorize: { label: "Categorizar", color: "text-blue-400" },
  summarize: { label: "Resumir", color: "text-green-400" },
  draft: { label: "Borrador", color: "text-purple-400" },
  extract: { label: "Factura", color: "text-yellow-400" },
  "pdf-extract": { label: "PDF", color: "text-amber-400" },
  chat: { label: "Chat", color: "text-cyan-400" },
  report: { label: "Informe", color: "text-orange-400" },
};

export default function AgentPanel() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [categorizing, setCategorizing] = useState(false);
  const [catResult, setCatResult] = useState<{
    processed: number;
    categorized: number;
  } | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<{
    processed: number;
    extracted: number;
  } | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<string | null>(null);
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [pdfResult, setPdfResult] = useState<{
    extracted: number;
    processed: number;
    skipped: number;
  } | null>(null);

  // Fetch agent status
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

  // Categorize uncategorized emails
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
      // Refresh logs
      const agentRes = await fetch("/api/agent");
      const agentData = await agentRes.json();
      setLogs(agentData.recentActivity || []);
    } catch (e) {
      console.error("Error categorizing:", e);
    } finally {
      setCategorizing(false);
    }
  };

  // Extract invoices from FACTURA emails
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
      setExtractResult({
        processed: data.processed || 0,
        extracted: data.extracted || 0,
      });
      // Refresh logs
      const agentRes = await fetch("/api/agent");
      const agentData = await agentRes.json();
      setLogs(agentData.recentActivity || []);
    } catch (e) {
      console.error("Error extracting invoices:", e);
    } finally {
      setExtracting(false);
    }
  };

  // Extract invoice data from PDF attachments
  const handlePdfExtract = async () => {
    setPdfExtracting(true);
    setPdfResult(null);
    try {
      const res = await fetch("/api/agent/invoice-pdf-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setPdfResult({
        extracted: data.extracted || 0,
        processed: data.processed || 0,
        skipped: data.skipped || 0,
      });
      // Refresh logs
      const agentRes = await fetch("/api/agent");
      const agentData = await agentRes.json();
      setLogs(agentData.recentActivity || []);
    } catch (e) {
      console.error("Error extracting PDFs:", e);
    } finally {
      setPdfExtracting(false);
    }
  };

  // Repair: re-fetch bodies + re-extract invoices + PDF extraction
  const handleRepair = async () => {
    setRepairing(true);
    setRepairResult(null);
    try {
      // Step 1: Re-fetch empty bodies from Gmail
      setRepairResult("Paso 1/4: Descargando bodies de Gmail...");
      const refetchRes = await fetch("/api/sync/refetch-bodies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "FACTURA" }),
      });
      const refetchData = await refetchRes.json();

      // Step 2: Delete existing invoices so we can re-extract
      setRepairResult(`Paso 2/4: ${refetchData.updated || 0} bodies actualizados. Eliminando facturas antiguas...`);
      const deleteRes = await fetch("/api/agent/invoice-extract", {
        method: "DELETE",
      });
      await deleteRes.json();

      // Step 3: Re-extract all invoices from email bodies
      setRepairResult("Paso 3/4: Re-extrayendo facturas de emails...");
      const extractRes = await fetch("/api/agent/invoice-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: true }),
      });
      const extractData = await extractRes.json();

      // Step 4: Extract from PDF attachments for invoices still missing amounts
      setRepairResult(`Paso 4/4: Extrayendo datos de ${extractData.extracted || 0} facturas. Procesando PDFs adjuntos...`);
      const pdfRes = await fetch("/api/agent/invoice-pdf-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const pdfData = await pdfRes.json();

      setRepairResult(
        `Completado: ${refetchData.updated || 0} bodies, ${extractData.extracted || 0} facturas de email, ${pdfData.extracted || 0} facturas de PDF`
      );

      // Refresh logs
      const agentRes = await fetch("/api/agent");
      const agentData = await agentRes.json();
      setLogs(agentData.recentActivity || []);
    } catch (e) {
      console.error("Error repairing:", e);
      setRepairResult("Error durante la reparación");
    } finally {
      setRepairing(false);
    }
  };

  // Generate weekly report
  const handleReport = async () => {
    setReportLoading(true);
    try {
      const res = await fetch("/api/agent/report");
      const data = await res.json();
      setReport(data.report);
    } catch (e) {
      console.error("Error generating report:", e);
    } finally {
      setReportLoading(false);
    }
  };

  // Update config
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
  const avgDuration =
    logs.length > 0
      ? Math.round(
          logs.reduce((s, l) => s + (l.durationMs || 0), 0) / logs.length
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Agent stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-sinergia-600/15 flex items-center justify-center text-sinergia-400">
              <Bot className="w-5 h-5" />
            </div>
          </div>
          <div className="stat-number text-xl mb-1">{logs.length}</div>
          <div className="text-xs text-[var(--text-secondary)]">
            Acciones recientes
          </div>
        </div>

        <div className="glass-card p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-green-400/10 flex items-center justify-center text-green-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="stat-number text-xl mb-1">{successCount}</div>
          <div className="text-xs text-[var(--text-secondary)]">Exitosas</div>
        </div>

        <div className="glass-card p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-red-400/10 flex items-center justify-center text-red-400">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="stat-number text-xl mb-1">{errorCount}</div>
          <div className="text-xs text-[var(--text-secondary)]">Errores</div>
        </div>

        <div className="glass-card p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-400/10 flex items-center justify-center text-cyan-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="stat-number text-xl mb-1">{avgDuration}ms</div>
          <div className="text-xs text-[var(--text-secondary)]">
            Tiempo medio
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <button
          onClick={handleCategorize}
          disabled={categorizing}
          className="glass-card p-5 text-left hover:border-sinergia-500/30 transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            {categorizing ? (
              <Loader2 className="w-5 h-5 animate-spin text-sinergia-400" />
            ) : (
              <Zap className="w-5 h-5 text-sinergia-400 group-hover:scale-110 transition" />
            )}
            <span className="font-semibold text-sm">
              {categorizing ? "Categorizando..." : "Categorizar emails"}
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Procesar emails sin categorizar con Gemini AI
          </p>
          {catResult && (
            <div className="mt-2 text-xs text-green-400">
              {catResult.categorized}/{catResult.processed} emails categorizados
            </div>
          )}
        </button>

        <button
          onClick={handleExtractInvoices}
          disabled={extracting}
          className="glass-card p-5 text-left hover:border-yellow-500/30 transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            {extracting ? (
              <Loader2 className="w-5 h-5 animate-spin text-yellow-400" />
            ) : (
              <FileText className="w-5 h-5 text-yellow-400 group-hover:scale-110 transition" />
            )}
            <span className="font-semibold text-sm">
              {extracting ? "Extrayendo..." : "Extraer facturas"}
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Extraer datos de emails categorizados como Factura
          </p>
          {extractResult && (
            <div className="mt-2 text-xs text-green-400">
              {extractResult.extracted}/{extractResult.processed} facturas extraídas
            </div>
          )}
        </button>

        <button
          onClick={() => setShowChat(!showChat)}
          className="glass-card p-5 text-left hover:border-purple-500/30 transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            <MessageSquarePlus className="w-5 h-5 text-purple-400 group-hover:scale-110 transition" />
            <span className="font-semibold text-sm">
              {showChat ? "Cerrar chat" : "Chat con el agente"}
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Pregunta al agente sobre tus emails y facturas
          </p>
        </button>

        <button
          onClick={handlePdfExtract}
          disabled={pdfExtracting}
          className="glass-card p-5 text-left hover:border-amber-500/30 transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            {pdfExtracting ? (
              <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            ) : (
              <FileSearch className="w-5 h-5 text-amber-400 group-hover:scale-110 transition" />
            )}
            <span className="font-semibold text-sm">
              {pdfExtracting ? "Procesando PDFs..." : "Extraer PDFs adjuntos"}
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Descargar PDFs de Gmail y extraer importes con AI
          </p>
          {pdfResult && (
            <div className="mt-2 text-xs text-green-400">
              {pdfResult.extracted}/{pdfResult.processed} procesados ({pdfResult.skipped} sin PDF)
            </div>
          )}
        </button>

        <button
          onClick={handleRepair}
          disabled={repairing}
          className="glass-card p-5 text-left hover:border-emerald-500/30 transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            {repairing ? (
              <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
            ) : (
              <Sparkles className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition" />
            )}
            <span className="font-semibold text-sm">
              {repairing ? "Reparando..." : "Reparar facturas"}
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Re-descargar bodies + re-extraer todo con AI mejorada
          </p>
          {repairResult && (
            <div className="mt-2 text-xs text-emerald-400">
              {repairResult}
            </div>
          )}
        </button>

        <button
          onClick={handleReport}
          disabled={reportLoading}
          className="glass-card p-5 text-left hover:border-orange-500/30 transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            {reportLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
            ) : (
              <FileSearch className="w-5 h-5 text-orange-400 group-hover:scale-110 transition" />
            )}
            <span className="font-semibold text-sm">
              {reportLoading ? "Generando..." : "Informe semanal"}
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Genera un informe IA del correo de la semana
          </p>
        </button>
      </div>

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

      {/* Config toggles */}
      {config && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="w-4 h-4 text-[var(--text-secondary)]" />
            <h3 className="font-semibold text-sm">Configuración del agente</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                key: "autoCategorizeOnSync" as const,
                label: "Auto-categorizar al sincronizar",
              },
              {
                key: "autoSummarize" as const,
                label: "Auto-resumir emails nuevos",
              },
              {
                key: "weeklyReportEnabled" as const,
                label: "Informe semanal automático (lunes 9:00)",
              },
            ].map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-3 cursor-pointer group"
              >
                <div
                  onClick={() => toggleConfig(key)}
                  className={`w-10 h-5 rounded-full transition-all relative cursor-pointer ${
                    config[key]
                      ? "bg-sinergia-500"
                      : "bg-[var(--bg-card)] border border-[var(--border)]"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      config[key] ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </div>
                <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity log */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-sm mb-4">Actividad reciente</h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {logs.map((log) => {
            const actionInfo = ACTION_LABELS[log.action] || {
              label: log.action,
              color: "text-gray-400",
            };
            return (
              <div
                key={log.id}
                className="flex items-start gap-3 py-2 border-b border-[var(--border)] last:border-0"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {log.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-medium ${actionInfo.color}`}
                    >
                      {actionInfo.label}
                    </span>
                    {log.durationMs && (
                      <span className="text-[10px] text-[var(--text-secondary)]">
                        {log.durationMs}ms
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] truncate">
                    {log.outputSummary || log.inputSummary || "—"}
                  </div>
                  {log.error && (
                    <div className="text-xs text-red-400 truncate">
                      {log.error}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] flex-shrink-0">
                  {log.createdAt
                    ? new Date(log.createdAt).toLocaleString("es-ES", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "short",
                      })
                    : ""}
                </div>
              </div>
            );
          })}
          {logs.length === 0 && (
            <div className="text-center py-8 text-[var(--text-secondary)]">
              <Bot className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-xs">
                El agente aún no ha realizado ninguna acción
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
