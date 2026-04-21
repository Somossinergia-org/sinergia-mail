"use client";

import { useState, useEffect, useRef } from "react";
import {
  Plus,
  X,
  CheckSquare,
  Activity,
  StickyNote,
  Target,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ActionType = "tarea" | "actividad" | "nota" | "oportunidad";

interface QuickActionForm {
  action: ActionType;
  title: string;
  companyId?: number;
  companyName?: string;
  description?: string;
  priority?: string;
  dueAt?: string;
  activityType?: string;
}

interface CompanyOption {
  id: number;
  name: string;
}

/* ------------------------------------------------------------------ */
/*  Actions config                                                     */
/* ------------------------------------------------------------------ */

const ACTIONS: Array<{
  id: ActionType;
  label: string;
  icon: React.ReactNode;
  color: string;
  gradient: string;
}> = [
  {
    id: "tarea",
    label: "Nueva tarea",
    icon: <CheckSquare className="w-4 h-4" />,
    color: "text-blue-400",
    gradient: "from-blue-500 to-indigo-600",
  },
  {
    id: "actividad",
    label: "Registrar actividad",
    icon: <Activity className="w-4 h-4" />,
    color: "text-green-400",
    gradient: "from-green-500 to-emerald-600",
  },
  {
    id: "nota",
    label: "Nota rápida",
    icon: <StickyNote className="w-4 h-4" />,
    color: "text-amber-400",
    gradient: "from-amber-500 to-orange-600",
  },
  {
    id: "oportunidad",
    label: "Nueva oportunidad",
    icon: <Target className="w-4 h-4" />,
    color: "text-purple-400",
    gradient: "from-purple-500 to-fuchsia-600",
  },
];

const ACTIVITY_TYPES = [
  { value: "llamada", label: "Llamada" },
  { value: "email", label: "Email" },
  { value: "reunion", label: "Reunión" },
  { value: "visita", label: "Visita" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "nota", label: "Nota" },
  { value: "otro", label: "Otro" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function QuickActionFab() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"menu" | "form">("menu");
  const [form, setForm] = useState<QuickActionForm>({
    action: "tarea",
    title: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companySearch, setCompanySearch] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setStep("menu");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Keyboard shortcut: n for new
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Fetch companies for autocomplete
  useEffect(() => {
    if (step !== "form") return;
    const load = async () => {
      try {
        const res = await fetch("/api/crm/companies?limit=200");
        if (res.ok) {
          const data = await res.json();
          setCompanies(
            (data.companies || data || []).map((c: any) => ({
              id: c.id,
              name: c.name,
            }))
          );
        }
      } catch {
        /* ignore */
      }
    };
    load();
  }, [step]);

  const filteredCompanies = companies.filter((c) =>
    c.name.toLowerCase().includes(companySearch.toLowerCase())
  );

  const selectAction = (action: ActionType) => {
    setForm({
      action,
      title: "",
      priority: "media",
      activityType: action === "actividad" ? "llamada" : undefined,
    });
    setStep("form");
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error("El título es obligatorio");
      return;
    }
    setSubmitting(true);
    try {
      let ok = false;

      if (form.action === "tarea") {
        const res = await fetch("/api/crm/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            description: form.description || null,
            priority: form.priority || "media",
            dueAt: form.dueAt || null,
            companyId: form.companyId || null,
            source: "manual",
          }),
        });
        ok = res.ok;
      } else if (form.action === "actividad") {
        if (!form.companyId) {
          toast.error("Selecciona una empresa para la actividad");
          setSubmitting(false);
          return;
        }
        const res = await fetch("/api/crm/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: form.companyId,
            type: form.activityType || "nota",
            summary: form.title,
            outcome: form.description || null,
          }),
        });
        ok = res.ok;
      } else if (form.action === "nota") {
        // Nota = actividad de tipo "nota" sin empresa obligatoria
        const body: any = {
          type: "nota",
          summary: form.title,
          outcome: form.description || null,
        };
        if (form.companyId) body.companyId = form.companyId;
        // If no company, create as a task with "nota" prefix instead
        if (!form.companyId) {
          const res = await fetch("/api/crm/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: `📝 ${form.title}`,
              description: form.description || null,
              priority: "baja",
              source: "manual",
            }),
          });
          ok = res.ok;
        } else {
          const res = await fetch("/api/crm/activities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          ok = res.ok;
        }
      } else if (form.action === "oportunidad") {
        if (!form.companyId) {
          toast.error("Selecciona una empresa para la oportunidad");
          setSubmitting(false);
          return;
        }
        const res = await fetch("/api/crm/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: form.companyId,
            title: form.title,
            status: "pendiente",
          }),
        });
        ok = res.ok;
      }

      if (ok) {
        const labels: Record<ActionType, string> = {
          tarea: "Tarea creada",
          actividad: "Actividad registrada",
          nota: "Nota guardada",
          oportunidad: "Oportunidad creada",
        };
        toast.success(labels[form.action]);
        setOpen(false);
        setStep("menu");
        setForm({ action: "tarea", title: "" });
      } else {
        toast.error("Error al guardar");
      }
    } catch (e) {
      console.error("QuickAction error:", e);
      toast.error("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* FAB button — bottom right, above mobile nav */}
      <button
        onClick={() => {
          setOpen(!open);
          if (open) setStep("menu");
        }}
        className={`fixed z-50 right-4 bottom-20 lg:bottom-6 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90 ${
          open
            ? "bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] rotate-45"
            : "bg-gradient-to-br from-sinergia-500 to-purple-600 text-white shadow-lg shadow-sinergia-500/30"
        }`}
        style={
          open
            ? {}
            : {
                boxShadow:
                  "0 4px 20px rgba(99,102,241,0.4), 0 0 40px rgba(99,102,241,0.15)",
              }
        }
        aria-label={open ? "Cerrar acciones rápidas" : "Acciones rápidas"}
      >
        {open ? (
          <X className="w-6 h-6" />
        ) : (
          <Plus className="w-6 h-6" />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed z-40 inset-0" onClick={() => { setOpen(false); setStep("menu"); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            className="absolute right-4 bottom-36 lg:bottom-24 w-80 max-h-[70vh] overflow-y-auto glass-card rounded-2xl p-4 animate-slide-up"
            style={{
              boxShadow:
                "0 8px 40px rgba(0,0,0,0.3), 0 0 60px rgba(99,102,241,0.1)",
            }}
          >
            {step === "menu" && (
              <>
                <h3 className="text-sm font-bold mb-3 text-shimmer">
                  Acción rápida
                </h3>
                <div className="space-y-2">
                  {ACTIONS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => selectAction(a.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all hover:bg-[var(--bg-card-hover)] active:scale-[0.98] ${a.color}`}
                    >
                      <span
                        className={`w-8 h-8 rounded-lg bg-gradient-to-br ${a.gradient} flex items-center justify-center text-white`}
                      >
                        {a.icon}
                      </span>
                      <span className="text-[var(--text-primary)] font-medium">
                        {a.label}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--text-secondary)] mt-3 text-center">
                  Atajo: pulsa <kbd className="px-1 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border)] text-[10px]">N</kbd> desde cualquier pantalla
                </p>
              </>
            )}

            {step === "form" && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setStep("menu")}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                  >
                    ← Volver
                  </button>
                  <h3 className="text-sm font-bold">
                    {ACTIONS.find((a) => a.id === form.action)?.label}
                  </h3>
                </div>

                <div className="space-y-3">
                  {/* Title */}
                  <input
                    type="text"
                    placeholder={
                      form.action === "tarea"
                        ? "¿Qué hay que hacer?"
                        : form.action === "actividad"
                        ? "Resumen de la actividad"
                        : form.action === "nota"
                        ? "Escribe tu nota..."
                        : "Título de la oportunidad"
                    }
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] transition"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                  />

                  {/* Description (optional for task/note) */}
                  {(form.action === "tarea" ||
                    form.action === "nota" ||
                    form.action === "actividad") && (
                    <textarea
                      placeholder="Detalles (opcional)"
                      value={form.description || ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] transition resize-none"
                    />
                  )}

                  {/* Activity type */}
                  {form.action === "actividad" && (
                    <select
                      value={form.activityType || "llamada"}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          activityType: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] transition"
                    >
                      {ACTIVITY_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Priority (tasks) */}
                  {form.action === "tarea" && (
                    <div className="flex gap-2">
                      {["baja", "media", "alta"].map((p) => (
                        <button
                          key={p}
                          onClick={() =>
                            setForm((f) => ({ ...f, priority: p }))
                          }
                          className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                            form.priority === p
                              ? p === "alta"
                                ? "bg-red-500/20 border-red-500/40 text-red-300"
                                : p === "media"
                                ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                                : "bg-green-500/20 border-green-500/40 text-green-300"
                              : "bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)]"
                          }`}
                        >
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Due date (tasks) */}
                  {form.action === "tarea" && (
                    <input
                      type="date"
                      value={form.dueAt || ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, dueAt: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] transition"
                    />
                  )}

                  {/* Company selector */}
                  {(form.action === "actividad" ||
                    form.action === "oportunidad" ||
                    form.action === "nota") && (
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={
                          form.companyName || "Buscar empresa..."
                        }
                        value={companySearch}
                        onChange={(e) => setCompanySearch(e.target.value)}
                        className={`w-full px-3 py-2 rounded-xl bg-[var(--bg-card)] border text-sm focus:outline-none focus:border-[var(--accent)] transition ${
                          form.companyId
                            ? "border-green-500/40 text-green-300"
                            : "border-[var(--border)]"
                        }`}
                      />
                      {form.companyId && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-400">
                          ✓ {form.companyName}
                        </span>
                      )}
                      {companySearch && !form.companyId && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl max-h-40 overflow-y-auto z-10">
                          {filteredCompanies.slice(0, 8).map((c) => (
                            <button
                              key={c.id}
                              onClick={() => {
                                setForm((f) => ({
                                  ...f,
                                  companyId: c.id,
                                  companyName: c.name,
                                }));
                                setCompanySearch("");
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-card-hover)] transition"
                            >
                              {c.name}
                            </button>
                          ))}
                          {filteredCompanies.length === 0 && (
                            <p className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                              Sin resultados
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Company for tasks (optional) */}
                  {form.action === "tarea" && (
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={
                          form.companyName || "Empresa (opcional)"
                        }
                        value={companySearch}
                        onChange={(e) => setCompanySearch(e.target.value)}
                        className={`w-full px-3 py-2 rounded-xl bg-[var(--bg-card)] border text-sm focus:outline-none focus:border-[var(--accent)] transition ${
                          form.companyId
                            ? "border-green-500/40 text-green-300"
                            : "border-[var(--border)]"
                        }`}
                      />
                      {form.companyId && (
                        <button
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              companyId: undefined,
                              companyName: undefined,
                            }))
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-400 hover:text-red-400"
                        >
                          ✓ {form.companyName} ×
                        </button>
                      )}
                      {companySearch && !form.companyId && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl max-h-40 overflow-y-auto z-10">
                          {filteredCompanies.slice(0, 8).map((c) => (
                            <button
                              key={c.id}
                              onClick={() => {
                                setForm((f) => ({
                                  ...f,
                                  companyId: c.id,
                                  companyName: c.name,
                                }));
                                setCompanySearch("");
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-card-hover)] transition"
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !form.title.trim()}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sinergia-500 to-purple-600 text-white text-sm font-semibold transition hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Guardar"
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
