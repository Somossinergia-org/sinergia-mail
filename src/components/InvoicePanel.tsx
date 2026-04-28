"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  Download,
  Euro,
  Calendar,
  Building2,
  Filter,
  Camera,
  Eye,
  Trash2,
  X,
  ExternalLink,
  Loader2,
  Search,
  Cloud,
} from "lucide-react";
import PhotoCapture from "./PhotoCapture";
import { toast } from "sonner";

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
  pdfGmailAttachmentId?: string | null;
  emailId?: number | null;
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
  onChanged?: () => void;
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
  onChanged,
}: InvoicePanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showPhotoAdd, setShowPhotoAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Listener para FAB cámara contextual del bottom nav (mobile)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpenPhoto = () => {
      setShowPhotoAdd(true);
      // Scroll suave al inicio para que se vea el capturador
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("sinergia:open-invoice-photo", onOpenPhoto);
    return () => window.removeEventListener("sinergia:open-invoice-photo", onOpenPhoto);
  }, []);

  // ESC cierra el modal de preview PDF
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const handlePhotoExtract = async (data: Record<string, unknown>) => {
    toast.info("Datos extraídos. Guardando…");
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: data.invoiceNumber,
          issuerName: data.issuerName,
          issuerNif: data.issuerNif,
          concept: data.concept,
          amount: data.subtotal,
          tax: data.tax,
          totalAmount: data.totalAmount,
          currency: data.currency || "EUR",
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          category: data.category,
        }),
      });
      if (res.ok) {
        toast.success(`Factura "${data.issuerName}" añadida`);
        setShowPhotoAdd(false);
        if (onChanged) onChanged();
        else setTimeout(() => window.location.reload(), 600);
      } else {
        const e = await res.json();
        toast.error(e.error || "No se pudo guardar");
      }
    } catch {
      toast.error("Error de red");
    }
  };

  const hasPdf = (inv: Invoice) =>
    Boolean(inv.pdfGmailAttachmentId && inv.emailId);

  const openPreview = (inv: Invoice) => {
    if (!hasPdf(inv)) {
      toast.info(
        "Esta factura no tiene PDF adjunto (creada manualmente o por foto).",
      );
      return;
    }
    setPreview(inv);
  };

  const downloadOne = async (inv: Invoice) => {
    if (!hasPdf(inv)) {
      toast.info("Esta factura no tiene PDF descargable.");
      return;
    }
    setBusyId(inv.id);
    try {
      const res = await fetch(`/api/invoices/${inv.id}/pdf?mode=download`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "No se pudo descargar");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        inv.pdfFilename?.replace(/[^a-zA-Z0-9._ -]/g, "_") ||
        `factura_${inv.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF descargado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  };

  const openInNewTab = (inv: Invoice) => {
    if (!hasPdf(inv)) {
      toast.info("Sin PDF adjunto.");
      return;
    }
    window.open(`/api/invoices/${inv.id}/pdf?mode=inline`, "_blank");
  };

  const saveToDriveOne = async (inv: Invoice) => {
    if (!hasPdf(inv)) {
      toast.info("Sin PDF disponible para guardar en Drive.");
      return;
    }
    setBusyId(inv.id);
    const t = toast.loading("Subiendo a Drive…");
    try {
      const res = await fetch(`/api/invoices/${inv.id}/drive`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsReauth) {
          toast.error("Falta permiso de Drive — cierra sesión y vuelve a entrar", { id: t });
        } else {
          toast.error(data.error || "Error subiendo a Drive", { id: t });
        }
        return;
      }
      toast.success(
        <span>
          Guardado en Drive ·{" "}
          <a
            href={data.driveLink}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-sinergia-300"
          >
            ver archivo
          </a>
        </span>,
        { id: t, duration: 6000 },
      );
    } catch {
      toast.error("Error de red", { id: t });
    } finally {
      setBusyId(null);
    }
  };

  const deleteOne = async (inv: Invoice) => {
    if (!confirm(
      `¿Eliminar la factura "${inv.issuerName || "sin emisor"}" — ${inv.invoiceNumber || "s/n"}?\n\nEsta acción no se puede deshacer.`,
    )) return;
    setBusyId(inv.id);
    try {
      const res = await fetch(`/api/invoices/${inv.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "No se pudo eliminar");
      }
      toast.success("Factura eliminada");
      if (onChanged) onChanged();
      else window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = invoices.filter((inv) => {
    if (selectedCategory && inv.category !== selectedCategory) return false;
    if (!normalizedQuery) return true;
    const hay = [
      inv.issuerName,
      inv.issuerNif,
      inv.invoiceNumber,
      inv.concept,
      inv.category,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(normalizedQuery);
  });

  const fmt = (n: number | null) =>
    (n ?? 0).toLocaleString("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="space-y-6">
      {/* Quick action: photo capture */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button
          onClick={() => setShowPhotoAdd(!showPhotoAdd)}
          className="text-xs px-4 py-2.5 rounded-xl bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 flex items-center gap-2 min-h-[44px] font-medium"
        >
          <Camera className="w-4 h-4" />
          {showPhotoAdd ? "Cerrar" : "Añadir factura por foto"}
        </button>
        <div className="text-xs text-[var(--text-secondary)]">
          {filtered.length} de {invoices.length} facturas
        </div>
      </div>
      {showPhotoAdd && (
        <PhotoCapture
          mode="invoice"
          accent="teal"
          label="Captura una factura recibida"
          onExtract={handlePhotoExtract}
        />
      )}

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

      {/* Search */}
      <div className="glass-card p-3 relative">
        <Search className="w-4 h-4 absolute left-6 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca por emisor, CIF, nº factura o concepto…"
          className="pl-10 pr-3 py-2 w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-teal-500 transition"
        />
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
                selectedCategory === cat.category ? null : cat.category!,
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

      {/* Bulk download */}
      <button
        onClick={() => onDownloadZip(selectedCategory || undefined)}
        className="btn-accent text-sm flex items-center gap-2"
      >
        <Download className="w-4 h-4" />
        Descargar ZIP{selectedCategory ? ` (${selectedCategory})` : " (Todas)"}
      </button>

      {/* Invoice list */}
      <div className="space-y-2">
        {filtered.map((inv) => {
          const isBusy = busyId === inv.id;
          const withPdf = hasPdf(inv);
          return (
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
                <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                    {inv.category || "OTROS"}
                  </span>
                  {!withPdf && (
                    <span className="badge text-[10px] bg-amber-500/10 text-amber-400">
                      Sin PDF
                    </span>
                  )}
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

              <div className="flex-shrink-0 flex flex-col items-end gap-2">
                <div className="text-right">
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

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openPreview(inv)}
                    disabled={!withPdf || isBusy}
                    title={withPdf ? "Ver PDF" : "Sin PDF disponible"}
                    className="min-w-[36px] min-h-[36px] rounded-lg bg-sinergia-500/10 text-sinergia-400 hover:bg-sinergia-500/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => downloadOne(inv)}
                    disabled={!withPdf || isBusy}
                    title={withPdf ? "Descargar PDF" : "Sin PDF disponible"}
                    className="min-w-[36px] min-h-[36px] rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition"
                  >
                    {isBusy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => saveToDriveOne(inv)}
                    disabled={!withPdf || isBusy}
                    title={withPdf ? "Guardar en Google Drive" : "Sin PDF disponible"}
                    className="min-w-[36px] min-h-[36px] rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition"
                  >
                    <Cloud className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteOne(inv)}
                    disabled={isBusy}
                    title="Eliminar factura"
                    className="min-w-[36px] min-h-[36px] rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-30 flex items-center justify-center transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{query ? `Sin resultados para "${query}"` : "No hay facturas para esta categoría"}</p>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="glass-card w-full max-w-4xl h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">
                  {preview.issuerName || "Emisor desconocido"} — {preview.invoiceNumber || "s/n"}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] truncate">
                  {preview.pdfFilename}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openInNewTab(preview)}
                  title="Abrir en pestaña nueva"
                  className="min-w-[40px] min-h-[40px] rounded-lg hover:bg-[var(--bg-card)] flex items-center justify-center"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
                <button
                  onClick={() => downloadOne(preview)}
                  title="Descargar"
                  className="min-w-[40px] min-h-[40px] rounded-lg hover:bg-[var(--bg-card)] flex items-center justify-center"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPreview(null)}
                  title="Cerrar"
                  className="min-w-[40px] min-h-[40px] rounded-lg hover:bg-[var(--bg-card)] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <iframe
              src={`/api/invoices/${preview.id}/pdf?mode=inline`}
              className="flex-1 w-full rounded-b-xl bg-white"
              title="Vista previa PDF"
            />
          </div>
        </div>
      )}
    </div>
  );
}
