"use client";

import { useState, useRef } from "react";
import { Zap, Upload, FileText, AlertTriangle, CheckCircle2, TrendingDown, Activity } from "lucide-react";
import { toast } from "sonner";

interface ParsedBill {
  comercializadora: string | null;
  cups: string | null;
  tarifa: string | null;
  periodoFacturacion: { desde: string | null; hasta: string | null; dias: number | null };
  potencias: number[];
  consumos: number[];
  preciosEnergia: number[];
  importePotencia: number | null;
  importeEnergia: number | null;
  importeTotal: number | null;
  tieneReactiva: boolean;
  impuestoElectrico: number | null;
  iva: number | null;
  alquilerContador: number | null;
  modalidad: string | null;
  confianza: number;
  camposExtraidos: string[];
  advertencias: string[];
}

export default function BillParserPanel() {
  const [result, setResult] = useState<ParsedBill | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parse = async (file: File) => {
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/bill-parser", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
        toast.success(`Factura parseada — confianza ${data.data.confianza}%`);
      } else {
        toast.error(data.error || "Error al parsear");
      }
    } catch { toast.error("Error de conexión"); } finally { setLoading(false); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parse(file);
  };

  const fmt = (n: number | null) => n != null ? n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €" : "—";
  const fmtKw = (arr: number[]) => arr.length > 0 ? arr.map(v => v.toLocaleString("es-ES")).join(" / ") + " kW" : "—";
  const fmtKwh = (arr: number[]) => arr.length > 0 ? arr.map(v => v.toLocaleString("es-ES")).join(" / ") + " kWh" : "—";

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
          <Activity className="w-4.5 h-4.5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Analizador de Facturas Energéticas</h3>
          <p className="text-[11px] text-[var(--text-secondary)]">20+ comercializadoras españolas · Regex + Gemini AI</p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`mx-5 my-4 p-6 rounded-xl border-2 border-dashed transition-colors cursor-pointer text-center ${
          dragOver ? "border-emerald-500 bg-emerald-500/10" : "border-[var(--border)] hover:border-emerald-500/50"
        }`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={e => e.target.files?.[0] && parse(e.target.files[0])} />
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-emerald-400">Analizando factura...</p>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-[var(--text-secondary)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-secondary)]">Arrastra un PDF de factura eléctrica o haz clic</p>
            <p className="text-[10px] text-[var(--text-secondary)] mt-1">Endesa · Iberdrola · Naturgy · Repsol · EDP · Holaluz · +15 más</p>
          </>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="px-5 pb-4 space-y-3">
          {/* Confidence bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-[var(--bg-primary)] overflow-hidden">
              <div className={`h-full rounded-full transition-all ${result.confianza >= 75 ? "bg-emerald-400" : result.confianza >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                style={{ width: `${result.confianza}%` }} />
            </div>
            <span className={`text-xs font-semibold ${result.confianza >= 75 ? "text-emerald-400" : result.confianza >= 50 ? "text-amber-400" : "text-red-400"}`}>
              {result.confianza}%
            </span>
          </div>

          {/* Main data grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="Comercializadora" value={result.comercializadora || "—"} icon={<FileText className="w-3 h-3" />} />
            <Stat label="CUPS" value={result.cups?.substring(0, 20) || "—"} icon={<Zap className="w-3 h-3" />} />
            <Stat label="Tarifa" value={result.tarifa || "—"} icon={<Activity className="w-3 h-3" />} />
            <Stat label="Modalidad" value={result.modalidad || "—"} icon={<TrendingDown className="w-3 h-3" />} />
            <Stat label="Potencias" value={fmtKw(result.potencias)} />
            <Stat label="Consumos" value={fmtKwh(result.consumos)} />
            <Stat label="Periodo" value={result.periodoFacturacion.desde && result.periodoFacturacion.hasta ? `${result.periodoFacturacion.desde} → ${result.periodoFacturacion.hasta} (${result.periodoFacturacion.dias}d)` : "—"} />
            <Stat label="Importe Total" value={fmt(result.importeTotal)} highlight />
            <Stat label="Potencia" value={fmt(result.importePotencia)} />
            <Stat label="Energía" value={fmt(result.importeEnergia)} />
            <Stat label="Impuesto Eléctrico" value={fmt(result.impuestoElectrico)} />
            <Stat label="IVA" value={fmt(result.iva)} />
          </div>

          {/* Warnings */}
          {result.advertencias.length > 0 && (
            <div className="mt-2 space-y-1">
              {result.advertencias.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px] text-amber-400">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon, highlight }: { label: string; value: string; icon?: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`p-2 rounded-lg ${highlight ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-[var(--bg-primary)]/50"}`}>
      <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1">{icon}{label}</div>
      <div className={`text-xs font-medium mt-0.5 truncate ${highlight ? "text-emerald-400" : ""}`}>{value}</div>
    </div>
  );
}
