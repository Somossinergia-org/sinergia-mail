"use client";

import { useState, useEffect } from "react";
import { Zap, FileText, Sparkles, Send, Loader2, BookTemplate, Mail, X, Check } from "lucide-react";

interface Result {
  message: string;
  success: boolean;
}

interface Template {
  id: string;
  category: string;
  name: string;
  subject: string;
  body: string;
}

interface PendingEmail {
  id: number;
  from: string;
  subject: string;
  category: string | null;
  snippet: string | null;
}

export default function AutomatizacionPanel() {
  const [categorizing, setCategorizing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const [catResult, setCatResult] = useState<Result | null>(null);
  const [extractResult, setExtractResult] = useState<Result | null>(null);
  const [repairResult, setRepairResult] = useState<Result | null>(null);
  const [draftResult, setDraftResult] = useState<Result | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [pendingEmails, setPendingEmails] = useState<PendingEmail[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState<Template | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);

  // Load templates and pending emails on mount
  useEffect(() => {
    fetch("/api/agent/templates").then((r) => r.json()).then((d) => setTemplates(d.templates || []));
    fetch("/api/agent/auto-drafts").then((r) => r.json()).then((d) => setPendingEmails(d.emails || []));
  }, []);

  const refreshPending = async () => {
    const r = await fetch("/api/agent/auto-drafts");
    const d = await r.json();
    setPendingEmails(d.emails || []);
  };

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
      await refreshPending();
    } catch { setDraftResult({ message: "Error generando borradores", success: false }); }
    finally { setDrafting(false); }
  };

  const handleApplyTemplate = async (emailId: number) => {
    if (!showTemplateModal) return;
    setApplying(true); setApplyResult(null);
    try {
      const res = await fetch("/api/agent/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: showTemplateModal.id, emailId }),
      });
      const data = await res.json();
      if (res.ok) {
        setApplyResult(`✓ Borrador creado en Gmail para "${data.subject}"`);
        await refreshPending();
        setTimeout(() => { setShowTemplateModal(null); setApplyResult(null); }, 2000);
      } else {
        setApplyResult(`Error: ${data.error || "Desconocido"}`);
      }
    } catch { setApplyResult("Error de red"); }
    finally { setApplying(false); }
  };

  const filteredEmailsForTemplate = showTemplateModal
    ? pendingEmails.filter((e) => showTemplateModal.category === "FACTURA"
        ? e.category === "FACTURA"
        : showTemplateModal.category === "CLIENTE"
          ? e.category === "CLIENTE"
          : e.category === "PROVEEDOR")
    : [];

  return (
    <div className="space-y-6">
      {/* Procesamiento IA */}
      <div>
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Procesamiento IA</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button onClick={handleCategorize} disabled={categorizing}
            className="glass-card p-5 text-left hover:border-sinergia-500/30 transition-all group disabled:opacity-60">
            <div className="flex items-center gap-3 mb-2">
              {categorizing ? <Loader2 className="w-5 h-5 animate-spin text-sinergia-400" /> : <Zap className="w-5 h-5 text-sinergia-400 group-hover:scale-110 transition" />}
              <span className="font-semibold text-sm">Categorizar emails</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">Procesar emails sin categorizar con Gemini</p>
            {catResult && <div className={`mt-2 text-xs ${catResult.success ? "text-green-400" : "text-red-400"}`}>{catResult.message}</div>}
          </button>

          <button onClick={handleExtractInvoices} disabled={extracting}
            className="glass-card p-5 text-left hover:border-yellow-500/30 transition-all group disabled:opacity-60">
            <div className="flex items-center gap-3 mb-2">
              {extracting ? <Loader2 className="w-5 h-5 animate-spin text-yellow-400" /> : <FileText className="w-5 h-5 text-yellow-400 group-hover:scale-110 transition" />}
              <span className="font-semibold text-sm">Extraer facturas</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">Extraer datos (email + PDFs adjuntos)</p>
            {extractResult && <div className={`mt-2 text-xs ${extractResult.success ? "text-green-400" : "text-red-400"}`}>{extractResult.message}</div>}
          </button>

          <button onClick={handleRepair} disabled={repairing}
            className="glass-card p-5 text-left hover:border-emerald-500/30 transition-all group disabled:opacity-60">
            <div className="flex items-center gap-3 mb-2">
              {repairing ? <Loader2 className="w-5 h-5 animate-spin text-emerald-400" /> : <Sparkles className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition" />}
              <span className="font-semibold text-sm">Reparación completa</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">Re-descargar + re-extraer todo el flujo</p>
            {repairResult && <div className={`mt-2 text-xs ${repairResult.success ? "text-emerald-400" : "text-red-400"}`}>{repairResult.message}</div>}
          </button>
        </div>
      </div>

      {/* Respuestas automáticas */}
      <div>
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Respuestas automáticas</h3>
        <button onClick={handleAutoDrafts} disabled={drafting}
          className="w-full glass-card p-5 text-left hover:border-indigo-500/30 transition-all group disabled:opacity-60">
          <div className="flex items-center gap-3 mb-2">
            {drafting ? <Loader2 className="w-5 h-5 animate-spin text-indigo-400" /> : <Send className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition" />}
            <span className="font-semibold text-sm">Auto-borradores con IA</span>
            <span className="ml-auto text-xs text-[var(--text-secondary)]">{pendingEmails.length} pendientes</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">Gemini redacta borradores para emails CLIENTE, PROVEEDOR y FACTURA sin leer</p>
          {draftResult && <div className={`mt-2 text-xs ${draftResult.success ? "text-green-400" : "text-red-400"}`}>{draftResult.message}</div>}
        </button>
      </div>

      {/* Plantillas */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Plantillas de respuesta</h3>
          <span className="text-[10px] text-[var(--text-secondary)]">Click para aplicar a un email</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => {
            const categoryColor =
              t.category === "CLIENTE" ? "green" :
              t.category === "PROVEEDOR" ? "blue" :
              "yellow";
            return (
              <button
                key={t.id}
                onClick={() => setShowTemplateModal(t)}
                className={`glass-card p-4 text-left hover:border-pink-500/30 transition-all group`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <BookTemplate className="w-4 h-4 text-pink-400 flex-shrink-0" />
                  <span className="font-semibold text-xs">{t.name}</span>
                </div>
                <div className={`text-[10px] text-${categoryColor}-400 mb-2`}>{t.category}</div>
                <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">{t.subject}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Template modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !applying && setShowTemplateModal(null)}>
          <div className="glass-card p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <BookTemplate className="w-4 h-4 text-pink-400" />
                  {showTemplateModal.name}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Categoría: {showTemplateModal.category}
                </p>
              </div>
              <button onClick={() => !applying && setShowTemplateModal(null)} className="p-1 rounded hover:bg-[var(--bg-card)]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4 p-3 rounded-lg bg-[var(--bg-card)] text-xs whitespace-pre-wrap">
              <div className="font-semibold mb-2">Asunto: {showTemplateModal.subject}</div>
              <div className="text-[var(--text-secondary)]">{showTemplateModal.body}</div>
            </div>

            <div className="mb-2">
              <p className="text-xs text-[var(--text-secondary)] mb-2">
                Selecciona un email {showTemplateModal.category} para aplicar esta plantilla (se creará un borrador en Gmail):
              </p>
              {filteredEmailsForTemplate.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)] py-4 text-center">
                  No hay emails {showTemplateModal.category} pendientes de respuesta
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredEmailsForTemplate.map((email) => (
                    <button
                      key={email.id}
                      onClick={() => handleApplyTemplate(email.id)}
                      disabled={applying}
                      className="w-full flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-card)] hover:bg-pink-500/10 transition text-left disabled:opacity-60"
                    >
                      <Mail className="w-4 h-4 text-pink-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{email.from}</div>
                        <div className="text-[10px] text-[var(--text-secondary)] truncate">{email.subject}</div>
                      </div>
                      {applying ? (
                        <Loader2 className="w-4 h-4 animate-spin text-pink-400" />
                      ) : (
                        <Check className="w-4 h-4 text-pink-400 opacity-0 group-hover:opacity-100" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {applyResult && (
              <div className={`mt-3 text-xs px-3 py-2 rounded ${applyResult.startsWith("✓") ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                {applyResult}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
