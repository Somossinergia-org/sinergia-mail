"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Download, Loader2, FileText, Check } from "lucide-react";
import { toast } from "sonner";

interface Concept {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

interface IssuedInvoice {
  id: number;
  number: string;
  clientName: string;
  clientNif: string | null;
  issueDate: string;
  dueDate: string | null;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  sentAt: string | null;
  paidAt: string | null;
}

interface ListResponse {
  invoices: IssuedInvoice[];
  totals: { count: number; subtotal: number; tax: number; total: number };
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FacturarPanel() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [clientName, setClientName] = useState("");
  const [clientNif, setClientNif] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [concepts, setConcepts] = useState<Concept[]>([
    { description: "", quantity: 1, unitPrice: 0, taxRate: 21 },
  ]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/issued-invoices");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const subtotal = concepts.reduce((s, c) => s + c.quantity * c.unitPrice, 0);
  const tax = concepts.reduce((s, c) => s + c.quantity * c.unitPrice * (c.taxRate / 100), 0);
  const total = subtotal + tax;

  const addConcept = () =>
    setConcepts([...concepts, { description: "", quantity: 1, unitPrice: 0, taxRate: 21 }]);
  const removeConcept = (i: number) =>
    setConcepts(concepts.filter((_, idx) => idx !== i));
  const updateConcept = (i: number, patch: Partial<Concept>) =>
    setConcepts(concepts.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const resetForm = () => {
    setClientName("");
    setClientNif("");
    setClientAddress("");
    setClientEmail("");
    setDueDate("");
    setConcepts([{ description: "", quantity: 1, unitPrice: 0, taxRate: 21 }]);
    setNotes("");
  };

  const save = async () => {
    if (!clientName.trim()) {
      toast.error("Nombre de cliente requerido");
      return;
    }
    if (concepts.some((c) => !c.description.trim() || c.unitPrice <= 0)) {
      toast.error("Todos los conceptos deben tener descripción e importe > 0");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/issued-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          clientNif: clientNif || undefined,
          clientAddress: clientAddress || undefined,
          clientEmail: clientEmail || undefined,
          issueDate,
          dueDate: dueDate || undefined,
          concepts,
          notes: notes || undefined,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(`Factura ${d.invoice.number} creada`);
        resetForm();
        setShowForm(false);
        await load();
      } else {
        toast.error(d.error || "Error");
      }
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = (id: number, number: string) => {
    const url = `/api/issued-invoices/${id}/pdf`;
    // Use a hidden anchor to trigger download (avoids popup blockers)
    const a = document.createElement("a");
    a.href = url;
    a.download = `${number}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Facturas emitidas" value={String(data?.totals.count || 0)} color="teal" />
        <StatCard label="Base imponible" value={`${fmt(data?.totals.subtotal || 0)} €`} color="sinergia" />
        <StatCard label="IVA repercutido" value={`${fmt(data?.totals.tax || 0)} €`} color="purple" />
        <StatCard label="Total facturado" value={`${fmt(data?.totals.total || 0)} €`} color="emerald" />
      </div>

      {/* Action */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {showForm ? "Nueva factura" : "Historial de facturas emitidas"}
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-accent px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          {showForm ? "Cancelar" : "Nueva factura"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="glass-card p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Nombre cliente *">
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="NIF">
              <input type="text" value={clientNif} onChange={(e) => setClientNif(e.target.value)} className="input" />
            </Field>
            <Field label="Email cliente">
              <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="input" />
            </Field>
            <Field label="Dirección">
              <input type="text" value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className="input" />
            </Field>
            <Field label="Fecha emisión">
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="input" />
            </Field>
            <Field label="Fecha vencimiento">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
            </Field>
          </div>

          {/* Concepts */}
          <div>
            <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Conceptos</div>
            <div className="space-y-2">
              {concepts.map((c, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    placeholder="Descripción"
                    value={c.description}
                    onChange={(e) => updateConcept(i, { description: e.target.value })}
                    className="input col-span-6"
                  />
                  <input
                    type="number"
                    placeholder="Cant."
                    value={c.quantity}
                    onChange={(e) => updateConcept(i, { quantity: parseFloat(e.target.value) || 0 })}
                    className="input col-span-1"
                    step="0.01"
                  />
                  <input
                    type="number"
                    placeholder="€"
                    value={c.unitPrice}
                    onChange={(e) => updateConcept(i, { unitPrice: parseFloat(e.target.value) || 0 })}
                    className="input col-span-2"
                    step="0.01"
                  />
                  <select
                    value={c.taxRate}
                    onChange={(e) => updateConcept(i, { taxRate: parseFloat(e.target.value) })}
                    className="input col-span-2"
                  >
                    <option value="0">0%</option>
                    <option value="4">4%</option>
                    <option value="10">10%</option>
                    <option value="21">21%</option>
                  </select>
                  <button
                    onClick={() => removeConcept(i)}
                    disabled={concepts.length === 1}
                    className="col-span-1 text-red-400 hover:bg-red-500/10 rounded-lg min-h-[44px] flex items-center justify-center disabled:opacity-30"
                    aria-label="Eliminar concepto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addConcept}
              className="mt-3 text-xs px-3 py-2 rounded-lg bg-sinergia-500/10 text-sinergia-400 hover:bg-sinergia-500/20 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Añadir concepto
            </button>
          </div>

          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input min-h-[64px]"
              placeholder="Notas adicionales, condiciones de pago, etc."
            />
          </Field>

          {/* Totals */}
          <div className="bg-[var(--bg-card)] rounded-xl p-4">
            <div className="flex justify-between text-sm py-1">
              <span className="text-[var(--text-secondary)]">Base imponible</span>
              <span className="font-mono">{fmt(subtotal)} €</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-[var(--text-secondary)]">IVA</span>
              <span className="font-mono">{fmt(tax)} €</span>
            </div>
            <div className="flex justify-between py-2 border-t border-[var(--border)] mt-2">
              <span className="font-semibold">TOTAL</span>
              <span className="font-bold text-sinergia-400 font-mono">{fmt(total)} €</span>
            </div>
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="btn-accent w-full py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            {saving ? "Creando..." : "Crear factura"}
          </button>
        </div>
      )}

      {/* List */}
      {!showForm && (
        <div className="glass-card overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
            </div>
          ) : !data || data.invoices.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-secondary)]">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-xs">No has emitido facturas aún. Crea la primera con &ldquo;Nueva factura&rdquo;.</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {data.invoices.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 p-4 hover:bg-[var(--bg-card-hover)] transition">
                  <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-teal-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold font-mono">{inv.number}</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          inv.status === "paid"
                            ? "bg-green-500/10 text-green-400"
                            : inv.status === "sent"
                              ? "bg-sinergia-500/10 text-sinergia-400"
                              : "bg-[var(--bg-card)] text-[var(--text-secondary)]"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] truncate">
                      {inv.clientName} · {new Date(inv.issueDate).toLocaleDateString("es-ES")}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono font-semibold">{fmt(inv.total)} €</div>
                  </div>
                  <button
                    onClick={() => downloadPdf(inv.id, inv.number)}
                    className="p-2 rounded-lg hover:bg-teal-500/10 transition text-teal-400 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="Descargar PDF"
                    title="Descargar PDF"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .input {
          padding: 0.75rem;
          border-radius: 0.75rem;
          background: var(--bg-card);
          border: 1px solid var(--border);
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s;
          min-height: 44px;
          color: var(--text-primary);
        }
        .input:focus {
          border-color: var(--accent);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
        {label}
      </span>
      {children}
    </label>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="glass-card p-4">
      <div className={`w-8 h-8 rounded-lg bg-${color}-500/10 flex items-center justify-center text-${color}-400 mb-2`}>
        <FileText className="w-4 h-4" />
      </div>
      <div className="stat-number text-xl mb-1">{value}</div>
      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
    </div>
  );
}
