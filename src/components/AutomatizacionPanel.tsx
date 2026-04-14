"use client";

import { useState } from "react";
import { Zap, FileText, Sparkles, Send, Loader2, BookTemplate } from "lucide-react";

interface Result {
  message: string;
  success: boolean;
}

export default function AutomatizacionPanel() {
  const [categorizing, setCategorizing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const [catResult, setCatResult] = useState<Result | null>(null);
  const [extractResult, setExtractResult] = useState<Result | null>(null);
  const [repairResult, setRepairResult] = useState<Result | null>(null);
  const [draftResult, setDraftResult] = useState<Result | null>(null);
  const [templatesResult, setTemplatesResult] = useState<Result | null>(null);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; category: string }> | null>(null);

  const handleCategorize = async () => {
    setCategorizing(true); setCatResult(null);
    try {
      const res = await fetch("/api/agent/categorize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      setCatResult({ message: `${data.categorized || 0}/${data.processed || 0} emails categorizados`, success: res.ok });
    } catch { setCatResult({ message: "Error al categorizar", success: false }); }
    finally { setCategorizing(false); }
  };

  const handleExtractInvoices = async () => {
    setExtracting(true); setExtractResult(null);
    try {
      const res = await fetch("/api/agent/invoice-extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch: true }) });
      const data = await res.json();
      setExtractResult({ message: `${data.extracted || 0}/${data.processed || 0} facturas extraídas`, success: res.ok });
    } catch { setExtractResult({ message: "Error al extraer", success: false }); }
    finally { setExtracting(false); }
  };

  const handleRepair = async () => {
    setRepairing(true); setRepairResult(null);
    try {
      setRepairResult({ message: "1/4 Descargando bodies...", success: true });
      const r1 = await fetch("/api/sync/refetch-bodies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "FACTURA" }) });
      const d1 = await r1.json();
      setRepairResult({ message: `2/4 Limpiando facturas (${d1.updated || 0} bodies)...`, success: true });
      await fetch("/api/agent/invoice-extract", { method: "DELETE" });
      setRepairResult({ message: "3/4 Re-extrayendo de emails...", success: true });
      const r3 = await fetch("/api/agent/invoice-extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch: true }) });
      const d3 = await r3.json();
      setRepairResult({ message: "4/4 Procesando PDFs adjuntos...", success: true });
      const r4 = await fetch("/api/agent/invoice-pdf-extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d4 = await r4.json();
      setRepairResult({ message: `✓ ${d1.updated || 0} bodies · ${d3.extracted || 0} emails · ${d4.extracted || 0} PDFs`, success: true });
    } catch { setRepairResult({ message: "Error durante la reparación", success: false }); }
    finally { setRepairing(false); }
  };

  const handleAutoDrafts = async () => {
    setDrafting(true); setDraftResult(null);
    try {
      const res = await fetch("/api/agent/auto-drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tone: "profesional" }) });
      const data = await res.json();
      setDraftResult({ message: `${data.drafted || 0} borradores creados en Gmail (${data.errors || 0} errores)`, success: res.ok });
    } catch { setDraftResult({ message: "Error generando borradores", success: false }); }
    finally { setDrafting(false); }
  };

  const handleLoadTemplates = async () => {
    setTemplatesLoading(true); setTemplatesResult(null);
    try {
      const res = await fetch("/api/agent/templates");
      const data = await res.json();
      setTemplates(data.templates || []);
      setTemplatesResult({ message: `${data.templates?.length || 0} plantillas disponibles`, success: res.ok });
    } catch { setTemplatesResult({ message: "Error cargando plantillas", success: false }); }
    finally { setTemplatesLoading(false); }
  };

  const Card = ({
    icon: Icon, color, title, desc, loading, onClick, result,
  }: {
    icon: typeof Zap; color: string; title: string; desc: string; loading: boolean; onClick: () => void; result: Result | null;
  }) => (
    <button
      onClick={onClick}
      disabled={loading}
      className={`glass-card p-5 text-left hover:border-${color}-500/30 transition-all group disabled:opacity-60`}
    >
      <div className="flex items-center gap-3 mb-2">
        {loading ? <Loader2 className={`w-5 h-5 animate-spin text-${color}-400`} /> : <Icon className={`w-5 h-5 text-${color}-400 group-hover:scale-110 transition`} />}
        <span className="font-semibold text-sm">{title}</span>
      </div>
      <p className="text-xs text-[var(--text-secondary)]">{desc}</p>
      {result && (
        <div className={`mt-2 text-xs ${result.success ? "text-green-400" : "text-red-400"}`}>
          {result.message}
        </div>
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Procesamiento IA</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card icon={Zap} color="sinergia" title="Categorizar emails" desc="Procesar emails sin categorizar con Gemini" loading={categorizing} onClick={handleCategorize} result={catResult} />
          <Card icon={FileText} color="yellow" title="Extraer facturas" desc="Extraer datos (email + PDFs adjuntos)" loading={extracting} onClick={handleExtractInvoices} result={extractResult} />
          <Card icon={Sparkles} color="emerald" title="Reparación completa" desc="Re-descargar + re-extraer todo el flujo" loading={repairing} onClick={handleRepair} result={repairResult} />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Respuestas automáticas</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card icon={Send} color="indigo" title="Auto-borradores" desc="Crear borradores para clientes y proveedores" loading={drafting} onClick={handleAutoDrafts} result={draftResult} />
          <Card icon={BookTemplate} color="pink" title="Plantillas de respuesta" desc="Ver y aplicar plantillas predefinidas" loading={templatesLoading} onClick={handleLoadTemplates} result={templatesResult} />
        </div>
      </div>

      {templates && templates.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="font-semibold text-sm mb-4">Plantillas disponibles</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-card)]">
                <BookTemplate className="w-4 h-4 text-pink-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{t.name}</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">{t.category}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
