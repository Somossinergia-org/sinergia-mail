"use client";

import { useState, useEffect, useCallback } from "react";
import { Zap, Plus, Play, Pause, ChevronRight, Mail, Clock, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Step {
  subject: string;
  body: string;
  waitDays: number;
  condition: string | null;
}

interface Sequence {
  id: number;
  name: string;
  description: string | null;
  trigger: string;
  active: boolean;
  totalEnrolled: number;
  totalCompleted: number;
  steps: Step[];
  enrollments: { id: number; contactEmail: string; status: string; currentStep: number }[];
}

export default function SequencesPanel() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", trigger: "manual" });
  const [steps, setSteps] = useState<Step[]>([{ subject: "", body: "", waitDays: 1, condition: null }]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sequences");
      if (res.ok) setSequences(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (id: number, active: boolean) => {
    await fetch("/api/sequences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active: !active }) });
    toast.success(active ? "Secuencia pausada" : "Secuencia activada");
    load();
  };

  const create = async () => {
    if (!form.name || steps.some(s => !s.subject || !s.body)) { toast.error("Completa todos los campos"); return; }
    await fetch("/api/sequences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, steps }) });
    toast.success("Secuencia creada");
    setCreating(false);
    setForm({ name: "", description: "", trigger: "manual" });
    setSteps([{ subject: "", body: "", waitDays: 1, condition: null }]);
    load();
  };

  const triggers: Record<string, string> = { manual: "Manual", new_contact: "Nuevo contacto", invoice_overdue: "Factura vencida", no_reply: "Sin respuesta" };

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <Zap className="w-4.5 h-4.5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Secuencias Drip</h3>
            <p className="text-[11px] text-[var(--text-secondary)]">{sequences.length} secuencias · {sequences.filter(s => s.active).length} activas</p>
          </div>
        </div>
        <button onClick={() => setCreating(!creating)} className="btn-accent text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Nueva
        </button>
      </div>

      {/* Create Form */}
      {creating && (
        <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--bg-card)]/50 space-y-3">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre de la secuencia" className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] focus:border-amber-500/50 focus:outline-none" />
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descripción (opcional)" className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] focus:border-amber-500/50 focus:outline-none" />
          <select value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-primary)] border border-[var(--border)]">
            {Object.entries(triggers).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <div className="text-xs font-semibold text-[var(--text-secondary)] mt-3">Pasos:</div>
          {steps.map((step, i) => (
            <div key={i} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]/50 space-y-2">
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                Paso {i + 1} — esperar {step.waitDays} día(s)
              </div>
              <input value={step.subject} onChange={e => { const s = [...steps]; s[i].subject = e.target.value; setSteps(s); }} placeholder="Asunto del email" className="w-full px-3 py-1.5 text-sm rounded bg-[var(--bg-primary)] border border-[var(--border)]" />
              <textarea value={step.body} onChange={e => { const s = [...steps]; s[i].body = e.target.value; setSteps(s); }} placeholder="Cuerpo del email (usa {{name}} y {{email}})" rows={2} className="w-full px-3 py-1.5 text-sm rounded bg-[var(--bg-primary)] border border-[var(--border)] resize-none" />
              <div className="flex gap-2">
                <input type="number" min={1} max={90} value={step.waitDays} onChange={e => { const s = [...steps]; s[i].waitDays = parseInt(e.target.value) || 1; setSteps(s); }} className="w-20 px-2 py-1 text-sm rounded bg-[var(--bg-primary)] border border-[var(--border)]" />
                <span className="text-xs text-[var(--text-secondary)] self-center">días de espera</span>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setSteps([...steps, { subject: "", body: "", waitDays: 3, condition: null }])} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
              <Plus className="w-3 h-3" /> Añadir paso
            </button>
            <div className="flex-1" />
            <button onClick={() => setCreating(false)} className="text-xs text-[var(--text-secondary)] hover:text-white px-3 py-1.5">Cancelar</button>
            <button onClick={create} className="btn-accent text-xs px-4 py-1.5 rounded-lg">Crear secuencia</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="divide-y divide-[var(--border)]">
        {loading && <div className="px-5 py-8 text-center text-sm text-[var(--text-secondary)]">Cargando...</div>}
        {!loading && sequences.length === 0 && !creating && (
          <div className="px-5 py-8 text-center">
            <Zap className="w-8 h-8 text-amber-400/30 mx-auto mb-2" />
            <p className="text-sm text-[var(--text-secondary)]">Sin secuencias. Crea una para automatizar follow-ups.</p>
          </div>
        )}
        {sequences.map(seq => (
          <div key={seq.id} className="px-5 py-3 hover:bg-[var(--bg-card)]/50 transition">
            <div className="flex items-center gap-3">
              <button onClick={() => toggleActive(seq.id, seq.active)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${seq.active ? "bg-emerald-500/15 text-emerald-400" : "bg-[var(--bg-card)] text-[var(--text-secondary)]"}`}>
                {seq.active ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{seq.name}</div>
                <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {seq.steps?.length || 0} pasos</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {seq.totalEnrolled || 0} inscritos</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {triggers[seq.trigger] || seq.trigger}</span>
                </div>
              </div>
              <div className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${seq.active ? "bg-emerald-500/15 text-emerald-400" : "bg-[var(--bg-card)] text-[var(--text-secondary)]"}`}>
                {seq.active ? "Activa" : "Pausada"}
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
