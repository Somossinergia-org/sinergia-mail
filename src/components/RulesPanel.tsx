"use client";

import { useState, useEffect, useCallback } from "react";
import { Filter, Plus, Trash2, ToggleLeft, ToggleRight, Zap, Loader2, AlertCircle, Hash } from "lucide-react";

type RuleField = "subject" | "from_email" | "from_name" | "body";
type RuleAction = "TRASH" | "MARK_READ" | "IGNORE" | "IMPORTANT";

interface Rule {
  id: number;
  pattern: string;
  field: RuleField;
  action: RuleAction;
  description: string | null;
  matchCount: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const FIELD_LABELS: Record<RuleField, string> = {
  subject: "Asunto",
  from_email: "Email remitente",
  from_name: "Nombre remitente",
  body: "Cuerpo",
};

const ACTION_LABELS: Record<RuleAction, { label: string; color: string }> = {
  TRASH: { label: "Papelera", color: "text-red-400" },
  MARK_READ: { label: "Marcar leído", color: "text-blue-400" },
  IGNORE: { label: "Ignorar", color: "text-slate-400" },
  IMPORTANT: { label: "Importante", color: "text-amber-400" },
};

const DEFAULT_FORM = {
  pattern: "",
  field: "subject" as RuleField,
  action: "IGNORE" as RuleAction,
  description: "",
};

export default function RulesPanel() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  const fetchRules = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/rules");
      if (!res.ok) throw new Error("Error cargando reglas");
      const data = await res.json();
      setRules(data.rules ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const createRule = async () => {
    if (!form.pattern) return;
    setSaving(true);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern: form.pattern,
          field: form.field,
          action: form.action,
          description: form.description || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error creando regla");
      }
      const data = await res.json();
      setRules((prev) => [data.rule, ...prev]);
      setShowCreate(false);
      setForm(DEFAULT_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando regla");
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule: Rule) => {
    setTogglingId(rule.id);
    // Optimistic update
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
    );
    try {
      const res = await fetch("/api/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      });
      if (!res.ok) {
        // Revert on failure
        setRules((prev) =>
          prev.map((r) =>
            r.id === rule.id ? { ...r, enabled: rule.enabled } : r
          )
        );
        throw new Error("Error actualizando regla");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando regla");
    } finally {
      setTogglingId(null);
    }
  };

  const deleteRule = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/rules?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error eliminando regla");
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando regla");
    } finally {
      setDeletingId(null);
    }
  };

  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-cyan-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
            Reglas Automáticas
          </span>
          <span className="text-[10px] font-mono text-cyan-500/40">
            {activeCount} activas
          </span>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition"
        >
          <Plus size={12} /> Nueva regla
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400/60 hover:text-red-400"
          >
            &times;
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="rounded-2xl bg-[#0a1628] border border-cyan-500/20 p-4 space-y-3 animate-fade-in">
          <input
            value={form.pattern}
            onChange={(e) => setForm({ ...form, pattern: e.target.value })}
            placeholder="Patrón a buscar (ej: newsletter, factura...)"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] text-slate-200 placeholder:text-slate-600"
          />
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">En</span>
            <select
              value={form.field}
              onChange={(e) =>
                setForm({ ...form, field: e.target.value as RuleField })
              }
              className="px-2 py-1.5 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-slate-200"
            >
              {Object.entries(FIELD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <span className="text-slate-500">hacer</span>
            <select
              value={form.action}
              onChange={(e) =>
                setForm({ ...form, action: e.target.value as RuleAction })
              }
              className="px-2 py-1.5 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm text-slate-200"
            >
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Descripción (opcional)"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] text-slate-200 placeholder:text-slate-600"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={createRule}
              disabled={!form.pattern || saving}
              className="btn-accent text-xs !py-1.5 !px-4 disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              Crear regla
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setForm(DEFAULT_FORM);
              }}
              className="text-xs text-slate-500 hover:text-slate-300 transition px-3 py-1.5"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-cyan-500/50" />
        </div>
      )}

      {/* Empty state */}
      {!loading && rules.length === 0 && (
        <div className="text-center py-8 text-slate-600 text-xs">
          <Zap size={20} className="mx-auto mb-2 text-slate-700" />
          No hay reglas configuradas. Crea una para automatizar tu bandeja.
        </div>
      )}

      {/* Rules list */}
      {!loading && rules.length > 0 && (
        <div className="space-y-1.5">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`rounded-xl bg-[#0a1628] border px-4 py-3 transition-colors ${
                rule.enabled
                  ? "border-[#1a2d4a]"
                  : "border-[#1a2d4a]/40 opacity-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleRule(rule)}
                  className="flex-shrink-0"
                  disabled={togglingId === rule.id}
                >
                  {togglingId === rule.id ? (
                    <Loader2 size={20} className="animate-spin text-cyan-400/50" />
                  ) : rule.enabled ? (
                    <ToggleRight size={20} className="text-cyan-400" />
                  ) : (
                    <ToggleLeft size={20} className="text-slate-600" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-300 truncate">
                      &quot;{rule.pattern}&quot;
                    </p>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        ACTION_LABELS[rule.action as RuleAction]?.color ?? "text-slate-400"
                      } bg-white/5`}
                    >
                      {ACTION_LABELS[rule.action as RuleAction]?.label ?? rule.action}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    En{" "}
                    <span className="text-slate-400">
                      {FIELD_LABELS[rule.field as RuleField] ?? rule.field}
                    </span>
                    {rule.description && (
                      <>
                        {" "}
                        &middot;{" "}
                        <span className="text-slate-500">{rule.description}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span
                    className="flex items-center gap-1 text-[10px] font-mono text-slate-600"
                    title="Emails coincidentes"
                  >
                    <Hash size={10} />
                    {rule.matchCount ?? 0}
                  </span>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    disabled={deletingId === rule.id}
                    className="text-slate-600 hover:text-red-400 transition"
                  >
                    {deletingId === rule.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
