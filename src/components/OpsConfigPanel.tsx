"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Package, FileText, CheckSquare, Mail, Handshake, Users,
  Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronRight,
  Loader2, AlertCircle, Zap, RefreshCw,
} from "lucide-react";

// ─── Types ───
type Entity = "services" | "documents" | "checklists" | "email-rules" | "partners" | "agents";

interface Service { id: number; name: string; vertical: string; subtype: string | null; active: boolean; clientType: string; economicModel: string; priceSetup: number | null; priceMonthly: number | null; commissionFixed: number | null; commissionRecurring: number | null; agentOwner: string | null; agentSupport: string | null; requiresDocs: boolean; commercialDescription: string | null; internalNotes: string | null; sortOrder: number; }
interface DocItem { id: number; serviceId: number; documentName: string; mandatory: boolean; appliesToClient: string | null; requestedBy: string | null; reviewedBy: string | null; sortOrder: number; notes: string | null; }
interface CheckItem { id: number; serviceId: number; taskName: string; description: string | null; sortOrder: number; mandatory: boolean; agentResponsible: string | null; flowMoment: string | null; notes: string | null; }
interface EmailRule { id: number; name: string; emailType: string; senderPattern: string | null; subjectPattern: string | null; category: string | null; routing: string | null; createTask: boolean; createAlert: boolean; extractPdf: boolean; extractExcel: boolean; agentResponsible: string | null; priority: string; active: boolean; notes: string | null; }
interface Partner { id: number; name: string; vertical: string; product: string | null; commissionFixed: number | null; commissionRecurring: number | null; conditions: string | null; clawback: string | null; contactName: string | null; contactEmail: string | null; active: boolean; notes: string | null; }
interface AgentCfg { id: number; agentSlug: string; displayName: string; role: string; description: string | null; verticals: string[] | null; canDo: string[] | null; cannotDo: string[] | null; active: boolean; }

// ─── API helpers ───
async function api(method: string, body?: Record<string, unknown>) {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const url = method === "GET" && body
    ? `/api/ops-config?${new URLSearchParams(body as any)}`
    : "/api/ops-config";
  const res = await fetch(url, method === "GET" ? {} : opts);
  return res.json();
}

async function fetchEntity(entity: Entity, serviceId?: number) {
  const params = new URLSearchParams({ entity });
  if (serviceId) params.set("serviceId", String(serviceId));
  const res = await fetch(`/api/ops-config?${params}`);
  return res.json();
}

async function mutateEntity(method: "POST" | "PUT" | "DELETE", entity: Entity, data?: any, id?: number) {
  const body: Record<string, unknown> = { entity };
  if (data) body.data = data;
  if (id) body.id = id;
  const res = await fetch("/api/ops-config", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── Constants ───
const VERTICALS = ["energia", "telecomunicaciones", "seguros", "alarmas", "ia", "web", "marketing", "crm", "apps"];
const CLIENT_TYPES = ["particular", "autonomo", "empresa", "todos"];
const ECONOMIC_MODELS = ["partner", "directo"];
const ROUTINGS = ["silenciar", "recepcion", "energia", "finanzas", "comercial", "legal", "documentacion", "log_only"];
const PRIORITIES = ["alta", "media", "baja"];
const FLOW_MOMENTS = ["inicio", "proceso", "cierre", "postventa"];

const VERTICAL_COLORS: Record<string, string> = {
  energia: "#F59E0B",
  telecomunicaciones: "#3B82F6",
  seguros: "#10B981",
  alarmas: "#EF4444",
  ia: "#8B5CF6",
  web: "#06B6D4",
  marketing: "#EC4899",
  crm: "#F97316",
  apps: "#6366F1",
};

// ─── Sub-components ───

function Badge({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: color ? `${color}22` : "var(--bg-tertiary)", color: color || "var(--text-secondary)", border: `1px solid ${color || "var(--border)"}33` }}
    >
      {children}
    </span>
  );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center" style={{ color: "var(--text-tertiary)" }}>
      <Icon className="w-10 h-10 mb-3 opacity-40" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function Btn({ children, onClick, variant = "default", disabled, small }: {
  children: React.ReactNode; onClick?: () => void; variant?: "default" | "primary" | "danger" | "ghost"; disabled?: boolean; small?: boolean;
}) {
  const base = `inline-flex items-center gap-1.5 rounded font-medium transition-colors disabled:opacity-50 ${small ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"}`;
  const styles: Record<string, string> = {
    default: "bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
    primary: "bg-[var(--accent)] text-white hover:opacity-90",
    danger: "bg-red-500/20 text-red-400 hover:bg-red-500/30",
    ghost: "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]",
  };
  return <button className={`${base} ${styles[variant]}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs mb-2">
      <span className="text-[var(--text-secondary)] mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Input({ value, onChange, placeholder, type = "text" }: {
  value: string | number | null | undefined; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      className="w-full px-2.5 py-1.5 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      className="w-full px-2.5 py-1.5 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer">
      <div
        className={`w-8 h-4 rounded-full transition-colors relative ${value ? "bg-[var(--accent)]" : "bg-[var(--bg-tertiary)]"}`}
        onClick={() => onChange(!value)}
      >
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${value ? "left-4" : "left-0.5"}`} />
      </div>
      <span className="text-[var(--text-secondary)]">{label}</span>
    </label>
  );
}

// ─── Tab Sections ───

function ServicesTab() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [tasks, setTasks] = useState<CheckItem[]>([]);
  const [editingService, setEditingService] = useState<Partial<Service> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchEntity("services");
    setServices(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = async (id: number) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    const [d, t] = await Promise.all([
      fetchEntity("documents", id),
      fetchEntity("checklists", id),
    ]);
    setDocs(Array.isArray(d) ? d : []);
    setTasks(Array.isArray(t) ? t : []);
  };

  const saveService = async () => {
    if (!editingService) return;
    if (editingService.id) {
      await mutateEntity("PUT", "services", editingService, editingService.id);
    } else {
      await mutateEntity("POST", "services", editingService);
    }
    setEditingService(null);
    load();
  };

  const deleteService = async (id: number) => {
    if (!confirm("¿Eliminar servicio? Se borrarán docs y tareas asociadas.")) return;
    await mutateEntity("DELETE", "services", undefined, id);
    load();
  };

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--accent)" }} /></div>;

  // Edit form
  if (editingService) {
    const s = editingService;
    const set = (k: string, v: any) => setEditingService({ ...s, [k]: v });
    return (
      <div className="space-y-3 p-4 rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{s.id ? "Editar" : "Nuevo"} servicio</h3>
          <Btn variant="ghost" small onClick={() => setEditingService(null)}><X className="w-3.5 h-3.5" /></Btn>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre"><Input value={s.name} onChange={v => set("name", v)} placeholder="Cambio comercializadora luz hogar" /></Field>
          <Field label="Vertical"><Select value={s.vertical || "energia"} onChange={v => set("vertical", v)} options={VERTICALS} /></Field>
          <Field label="Subtipo"><Input value={s.subtype} onChange={v => set("subtype", v)} placeholder="hogar, pyme..." /></Field>
          <Field label="Tipo cliente"><Select value={s.clientType || "todos"} onChange={v => set("clientType", v)} options={CLIENT_TYPES} /></Field>
          <Field label="Modelo económico"><Select value={s.economicModel || "partner"} onChange={v => set("economicModel", v)} options={ECONOMIC_MODELS} /></Field>
          <Field label="Agente owner"><Input value={s.agentOwner} onChange={v => set("agentOwner", v)} placeholder="comercial-junior" /></Field>
          <Field label="Comisión fija (€)"><Input value={s.commissionFixed} onChange={v => set("commissionFixed", Number(v))} type="number" /></Field>
          <Field label="Comisión recurrente (€)"><Input value={s.commissionRecurring} onChange={v => set("commissionRecurring", Number(v))} type="number" /></Field>
          <Field label="Precio setup (€)"><Input value={s.priceSetup} onChange={v => set("priceSetup", Number(v))} type="number" /></Field>
          <Field label="Precio mensual (€)"><Input value={s.priceMonthly} onChange={v => set("priceMonthly", Number(v))} type="number" /></Field>
        </div>
        <Field label="Descripción comercial">
          <textarea
            className="w-full px-2.5 py-1.5 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none resize-none"
            rows={2}
            value={s.commercialDescription ?? ""}
            onChange={e => set("commercialDescription", e.target.value)}
          />
        </Field>
        <Field label="Notas internas">
          <textarea
            className="w-full px-2.5 py-1.5 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none resize-none"
            rows={2}
            value={s.internalNotes ?? ""}
            onChange={e => set("internalNotes", e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-2">
          <Toggle value={s.active ?? true} onChange={v => set("active", v)} label="Activo" />
          <Toggle value={s.requiresDocs ?? false} onChange={v => set("requiresDocs", v)} label="Requiere docs" />
        </div>
        <div className="flex gap-2 pt-2">
          <Btn variant="primary" onClick={saveService}><Save className="w-3.5 h-3.5" /> Guardar</Btn>
          <Btn onClick={() => setEditingService(null)}>Cancelar</Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{services.length} servicios</span>
        <Btn small variant="primary" onClick={() => setEditingService({ vertical: "energia", clientType: "todos", economicModel: "partner", active: true, requiresDocs: false, sortOrder: 0 })}><Plus className="w-3.5 h-3.5" /> Nuevo</Btn>
      </div>

      {services.map(s => (
        <div key={s.id} className="rounded-lg overflow-hidden" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors" onClick={() => toggleExpand(s.id)}>
            {expanded === s.id ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--text-tertiary)" }} /> : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-tertiary)" }} />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{s.name}</span>
                {!s.active && <Badge>inactivo</Badge>}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge color={VERTICAL_COLORS[s.vertical]}>{s.vertical}</Badge>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{s.clientType} · {s.economicModel}</span>
                {s.commissionFixed ? <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>€{s.commissionFixed}{s.commissionRecurring ? `+${s.commissionRecurring}/mes` : ""}</span> : null}
              </div>
            </div>
            <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
              <Btn variant="ghost" small onClick={() => setEditingService(s)}><Pencil className="w-3.5 h-3.5" /></Btn>
              <Btn variant="ghost" small onClick={() => deleteService(s.id)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Btn>
            </div>
          </div>

          {expanded === s.id && (
            <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
              {/* Docs */}
              <div className="pt-3">
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                  <FileText className="w-3.5 h-3.5" /> Documentación ({docs.length})
                </h4>
                {docs.length === 0 ? <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Sin documentación configurada</p> : (
                  <div className="space-y-1">
                    {docs.map(d => (
                      <div key={d.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded" style={{ background: "var(--bg-tertiary)" }}>
                        <span className={`w-1.5 h-1.5 rounded-full ${d.mandatory ? "bg-red-400" : "bg-gray-400"}`} />
                        <span className="flex-1" style={{ color: "var(--text-primary)" }}>{d.documentName}</span>
                        <span style={{ color: "var(--text-tertiary)" }}>{d.appliesToClient || "todos"}</span>
                        <span style={{ color: "var(--text-tertiary)" }}>{d.requestedBy} → {d.reviewedBy}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Tasks */}
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                  <CheckSquare className="w-3.5 h-3.5" /> Checklist ({tasks.length})
                </h4>
                {tasks.length === 0 ? <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Sin tareas configuradas</p> : (
                  <div className="space-y-1">
                    {tasks.map(t => (
                      <div key={t.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded" style={{ background: "var(--bg-tertiary)" }}>
                        <span className="text-[var(--text-tertiary)]">{t.sortOrder}.</span>
                        <span className="flex-1" style={{ color: "var(--text-primary)" }}>{t.taskName}</span>
                        <Badge>{t.flowMoment || "–"}</Badge>
                        <span style={{ color: "var(--text-tertiary)" }}>{t.agentResponsible}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EmailRulesTab() {
  const [rules, setRules] = useState<EmailRule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchEntity("email-rules");
    setRules(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--accent)" }} /></div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{rules.length} reglas</span>
      </div>
      {rules.map(r => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <div className={`w-2 h-2 rounded-full ${r.active ? "bg-green-400" : "bg-gray-500"}`} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{r.name}</div>
            <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
              <span>{r.emailType}</span>
              <span>→</span>
              <Badge color={r.routing === "silenciar" ? "#6B7280" : r.routing === "energia" ? "#F59E0B" : r.routing === "finanzas" ? "#10B981" : r.routing === "comercial" ? "#3B82F6" : r.routing === "legal" ? "#EF4444" : undefined}>{r.routing}</Badge>
              <span>·</span>
              <Badge color={r.priority === "alta" ? "#EF4444" : r.priority === "baja" ? "#6B7280" : "#F59E0B"}>{r.priority}</Badge>
              {r.createTask && <Badge color="#8B5CF6">tarea</Badge>}
              {r.createAlert && <Badge color="#F97316">alerta</Badge>}
              {r.extractPdf && <Badge color="#EC4899">PDF</Badge>}
              {r.extractExcel && <Badge color="#06B6D4">Excel</Badge>}
            </div>
          </div>
          <span className="text-xs shrink-0" style={{ color: "var(--text-tertiary)" }}>{r.agentResponsible}</span>
        </div>
      ))}
    </div>
  );
}

function PartnersTab() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchEntity("partners");
    setPartners(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--accent)" }} /></div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{partners.length} partners</span>
      </div>
      {partners.map(p => (
        <div key={p.id} className="px-4 py-3 rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{p.name}</span>
            <Badge color={VERTICAL_COLORS[p.vertical]}>{p.vertical}</Badge>
            {!p.active && <Badge>inactivo</Badge>}
          </div>
          <div className="text-xs space-y-0.5" style={{ color: "var(--text-tertiary)" }}>
            {p.product && <div>{p.product}</div>}
            <div>
              Comisión: €{p.commissionFixed || 0} fija
              {p.commissionRecurring ? ` + €${p.commissionRecurring}/mes` : ""}
            </div>
            {p.conditions && <div>Condiciones: {p.conditions}</div>}
            {p.clawback && <div>Clawback: {p.clawback}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentsTab() {
  const [agents, setAgents] = useState<AgentCfg[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchEntity("agents");
    setAgents(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--accent)" }} /></div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{agents.length} agentes</span>
      </div>
      {agents.map(a => (
        <div key={a.id} className="rounded-lg overflow-hidden" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors" onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
            {expanded === a.id ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--text-tertiary)" }} /> : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-tertiary)" }} />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{a.displayName}</span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}>{a.agentSlug}</span>
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{a.role}</div>
            </div>
          </div>
          {expanded === a.id && (
            <div className="px-4 pb-4 space-y-2 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              {a.description && <p className="pt-2">{a.description}</p>}
              {a.verticals && a.verticals.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {a.verticals.map(v => <Badge key={v} color={VERTICAL_COLORS[v]}>{v}</Badge>)}
                </div>
              )}
              {a.canDo && a.canDo.length > 0 && (
                <div>
                  <span className="font-semibold text-green-400">Puede:</span>{" "}
                  {a.canDo.join(", ")}
                </div>
              )}
              {a.cannotDo && a.cannotDo.length > 0 && (
                <div>
                  <span className="font-semibold text-red-400">No puede:</span>{" "}
                  {a.cannotDo.join(", ")}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Panel ───

const TABS: { id: string; label: string; icon: any }[] = [
  { id: "services", label: "Servicios", icon: Package },
  { id: "rules", label: "Reglas Email", icon: Mail },
  { id: "partners", label: "Partners", icon: Handshake },
  { id: "agents", label: "Agentes", icon: Users },
];

export default function OpsConfigPanel() {
  const [activeTab, setActiveTab] = useState("services");
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<any>(null);

  const runSeed = async () => {
    if (!confirm("¿Ejecutar carga inicial? Esto reemplaza todos los datos operativos actuales.")) return;
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await fetch("/api/ops-config/seed", { method: "POST" });
      const data = await res.json();
      setSeedResult(data);
      // Force refresh current tab
      setActiveTab(prev => { const t = prev; setActiveTab(""); setTimeout(() => setActiveTab(t), 50); return prev; });
    } catch (e) {
      setSeedResult({ error: "Error de conexión" });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="h-full flex flex-col" style={{ color: "var(--text-primary)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="text-base font-semibold">Base Operativa</h2>
        <Btn variant="primary" small onClick={runSeed} disabled={seeding}>
          {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          {seeding ? "Cargando..." : "Seed inicial"}
        </Btn>
      </div>

      {/* Seed result toast */}
      {seedResult && (
        <div className="mx-4 mt-2 px-3 py-2 rounded text-xs" style={{ background: seedResult.error ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", border: `1px solid ${seedResult.error ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}` }}>
          {seedResult.error ? (
            <span className="text-red-400">Error: {seedResult.error}</span>
          ) : (
            <span className="text-green-400">
              Seed OK — {seedResult.seeded?.services} servicios, {seedResult.seeded?.documents} docs, {seedResult.seeded?.checklists} tareas, {seedResult.seeded?.agents} agentes, {seedResult.seeded?.emailRules} reglas, {seedResult.seeded?.partners} partners
            </span>
          )}
          <button className="ml-2 opacity-60 hover:opacity-100" onClick={() => setSeedResult(null)}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${active ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"}`}
              onClick={() => setActiveTab(t.id)}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "services" && <ServicesTab />}
        {activeTab === "rules" && <EmailRulesTab />}
        {activeTab === "partners" && <PartnersTab />}
        {activeTab === "agents" && <AgentsTab />}
      </div>
    </div>
  );
}
