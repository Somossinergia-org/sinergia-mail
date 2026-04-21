/**
 * Operational Agenda — Light commercial planning.
 *
 * Phase 10: Aggregation layer that groups tasks, follow-ups, renewals,
 * hot opportunities and alerts into time-based views.
 *
 * No new schema — this is a VIEW layer over Phases 7-9 data.
 * All queries enforce userId ownership via underlying services.
 */

import { getTodayTasks, getOverdueTasks, getUpcomingTasks } from "./commercial-tasks";
import { getOverdueFollowUps, getUpcomingFollowUps } from "./activities";
import { getExpiringServices, getHotOpportunities } from "./commercial-ops";
import { listNewNotifications, getNotificationSummary } from "./notifications";

// ─── Types ────────────────────────────────────────────────────────────

export type AgendaItemType =
  | "task"
  | "followup"
  | "renewal"
  | "opportunity"
  | "alert";

export interface AgendaItem {
  type: AgendaItemType;
  id: number;
  title: string;
  /** Date string ISO — the relevant date for sorting */
  date: string | null;
  /** Company name if linked */
  companyName: string | null;
  companyId: number | null;
  /** Priority/urgency label */
  priority: "alta" | "media" | "baja" | "urgente" | "info";
  /** Status or sub-type */
  status: string;
  /** Optional extra context (e.g. opportunity value, service type) */
  context: string | null;
}

export interface AgendaTimeSlot {
  label: string;
  /** "overdue" | "today" | "tomorrow" | "this_week" | "next_days" */
  slot: string;
  /** ISO date range start (inclusive) */
  from: string;
  /** ISO date range end (inclusive) */
  to: string;
  items: AgendaItem[];
}

export interface OperationalAgenda {
  generatedAt: string;
  userId: string;
  overdue: AgendaTimeSlot;
  today: AgendaTimeSlot;
  tomorrow: AgendaTimeSlot;
  thisWeek: AgendaTimeSlot;
  /** Items beyond this week, up to 14 days out */
  nextDays: AgendaTimeSlot;
  summary: AgendaSummary;
}

export interface AgendaSummary {
  totalOverdue: number;
  totalToday: number;
  totalTomorrow: number;
  totalThisWeek: number;
  totalNextDays: number;
  highPriorityCount: number;
  notificationsNew: number;
  notificationsUrgent: number;
  /** Simple overload detection */
  overloadWarning: string | null;
}

export interface WeeklySummary {
  generatedAt: string;
  userId: string;
  days: DaySummary[];
  weekTotals: { tasks: number; followups: number; renewals: number; opportunities: number; alerts: number };
  priorities: { alta: number; media: number; baja: number };
  overdue: AgendaItem[];
  topActions: string[];
}

export interface DaySummary {
  date: string;
  dayLabel: string;
  items: AgendaItem[];
  taskCount: number;
  followupCount: number;
  renewalCount: number;
}

// ─── Date Helpers ─────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function dayLabel(d: Date): string {
  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function isInRange(dateStr: string | null, from: Date, to: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

function isBefore(dateStr: string | null, ref: Date): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < ref;
}

// ─── Item Builders ────────────────────────────────────────────────────

function taskToItem(t: { task: any; companyName: string | null }): AgendaItem {
  return {
    type: "task",
    id: t.task.id,
    title: t.task.title,
    date: t.task.dueAt ? new Date(t.task.dueAt).toISOString() : null,
    companyName: t.companyName,
    companyId: t.task.companyId,
    priority: t.task.priority as "alta" | "media" | "baja",
    status: t.task.status,
    context: t.task.source !== "manual" ? `Origen: ${t.task.source}` : null,
  };
}

function followupToItem(f: { activity: any; companyName: string | null }): AgendaItem {
  return {
    type: "followup",
    id: f.activity.id,
    title: f.activity.nextStep || f.activity.summary,
    date: f.activity.dueAt ? new Date(f.activity.dueAt).toISOString() : null,
    companyName: f.companyName,
    companyId: f.activity.companyId,
    priority: "media",
    status: f.activity.type,
    context: f.activity.summary !== f.activity.nextStep ? f.activity.summary : null,
  };
}

function renewalToItem(s: {
  id: number;
  companyName: string;
  companyId: number;
  type: string;
  expiryDate: Date;
  daysUntilExpiry: number;
  urgency: string;
  currentSpendEur: number | null;
}): AgendaItem {
  return {
    type: "renewal",
    id: s.id,
    title: `Renovación ${s.type}: ${s.companyName}`,
    date: s.expiryDate.toISOString(),
    companyName: s.companyName,
    companyId: s.companyId,
    priority: s.urgency === "overdue" ? "urgente" : s.urgency === "urgent" ? "alta" : "media",
    status: s.urgency,
    context: s.currentSpendEur ? `${s.currentSpendEur.toFixed(0)}€/año` : null,
  };
}

function opportunityToItem(o: {
  id: number;
  companyName: string;
  companyId: number;
  title: string;
  expectedCloseDate: Date;
  daysUntilClose: number;
  isOverdue: boolean;
  estimatedValueEur: number | null;
  temperature: string | null;
}): AgendaItem {
  return {
    type: "opportunity",
    id: o.id,
    title: o.title,
    date: o.expectedCloseDate.toISOString(),
    companyName: o.companyName,
    companyId: o.companyId,
    priority: o.isOverdue ? "urgente" : o.temperature === "caliente" ? "alta" : "media",
    status: o.isOverdue ? "vencida" : `cierre en ${o.daysUntilClose}d`,
    context: o.estimatedValueEur ? `${o.estimatedValueEur.toFixed(0)}€` : null,
  };
}

// ─── Sort helper ──────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { urgente: 0, alta: 1, media: 2, baja: 3, info: 4 };

function sortItems(items: AgendaItem[]): AgendaItem[] {
  return items.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 5;
    const pb = PRIORITY_ORDER[b.priority] ?? 5;
    if (pa !== pb) return pa - pb;
    if (a.date && b.date) return new Date(a.date).getTime() - new Date(b.date).getTime();
    if (a.date) return -1;
    return 1;
  });
}

// ─── Assign items to time slots ───────────────────────────────────────

function assignSlot(
  item: AgendaItem,
  now: Date,
  todayEnd: Date,
  tomorrowStart: Date,
  tomorrowEnd: Date,
  weekEnd: Date,
  nextEnd: Date,
  slots: {
    overdue: AgendaItem[];
    today: AgendaItem[];
    tomorrow: AgendaItem[];
    thisWeek: AgendaItem[];
    nextDays: AgendaItem[];
  },
) {
  if (!item.date) {
    // No date → treat as today (unscheduled work)
    slots.today.push(item);
    return;
  }
  const d = new Date(item.date);
  if (d < startOfDay(now)) {
    slots.overdue.push(item);
  } else if (d <= todayEnd) {
    slots.today.push(item);
  } else if (d >= tomorrowStart && d <= tomorrowEnd) {
    slots.tomorrow.push(item);
  } else if (d <= weekEnd) {
    slots.thisWeek.push(item);
  } else if (d <= nextEnd) {
    slots.nextDays.push(item);
  }
  // Beyond 14 days: skip for now
}

// ═══════════════════════════════════════════════════════════════════════
// Main: Build Operational Agenda
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build the full operational agenda for a user.
 * Aggregates tasks, follow-ups, renewals, hot opportunities and alerts
 * into time-based slots: overdue, today, tomorrow, this week, next 14 days.
 */
export async function buildOperationalAgenda(userId: string): Promise<OperationalAgenda> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const tomorrowStart = startOfDay(addDays(now, 1));
  const tomorrowEnd = endOfDay(addDays(now, 1));
  // "This week" = rest of the week after tomorrow (up to Sunday)
  const daysUntilSunday = 7 - now.getDay();
  const weekEnd = endOfDay(addDays(now, Math.max(daysUntilSunday, 2)));
  const nextEnd = endOfDay(addDays(now, 14));

  // Fetch all data in parallel
  const [
    todayTasksRaw,
    overdueTasksRaw,
    upcomingTasksRaw,
    overdueFollowUpsRaw,
    upcomingFollowUpsRaw,
    expiringServices,
    hotOpportunities,
    notifSummary,
  ] = await Promise.all([
    getTodayTasks(userId),
    getOverdueTasks(userId, 50),
    getUpcomingTasks(userId, 14, 50),
    getOverdueFollowUps(userId, 50),
    getUpcomingFollowUps(userId, 14, 50),
    getExpiringServices(userId, 30), // 30 days out for renewals
    getHotOpportunities(userId, 30),
    getNotificationSummary(userId),
  ]);

  // Convert to AgendaItems
  const allItems: AgendaItem[] = [];

  for (const t of todayTasksRaw) allItems.push(taskToItem(t));
  for (const t of overdueTasksRaw) allItems.push(taskToItem(t));
  for (const t of upcomingTasksRaw) allItems.push(taskToItem(t));
  for (const f of overdueFollowUpsRaw) allItems.push(followupToItem(f));
  for (const f of upcomingFollowUpsRaw) allItems.push(followupToItem(f));
  for (const s of expiringServices) allItems.push(renewalToItem(s));
  for (const o of hotOpportunities) allItems.push(opportunityToItem(o));

  // Deduplicate by (type + id) — tasks might appear in both today and overdue
  const seen = new Set<string>();
  const uniqueItems: AgendaItem[] = [];
  for (const item of allItems) {
    const key = `${item.type}:${item.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueItems.push(item);
    }
  }

  // Assign to slots
  const slots = {
    overdue: [] as AgendaItem[],
    today: [] as AgendaItem[],
    tomorrow: [] as AgendaItem[],
    thisWeek: [] as AgendaItem[],
    nextDays: [] as AgendaItem[],
  };

  for (const item of uniqueItems) {
    assignSlot(item, now, todayEnd, tomorrowStart, tomorrowEnd, weekEnd, nextEnd, slots);
  }

  // Sort each slot
  sortItems(slots.overdue);
  sortItems(slots.today);
  sortItems(slots.tomorrow);
  sortItems(slots.thisWeek);
  sortItems(slots.nextDays);

  // Detect overload
  const todayCount = slots.today.length;
  const overdueCount = slots.overdue.length;
  let overloadWarning: string | null = null;
  if (todayCount > 10) {
    overloadWarning = `Sobrecarga: ${todayCount} items para hoy. Considera delegar o reorganizar.`;
  } else if (overdueCount > 5) {
    overloadWarning = `${overdueCount} items vencidos. Revisa y prioriza urgentemente.`;
  }

  const highPriorityCount = uniqueItems.filter(
    (i) => i.priority === "urgente" || i.priority === "alta"
  ).length;

  const summary: AgendaSummary = {
    totalOverdue: slots.overdue.length,
    totalToday: slots.today.length,
    totalTomorrow: slots.tomorrow.length,
    totalThisWeek: slots.thisWeek.length,
    totalNextDays: slots.nextDays.length,
    highPriorityCount,
    notificationsNew: notifSummary.totalNew,
    notificationsUrgent: notifSummary.totalUrgent,
    overloadWarning,
  };

  return {
    generatedAt: now.toISOString(),
    userId,
    overdue: {
      label: "Vencido",
      slot: "overdue",
      from: "1970-01-01",
      to: isoDate(addDays(now, -1)),
      items: slots.overdue,
    },
    today: {
      label: "Hoy",
      slot: "today",
      from: isoDate(now),
      to: isoDate(now),
      items: slots.today,
    },
    tomorrow: {
      label: "Mañana",
      slot: "tomorrow",
      from: isoDate(addDays(now, 1)),
      to: isoDate(addDays(now, 1)),
      items: slots.tomorrow,
    },
    thisWeek: {
      label: "Esta semana",
      slot: "this_week",
      from: isoDate(addDays(now, 2)),
      to: isoDate(addOfDay(weekEnd)),
      items: slots.thisWeek,
    },
    nextDays: {
      label: "Próximos días",
      slot: "next_days",
      from: isoDate(addDays(weekEnd, 1)),
      to: isoDate(nextEnd),
      items: slots.nextDays,
    },
    summary,
  };
}

// Helper to avoid confusion — just returns the date as-is since endOfDay already sets it
function addOfDay(d: Date): Date {
  return d;
}

// ═══════════════════════════════════════════════════════════════════════
// Weekly Summary
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a weekly summary: 7 days starting from today, with overdue prepended.
 */
export async function buildWeeklySummary(userId: string): Promise<WeeklySummary> {
  const agenda = await buildOperationalAgenda(userId);
  const now = new Date();

  // Build day-by-day breakdown
  const days: DaySummary[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(now, i);
    const dateStr = isoDate(d);
    const label = i === 0 ? "Hoy" : i === 1 ? "Mañana" : dayLabel(d);

    // Collect items for this day from the relevant slot
    let dayItems: AgendaItem[] = [];
    if (i === 0) {
      dayItems = agenda.today.items;
    } else if (i === 1) {
      dayItems = agenda.tomorrow.items;
    } else {
      // Filter from thisWeek or nextDays by date
      const dayStart = startOfDay(d);
      const dayEnd = endOfDay(d);
      dayItems = [
        ...agenda.thisWeek.items.filter((it) => isInRange(it.date, dayStart, dayEnd)),
        ...agenda.nextDays.items.filter((it) => isInRange(it.date, dayStart, dayEnd)),
      ];
    }

    days.push({
      date: dateStr,
      dayLabel: label,
      items: dayItems,
      taskCount: dayItems.filter((i) => i.type === "task").length,
      followupCount: dayItems.filter((i) => i.type === "followup").length,
      renewalCount: dayItems.filter((i) => i.type === "renewal").length,
    });
  }

  // Aggregate totals
  const allItems = [
    ...agenda.overdue.items,
    ...agenda.today.items,
    ...agenda.tomorrow.items,
    ...agenda.thisWeek.items,
    ...agenda.nextDays.items,
  ];

  const weekTotals = {
    tasks: allItems.filter((i) => i.type === "task").length,
    followups: allItems.filter((i) => i.type === "followup").length,
    renewals: allItems.filter((i) => i.type === "renewal").length,
    opportunities: allItems.filter((i) => i.type === "opportunity").length,
    alerts: allItems.filter((i) => i.type === "alert").length,
  };

  const priorities = {
    alta: allItems.filter((i) => i.priority === "alta" || i.priority === "urgente").length,
    media: allItems.filter((i) => i.priority === "media").length,
    baja: allItems.filter((i) => i.priority === "baja" || i.priority === "info").length,
  };

  // Top actions
  const topActions: string[] = [];
  if (agenda.overdue.items.length > 0) {
    topActions.push(`⚠️ ${agenda.overdue.items.length} items vencidos — resolver primero`);
  }
  const urgentToday = agenda.today.items.filter((i) => i.priority === "urgente" || i.priority === "alta");
  if (urgentToday.length > 0) {
    topActions.push(`🔴 ${urgentToday.length} items urgentes/alta prioridad hoy`);
  }
  const renewals = allItems.filter((i) => i.type === "renewal");
  if (renewals.length > 0) {
    topActions.push(`🔄 ${renewals.length} renovaciones pendientes esta semana`);
  }
  const followups = allItems.filter((i) => i.type === "followup");
  if (followups.length > 0) {
    topActions.push(`📞 ${followups.length} seguimientos programados`);
  }
  if (agenda.summary.overloadWarning) {
    topActions.push(agenda.summary.overloadWarning);
  }
  if (topActions.length === 0) {
    topActions.push("✅ Semana controlada — sin urgencias detectadas");
  }

  return {
    generatedAt: new Date().toISOString(),
    userId,
    days,
    weekTotals,
    priorities,
    overdue: agenda.overdue.items,
    topActions,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Agenda for a specific company
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get agenda items for a specific company.
 * Useful when opening a company card — "what's coming up for this company?"
 */
export async function getCompanyAgenda(
  userId: string,
  companyId: number,
): Promise<{ items: AgendaItem[]; overdue: AgendaItem[]; upcoming: AgendaItem[] }> {
  const agenda = await buildOperationalAgenda(userId);

  const allSlots = [
    agenda.overdue,
    agenda.today,
    agenda.tomorrow,
    agenda.thisWeek,
    agenda.nextDays,
  ];

  const companyItems: AgendaItem[] = [];
  for (const slot of allSlots) {
    for (const item of slot.items) {
      if (item.companyId === companyId) {
        companyItems.push(item);
      }
    }
  }

  const now = new Date();
  const overdue = companyItems.filter((i) => i.date && isBefore(i.date, startOfDay(now)));
  const upcoming = companyItems.filter((i) => !i.date || !isBefore(i.date, startOfDay(now)));

  return { items: companyItems, overdue, upcoming };
}
