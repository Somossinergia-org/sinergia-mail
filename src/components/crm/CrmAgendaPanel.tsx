"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Calendar, CalendarDays, Clock, AlertTriangle,
  ClipboardList, Phone, RotateCcw, Briefcase, Building2,
  ChevronRight, TrendingUp, ArrowUp, ArrowDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────

interface AgendaItem {
  type: string;
  id: number;
  title: string;
  date: string | null;
  companyName: string | null;
  companyId: number | null;
  priority: string;
  status: string;
  context: string | null;
}

interface AgendaTimeSlot {
  label: string;
  slot: string;
  items: AgendaItem[];
}

interface AgendaSummary {
  totalOverdue: number;
  totalToday: number;
  totalTomorrow: number;
  totalThisWeek: number;
  totalNextDays: number;
  highPriorityCount: number;
  notificationsNew: number;
  notificationsUrgent: number;
  overloadWarning: string | null;
}

interface OperationalAgenda {
  generatedAt: string;
  overdue: AgendaTimeSlot;
  today: AgendaTimeSlot;
  tomorrow: AgendaTimeSlot;
  thisWeek: AgendaTimeSlot;
  nextDays: AgendaTimeSlot;
  summary: AgendaSummary;
}

interface DaySummary {
  date: string;
  dayLabel: string;
  items: AgendaItem[];
  taskCount: number;
  followupCount: number;
  renewalCount: number;
}

interface WeeklySummary {
  days: DaySummary[];
  weekTotals: { tasks: number; followups: number; renewals: number; opportunities: number };
  priorities: { alta: number; media: number; baja: number };
  overdue: AgendaItem[];
  topActions: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────

function typeIcon(type: string) {
  const map: Record<string, React.ReactNode> = {
    task: <ClipboardList className="w-3.5 h-3.5 text-blue-500" />,
    followup: <Phone className="w-3.5 h-3.5 text-orange-500" />,
    renewal: <RotateCcw className="w-3.5 h-3.5 text-purple-500" />,
    opportunity: <Briefcase className="w-3.5 h-3.5 text-green-500" />,
    alert: <AlertTriangle className="w-3.5 h-3.5 text-red-500" />,
  };
  return map[type] || <Calendar className="w-3.5 h-3.5 text-gray-400" />;
}

function typeLabel(type: string) {
  const map: Record<string, string> = {
    task: "Tarea",
    followup: "Seguimiento",
    renewal: "Renovación",
    opportunity: "Oportunidad",
    alert: "Alerta",
  };
  return map[type] || type;
}

function priorityBadge(priority: string) {
  if (priority === "urgente") return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Urgente</span>;
  if (priority === "alta") return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">Alta</span>;
  if (priority === "media") return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-600">Media</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">Baja</span>;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "Sin fecha";
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function slotColor(slot: string) {
  if (slot === "overdue") return "border-red-300 bg-red-50/30";
  if (slot === "today") return "border-blue-300 bg-blue-50/30";
  if (slot === "tomorrow") return "border-indigo-200 bg-indigo-50/20";
  return "border-gray-200";
}

function slotIcon(slot: string) {
  if (slot === "overdue") return <AlertTriangle className="w-4 h-4 text-red-500" />;
  if (slot === "today") return <Calendar className="w-4 h-4 text-blue-600" />;
  if (slot === "tomorrow") return <CalendarDays className="w-4 h-4 text-indigo-500" />;
  return <Clock className="w-4 h-4 text-gray-400" />;
}

// ─── Summary Bar ────────────────────────────────────────���─────────────

function AgendaSummaryBar({ summary }: { summary: AgendaSummary }) {
  const cards = [
    { label: "Vencido", value: summary.totalOverdue, color: "text-red-600", bg: "bg-red-50", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    { label: "Hoy", value: summary.totalToday, color: "text-blue-600", bg: "bg-blue-50", icon: <Calendar className="w-3.5 h-3.5" /> },
    { label: "Mañana", value: summary.totalTomorrow, color: "text-indigo-600", bg: "bg-indigo-50", icon: <CalendarDays className="w-3.5 h-3.5" /> },
    { label: "Semana", value: summary.totalThisWeek, color: "text-gray-600", bg: "bg-gray-50", icon: <Clock className="w-3.5 h-3.5" /> },
    { label: "Próx.", value: summary.totalNextDays, color: "text-gray-500", bg: "bg-gray-50", icon: <ChevronRight className="w-3.5 h-3.5" /> },
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-1.5">
        {cards.map((c) => (
          <div key={c.label} className={`${c.bg} rounded-lg px-1.5 py-1.5 text-center`}>
            <div className={`text-lg font-bold ${c.color}`}>{c.value}</div>
            <div className="text-[10px] text-gray-600 flex items-center justify-center gap-0.5">{c.icon}{c.label}</div>
          </div>
        ))}
      </div>
      {summary.overloadWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1 text-xs text-amber-700 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {summary.overloadWarning}
        </div>
      )}
      {summary.highPriorityCount > 0 && (
        <div className="text-xs text-gray-500 flex items-center gap-1">
          <ArrowUp className="w-3 h-3 text-red-400" /> {summary.highPriorityCount} items de alta prioridad
        </div>
      )}
    </div>
  );
}

// ─── Agenda Item Row ──────────────────────────────────────────────────

function AgendaItemRow({ item }: { item: AgendaItem }) {
  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0">
      <div className="mt-0.5">{typeIcon(item.type)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-gray-800 truncate">{item.title}</span>
          {priorityBadge(item.priority)}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {item.companyName && (
            <span className="text-[11px] text-blue-600 flex items-center gap-0.5">
              <Building2 className="w-3 h-3" />{item.companyName}
            </span>
          )}
          <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-500">{typeLabel(item.type)}</span>
          {item.context && <span className="text-[10px] text-gray-400">{item.context}</span>}
        </div>
      </div>
      <div className="text-[10px] text-gray-400 whitespace-nowrap mt-1">
        {formatTime(item.date)}
      </div>
    </div>
  );
}

// ─── Time Slot Section ────────────────────────────────────────────────

function SlotSection({ slot, defaultOpen = true }: { slot: AgendaTimeSlot; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (slot.items.length === 0) return null;

  return (
    <div className={`border rounded-lg ${slotColor(slot.slot)}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-gray-700"
      >
        <span className="flex items-center gap-1.5">
          {slotIcon(slot.slot)}
          {slot.label}
          <span className="bg-white/70 text-xs px-1.5 py-0.5 rounded-full font-bold text-gray-600">
            {slot.items.length}
          </span>
        </span>
        <ChevronRight className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="px-1 pb-1">
          {slot.items.map((item) => (
            <AgendaItemRow key={`${item.type}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Weekly View ──────────────────────────────────────────────────────

function WeeklyView({ weekly }: { weekly: WeeklySummary }) {
  return (
    <div className="space-y-3">
      {/* Top actions */}
      {weekly.topActions.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-2 space-y-1">
          {weekly.topActions.map((a, i) => (
            <div key={i} className="text-xs text-gray-700">{a}</div>
          ))}
        </div>
      )}

      {/* Overdue */}
      {weekly.overdue.length > 0 && (
        <div className="border border-red-200 bg-red-50/30 rounded-lg p-2">
          <div className="text-xs font-semibold text-red-600 mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {weekly.overdue.length} Vencidos
          </div>
          {weekly.overdue.slice(0, 5).map((item) => (
            <AgendaItemRow key={`${item.type}-${item.id}`} item={item} />
          ))}
          {weekly.overdue.length > 5 && (
            <div className="text-xs text-red-400 mt-1">+{weekly.overdue.length - 5} más</div>
          )}
        </div>
      )}

      {/* Day by day */}
      {weekly.days.map((day) => (
        <div key={day.date} className="border rounded-lg">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-t-lg">
            <span className="text-sm font-semibold text-gray-700">{day.dayLabel}</span>
            <span className="text-xs text-gray-400">{day.items.length} items</span>
          </div>
          {day.items.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">Sin agenda</div>
          ) : (
            <div className="px-1 pb-1">
              {day.items.map((item) => (
                <AgendaItemRow key={`${item.type}-${item.id}`} item={item} />
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Week totals */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div className="bg-blue-50 rounded p-1.5">
          <div className="font-bold text-blue-600">{weekly.weekTotals.tasks}</div>
          <div className="text-gray-500">Tareas</div>
        </div>
        <div className="bg-orange-50 rounded p-1.5">
          <div className="font-bold text-orange-600">{weekly.weekTotals.followups}</div>
          <div className="text-gray-500">Seguim.</div>
        </div>
        <div className="bg-purple-50 rounded p-1.5">
          <div className="font-bold text-purple-600">{weekly.weekTotals.renewals}</div>
          <div className="text-gray-500">Renov.</div>
        </div>
        <div className="bg-green-50 rounded p-1.5">
          <div className="font-bold text-green-600">{weekly.weekTotals.opportunities}</div>
          <div className="text-gray-500">Oport.</div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────���────────────

export default function CrmAgendaPanel({ companyId }: { companyId?: number }) {
  const [agenda, setAgenda] = useState<OperationalAgenda | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"agenda" | "semanal">("agenda");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (companyId) {
        const res = await fetch(`/api/crm/agenda?view=company&companyId=${companyId}`);
        const data = await res.json();
        // Build a pseudo-agenda from company items
        if (data.companyAgenda) {
          const items = data.companyAgenda.items || [];
          setAgenda({
            generatedAt: new Date().toISOString(),
            overdue: { label: "Vencido", slot: "overdue", items: data.companyAgenda.overdue || [] },
            today: { label: "Hoy", slot: "today", items: [] },
            tomorrow: { label: "Mañana", slot: "tomorrow", items: [] },
            thisWeek: { label: "Esta semana", slot: "this_week", items: data.companyAgenda.upcoming || [] },
            nextDays: { label: "Próximos días", slot: "next_days", items: [] },
            summary: {
              totalOverdue: (data.companyAgenda.overdue || []).length,
              totalToday: 0,
              totalTomorrow: 0,
              totalThisWeek: (data.companyAgenda.upcoming || []).length,
              totalNextDays: 0,
              highPriorityCount: items.filter((i: AgendaItem) => i.priority === "alta" || i.priority === "urgente").length,
              notificationsNew: 0,
              notificationsUrgent: 0,
              overloadWarning: null,
            },
          });
        }
      } else if (viewMode === "semanal") {
        const res = await fetch("/api/crm/agenda?view=weekly");
        const data = await res.json();
        setWeekly(data.weekly || null);
      } else {
        const res = await fetch("/api/crm/agenda?view=full");
        const data = await res.json();
        setAgenda(data.agenda || null);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [companyId, viewMode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Cargando agenda...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
          <Calendar className="w-4 h-4" /> Agenda Operativa
        </h3>
        <div className="flex items-center gap-1.5">
          {!companyId && (
            <div className="flex gap-0.5 bg-gray-100 rounded p-0.5">
              <button
                onClick={() => setViewMode("agenda")}
                className={`text-xs px-2 py-1 rounded ${viewMode === "agenda" ? "bg-white shadow-sm font-medium" : "text-gray-500"}`}
              >
                Agenda
              </button>
              <button
                onClick={() => setViewMode("semanal")}
                className={`text-xs px-2 py-1 rounded ${viewMode === "semanal" ? "bg-white shadow-sm font-medium" : "text-gray-500"}`}
              >
                Semanal
              </button>
            </div>
          )}
          <button onClick={fetchData} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Agenda view */}
      {viewMode === "agenda" && agenda && (
        <div className="space-y-2">
          <AgendaSummaryBar summary={agenda.summary} />
          <SlotSection slot={agenda.overdue} defaultOpen={true} />
          <SlotSection slot={agenda.today} defaultOpen={true} />
          <SlotSection slot={agenda.tomorrow} defaultOpen={true} />
          <SlotSection slot={agenda.thisWeek} defaultOpen={false} />
          <SlotSection slot={agenda.nextDays} defaultOpen={false} />
          {agenda.overdue.items.length === 0 && agenda.today.items.length === 0 &&
           agenda.tomorrow.items.length === 0 && agenda.thisWeek.items.length === 0 &&
           agenda.nextDays.items.length === 0 && (
            <p className="text-sm text-gray-500 py-3 text-center">Sin agenda pendiente</p>
          )}
        </div>
      )}

      {/* Weekly view */}
      {viewMode === "semanal" && weekly && (
        <WeeklyView weekly={weekly} />
      )}
    </div>
  );
}
