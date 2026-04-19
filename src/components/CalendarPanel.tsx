"use client";

import { useState, useEffect } from "react";
import { Calendar, Plus, MapPin, Video, Clock, ExternalLink, RefreshCw } from "lucide-react";

interface CalEvent {
  id: string;
  summary: string;
  startISO: string;
  endISO: string;
  htmlLink: string;
  location: string | null;
}

export default function CalendarPanel() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ summary: "", description: "", date: "", time: "09:00", duration: 60, location: "", withMeet: false });

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar?days=14");
      const data = await res.json();
      if (data.events) setEvents(data.events);
      if (data.error) setError(data.error);
    } catch { setError("Error cargando calendario"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchEvents(); }, []);

  const handleCreate = async () => {
    if (!form.summary || !form.date) return;
    setCreating(true);
    try {
      const startISO = `${form.date}T${form.time}:00`;
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: form.summary, description: form.description, startISO, durationMin: form.duration, location: form.location, withMeet: form.withMeet }),
      });
      if (res.ok) {
        setShowCreate(false);
        setForm({ summary: "", description: "", date: "", time: "09:00", duration: 60, location: "", withMeet: false });
        fetchEvents();
      }
    } catch { /* */ }
    finally { setCreating(false); }
  };

  const groupByDay = (evts: CalEvent[]) => {
    const groups: Record<string, CalEvent[]> = {};
    for (const e of evts) {
      const day = e.startISO.slice(0, 10);
      if (!groups[day]) groups[day] = [];
      groups[day].push(e);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  };

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  };

  const formatDay = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T00:00:00");
      const today = new Date(); today.setHours(0,0,0,0);
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
      if (d.getTime() === today.getTime()) return "Hoy";
      if (d.getTime() === tomorrow.getTime()) return "Mañana";
      return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" });
    } catch { return dateStr; }
  };

  const isToday = (dateStr: string) => dateStr === new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-cyan-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Google Calendar</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchEvents} className="text-[10px] text-cyan-500/60 hover:text-cyan-400 transition font-mono">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition">
            <Plus size={12} /> Nuevo evento
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-2xl bg-[#0a1628] border border-cyan-500/20 p-4 space-y-3 animate-fade-in">
          <input value={form.summary} onChange={e => setForm({...form, summary: e.target.value})}
            placeholder="Título del evento" className="w-full px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] focus:border-cyan-500/50" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})}
              className="px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a]" />
            <input type="time" value={form.time} onChange={e => setForm({...form, time: e.target.value})}
              className="px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a]" />
            <select value={form.duration} onChange={e => setForm({...form, duration: Number(e.target.value)})}
              className="px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a]">
              <option value={30}>30 min</option><option value={60}>1 hora</option><option value={90}>1.5h</option><option value={120}>2h</option>
            </select>
            <input value={form.location} onChange={e => setForm({...form, location: e.target.value})}
              placeholder="Ubicación" className="px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a]" />
          </div>
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
            placeholder="Descripción (opcional)" rows={2} className="w-full px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a]" />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input type="checkbox" checked={form.withMeet} onChange={e => setForm({...form, withMeet: e.target.checked})}
                className="rounded border-[#1a2d4a]" />
              <Video size={12} /> Añadir Google Meet
            </label>
            <button onClick={handleCreate} disabled={creating || !form.summary || !form.date}
              className="btn-accent text-xs !py-1.5 !px-4 disabled:opacity-50">
              {creating ? "Creando..." : "Crear evento"}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">{error}</div>}

      {/* Events by day */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-slate-600">
          <Calendar size={32} className="mx-auto mb-2 text-cyan-500/20" />
          <p className="text-sm">Sin eventos próximos</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupByDay(events).map(([day, dayEvents]) => (
            <div key={day}>
              <div className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-2 ${isToday(day) ? "text-cyan-400" : "text-slate-500"}`}>
                {formatDay(day)}
              </div>
              <div className="space-y-1">
                {dayEvents.map(evt => (
                  <a key={evt.id} href={evt.htmlLink} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl bg-[#0a1628] border border-[#1a2d4a] px-4 py-3 hover:border-cyan-500/30 transition-colors group">
                    <div className="flex-shrink-0 w-12 text-center">
                      <span className="text-sm font-black font-mono text-cyan-400">{formatTime(evt.startISO)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-300 truncate group-hover:text-white transition">{evt.summary}</p>
                      {evt.location && (
                        <p className="text-[10px] text-slate-600 flex items-center gap-1 mt-0.5">
                          <MapPin size={9} /> {evt.location}
                        </p>
                      )}
                    </div>
                    <ExternalLink size={12} className="text-slate-600 group-hover:text-cyan-400 transition flex-shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
