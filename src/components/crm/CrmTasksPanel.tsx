"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Plus, CheckCircle, Circle, Clock, AlertTriangle,
  ArrowUp, ArrowRight, ArrowDown, ChevronRight,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────

interface Task {
  id: number;
  companyId: number | null;
  opportunityId: number | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueAt: string | null;
  source: string;
  completedAt: string | null;
  createdAt: string;
}

interface TaskWithCompany {
  task: Task;
  companyName: string | null;
}

interface TaskSummary {
  totalActive: number;
  overdue: number;
  dueToday: number;
  upcoming7d: number;
  alta: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function priorityIcon(p: string) {
  if (p === "alta") return <ArrowUp className="w-3.5 h-3.5 text-red-500" />;
  if (p === "media") return <ArrowRight className="w-3.5 h-3.5 text-yellow-500" />;
  return <ArrowDown className="w-3.5 h-3.5 text-gray-400" />;
}

function statusIcon(s: string) {
  if (s === "completada") return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
  if (s === "en_progreso") return <Clock className="w-3.5 h-3.5 text-blue-500" />;
  if (s === "cancelada") return <Circle className="w-3.5 h-3.5 text-gray-300" />;
  return <Circle className="w-3.5 h-3.5 text-gray-500" />;
}

function isOverdue(dueAt: string | null, status: string): boolean {
  if (!dueAt || status === "completada" || status === "cancelada") return false;
  return new Date(dueAt) < new Date();
}

function sourceBadge(source: string) {
  const map: Record<string, { bg: string; label: string }> = {
    manual: { bg: "bg-gray-100 text-gray-600", label: "Manual" },
    suggested: { bg: "bg-blue-100 text-blue-700", label: "Sugerida" },
    followup: { bg: "bg-orange-100 text-orange-700", label: "Seguimiento" },
    renewal: { bg: "bg-purple-100 text-purple-700", label: "Renovación" },
    case: { bg: "bg-green-100 text-green-700", label: "Caso" },
  };
  const m = map[source] || map.manual;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${m.bg}`}>{m.label}</span>;
}

// ─── Task Form ─────────────────────────────────────────────────────────

function TaskForm({ companyId, opportunityId, onCreated }: {
  companyId?: number;
  opportunityId?: number;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("media");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/crm/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          companyId: companyId ?? null,
          opportunityId: opportunityId ?? null,
          priority,
          dueAt: dueAt || null,
          source: "manual",
        }),
      });
      setTitle(""); setDueAt("");
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-gray-50 flex items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Nueva tarea..."
        className="flex-1 text-sm border rounded px-2 py-1"
      />
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        className="text-xs border rounded px-2 py-1 bg-white"
      >
        <option value="alta">Alta</option>
        <option value="media">Media</option>
        <option value="baja">Baja</option>
      </select>
      <input
        type="date"
        value={dueAt}
        onChange={(e) => setDueAt(e.target.value)}
        className="text-xs border rounded px-2 py-1"
      />
      <button
        onClick={handleSubmit}
        disabled={saving || !title.trim()}
        className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "..." : "Crear"}
      </button>
    </div>
  );
}

// ─── Task List ─────────────────────────────────────────────────────────

function TaskList({ tasks, onStatusChange }: {
  tasks: (Task | TaskWithCompany)[];
  onStatusChange: () => void;
}) {
  const changeStatus = async (taskId: number, status: string) => {
    await fetch(`/api/crm/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onStatusChange();
  };

  if (tasks.length === 0) {
    return <p className="text-sm text-gray-500 py-3 text-center">Sin tareas</p>;
  }

  return (
    <div className="space-y-1">
      {tasks.map((item) => {
        const t = "task" in item ? item.task : item;
        const company = "companyName" in item ? item.companyName : null;
        const overdue = isOverdue(t.dueAt, t.status);

        return (
          <div key={t.id} className={`flex items-center gap-2 py-1.5 px-2 rounded border text-sm ${overdue ? "border-red-200 bg-red-50" : "border-gray-100"}`}>
            <button
              onClick={() => changeStatus(t.id, t.status === "pendiente" ? "en_progreso" : "completada")}
              className="shrink-0"
              title={t.status === "pendiente" ? "Empezar" : "Completar"}
            >
              {statusIcon(t.status)}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {priorityIcon(t.priority)}
                <span className={`font-medium ${t.status === "completada" ? "line-through text-gray-400" : ""}`}>
                  {t.title}
                </span>
                {company && <span className="text-xs text-blue-600">{company}</span>}
                {sourceBadge(t.source)}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs">
              {overdue && <span className="text-red-600 font-medium">Vencida</span>}
              {t.dueAt && !overdue && (
                <span className="text-gray-500">{new Date(t.dueAt).toLocaleDateString("es-ES")}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Summary Cards ─────────────────────────────────────────────────────

function TaskSummaryCards({ summary }: { summary: TaskSummary }) {
  const cards = [
    { label: "Activas", value: summary.totalActive, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Vencidas", value: summary.overdue, color: "text-red-600", bg: "bg-red-50" },
    { label: "Hoy", value: summary.dueToday, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "7 días", value: summary.upcoming7d, color: "text-green-600", bg: "bg-green-50" },
    { label: "Alta", value: summary.alta, color: "text-purple-600", bg: "bg-purple-50" },
  ];
  return (
    <div className="grid grid-cols-5 gap-2">
      {cards.map((c) => (
        <div key={c.label} className={`${c.bg} rounded-lg px-2 py-1.5 text-center`}>
          <div className={`text-lg font-bold ${c.color}`}>{c.value}</div>
          <div className="text-[10px] text-gray-600">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Panel ────────────────────────────────────────────────────────

export default function CrmTasksPanel({ companyId, opportunityId }: {
  companyId?: number;
  opportunityId?: number;
}) {
  const [tasks, setTasks] = useState<(Task | TaskWithCompany)[]>([]);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"active" | "overdue" | "today">("active");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (companyId) {
        const res = await fetch(`/api/crm/tasks?view=company&companyId=${companyId}`);
        const data = await res.json();
        setTasks(data.tasks || []);
      } else if (opportunityId) {
        const res = await fetch(`/api/crm/tasks?view=opportunity&opportunityId=${opportunityId}`);
        const data = await res.json();
        setTasks(data.tasks || []);
      } else {
        const viewMap = { active: "active", overdue: "overdue", today: "today" };
        const [tasksRes, summaryRes] = await Promise.all([
          fetch(`/api/crm/tasks?view=${viewMap[tab]}&limit=30`),
          fetch("/api/crm/tasks?view=summary"),
        ]);
        const tasksData = await tasksRes.json();
        const summaryData = await summaryRes.json();
        setTasks(tasksData.tasks || []);
        setSummary(summaryData.summary || null);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [companyId, opportunityId, tab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Cargando tareas...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">Tareas Comerciales</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs bg-blue-600 text-white px-2 py-1 rounded flex items-center gap-1 hover:bg-blue-700"
          >
            <Plus className="w-3 h-3" /> Nueva
          </button>
          <button onClick={fetchData} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showForm && (
        <TaskForm
          companyId={companyId}
          opportunityId={opportunityId}
          onCreated={() => { setShowForm(false); fetchData(); }}
        />
      )}

      {!companyId && !opportunityId && summary && <TaskSummaryCards summary={summary} />}

      {!companyId && !opportunityId && (
        <div className="flex gap-1 border-b pb-1">
          {(["active", "overdue", "today"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs px-2 py-1 rounded-t ${tab === t ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-500 hover:text-gray-700"}`}
            >
              {t === "active" ? "Activas" : t === "overdue" ? "Vencidas" : "Hoy"}
            </button>
          ))}
        </div>
      )}

      <TaskList tasks={tasks} onStatusChange={fetchData} />
    </div>
  );
}

export { TaskForm, TaskList, TaskSummaryCards };
