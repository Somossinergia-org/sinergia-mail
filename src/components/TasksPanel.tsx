"use client";

import { useState, useEffect } from "react";
import { CheckSquare, Plus, ExternalLink, RefreshCw, Calendar as CalIcon } from "lucide-react";

interface TaskItem {
  id: string;
  title: string;
  notes: string | null;
  due: string | null;
  status: string;
  webViewLink: string;
}

export default function TasksPanel() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", notes: "", due: "" });

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      if (data.tasks) setTasks(data.tasks);
      if (data.error) setError(data.error);
    } catch { setError("Error cargando tareas"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTasks(); }, []);

  const handleCreate = async () => {
    if (!form.title) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowCreate(false);
        setForm({ title: "", notes: "", due: "" });
        fetchTasks();
      }
    } catch { /* */ }
    finally { setCreating(false); }
  };

  const isOverdue = (due: string | null) => {
    if (!due) return false;
    return new Date(due) < new Date();
  };

  const formatDue = (due: string | null) => {
    if (!due) return null;
    try { return new Date(due).toLocaleDateString("es-ES", { day: "numeric", month: "short" }); }
    catch { return null; }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare size={14} className="text-cyan-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Google Tasks</span>
          <span className="text-[10px] font-mono text-cyan-500/40">{tasks.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchTasks} className="text-cyan-500/60 hover:text-cyan-400 transition">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition">
            <Plus size={12} /> Nueva tarea
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-2xl bg-[#0a1628] border border-cyan-500/20 p-4 space-y-3 animate-fade-in">
          <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
            placeholder="Título de la tarea" className="w-full px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] focus:border-cyan-500/50" />
          <div className="flex gap-2">
            <input type="date" value={form.due} onChange={e => setForm({...form, due: e.target.value})}
              className="px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a] flex-1" />
            <button onClick={handleCreate} disabled={creating || !form.title}
              className="btn-accent text-xs !py-1.5 !px-4 disabled:opacity-50">
              {creating ? "..." : "Crear"}
            </button>
          </div>
          <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
            placeholder="Notas (opcional)" rows={2} className="w-full px-3 py-2 rounded-lg text-sm bg-[#050a14] border border-[#1a2d4a]" />
        </div>
      )}

      {/* Error */}
      {error && <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">{error}</div>}

      {/* Task list */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-slate-600">
          <CheckSquare size={32} className="mx-auto mb-2 text-cyan-500/20" />
          <p className="text-sm">Sin tareas pendientes</p>
        </div>
      ) : (
        <div className="space-y-1">
          {tasks.map(task => (
            <a key={task.id} href={task.webViewLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl bg-[#0a1628] border border-[#1a2d4a] px-4 py-3 hover:border-cyan-500/20 transition-colors group">
              <div className={`w-4 h-4 rounded border-2 flex-shrink-0 ${isOverdue(task.due) ? "border-red-400" : "border-cyan-500/30"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-300 truncate group-hover:text-white transition">{task.title}</p>
                {task.notes && <p className="text-[10px] text-slate-600 truncate">{task.notes}</p>}
              </div>
              {task.due && (
                <span className={`text-[10px] font-mono flex-shrink-0 flex items-center gap-1 ${isOverdue(task.due) ? "text-red-400" : "text-slate-500"}`}>
                  <CalIcon size={9} /> {formatDue(task.due)}
                </span>
              )}
              <ExternalLink size={12} className="text-slate-600 group-hover:text-cyan-400 transition flex-shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
