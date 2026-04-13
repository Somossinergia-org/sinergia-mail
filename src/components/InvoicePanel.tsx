"use client";

import { useState } from "react";
import { FileText, Download, Euro, Calendar, Building2, Filter } from "lucide-react";

interface Invoice {
  id: number;
  invoiceNumber: string | null;
  issuerName: string | null;
  issuerNif: string | null;
  concept: string | null;
  amount: number | null;
  tax: number | null;
  totalAmount: number | null;
  currency: string | null;
  invoiceDate: string | null;
  pdfFilename: string | null;
  category: string | null;
  processed: boolean | null;
}

interface InvoicePanelProps {
  invoices: Invoice[];
  totals: {
    grandTotal: { totalAmount: number; totalTax: number; totalBase: number };
    byCategory: Array<{
      category: string | null;
      count: number;
      totalAmount: number;
    }>;
    byMonth: Array<{ month: string | null; totalAmount: number; count: number }>;
  };
  onDownloadZip: (category?: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  COMBUSTIBLE: "#ef4444",
  TELECOMUNICACIONES: "#3b82f6",
  ELECTRICIDAD: "#f59e0b",
  SUSCRIPCION_TECH: "#8b5cf6",
  CONTABILIDAD: "#06b6d4",
  ASESORIA: "#ec4899",
  ENERGIA_CLIENTES: "#22c55e",
  SEGURO: "#f97316",
  BANCO: "#6366f1",
  ALQUILER: "#14b8a6",
  VEHICULO: "#e11d48",
  MATERIAL: "#84cc16",
  OTROS: "#6b7280",
};

export default function InvoicePanel({
  invoices,
  totals,
  onDownloadZip,
}: InvoicePanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filtered = selectedCategory
    ? invoices.filter((i) => i.category === selectedCategory)
    : invoices;

  const fmt = (n: number | null) =>
    (n ?? 0).toLocaleString("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <div className="text-xs text-[var(--text-secondary)] mb-1">
            Base Imponible Total
          </div>
          <div className="stat-number text-lg">{fmt(totals.grandTotal.totalBase)} €</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-xs text-[var(--text-secondary)] mb-1">
            IVA Total
          </div>
          <div className="stat-number text-lg">{fmt(totals.grandTotal.totalTax)} €</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-xs text-[var(--text-secondary)] mb-1">
            Total Facturas
          </div>
          <div className="stat-number text-lg">
            {fmt(totals.grandTotal.totalAmount)} €
          </div>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`badge transition ${!selectedCategory ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-card)] text-[var(--text-secondary)]"}`}
        >
          <Filter className="w-3 h-3 mr-1" />
          Todas ({invoices.length})
        </button>
        {totals.byCategory.map((cat) => (
          <button
            key={cat.category}
            onClick={() =>
              setSelectedCategory(
                selectedCategory === cat.category ? null : cat.category!
              )
            }
            className="badge transition"
            style={{
              background:
                selectedCategory === cat.category
                  ? CATEGORY_COLORS[cat.category || "OTROS"]
                  : `${CATEGORY_COLORS[cat.category || "OTROS"]}20`,
              color:
                selectedCategory === cat.category
                  ? "white"
                  : CATEGORY_COLORS[cat.category || "OTROS"],
            }}
          >
            {cat.category} ({cat.count})
          </button>
        ))}
      </div>

      {/* Download button */}
      <button
        onClick={() => onDownloadZip(selectedCategory || undefined)}
        className="btn-accent text-sm flex items-center gap-2"
      >
        <Download className="w-4 h-4" />
        Descargar PDFs{selectedCategory ? ` (${selectedCategory})` : " (Todas)"}
      </button>

      {/* Invoice list */}
      <div className="space-y-2">
        {filtered.map((inv) => (
          <div
            key={inv.id}
            className="glass-card p-4 flex items-start gap-4"
            style={{
              borderLeft: `3px solid ${CATEGORY_COLORS[inv.category || "OTROS"]}`,
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: `${CATEGORY_COLORS[inv.category || "OTROS"]}20`,
                color: CATEGORY_COLORS[inv.category || "OTROS"],
              }}
            >
              <FileText className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm truncate">
                  {inv.issuerName || "Emisor desconocido"}
                </span>
                <span
                  className="badge text-[10px]"
                  style={{
                    background: `${CATEGORY_COLORS[inv.category || "OTROS"]}15`,
                    color: CATEGORY_COLORS[inv.category || "OTROS"],
                  }}
                >
                  {inv.category}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                {inv.invoiceNumber && (
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {inv.invoiceNumber}
                  </span>
                )}
                {inv.invoiceDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(inv.invoiceDate).toLocaleDateString("es-ES")}
                  </span>
                )}
                {inv.issuerNif && (
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    {inv.issuerNif}
                  </span>
                )}
              </div>

              {inv.concept && (
                <div className="text-xs text-[var(--text-secondary)] mt-1 truncate">
                  {inv.concept}
                </div>
              )}
            </div>

            <div className="text-right flex-shrink-0">
              <div className="font-bold text-sm flex items-center gap-1">
                <Euro className="w-3.5 h-3.5" />
                {fmt(inv.totalAmount)}
              </div>
              {inv.tax && inv.tax > 0 && (
                <div className="text-[10px] text-[var(--text-secondary)]">
                  IVA: {fmt(inv.tax)} €
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay facturas para esta categoría</p>
        </div>
      )}
    </div>
  );
}
