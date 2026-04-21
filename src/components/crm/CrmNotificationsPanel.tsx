"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Bell, BellRing, AlertTriangle, Info, Eye, EyeOff, CheckCircle,
  X, ChevronRight, Building2, Briefcase, ClipboardList, Zap, Users,
  RotateCcw, TrendingUp, Clock,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────

interface Notification {
  id: number;
  userId: string;
  companyId: number | null;
  opportunityId: number | null;
  caseId: number | null;
  taskId: number | null;
  serviceId: number | null;
  type: string;
  title: string;
  message: string;
  severity: string;
  status: string;
  source: string;
  dedupKey: string | null;
  createdAt: string;
  seenAt: string | null;
  resolvedAt: string | null;
}

interface NotificationWithCompany {
  notification: Notification;
  companyName: string | null;
}

interface NotifSummary {
  totalNew: number;
  totalUrgent: number;
  totalWarning: number;
  totalActive: number;
}

interface GenerationResult {
  totalNotifications: number;
  totalTasks: number;
  rules: { rule: string; notificationsCreated: number; tasksCreated: number; skipped: number; errors: string[] }[];
  executedAt: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function typeIcon(type: string) {
  const map: Record<string, React.ReactNode> = {
    task_overdue: <ClipboardList className="w-3.5 h-3.5 text-red-500" />,
    followup_overdue: <Clock className="w-3.5 h-3.5 text-orange-500" />,
    renewal_upcoming: <RotateCcw className="w-3.5 h-3.5 text-purple-500" />,
    opportunity_stale: <Briefcase className="w-3.5 h-3.5 text-yellow-600" />,
    cross_sell: <TrendingUp className="w-3.5 h-3.5 text-green-500" />,
    inactivity: <Users className="w-3.5 h-3.5 text-gray-500" />,
    suggested_task: <Zap className="w-3.5 h-3.5 text-blue-500" />,
  };
  return map[type] || <Bell className="w-3.5 h-3.5 text-gray-400" />;
}

function typeLabel(type: string) {
  const map: Record<string, string> = {
    task_overdue: "Tarea vencida",
    followup_overdue: "Seguimiento vencido",
    renewal_upcoming: "Renovación",
    opportunity_stale: "Oportunidad estancada",
    cross_sell: "Cross-sell",
    inactivity: "Inactividad",
    suggested_task: "Tarea sugerida",
  };
  return map[type] || type;
}

function severityBadge(severity: string) {
  if (severity === "urgent") return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Urgente</span>;
  if (severity === "warning") return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">Aviso</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-600">Info</span>;
}

function statusBadge(status: string) {
  if (status === "new") return <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />;
  if (status === "seen") return <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />;
  if (status === "dismissed") return <span className="w-2 h-2 rounded-full bg-gray-200 shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />;
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60));
  if (diff < 60) return `hace ${diff}m`;
  if (diff < 1440) return `hace ${Math.floor(diff / 60)}h`;
  return `hace ${Math.floor(diff / 1440)}d`;
}

// ─── Summary Cards ─────────────────────────────────────────────────────

function NotifSummaryCards({ summary, onRefresh }: { summary: NotifSummary; onRefresh: () => void }) {
  const cards = [
    { label: "Nuevas", value: summary.totalNew, color: "text-blue-600", bg: "bg-blue-50", icon: <BellRing className="w-3.5 h-3.5" /> },
    { label: "Urgentes", value: summary.totalUrgent, color: "text-red-600", bg: "bg-red-50", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    { label: "Avisos", value: summary.totalWarning, color: "text-amber-600", bg: "bg-amber-50", icon: <Info className="w-3.5 h-3.5" /> },
    { label: "Activas", value: summary.totalActive, color: "text-gray-600", bg: "bg-gray-50", icon: <Bell className="w-3.5 h-3.5" /> },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {cards.map((c) => (
        <div key={c.label} className={`${c.bg} rounded-lg px-2 py-1.5 text-center`}>
          <div className={`text-lg font-bold ${c.color}`}>{c.value}</div>
          <div className="text-[10px] text-gray-600 flex items-center justify-center gap-1">{c.icon}{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Notification Item ─────────────────────────────────────────────────

function NotifItem({ item, onAction }: {
  item: NotificationWithCompany;
  onAction: (id: number, action: string) => void;
}) {
  const n = item.notification;
  const isNew = n.status === "new";

  return (
    <div className={`flex items-start gap-2 py-2 px-2 rounded border text-sm ${isNew ? "border-blue-200 bg-blue-50/50" : "border-gray-100"}`}>
      {statusBadge(n.status)}
      <div className="mt-0.5">{typeIcon(n.type)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-gray-800">{n.title}</span>
          {severityBadge(n.severity)}
          {item.companyName && (
            <span className="text-xs text-blue-600 flex items-center gap-0.5">
              <Building2 className="w-3 h-3" />{item.companyName}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.message}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-gray-400">{timeAgo(n.createdAt)}</span>
          <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-500">{typeLabel(n.type)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {n.status === "new" && (
          <button
            onClick={() => onAction(n.id, "seen")}
            className="p-1 rounded hover:bg-gray-200 text-gray-400"
            title="Marcar vista"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}
        {n.status !== "dismissed" && n.status !== "resolved" && (
          <button
            onClick={() => onAction(n.id, "dismissed")}
            className="p-1 rounded hover:bg-gray-200 text-gray-400"
            title="Descartar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {n.status !== "resolved" && (
          <button
            onClick={() => onAction(n.id, "resolved")}
            className="p-1 rounded hover:bg-green-100 text-gray-400"
            title="Resolver"
          >
            <CheckCircle className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Panel ────────────────────────────────────────────────────────

export default function CrmNotificationsPanel({ companyId }: { companyId?: number }) {
  const [notifications, setNotifications] = useState<NotificationWithCompany[]>([]);
  const [summary, setSummary] = useState<NotifSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [lastGenResult, setLastGenResult] = useState<GenerationResult | null>(null);
  const [filter, setFilter] = useState<"all" | "new" | "urgent">("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const viewMap = { all: "list", new: "new", urgent: "urgent" };
      const baseUrl = companyId
        ? `/api/crm/notifications?view=company&companyId=${companyId}`
        : `/api/crm/notifications?view=${viewMap[filter]}&limit=50`;

      const [notifsRes, summaryRes] = await Promise.all([
        fetch(baseUrl),
        !companyId ? fetch("/api/crm/notifications?view=summary") : Promise.resolve(null),
      ]);

      const notifsData = await notifsRes.json();
      setNotifications(notifsData.notifications || []);

      if (summaryRes) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData.summary || null);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [companyId, filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAction = async (id: number, action: string) => {
    await fetch(`/api/crm/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: action }),
    });
    fetchData();
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/crm/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const data = await res.json();
      setLastGenResult(data.result || null);
      fetchData();
    } finally {
      setGenerating(false);
    }
  };

  const handleMarkAllSeen = async () => {
    await fetch("/api/crm/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_seen" }),
    });
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Cargando notificaciones...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
          <Bell className="w-4 h-4" /> Notificaciones Operativas
          {summary && summary.totalNew > 0 && (
            <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {summary.totalNew}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="text-xs bg-purple-600 text-white px-2 py-1 rounded flex items-center gap-1 hover:bg-purple-700 disabled:opacity-50"
            title="Escanear y generar notificaciones"
          >
            <Zap className="w-3 h-3" /> {generating ? "Generando..." : "Escanear"}
          </button>
          {summary && summary.totalNew > 0 && (
            <button
              onClick={handleMarkAllSeen}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
              title="Marcar todas como vistas"
            >
              <EyeOff className="w-3 h-3" />
            </button>
          )}
          <button onClick={fetchData} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Summary */}
      {!companyId && summary && <NotifSummaryCards summary={summary} onRefresh={fetchData} />}

      {/* Generation result */}
      {lastGenResult && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 text-xs">
          <div className="flex items-center gap-1 text-purple-700 font-medium">
            <Zap className="w-3 h-3" />
            Generadas {lastGenResult.totalNotifications} notificaciones
            {lastGenResult.totalTasks > 0 && `, ${lastGenResult.totalTasks} tareas`}
          </div>
          <button onClick={() => setLastGenResult(null)} className="text-purple-500 hover:text-purple-700 mt-1">
            Cerrar
          </button>
        </div>
      )}

      {/* Filter tabs */}
      {!companyId && (
        <div className="flex gap-1 border-b pb-1">
          {(["all", "new", "urgent"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-2 py-1 rounded-t ${filter === f ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-500 hover:text-gray-700"}`}
            >
              {f === "all" ? "Todas" : f === "new" ? "Nuevas" : "Urgentes"}
            </button>
          ))}
        </div>
      )}

      {/* Notification list */}
      {notifications.length === 0 ? (
        <p className="text-sm text-gray-500 py-3 text-center">Sin notificaciones</p>
      ) : (
        <div className="space-y-1.5">
          {notifications.map((item) => (
            <NotifItem key={item.notification.id} item={item} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  );
}

export { NotifSummaryCards, NotifItem };
