"use client";

import { useState, useEffect, useCallback } from "react";
import { MapPin, Plus, Clock, CheckCircle, Navigation, Phone, Calendar, Loader2 } from "lucide-react";

interface Visit {
  id: number;
  contactName: string;
  address: string | null;
  phone: string | null;
  date: string;
  time: string | null;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
  lat?: number | null;
  lng?: number | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
}

const STATUS_CONFIG = {
  scheduled: { label: "Programada", color: "#06b6d4", bg: "bg-cyan-500/10" },
  in_progress: { label: "En curso", color: "#f59e0b", bg: "bg-amber-500/10" },
  completed: { label: "Completada", color: "#22c55e", bg: "bg-emerald-500/10" },
  cancelled: { label: "Cancelada", color: "#ef4444", bg: "bg-red-500/10" },
};

export default function VisitsPanel() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"all" | "today" | "completed">("all");
  const [form, setForm] = useState({ contactName: "", address: "", phone: "", date: "", time: "09:00", notes: "" });
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchVisits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/visits?filter=${filter}`);
      if (res.ok) {
        const data = await res.json();
        setVisits(data);
      }
    } catch {
      // silently fail — keep current list
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  const today = new Date().toISOString().slice(0, 10);

  const patchVisit = async (id: number, action: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch("/api/visits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) {
        const updated: Visit = await res.json();
        setVisits((prev) => prev.map((v) => (v.id === id ? updated : v)));
      }
    } catch {
      // ignore
    } finally {
      setUpdatingId(null);
    }
  };

  const markInProgress = (id: number) => patchVisit(id, "check_in");
  const markCompleted = (id: number) => patchVisit(id, "complete");

  const createVisit = async () => {
    if (!form.contactName || !form.date) return;
    setSaving(true);
    try {
      const res = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const newVisit: Visit = await res.json();
        setVisits((prev) => [newVisit, ...prev]);
        setShowCreate(false);
        setForm({ contactName: "", address: "", phone: "", date: "", time: "09:00", notes: "" });
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  // For today's route summary, compute from all visits (not just filtered)
  const scheduledToday = visits.filter((v) => {
    const vDate = v.date ? new Date(v.date).toISOString().slice(0, 10) : null;
    return vDate === today && v.status !== "completed" && v.status !== "cancelled";
  });

  // Apply client-side display filter only when filter is "all" (server already filters for today/completed)
  const filteredVisits = visits;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-cyan-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Visitas Comerciales</span>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition">
          <Plus size={12} /> Nueva visita
        </button>
      </div>

      {/* Route summary */}
      {scheduledToday.length > 0 && (
        <div className="rounded-2xl bg-cyan-500/5 border border-cyan-500/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Navigation size={12} className="text-cyan-400" />
            <span className="text-[10px] font-bold text-cyan-400">RUTA HOY &mdash; {scheduledToday.length} visitas</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {scheduledToday.map((v, i) => (
              <div key={v.id} className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-slate-400">{v.time}</span>
                <span className="text-[10px] text-slate-300">{v.contactName.split(" - ")[0]}</span>
                {i < scheduledToday.length - 1 && <span className="text-cyan-500/30 mx-1">&rarr;</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-1">
        {[
          { id: "all" as const, label: "Todas" },
          { id: "today" as const, label: "Hoy" },
          { id: "completed" as const, label: "Completadas" },
        ].map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`text-[10px] px-3 py-1.5 rounded-lg transition ${filter === f.id ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30" : "text-slate-500 hover:text-slate-300 border border-transparent"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-2xl bg-[#0a1628] border border-cyan-500/20 p-4 space-y-3 animate-fade-in">
          <div className="grid grid-cols-2 gap-2">
            <input value={form.contactName} onChange={(e) => setForm({...form, contactName: e.target.value})}
              placeholder="Nombre contacto / empresa" className="col-span-2 px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] text-slate-200 placeholder:text-slate-600" />
            <input value={form.address} onChange={(e) => setForm({...form, address: e.target.value})}
              placeholder="Direccion" className="col-span-2 px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] text-slate-200 placeholder:text-slate-600" />
            <input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})}
              placeholder="Telefono" className="px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] text-slate-200 placeholder:text-slate-600" />
            <div className="flex gap-2">
              <input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}
                className="flex-1 px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] text-slate-200" />
              <input type="time" value={form.time} onChange={(e) => setForm({...form, time: e.target.value})}
                className="w-24 px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] text-slate-200" />
            </div>
          </div>
          <textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})}
            placeholder="Notas" rows={2} className="w-full px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] text-slate-200 placeholder:text-slate-600" />
          <button onClick={createVisit} disabled={!form.contactName || !form.date || saving}
            className="btn-accent text-xs !py-1.5 !px-4 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 size={12} className="animate-spin" />}
            Programar visita
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-cyan-400" />
        </div>
      )}

      {/* Visits list */}
      {!loading && (
        <div className="space-y-1.5">
          {filteredVisits.length === 0 && (
            <div className="text-center py-12 text-slate-600"><MapPin size={32} className="mx-auto mb-2 text-cyan-500/20" /><p className="text-sm">Sin visitas</p></div>
          )}
          {filteredVisits.map((visit) => {
            const sc = STATUS_CONFIG[visit.status] || STATUS_CONFIG.scheduled;
            const visitDate = visit.date ? new Date(visit.date).toISOString().slice(0, 10) : "";
            const isUpdating = updatingId === visit.id;
            return (
              <div key={visit.id} className="rounded-xl bg-[#0a1628] border border-[#1a2d4a] px-4 py-3 hover:border-cyan-500/20 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${sc.color}15` }}>
                      {visit.status === "completed" ? <CheckCircle size={14} style={{ color: sc.color }} /> : <MapPin size={14} style={{ color: sc.color }} />}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-300">{visit.contactName}</p>
                      <span className="text-[8px] px-1.5 py-0.5 rounded uppercase font-bold" style={{ color: sc.color, backgroundColor: `${sc.color}15` }}>{sc.label}</span>
                    </div>
                    {visit.address && <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5"><MapPin size={9} /> {visit.address}</p>}
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-600">
                      <span className="flex items-center gap-1"><Calendar size={9} /> {visitDate}</span>
                      {visit.time && <span className="flex items-center gap-1"><Clock size={9} /> {visit.time}</span>}
                      {visit.phone && <span className="flex items-center gap-1"><Phone size={9} /> {visit.phone}</span>}
                    </div>
                    {visit.notes && <p className="text-[10px] text-slate-600 mt-1 italic">{visit.notes}</p>}
                  </div>
                  {visit.status === "scheduled" && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => markInProgress(visit.id)} disabled={isUpdating}
                        className="text-[9px] px-2 py-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-50">
                        {isUpdating ? <Loader2 size={10} className="animate-spin" /> : "Check-in"}
                      </button>
                      <button onClick={() => markCompleted(visit.id)} disabled={isUpdating}
                        className="text-[9px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-50">
                        Completar
                      </button>
                    </div>
                  )}
                  {visit.status === "in_progress" && (
                    <button onClick={() => markCompleted(visit.id)} disabled={isUpdating}
                      className="text-[9px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition flex-shrink-0 disabled:opacity-50">
                      {isUpdating ? <Loader2 size={10} className="animate-spin" /> : "Check-out"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
