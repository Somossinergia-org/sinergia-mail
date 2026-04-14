"use client";

import { useState } from "react";
import { FileSpreadsheet, Download, Loader2, Sparkles, CheckCircle2, FileText, Wallet, BarChart3, Mail } from "lucide-react";

const REPORT_TYPES: Array<{
  value: string;
  label: string;
  desc: string;
  icon: typeof FileText;
  color: string;
}> = [
  { value: "executive", label: "Resumen Ejecutivo", desc: "Vista general de emails + facturas + top proveedores", icon: BarChart3, color: "teal" },
  { value: "invoices", label: "Informe de Facturas", desc: "Listado completo con desglose IVA y totales por categoría", icon: FileText, color: "yellow" },
  { value: "expenses", label: "Análisis de Gastos", desc: "Gastos recurrentes, por categoría y tendencia mensual", icon: Wallet, color: "violet" },
  { value: "emails", label: "Informe de Emails", desc: "Listado de emails con estadísticas por categoría y prioridad", icon: Mail, color: "sinergia" },
];

export default function InformesPanel() {
  const [generating, setGenerating] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Record<string, string>>({});
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const handleExcel = async (type: string) => {
    setGenerating(type);
    try {
      const res = await fetch("/api/agent/report-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error("Error");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename = `sinergia-${type}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setGenerated((prev) => ({ ...prev, [type]: `Descargado ${(blob.size / 1024).toFixed(1)} KB` }));
    } catch { setGenerated((prev) => ({ ...prev, [type]: "Error" })); }
    finally { setGenerating(null); }
  };

  const handleAiReport = async () => {
    setAiLoading(true); setAiReport(null);
    try {
      const res = await fetch("/api/agent/report");
      const data = await res.json();
      setAiReport(data.report || "Sin datos");
    } catch { setAiReport("Error generando informe"); }
    finally { setAiLoading(false); }
  };

  return (
    <div className="space-y-6">
      {/* Excel reports grid */}
      <div>
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Informes Excel profesionales</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {REPORT_TYPES.map((rt) => (
            <button
              key={rt.value}
              onClick={() => handleExcel(rt.value)}
              disabled={generating !== null}
              className={`glass-card p-5 text-left hover:border-${rt.color}-500/30 transition-all group disabled:opacity-60`}
            >
              <div className="flex items-start gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg bg-${rt.color}-500/10 flex items-center justify-center flex-shrink-0`}>
                  {generating === rt.value ? (
                    <Loader2 className={`w-5 h-5 animate-spin text-${rt.color}-400`} />
                  ) : (
                    <rt.icon className={`w-5 h-5 text-${rt.color}-400 group-hover:scale-110 transition`} />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{rt.label}</span>
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{rt.desc}</p>
                  {generated[rt.value] && (
                    <div className={`mt-2 text-xs flex items-center gap-1 ${generated[rt.value].includes("Error") ? "text-red-400" : "text-green-400"}`}>
                      <CheckCircle2 className="w-3 h-3" /> {generated[rt.value]}
                    </div>
                  )}
                </div>
                <Download className={`w-4 h-4 text-${rt.color}-400 flex-shrink-0`} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* AI Report */}
      <div>
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Análisis IA narrativo</h3>
        <button
          onClick={handleAiReport}
          disabled={aiLoading}
          className="w-full glass-card p-5 text-left hover:border-orange-500/30 transition-all group disabled:opacity-60"
        >
          <div className="flex items-center gap-3 mb-2">
            {aiLoading ? <Loader2 className="w-5 h-5 animate-spin text-orange-400" /> : <Sparkles className="w-5 h-5 text-orange-400 group-hover:scale-110 transition" />}
            <span className="font-semibold text-sm">{aiLoading ? "Generando informe..." : "Informe IA semanal"}</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">Resumen narrativo generado por Gemini sobre la actividad reciente</p>
        </button>
      </div>

      {aiReport && (
        <div className="glass-card p-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-orange-400" />
            <h3 className="font-semibold text-sm">Informe Semanal IA</h3>
          </div>
          <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
            {aiReport}
          </div>
        </div>
      )}
    </div>
  );
}
