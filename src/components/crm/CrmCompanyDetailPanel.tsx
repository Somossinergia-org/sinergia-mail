"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Pencil,
  X,
  Save,
  Loader2,
  Users,
  TrendingUp,
  Briefcase,
  MessageSquare,
  FileText,
  Zap,
  Link,
  Unlink,
  Building2,
  Flame,
} from "lucide-react";
import CrmEnergyBillsPanel from "./CrmEnergyBillsPanel";
import CompanyQuickActions from "./CompanyQuickActions";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CompanyData {
  id: number;
  name: string;
  legalName: string | null;
  nif: string | null;
  sector: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  source: string | null;
  tags: string[] | null;
}

interface Contact {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
}

interface Opportunity {
  id: number;
  title: string;
  status: string;
  temperature: string | null;
  estimatedValueEur: number | null;
  createdAt: string;
}

interface Service {
  id: number;
  type: string;
  status: string;
  currentProvider: string | null;
  currentSpendEur: number | null;
  offeredPriceEur: number | null;
  estimatedSavings: number | null;
  expiryDate: string | null;
  opportunityId: number | null;
  data: Record<string, unknown> | null;
  notes: string | null;
}

interface CaseItem {
  id: number;
  subject: string;
  status: string;
  channel: string | null;
  visibleOwnerId: number | null;
  interactionCount: number;
}

interface Document {
  id: number;
  name: string;
  type: string | null;
  fileMime: string | null;
  createdAt: string;
}

interface SupplyPoint {
  id: number;
  cups: string;
  tariff: string | null;
  powerP1Kw: number | null;
  currentRetailer: string | null;
  status: string | null;
}

interface FullCompanyResponse {
  company: CompanyData;
  contacts: Contact[];
  opportunities: Opportunity[];
  services: Service[];
  cases: CaseItem[];
  documents: Document[];
  supplyPoints: SupplyPoint[];
}

interface CrmCompanyDetailPanelProps {
  companyId: number;
  onBack: () => void;
}

/* ------------------------------------------------------------------ */
/*  Status badge color maps                                            */
/* ------------------------------------------------------------------ */

const PIPELINE_COLORS: Record<string, string> = {
  pendiente: "text-slate-300 bg-slate-500/15 border-slate-500/30",
  contactado: "text-blue-300 bg-blue-500/15 border-blue-500/30",
  interesado: "text-cyan-300 bg-cyan-500/15 border-cyan-500/30",
  visita_programada: "text-purple-300 bg-purple-500/15 border-purple-500/30",
  visitado: "text-violet-300 bg-violet-500/15 border-violet-500/30",
  oferta_enviada: "text-amber-300 bg-amber-500/15 border-amber-500/30",
  negociacion: "text-orange-300 bg-orange-500/15 border-orange-500/30",
  contrato_firmado: "text-green-300 bg-green-500/15 border-green-500/30",
  cliente_activo: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  perdido: "text-red-300 bg-red-500/15 border-red-500/30",
};

const CASE_COLORS: Record<string, string> = {
  open: "text-blue-300 bg-blue-500/15 border-blue-500/30",
  active: "text-green-300 bg-green-500/15 border-green-500/30",
  waiting: "text-amber-300 bg-amber-500/15 border-amber-500/30",
  closed: "text-slate-300 bg-slate-500/15 border-slate-500/30",
};

const SERVICE_COLORS: Record<string, string> = {
  prospecting: "text-blue-300 bg-blue-500/15 border-blue-500/30",
  offered: "text-amber-300 bg-amber-500/15 border-amber-500/30",
  contracted: "text-green-300 bg-green-500/15 border-green-500/30",
  cancelled: "text-red-300 bg-red-500/15 border-red-500/30",
};

type TabKey = "contactos" | "oportunidades" | "servicios" | "casos" | "documentos" | "suministros" | "energia";

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: "contactos", label: "Contactos", icon: <Users className="w-4 h-4" /> },
  { key: "oportunidades", label: "Oportunidades", icon: <TrendingUp className="w-4 h-4" /> },
  { key: "servicios", label: "Servicios", icon: <Briefcase className="w-4 h-4" /> },
  { key: "energia", label: "Energia", icon: <Flame className="w-4 h-4" /> },
  { key: "casos", label: "Casos", icon: <MessageSquare className="w-4 h-4" /> },
  { key: "documentos", label: "Documentos", icon: <FileText className="w-4 h-4" /> },
  { key: "suministros", label: "Suministros", icon: <Zap className="w-4 h-4" /> },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatEur(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
}

function StatusBadge({ status, colorMap }: { status: string; colorMap: Record<string, string> }) {
  const colors = colorMap[status] ?? "text-slate-300 bg-slate-500/15 border-slate-500/30";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${colors}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CrmCompanyDetailPanel({ companyId, onBack }: CrmCompanyDetailPanelProps) {
  const [data, setData] = useState<FullCompanyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("contactos");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState<Partial<CompanyData>>({});

  const fetchFull = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/companies/${companyId}/full`);
      if (res.ok) {
        const json: FullCompanyResponse = await res.json();
        setData(json);
        setEditForm({ ...json.company });
      }
    } catch (e) {
      console.error("Error fetching company detail:", e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchFull();
  }, [fetchFull]);

  const handleSave = useCallback(async () => {
    if (!editForm.name?.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditing(false);
        fetchFull();
      }
    } catch (e) {
      console.error("Error saving company:", e);
    } finally {
      setSaving(false);
    }
  }, [companyId, editForm, fetchFull]);

  const handleContactAction = useCallback(
    async (contactId: number, action: "link" | "unlink") => {
      try {
        await fetch("/api/crm/contacts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId, companyId, action }),
        });
        fetchFull();
      } catch (e) {
        console.error("Error updating contact:", e);
      }
    },
    [companyId, fetchFull]
  );

  const updateField = useCallback((field: keyof CompanyData, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Building2 className="w-8 h-8 text-[var(--text-secondary)] opacity-40" />
        <p className="text-sm text-[var(--text-secondary)]">No se pudo cargar la empresa</p>
        <button onClick={onBack} className="text-sm text-cyan-400 hover:underline">
          Volver
        </button>
      </div>
    );
  }

  const { company, contacts, opportunities, services, cases, documents, supplyPoints } = data;

  const tabCounts: Record<TabKey, number> = {
    contactos: contacts.length,
    oportunidades: opportunities.length,
    servicios: services.length,
    energia: 0, // loaded independently by CrmEnergyBillsPanel
    casos: cases.length,
    documentos: documents.length,
    suministros: supplyPoints.length,
  };

  /* ---- Info fields (view / edit) ---- */

  const infoFields: Array<{ label: string; field: keyof CompanyData; type?: string }> = [
    { label: "Nombre", field: "name" },
    { label: "Razón social", field: "legalName" },
    { label: "NIF", field: "nif" },
    { label: "Sector", field: "sector" },
    { label: "Dirección", field: "address" },
    { label: "Ciudad", field: "city" },
    { label: "Provincia", field: "province" },
    { label: "Teléfono", field: "phone" },
    { label: "Email", field: "email", type: "email" },
    { label: "Web", field: "website" },
    { label: "Origen", field: "source" },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] flex-1 truncate">
          {company.name}
        </h2>
        {editing ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setEditing(false);
                setEditForm({ ...company });
              }}
              className="p-2 rounded-lg hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25 transition-colors disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="p-2 rounded-lg hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Company info card */}
      <div className="glass-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {infoFields.map(({ label, field, type }) => (
            <div key={field}>
              <p className="text-xs text-[var(--text-secondary)] mb-1">{label}</p>
              {editing ? (
                <input
                  type={type ?? "text"}
                  value={(editForm[field] as string) ?? ""}
                  onChange={(e) => updateField(field, e.target.value)}
                  className="w-full px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-cyan-500 rounded-lg"
                />
              ) : (
                <p className="text-sm text-[var(--text-primary)] truncate">
                  {(company[field] as string) ?? "—"}
                </p>
              )}
            </div>
          ))}
          {/* Tags (view only) */}
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1">Tags</p>
            <div className="flex flex-wrap gap-1">
              {company.tags && company.tags.length > 0 ? (
                company.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-400"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-sm text-[var(--text-primary)]">—</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <CompanyQuickActions
        companyId={company.id}
        companyName={company.name}
        hasEnergy={supplyPoints.length > 0}
        onRefresh={fetchFull}
        onOpenAgent={(ctx) => {
          window.dispatchEvent(new CustomEvent("sinergia:open-agent", { detail: ctx }));
        }}
        onSwitchTab={(tab) => setActiveTab(tab as TabKey)}
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1">
        {TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeTab === key
                ? "bg-cyan-500/15 border border-cyan-500/30 text-cyan-400"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] border border-transparent"
            }`}
          >
            {icon}
            {label}
            <span className="ml-1 text-xs opacity-70">({tabCounts[key]})</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="glass-card flex-1 overflow-y-auto custom-scrollbar">
        {/* Contactos */}
        {activeTab === "contactos" && (
          <div className="divide-y divide-[var(--border)]">
            {contacts.length === 0 ? (
              <p className="p-4 text-sm text-[var(--text-secondary)]">Sin contactos vinculados</p>
            ) : (
              contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{c.name ?? "Sin nombre"}</p>
                    <p className="text-xs text-[var(--text-secondary)] truncate">
                      {[c.email, c.phone, c.company].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <button
                    onClick={() => handleContactAction(c.id, "unlink")}
                    className="ml-2 p-1.5 rounded-lg hover:bg-red-500/15 text-[var(--text-secondary)] hover:text-red-400 transition-colors"
                    title="Desvincular contacto"
                  >
                    <Unlink className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Oportunidades */}
        {activeTab === "oportunidades" && (
          <div className="divide-y divide-[var(--border)]">
            {opportunities.length === 0 ? (
              <p className="p-4 text-sm text-[var(--text-secondary)]">Sin oportunidades</p>
            ) : (
              opportunities.map((o) => (
                <div key={o.id} className="px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{o.title}</p>
                    <StatusBadge status={o.status} colorMap={PIPELINE_COLORS} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                    {o.temperature && <span>Temp: {o.temperature}</span>}
                    <span>{formatEur(o.estimatedValueEur)}</span>
                    <span>{formatDate(o.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Servicios — Multiservicio */}
        {activeTab === "servicios" && (
          <ServicesTabContent
            services={services}
            companyId={companyId}
            onRefresh={fetchFull}
          />
        )}

        {/* Casos */}
        {activeTab === "casos" && (
          <div className="divide-y divide-[var(--border)]">
            {cases.length === 0 ? (
              <p className="p-4 text-sm text-[var(--text-secondary)]">Sin casos</p>
            ) : (
              cases.map((c) => (
                <div key={c.id} className="px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{c.subject}</p>
                    <StatusBadge status={c.status} colorMap={CASE_COLORS} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                    {c.channel && <span>Canal: {c.channel}</span>}
                    {c.visibleOwnerId && <span>Propietario: #{c.visibleOwnerId}</span>}
                    <span>{c.interactionCount} interacciones</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Energia */}
        {activeTab === "energia" && (
          <div style={{ padding: 16 }}>
            <CrmEnergyBillsPanel companyId={companyId} />
          </div>
        )}

        {/* Documentos */}
        {activeTab === "documentos" && (
          <div className="divide-y divide-[var(--border)]">
            {documents.length === 0 ? (
              <p className="p-4 text-sm text-[var(--text-secondary)]">Sin documentos</p>
            ) : (
              documents.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <FileText className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{d.name}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {[d.type, d.fileMime, formatDate(d.createdAt)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Suministros */}
        {activeTab === "suministros" && (
          <div className="divide-y divide-[var(--border)]">
            {supplyPoints.length === 0 ? (
              <p className="p-4 text-sm text-[var(--text-secondary)]">Sin puntos de suministro</p>
            ) : (
              supplyPoints.map((sp) => (
                <div key={sp.id} className="px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <p className="text-sm font-medium text-[var(--text-primary)] font-mono truncate">{sp.cups}</p>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)] mt-1">
                    {sp.tariff && <span>Tarifa: {sp.tariff}</span>}
                    {sp.powerP1Kw !== null && <span>P1: {sp.powerP1Kw} kW</span>}
                    {sp.currentRetailer && <span>Comercializadora: {sp.currentRetailer}</span>}
                    {sp.status && <span>Estado: {sp.status}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Services Tab — Multiservicio                                       */
/* ------------------------------------------------------------------ */

const VERTICAL_ICONS: Record<string, string> = {
  energia: "⚡",
  telecomunicaciones: "📡",
  alarmas: "🔒",
  seguros: "🛡️",
  agentes_ia: "🤖",
  web: "🌐",
  crm: "📊",
  aplicaciones: "📱",
};

const VERTICAL_LABELS: Record<string, string> = {
  energia: "Energía",
  telecomunicaciones: "Telecom",
  alarmas: "Alarmas",
  seguros: "Seguros",
  agentes_ia: "Agentes IA",
  web: "Web",
  crm: "CRM",
  aplicaciones: "Apps",
};

const SERVICE_TYPE_OPTIONS = [
  "energia", "telecomunicaciones", "alarmas", "seguros",
  "agentes_ia", "web", "crm", "aplicaciones",
];

const SERVICE_STATUS_OPTIONS = [
  { value: "prospecting", label: "Prospección" },
  { value: "offered", label: "Ofertado" },
  { value: "contracted", label: "Contratado" },
  { value: "cancelled", label: "Cancelado" },
];

function ServicesTabContent({
  services,
  companyId,
  onRefresh,
}: {
  services: Service[];
  companyId: number;
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    type: "telecomunicaciones",
    status: "prospecting",
    currentProvider: "",
    currentSpendEur: "",
    offeredPriceEur: "",
    estimatedSavings: "",
    notes: "",
  });

  const handleCreate = async () => {
    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        companyId,
        type: form.type,
        status: form.status,
      };
      if (form.currentProvider) payload.currentProvider = form.currentProvider;
      if (form.currentSpendEur) payload.currentSpendEur = parseFloat(form.currentSpendEur);
      if (form.offeredPriceEur) payload.offeredPriceEur = parseFloat(form.offeredPriceEur);
      if (form.estimatedSavings) payload.estimatedSavings = parseFloat(form.estimatedSavings);
      if (form.notes) payload.notes = form.notes;

      const res = await fetch("/api/crm/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ type: "telecomunicaciones", status: "prospecting", currentProvider: "", currentSpendEur: "", offeredPriceEur: "", estimatedSavings: "", notes: "" });
        onRefresh();
      }
    } catch (e) {
      console.error("Error creating service:", e);
    } finally {
      setCreating(false);
    }
  };

  // Group services by type for visual clarity
  const grouped = services.reduce<Record<string, Service[]>>((acc, s) => {
    if (!acc[s.type]) acc[s.type] = [];
    acc[s.type].push(s);
    return acc;
  }, {});

  const contractedCount = services.filter((s) => s.status === "contracted").length;
  const totalSpend = services.reduce((sum, s) => sum + (s.currentSpendEur ?? 0), 0);
  const totalSavings = services.reduce((sum, s) => sum + (s.estimatedSavings ?? 0), 0);

  return (
    <div>
      {/* Summary bar */}
      <div className="px-4 py-3 bg-[var(--bg-card)] border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
          <span>{services.length} servicio{services.length !== 1 ? "s" : ""}</span>
          <span>{contractedCount} contratado{contractedCount !== 1 ? "s" : ""}</span>
          {totalSpend > 0 && <span>Gasto: {formatEur(totalSpend)}/mes</span>}
          {totalSavings > 0 && <span className="text-green-400">Ahorro est.: {formatEur(totalSavings)}</span>}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          {showForm ? "Cancelar" : "+ Servicio"}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="px-4 py-3 bg-[var(--bg-card-hover)] border-b border-[var(--border)] space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="text-xs px-2 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)]"
            >
              {SERVICE_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{VERTICAL_ICONS[t]} {VERTICAL_LABELS[t]}</option>
              ))}
            </select>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="text-xs px-2 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)]"
            >
              {SERVICE_STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Proveedor actual"
              value={form.currentProvider}
              onChange={(e) => setForm({ ...form, currentProvider: e.target.value })}
              className="text-xs px-2 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)]"
            />
            <input
              placeholder="Gasto actual (EUR/mes)"
              type="number"
              value={form.currentSpendEur}
              onChange={(e) => setForm({ ...form, currentSpendEur: e.target.value })}
              className="text-xs px-2 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Precio ofertado (EUR)"
              type="number"
              value={form.offeredPriceEur}
              onChange={(e) => setForm({ ...form, offeredPriceEur: e.target.value })}
              className="text-xs px-2 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)]"
            />
            <input
              placeholder="Ahorro estimado (EUR)"
              type="number"
              value={form.estimatedSavings}
              onChange={(e) => setForm({ ...form, estimatedSavings: e.target.value })}
              className="text-xs px-2 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)]"
            />
          </div>
          <textarea
            placeholder="Notas..."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full text-xs px-2 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] resize-none"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="text-xs px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
          >
            {creating ? "Creando..." : "Crear servicio"}
          </button>
        </div>
      )}

      {/* Services list grouped by type */}
      {services.length === 0 && !showForm ? (
        <p className="p-4 text-sm text-[var(--text-secondary)]">
          Sin servicios. Pulsa &quot;+ Servicio&quot; para registrar el primer servicio.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {SERVICE_TYPE_OPTIONS.filter((t) => grouped[t]?.length).map((type) => (
            <div key={type}>
              <div className="px-4 py-2 bg-[var(--bg-card)] flex items-center gap-2">
                <span className="text-sm">{VERTICAL_ICONS[type]}</span>
                <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                  {VERTICAL_LABELS[type]}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">({grouped[type].length})</span>
              </div>
              {grouped[type].map((s) => (
                <div key={s.id} className="px-4 py-3 pl-10 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={s.status} colorMap={SERVICE_COLORS} />
                      {s.currentProvider && (
                        <span className="text-xs text-[var(--text-secondary)]">{s.currentProvider}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                      {s.currentSpendEur != null && s.currentSpendEur > 0 && (
                        <span>Gasto: {formatEur(s.currentSpendEur)}</span>
                      )}
                      {s.offeredPriceEur != null && s.offeredPriceEur > 0 && (
                        <span className="text-blue-400">Oferta: {formatEur(s.offeredPriceEur)}</span>
                      )}
                      {s.estimatedSavings != null && s.estimatedSavings > 0 && (
                        <span className="text-green-400">Ahorro: {formatEur(s.estimatedSavings)}</span>
                      )}
                    </div>
                  </div>
                  {(s.expiryDate || s.notes) && (
                    <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)] mt-1">
                      {s.expiryDate && <span>Vence: {formatDate(s.expiryDate)}</span>}
                      {s.notes && <span className="truncate max-w-[200px]">{s.notes}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
