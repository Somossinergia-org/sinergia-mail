"use client";

import { useState } from "react";
import { Filter, Plus, Trash2, ToggleLeft, ToggleRight, Zap, Mail, Tag, Reply } from "lucide-react";

type RuleAction = "categorize" | "auto_reply" | "forward" | "tag" | "archive" | "priority";

interface Rule {
  id: string;
  name: string;
  condition: { field: string; operator: string; value: string };
  action: RuleAction;
  actionValue: string;
  enabled: boolean;
}

const ACTION_LABELS: Record<RuleAction, { label: string; icon: React.ReactNode }> = {
  categorize: { label: "Categorizar como", icon: <Tag size={12} /> },
  auto_reply: { label: "Auto-responder", icon: <Reply size={12} /> },
  forward: { label: "Reenviar a", icon: <Mail size={12} /> },
  tag: { label: "Etiquetar", icon: <Tag size={12} /> },
  archive: { label: "Archivar", icon: <Filter size={12} /> },
  priority: { label: "Prioridad", icon: <Zap size={12} /> },
};

export default function RulesPanel() {
  const [rules, setRules] = useState<Rule[]>([
    { id: "1", name: "Facturas → FACTURA", condition: { field: "subject", operator: "contains", value: "factura" }, action: "categorize", actionValue: "FACTURA", enabled: true },
    { id: "2", name: "Urgente → Alta prioridad", condition: { field: "subject", operator: "contains", value: "urgente" }, action: "priority", actionValue: "ALTA", enabled: true },
    { id: "3", name: "Newsletter → Archivar", condition: { field: "from", operator: "contains", value: "newsletter" }, action: "archive", actionValue: "", enabled: false },
  ]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", field: "subject", operator: "contains", value: "", action: "categorize" as RuleAction, actionValue: "" });

  const toggleRule = (id: string) => {
    setRules(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const deleteRule = (id: string) => {
    setRules(rules.filter(r => r.id !== id));
  };

  const createRule = () => {
    if (!form.name || !form.value) return;
    const newRule: Rule = {
      id: String(Date.now()),
      name: form.name,
      condition: { field: form.field, operator: form.operator, value: form.value },
      action: form.action,
      actionValue: form.actionValue,
      enabled: true,
    };
    setRules([...rules, newRule]);
    setShowCreate(false);
    setForm({ name: "", field: "subject", operator: "contains", value: "", action: "categorize", actionValue: "" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-cyan-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Reglas Automáticas</span>
          <span className="text-[10px] font-mono text-cyan-500/40">{rules.filter(r => r.enabled).length} activas</span>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition">
          <Plus size={12} /> Nueva regla
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-2xl bg-[#0a1628] border border-cyan-500/20 p-4 space-y-3 animate-fade-in">
          <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
            placeholder="Nombre de la regla" className="w-full px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a]" />
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Si</span>
            <select value={form.field} onChange={e => setForm({...form, field: e.target.value})}
              className="px-2 py-1.5 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm">
              <option value="subject">Asunto</option><option value="from">Remitente</option><option value="body">Cuerpo</option><option value="category">Categoría</option>
            </select>
            <select value={form.operator} onChange={e => setForm({...form, operator: e.target.value})}
              className="px-2 py-1.5 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm">
              <option value="contains">contiene</option><option value="equals">es igual a</option><option value="starts_with">empieza por</option><option value="regex">regex</option>
            </select>
            <input value={form.value} onChange={e => setForm({...form, value: e.target.value})}
              placeholder="valor" className="flex-1 px-2 py-1.5 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm" />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Entonces</span>
            <select value={form.action} onChange={e => setForm({...form, action: e.target.value as RuleAction})}
              className="px-2 py-1.5 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm">
              {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <input value={form.actionValue} onChange={e => setForm({...form, actionValue: e.target.value})}
              placeholder="valor acción" className="flex-1 px-2 py-1.5 rounded-lg bg-[#050a14] border border-[#1a2d4a] text-sm" />
          </div>
          <button onClick={createRule} disabled={!form.name || !form.value}
            className="btn-accent text-xs !py-1.5 !px-4 disabled:opacity-50">Crear regla</button>
        </div>
      )}

      {/* Rules list */}
      <div className="space-y-1.5">
        {rules.map(rule => (
          <div key={rule.id} className={`rounded-xl bg-[#0a1628] border px-4 py-3 transition-colors ${rule.enabled ? "border-[#1a2d4a]" : "border-[#1a2d4a]/40 opacity-50"}`}>
            <div className="flex items-center gap-3">
              <button onClick={() => toggleRule(rule.id)} className="flex-shrink-0">
                {rule.enabled ? <ToggleRight size={20} className="text-cyan-400" /> : <ToggleLeft size={20} className="text-slate-600" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-300">{rule.name}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">
                  Si <span className="text-slate-400">{rule.condition.field}</span> {rule.condition.operator} &quot;<span className="text-cyan-400/60">{rule.condition.value}</span>&quot; → {ACTION_LABELS[rule.action].label} <span className="text-slate-400">{rule.actionValue}</span>
                </p>
              </div>
              <button onClick={() => deleteRule(rule.id)} className="text-slate-600 hover:text-red-400 transition flex-shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
