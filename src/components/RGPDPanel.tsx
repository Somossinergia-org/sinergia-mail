"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  FileCheck,
  Clock,
  AlertTriangle,
  BookOpen,
  Plus,
  Check,
  X,
  Loader2,
  ChevronDown,
  RefreshCw,
  Trash2,
  Eye,
  Download,
} from "lucide-react";

// ─── Types ───

interface GdprConsent {
  id: number;
  contactEmail: string;
  consentType: string;
  granted: boolean;
  source: string | null;
  consentText: string | null;
  grantedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface GdprRetentionPolicy {
  id: number;
  dataType: string;
  retentionDays: number;
  action: string;
  enabled: boolean;
  lastExecutedAt: string | null;
  createdAt: string;
}

interface GdprDeletionRequest {
  id: number;
  requestedBy: string;
  requestType: string;
  status: string;
  dataScope: string[] | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface GdprProcessingActivity {
  id: number;
  activityName: string;
  purpose: string;
  legalBasis: string;
  dataCategories: string[] | null;
  dataSubjects: string | null;
  recipients: string | null;
  retentionPeriod: string | null;
  securityMeasures: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  totalConsents: number;
  activeConsents: number;
  activePolicies: number;
  pendingRequests: number;
  totalActivities: number;
}

type RGPDTab = "consents" | "retention" | "requests" | "activities";

// ─── Helpers ───

const CONSENT_TYPES: Record<string, string> = {
  email_marketing: "Email Marketing",
  data_processing: "Tratamiento de datos",
  analytics: "Analiticas",
  third_party: "Terceros",
};

const CONSENT_SOURCES: Record<string, string> = {
  web_form: "Formulario web",
  email: "Email",
  verbal: "Verbal",
  contract: "Contrato",
};

const LEGAL_BASES: Record<string, string> = {
  consent: "Consentimiento",
  contract: "Contrato",
  legal_obligation: "Obligacion legal",
  legitimate_interest: "Interes legitimo",
  vital_interest: "Interes vital",
  public_task: "Mision publica",
};

const REQUEST_TYPES: Record<string, string> = {
  erasure: "Supresion",
  rectification: "Rectificacion",
  portability: "Portabilidad",
  restriction: "Limitacion",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  processing: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  completed: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  rejected: "text-red-400 bg-red-400/10 border-red-400/30",
};

const DATA_TYPES = ["emails", "invoices", "contacts", "logs", "memory"];
const RETENTION_ACTIONS = ["delete", "anonymize", "archive"];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Component ───

export default function RGPDPanel() {
  const [activeTab, setActiveTab] = useState<RGPDTab>("consents");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalConsents: 0,
    activeConsents: 0,
    activePolicies: 0,
    pendingRequests: 0,
    totalActivities: 0,
  });

  // Data
  const [consents, setConsents] = useState<GdprConsent[]>([]);
  const [policies, setPolicies] = useState<GdprRetentionPolicy[]>([]);
  const [requests, setRequests] = useState<GdprDeletionRequest[]>([]);
  const [activities, setActivities] = useState<GdprProcessingActivity[]>([]);

  // Forms
  const [showConsentForm, setShowConsentForm] = useState(false);
  const [showRetentionForm, setShowRetentionForm] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ─── Fetch data ───

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rgpd");
      if (!res.ok) throw new Error("Error al cargar datos");
      const data = await res.json();
      setConsents(data.consents || []);
      setPolicies(data.policies || []);
      setRequests(data.requests || []);
      setActivities(data.activities || []);
      setStats(
        data.stats || {
          totalConsents: 0,
          activeConsents: 0,
          activePolicies: 0,
          pendingRequests: 0,
          totalActivities: 0,
        }
      );
    } catch (err) {
      console.error("[RGPD] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── API helpers ───

  async function apiPost(body: Record<string, unknown>) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/rgpd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error");
      }
      await fetchData();
      return true;
    } catch (err) {
      console.error("[RGPD] post error:", err);
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Tabs config ───

  const tabs: Array<{ id: RGPDTab; label: string; icon: React.ReactNode }> = [
    { id: "consents", label: "Consentimientos", icon: <FileCheck className="w-4 h-4" /> },
    { id: "retention", label: "Retencion", icon: <Clock className="w-4 h-4" /> },
    { id: "requests", label: "Solicitudes", icon: <AlertTriangle className="w-4 h-4" /> },
    { id: "activities", label: "Registro Art.30", icon: <BookOpen className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">RGPD / Compliance</h2>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
              Reglamento General de Proteccion de Datos
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2.5 rounded-xl bg-[#0a1628] border border-[#1a2d4a] hover:border-cyan-500/30 transition"
        >
          <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Consentimientos", value: stats.activeConsents, total: stats.totalConsents, color: "cyan" },
          { label: "Politicas activas", value: stats.activePolicies, color: "emerald" },
          { label: "Solicitudes pendientes", value: stats.pendingRequests, color: stats.pendingRequests > 0 ? "amber" : "slate" },
          { label: "Actividades registradas", value: stats.totalActivities, color: "indigo" },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-[#0a1628] border border-[#1a2d4a] rounded-xl p-4"
          >
            <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1">
              {s.label}
            </div>
            <div className={`text-2xl font-bold text-${s.color}-400`}>
              {s.value}
              {s.total !== undefined && (
                <span className="text-xs text-slate-600 font-normal ml-1">
                  / {s.total}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[#0a1628] border border-[#1a2d4a] rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition ${
              activeTab === t.id
                ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                : "text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent"
            }`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
        </div>
      ) : (
        <>
          {activeTab === "consents" && (
            <ConsentsTab
              consents={consents}
              showForm={showConsentForm}
              setShowForm={setShowConsentForm}
              submitting={submitting}
              onSubmit={apiPost}
              onRevoke={(id) => apiPost({ action: "revoke_consent", consentId: id })}
            />
          )}
          {activeTab === "retention" && (
            <RetentionTab
              policies={policies}
              showForm={showRetentionForm}
              setShowForm={setShowRetentionForm}
              submitting={submitting}
              onSubmit={apiPost}
            />
          )}
          {activeTab === "requests" && (
            <RequestsTab
              requests={requests}
              showForm={showRequestForm}
              setShowForm={setShowRequestForm}
              submitting={submitting}
              onSubmit={apiPost}
              onUpdateStatus={(id, status) =>
                apiPost({ action: "update_request", requestId: id, status })
              }
            />
          )}
          {activeTab === "activities" && (
            <ActivitiesTab
              activities={activities}
              showForm={showActivityForm}
              setShowForm={setShowActivityForm}
              submitting={submitting}
              onSubmit={apiPost}
            />
          )}
        </>
      )}
    </div>
  );
}

// ═══════ CONSENTS TAB ═══════

function ConsentsTab({
  consents,
  showForm,
  setShowForm,
  submitting,
  onSubmit,
  onRevoke,
}: {
  consents: GdprConsent[];
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  submitting: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>;
  onRevoke: (id: number) => void;
}) {
  const [email, setEmail] = useState("");
  const [consentType, setConsentType] = useState("email_marketing");
  const [source, setSource] = useState("web_form");
  const [text, setText] = useState("");

  const handleSubmit = async () => {
    const ok = await onSubmit({
      action: "create_consent",
      contactEmail: email,
      consentType,
      granted: true,
      source,
      consentText: text || null,
    });
    if (ok) {
      setEmail("");
      setText("");
      setShowForm(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">
          Registro de consentimientos
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition"
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? "Cancelar" : "Nuevo consentimiento"}
        </button>
      </div>

      {/* New consent form */}
      {showForm && (
        <div className="bg-[#0a1628] border border-[#1a2d4a] rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
                Email del contacto
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contacto@ejemplo.com"
                className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
                Tipo
              </label>
              <select
                value={consentType}
                onChange={(e) => setConsentType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white focus:border-cyan-500/50 focus:outline-none transition"
              >
                {Object.entries(CONSENT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
                Fuente
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white focus:border-cyan-500/50 focus:outline-none transition"
              >
                {Object.entries(CONSENT_SOURCES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
              Texto del consentimiento (opcional)
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="Texto exacto mostrado al usuario..."
              className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none transition resize-none"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!email || submitting}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25 transition disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />
            ) : (
              <Check className="w-3.5 h-3.5 inline mr-1" />
            )}
            Registrar consentimiento
          </button>
        </div>
      )}

      {/* List */}
      {consents.length === 0 ? (
        <EmptyState text="No hay consentimientos registrados" />
      ) : (
        <div className="space-y-2">
          {consents.map((c) => (
            <div
              key={c.id}
              className="bg-[#0a1628] border border-[#1a2d4a] rounded-xl p-4 flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-white truncate">
                    {c.contactEmail}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${
                      c.granted && !c.revokedAt
                        ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
                        : "text-red-400 bg-red-400/10 border-red-400/30"
                    }`}
                  >
                    {c.granted && !c.revokedAt ? "Activo" : "Revocado"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
                  <span>{CONSENT_TYPES[c.consentType] || c.consentType}</span>
                  <span>|</span>
                  <span>{CONSENT_SOURCES[c.source || ""] || c.source}</span>
                  <span>|</span>
                  <span>{formatDate(c.grantedAt || c.createdAt)}</span>
                  {c.expiresAt && (
                    <>
                      <span>|</span>
                      <span>Expira: {formatDate(c.expiresAt)}</span>
                    </>
                  )}
                </div>
              </div>
              {c.granted && !c.revokedAt && (
                <button
                  onClick={() => onRevoke(c.id)}
                  className="p-2 rounded-lg hover:bg-red-400/10 transition text-red-400/60 hover:text-red-400"
                  title="Revocar consentimiento"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════ RETENTION TAB ═══════

function RetentionTab({
  policies,
  showForm,
  setShowForm,
  submitting,
  onSubmit,
}: {
  policies: GdprRetentionPolicy[];
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  submitting: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [dataType, setDataType] = useState("emails");
  const [days, setDays] = useState("365");
  const [action, setAction] = useState("archive");

  const handleSubmit = async () => {
    const ok = await onSubmit({
      action: "upsert_retention",
      dataType,
      retentionDays: parseInt(days, 10),
      retentionAction: action,
      enabled: true,
    });
    if (ok) {
      setShowForm(false);
    }
  };

  const DEFAULT_SUGGESTIONS: Record<string, { days: number; action: string }> = {
    emails: { days: 365, action: "archive" },
    invoices: { days: 1825, action: "archive" },
    contacts: { days: 730, action: "anonymize" },
    logs: { days: 90, action: "delete" },
    memory: { days: 365, action: "delete" },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">
          Politicas de retencion de datos
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition"
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? "Cancelar" : "Nueva politica"}
        </button>
      </div>

      {showForm && (
        <div className="bg-[#0a1628] border border-[#1a2d4a] rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
                Tipo de dato
              </label>
              <select
                value={dataType}
                onChange={(e) => {
                  setDataType(e.target.value);
                  const sug = DEFAULT_SUGGESTIONS[e.target.value];
                  if (sug) {
                    setDays(sug.days.toString());
                    setAction(sug.action);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white focus:border-cyan-500/50 focus:outline-none transition"
              >
                {DATA_TYPES.map((dt) => (
                  <option key={dt} value={dt}>
                    {dt.charAt(0).toUpperCase() + dt.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
                Dias de retencion
              </label>
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                min={1}
                className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white focus:border-cyan-500/50 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
                Accion
              </label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white focus:border-cyan-500/50 focus:outline-none transition"
              >
                {RETENTION_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a === "delete" ? "Eliminar" : a === "anonymize" ? "Anonimizar" : "Archivar"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25 transition disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />
            ) : (
              <Check className="w-3.5 h-3.5 inline mr-1" />
            )}
            Guardar politica
          </button>
        </div>
      )}

      {policies.length === 0 ? (
        <EmptyState text="No hay politicas de retencion configuradas" />
      ) : (
        <div className="space-y-2">
          {policies.map((p) => (
            <div
              key={p.id}
              className="bg-[#0a1628] border border-[#1a2d4a] rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white capitalize">
                    {p.dataType}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${
                      p.enabled
                        ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
                        : "text-slate-500 bg-slate-500/10 border-slate-500/30"
                    }`}
                  >
                    {p.enabled ? "Activa" : "Inactiva"}
                  </span>
                </div>
                <span className="text-xs text-slate-500 font-mono">
                  {p.retentionDays} dias
                </span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
                <span>
                  Accion:{" "}
                  {p.action === "delete"
                    ? "Eliminar"
                    : p.action === "anonymize"
                    ? "Anonimizar"
                    : "Archivar"}
                </span>
                {p.lastExecutedAt && (
                  <>
                    <span>|</span>
                    <span>Ultima ejecucion: {formatDate(p.lastExecutedAt)}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════ REQUESTS TAB ═══════

function RequestsTab({
  requests,
  showForm,
  setShowForm,
  submitting,
  onSubmit,
  onUpdateStatus,
}: {
  requests: GdprDeletionRequest[];
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  submitting: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>;
  onUpdateStatus: (id: number, status: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [reqType, setReqType] = useState("erasure");
  const [scope, setScope] = useState<string[]>(["emails", "contacts"]);
  const [notes, setNotes] = useState("");

  const toggleScope = (item: string) => {
    setScope((prev) =>
      prev.includes(item) ? prev.filter((s) => s !== item) : [...prev, item]
    );
  };

  const handleSubmit = async () => {
    const ok = await onSubmit({
      action: "create_request",
      requestedBy: email,
      requestType: reqType,
      dataScope: scope,
      notes: notes || null,
    });
    if (ok) {
      setEmail("");
      setNotes("");
      setShowForm(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">
          Solicitudes de derechos RGPD
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition"
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? "Cancelar" : "Nueva solicitud"}
        </button>
      </div>

      {showForm && (
        <div className="bg-[#0a1628] border border-[#1a2d4a] rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
                Solicitante (email)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="persona@ejemplo.com"
                className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
                Tipo de solicitud
              </label>
              <select
                value={reqType}
                onChange={(e) => setReqType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white focus:border-cyan-500/50 focus:outline-none transition"
              >
                {Object.entries(REQUEST_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
              Alcance de datos
            </label>
            <div className="flex flex-wrap gap-2">
              {DATA_TYPES.map((dt) => (
                <button
                  key={dt}
                  onClick={() => toggleScope(dt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    scope.includes(dt)
                      ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
                      : "bg-[#050a14] border-[#1a2d4a] text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {dt.charAt(0).toUpperCase() + dt.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
              Notas (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Detalles adicionales..."
              className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none transition resize-none"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!email || submitting}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25 transition disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />
            ) : (
              <Check className="w-3.5 h-3.5 inline mr-1" />
            )}
            Crear solicitud
          </button>
        </div>
      )}

      {requests.length === 0 ? (
        <EmptyState text="No hay solicitudes de derechos registradas" />
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div
              key={r.id}
              className="bg-[#0a1628] border border-[#1a2d4a] rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">
                    {r.requestedBy}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${
                      STATUS_COLORS[r.status || "pending"]
                    }`}
                  >
                    {r.status === "pending"
                      ? "Pendiente"
                      : r.status === "processing"
                      ? "En proceso"
                      : r.status === "completed"
                      ? "Completada"
                      : "Rechazada"}
                  </span>
                </div>
                {r.status === "pending" && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => onUpdateStatus(r.id, "processing")}
                      className="p-1.5 rounded-lg hover:bg-blue-400/10 transition text-blue-400/60 hover:text-blue-400"
                      title="Marcar en proceso"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onUpdateStatus(r.id, "completed")}
                      className="p-1.5 rounded-lg hover:bg-emerald-400/10 transition text-emerald-400/60 hover:text-emerald-400"
                      title="Marcar completada"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onUpdateStatus(r.id, "rejected")}
                      className="p-1.5 rounded-lg hover:bg-red-400/10 transition text-red-400/60 hover:text-red-400"
                      title="Rechazar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {r.status === "processing" && (
                  <button
                    onClick={() => onUpdateStatus(r.id, "completed")}
                    className="p-1.5 rounded-lg hover:bg-emerald-400/10 transition text-emerald-400/60 hover:text-emerald-400"
                    title="Marcar completada"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono flex-wrap">
                <span>{REQUEST_TYPES[r.requestType] || r.requestType}</span>
                <span>|</span>
                <span>{formatDate(r.createdAt)}</span>
                {r.dataScope && r.dataScope.length > 0 && (
                  <>
                    <span>|</span>
                    <span>Datos: {r.dataScope.join(", ")}</span>
                  </>
                )}
                {r.completedAt && (
                  <>
                    <span>|</span>
                    <span>Completada: {formatDate(r.completedAt)}</span>
                  </>
                )}
              </div>
              {r.notes && (
                <p className="mt-2 text-xs text-slate-400">{r.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════ ACTIVITIES TAB ═══════

function ActivitiesTab({
  activities,
  showForm,
  setShowForm,
  submitting,
  onSubmit,
}: {
  activities: GdprProcessingActivity[];
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  submitting: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [legalBasis, setLegalBasis] = useState("contract");
  const [categories, setCategories] = useState("email, nombre, empresa, NIF");
  const [subjects, setSubjects] = useState("clientes, proveedores");
  const [recipients, setRecipients] = useState("Somos Sinergia S.L.");
  const [retention, setRetention] = useState("Segun politica de retencion configurada");
  const [security, setSecurity] = useState(
    "Cifrado en transito (TLS), cifrado en reposo (AES-256), acceso autenticado OAuth2, logs de auditoria"
  );

  const handleSubmit = async () => {
    const ok = await onSubmit({
      action: "create_activity",
      activityName: name,
      purpose,
      legalBasis,
      dataCategories: categories.split(",").map((s) => s.trim()).filter(Boolean),
      dataSubjects: subjects,
      recipients,
      retentionPeriod: retention,
      securityMeasures: security,
    });
    if (ok) {
      setName("");
      setPurpose("");
      setShowForm(false);
    }
  };

  // Pre-filled defaults for Somos Sinergia
  const prefillDefaults = () => {
    setName("Gestion de correo electronico con IA");
    setPurpose(
      "Categorizar, resumir y gestionar emails comerciales usando inteligencia artificial para mejorar la productividad"
    );
    setLegalBasis("legitimate_interest");
    setCategories("email, nombre, empresa, NIF, direccion, telefono");
    setSubjects("clientes, proveedores, contactos comerciales");
    setRecipients("Somos Sinergia S.L.");
    setRetention("Segun politica de retencion configurada por tipo de dato");
    setSecurity(
      "Cifrado en transito (TLS 1.3), cifrado en reposo (AES-256), autenticacion OAuth2, control de acceso basado en roles, logs de auditoria, copias de seguridad automaticas"
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">
          Registro de actividades de tratamiento (Art. 30)
        </h3>
        <div className="flex gap-2">
          {!showForm && (
            <button
              onClick={prefillDefaults}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 transition"
            >
              <Download className="w-3.5 h-3.5" />
              Plantilla Sinergia
            </button>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition"
          >
            {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showForm ? "Cancelar" : "Nueva actividad"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-[#0a1628] border border-[#1a2d4a] rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
                Nombre de la actividad
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Gestion de facturas"
                className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
                Base legal
              </label>
              <select
                value={legalBasis}
                onChange={(e) => setLegalBasis(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white focus:border-cyan-500/50 focus:outline-none transition"
              >
                {Object.entries(LEGAL_BASES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
              Finalidad
            </label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={2}
              placeholder="Describe la finalidad del tratamiento..."
              className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none transition resize-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
                Categorias de datos (separadas por coma)
              </label>
              <input
                type="text"
                value={categories}
                onChange={(e) => setCategories(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white focus:border-cyan-500/50 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
                Interesados
              </label>
              <input
                type="text"
                value={subjects}
                onChange={(e) => setSubjects(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white focus:border-cyan-500/50 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
                Destinatarios
              </label>
              <input
                type="text"
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white focus:border-cyan-500/50 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
                Periodo de retencion
              </label>
              <input
                type="text"
                value={retention}
                onChange={(e) => setRetention(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white focus:border-cyan-500/50 focus:outline-none transition"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 block">
              Medidas de seguridad
            </label>
            <textarea
              value={security}
              onChange={(e) => setSecurity(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-white placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none transition resize-none"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!name || !purpose || submitting}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25 transition disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />
            ) : (
              <Check className="w-3.5 h-3.5 inline mr-1" />
            )}
            Registrar actividad
          </button>
        </div>
      )}

      {activities.length === 0 ? (
        <EmptyState text="No hay actividades de tratamiento registradas" />
      ) : (
        <div className="space-y-2">
          {activities.map((a) => (
            <div
              key={a.id}
              className="bg-[#0a1628] border border-[#1a2d4a] rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white">
                  {a.activityName}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full border font-mono text-indigo-400 bg-indigo-400/10 border-indigo-400/30">
                  {LEGAL_BASES[a.legalBasis] || a.legalBasis}
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-2">{a.purpose}</p>
              <div className="flex flex-wrap gap-3 text-[10px] text-slate-500 font-mono">
                {a.dataCategories && a.dataCategories.length > 0 && (
                  <span>Datos: {a.dataCategories.join(", ")}</span>
                )}
                {a.dataSubjects && (
                  <>
                    <span>|</span>
                    <span>Interesados: {a.dataSubjects}</span>
                  </>
                )}
                {a.recipients && (
                  <>
                    <span>|</span>
                    <span>Dest.: {a.recipients}</span>
                  </>
                )}
              </div>
              {a.securityMeasures && (
                <div className="mt-2 text-[10px] text-slate-600">
                  Seguridad: {a.securityMeasures}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════ EMPTY STATE ═══════

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-[#0a1628] border border-[#1a2d4a] rounded-xl p-12 text-center">
      <Shield className="w-8 h-8 text-slate-700 mx-auto mb-3" />
      <p className="text-sm text-slate-500">{text}</p>
      <p className="text-[10px] text-slate-600 mt-1">
        Usa el boton superior para crear el primer registro
      </p>
    </div>
  );
}
