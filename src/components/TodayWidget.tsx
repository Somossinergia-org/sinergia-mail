"use client";

import { useState, useEffect } from "react";
import {
  CheckSquare,
  AlertTriangle,
  Clock,
  ArrowRight,
  Activity,
  Bell,
  Loader2,
  Calendar,
  Flame,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TaskItem {
  id: number;
  title: string;
  priority: string;
  dueAt: string | null;
  companyName?: string | null;
  status: string;
}

interface NotificationItem {
  id: number;
  message: string;
  priority: string;
  category: string;
  createdAt: string;
}

interface TodayData {
  tasksToday: TaskItem[];
  tasksOverdue: TaskItem[];
  tasksUrgent: TaskItem[];
  upcomingTasks: TaskItem[];
  notifications: NotificationItem[];
  loading: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function priorityColor(p: string): string {
  switch (p) {
    case "alta":
    case "high":
      return "text-red-400 bg-red-500/15 border-red-500/30";
    case "media":
    case "medium":
      return "text-amber-400 bg-amber-500/15 border-amber-500/30";
    default:
      return "text-green-400 bg-green-500/15 border-green-500/30";
  }
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((d.getTime() - now.getTime()) / 86400000);
  if (diff < -1) return `hace ${Math.abs(diff)} días`;
  if (diff === -1) return "ayer";
  if (diff === 0) return "hoy";
  if (diff === 1) return "mañana";
  return `en ${diff} días`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface TodayWidgetProps {
  onNavigate?: (tab: string) => void;
}

export default function TodayWidget({ onNavigate }: TodayWidgetProps) {
  const [data, setData] = useState<TodayData>({
    tasksToday: [],
    tasksOverdue: [],
    tasksUrgent: [],
    upcomingTasks: [],
    notifications: [],
    loading: true,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [todayRes, overdueRes, upcomingRes, notiRes] = await Promise.all([
          fetch("/api/crm/tasks?view=today").then((r) => (r.ok ? r.json() : { tasks: [] })),
          fetch("/api/crm/tasks?view=overdue").then((r) => (r.ok ? r.json() : { tasks: [] })),
          fetch("/api/crm/tasks?view=upcoming&days=3&limit=5").then((r) => (r.ok ? r.json() : { tasks: [] })),
          fetch("/api/crm/notifications?limit=5&status=pending").then((r) => (r.ok ? r.json() : { notifications: [] })),
        ]);

        const urgent = [...(todayRes.tasks || []), ...(overdueRes.tasks || [])].filter(
          (t: TaskItem) => t.priority === "alta"
        );

        setData({
          tasksToday: todayRes.tasks || [],
          tasksOverdue: overdueRes.tasks || [],
          tasksUrgent: urgent,
          upcomingTasks: upcomingRes.tasks || [],
          notifications: notiRes.notifications || [],
          loading: false,
        });
      } catch (e) {
        console.error("TodayWidget load error:", e);
        setData((d) => ({ ...d, loading: false }));
      }
    };
    load();
  }, []);

  if (data.loading) {
    return (
      <div className="glass-card p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-sinergia-400" />
        <span className="ml-2 text-sm text-[var(--text-secondary)]">Cargando tu día...</span>
      </div>
    );
  }

  const totalToday = data.tasksToday.length;
  const totalOverdue = data.tasksOverdue.length;
  const totalUrgent = data.tasksUrgent.length;
  const totalNotifications = data.notifications.length;
  const hasAnything = totalToday + totalOverdue + totalUrgent + totalNotifications + data.upcomingTasks.length > 0;

  // Si no hay nada que mostrar, NO renderizamos la card. Evita el "hueco
  // grande" en la pantalla de inicio cuando un usuario no tiene tareas.
  if (!hasAnything) return null;

  return (
    <div className="glass-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-sinergia-400" />
          <h3 className="text-sm font-bold text-shimmer">Mi agenda hoy</h3>
        </div>
        {onNavigate && (
          <button
            onClick={() => onNavigate("crm")}
            className="text-xs text-[var(--text-secondary)] hover:text-sinergia-400 transition flex items-center gap-1"
          >
            Ver todo <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Urgentes / Vencidos */}
      {(totalUrgent > 0 || totalOverdue > 0) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">
              Requiere atención ({totalOverdue} vencidas, {totalUrgent} urgentes)
            </span>
          </div>
          <div className="space-y-1.5">
            {data.tasksOverdue.slice(0, 5).map((t) => (
              <TaskRow key={`ov-${t.id}`} task={t} tag="Vencida" tagColor="text-red-400 bg-red-500/10" />
            ))}
            {data.tasksUrgent
              .filter((u) => !data.tasksOverdue.some((ov) => ov.id === u.id))
              .slice(0, 3)
              .map((t) => (
                <TaskRow key={`ur-${t.id}`} task={t} tag="Urgente" tagColor="text-orange-400 bg-orange-500/10" />
              ))}
          </div>
        </div>
      )}

      {/* Tareas de hoy */}
      {totalToday > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
              Para hoy ({totalToday})
            </span>
          </div>
          <div className="space-y-1.5">
            {data.tasksToday.slice(0, 5).map((t) => (
              <TaskRow key={`td-${t.id}`} task={t} />
            ))}
            {totalToday > 5 && (
              <p className="text-xs text-[var(--text-secondary)] pl-2">
                +{totalToday - 5} más
              </p>
            )}
          </div>
        </div>
      )}

      {/* Próximos 3 días */}
      {data.upcomingTasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
              Próximos 3 días
            </span>
          </div>
          <div className="space-y-1.5">
            {data.upcomingTasks.map((t) => (
              <TaskRow key={`up-${t.id}`} task={t} showDate />
            ))}
          </div>
        </div>
      )}

      {/* Alertas / Notificaciones */}
      {totalNotifications > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
              Alertas ({totalNotifications})
            </span>
          </div>
          <div className="space-y-1.5">
            {data.notifications.slice(0, 3).map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs"
              >
                <Flame className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <span className="text-[var(--text-primary)] line-clamp-2">
                  {n.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TaskRow                                                            */
/* ------------------------------------------------------------------ */

function TaskRow({
  task,
  tag,
  tagColor,
  showDate,
}: {
  task: TaskItem;
  tag?: string;
  tagColor?: string;
  showDate?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs group">
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          task.priority === "alta"
            ? "bg-red-400"
            : task.priority === "media"
            ? "bg-amber-400"
            : "bg-green-400"
        }`}
      />
      <span className="text-[var(--text-primary)] truncate flex-1">{task.title}</span>
      {task.companyName && (
        <span className="text-[var(--text-secondary)] truncate max-w-[80px]">
          {task.companyName}
        </span>
      )}
      {tag && (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tagColor}`}>
          {tag}
        </span>
      )}
      {showDate && task.dueAt && (
        <span className="text-[var(--text-secondary)] shrink-0">
          {formatRelativeDate(task.dueAt)}
        </span>
      )}
    </div>
  );
}
