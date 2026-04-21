/**
 * Commercial Operations — Expiry, Renewals, Stale Detection, Cross-sell & Daily Brief.
 *
 * Phase 7: Operational layer on top of the multiservice CRM.
 * All queries enforce userId ownership via JOINs.
 */

import { db } from "@/db";
import { services, opportunities, companies } from "@/db/schema";
import { eq, and, sql, lte, gte, lt, isNotNull, desc, asc, not, inArray } from "drizzle-orm";
import { buildPortfolioSummary, VERTICAL_META, SERVICE_TYPES, type ServiceType } from "./service-verticals";
// Phase 8 — Activity & Tasks integration
import { getOverdueFollowUps, getLastActivityForCompany, getCompaniesWithoutRecentActivity } from "./activities";
import { getTaskCountsSummary, getOverdueTasks, getTodayTasks, listTasksByCompany } from "./commercial-tasks";
// Phase 9 — Notifications integration
import { getNotificationSummary, listCompanyNotifications } from "./notifications";

// ─── Configurable Thresholds ───────────────────────────────────────────

export const OPS_THRESHOLDS = {
  /** Services expiring within this many days = "expiring soon" */
  expiringDays: 90,
  /** Services expiring within this many days = "urgent" */
  urgentExpiringDays: 30,
  /** Opportunities not updated in this many days = "stale" */
  staleOpportunityDays: 21,
  /** Opportunities closing within this many days = "hot" */
  hotOpportunityDays: 30,
  /** Maximum number of items per section in the daily brief */
  briefMaxItems: 15,
} as const;

// ─── Types ──────────────────────────────────────────────────────────────

export interface ExpiringService {
  id: number;
  companyId: number;
  companyName: string;
  type: string;
  status: string | null;
  currentProvider: string | null;
  currentSpendEur: number | null;
  expiryDate: Date;
  daysUntilExpiry: number;
  urgency: "overdue" | "urgent" | "soon";
}

export interface StaleOpportunity {
  id: number;
  companyId: number;
  companyName: string;
  title: string;
  status: string;
  temperature: string | null;
  priority: string | null;
  estimatedValueEur: number | null;
  updatedAt: Date | null;
  daysSinceUpdate: number;
  expectedCloseDate: Date | null;
}

export interface HotOpportunity {
  id: number;
  companyId: number;
  companyName: string;
  title: string;
  status: string;
  temperature: string | null;
  priority: string | null;
  estimatedValueEur: number | null;
  expectedCloseDate: Date;
  daysUntilClose: number;
  isOverdue: boolean;
}

export interface CrossSellCandidate {
  companyId: number;
  companyName: string;
  activeVerticals: string[];
  missingVerticals: string[];
  missingCount: number;
  totalCurrentSpend: number;
  contractedCount: number;
  /** Simple priority: more spend + fewer verticals = higher cross-sell potential */
  priority: "alta" | "media" | "baja";
  reasons: string[];
}

export interface DailyBrief {
  date: string;
  summary: {
    expiringCount: number;
    overdueCount: number;
    staleOpportunitiesCount: number;
    hotOpportunitiesCount: number;
    crossSellCandidatesCount: number;
    // Phase 8 — Activity & Tasks
    pendingTasksCount: number;
    overdueTasksCount: number;
    todayTasksCount: number;
    overdueFollowUpsCount: number;
    inactiveCompaniesCount: number;
  };
  expiring: ExpiringService[];
  overdue: ExpiringService[];
  staleOpportunities: StaleOpportunity[];
  hotOpportunities: HotOpportunity[];
  crossSellCandidates: CrossSellCandidate[];
  // Phase 8 — Activity & Tasks
  overdueFollowUps: { companyName: string; nextStep: string; dueAt: string | null }[];
  todayTasks: { title: string; priority: string; companyId: number | null }[];
  overdueTasks: { title: string; priority: string; dueAt: string | null; companyId: number | null }[];
  inactiveCompanies: { companyId: number; companyName: string; daysSinceActivity: number }[];
  // Phase 9 — Notifications
  notifications: { totalNew: number; totalUrgent: number; totalWarning: number; totalActive: number };
}

export interface CompanyOpsContext {
  companyId: number;
  companyName: string;
  expiringServices: ExpiringService[];
  activeOpportunities: HotOpportunity[];
  staleOpportunities: StaleOpportunity[];
  crossSell: {
    activeVerticals: string[];
    missingVerticals: string[];
    reasons: string[];
  };
  recommendedActions: string[];
  // Phase 8 — Activity & Tasks
  lastActivity: { type: string; summary: string; createdAt: string } | null;
  daysSinceLastActivity: number | null;
  pendingTasks: { id: number; title: string; priority: string; status: string; dueAt: string | null }[];
  // Phase 9 — Notifications
  activeAlerts: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function daysFromNow(date: Date): number {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function daysSince(date: Date | null): number {
  if (!date) return 999;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// Terminal opportunity states — no follow-up needed
const TERMINAL_STATUSES = ["cliente_activo", "perdido"];

// ─── Expiring Services ──────────────────────────────────────────────────

/**
 * Get services with expiryDate within N days (or overdue).
 * Includes overdue services (past expiryDate).
 */
export async function getExpiringServices(
  userId: string,
  days: number = OPS_THRESHOLDS.expiringDays,
): Promise<ExpiringService[]> {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  const rows = await db
    .select({
      id: services.id,
      companyId: services.companyId,
      companyName: companies.name,
      type: services.type,
      status: services.status,
      currentProvider: services.currentProvider,
      currentSpendEur: services.currentSpendEur,
      expiryDate: services.expiryDate,
    })
    .from(services)
    .innerJoin(companies, eq(services.companyId, companies.id))
    .where(
      and(
        eq(companies.userId, userId),
        isNotNull(services.expiryDate),
        lte(services.expiryDate, futureDate),
        // Only contracted or offered services matter for renewal
        inArray(services.status!, ["contracted", "offered"]),
      ),
    )
    .orderBy(asc(services.expiryDate));

  return rows
    .filter((r) => r.expiryDate !== null)
    .map((r) => {
      const d = daysFromNow(r.expiryDate!);
      return {
        ...r,
        expiryDate: r.expiryDate!,
        daysUntilExpiry: d,
        urgency: d < 0 ? "overdue" as const : d <= OPS_THRESHOLDS.urgentExpiringDays ? "urgent" as const : "soon" as const,
      };
    });
}

/**
 * Get only overdue services (past expiryDate, still contracted/offered).
 */
export async function getOverdueServices(userId: string): Promise<ExpiringService[]> {
  const all = await getExpiringServices(userId, 0);
  // getExpiringServices with 0 days returns everything up to today.
  // But overdue = expiryDate < now, which is daysUntilExpiry < 0
  // Actually we need to fetch with a large window and filter.
  const largeSet = await getExpiringServices(userId, 365);
  return largeSet.filter((s) => s.urgency === "overdue");
}

// ─── Stale Opportunities ────────────────────────────────────────────────

/**
 * Opportunities not updated in N days that are still active (not terminal).
 */
export async function getStaleOpportunities(
  userId: string,
  days: number = OPS_THRESHOLDS.staleOpportunityDays,
): Promise<StaleOpportunity[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const rows = await db
    .select({
      id: opportunities.id,
      companyId: opportunities.companyId,
      companyName: companies.name,
      title: opportunities.title,
      status: opportunities.status,
      temperature: opportunities.temperature,
      priority: opportunities.priority,
      estimatedValueEur: opportunities.estimatedValueEur,
      updatedAt: opportunities.updatedAt,
      expectedCloseDate: opportunities.expectedCloseDate,
    })
    .from(opportunities)
    .innerJoin(companies, eq(opportunities.companyId, companies.id))
    .where(
      and(
        eq(opportunities.userId, userId),
        lte(opportunities.updatedAt, cutoff),
        not(inArray(opportunities.status, TERMINAL_STATUSES)),
      ),
    )
    .orderBy(asc(opportunities.updatedAt));

  return rows.map((r) => ({
    ...r,
    daysSinceUpdate: daysSince(r.updatedAt),
  }));
}

// ─── Hot Opportunities ──────────────────────────────────────────────────

/**
 * Opportunities with expectedCloseDate within N days (or overdue).
 */
export async function getHotOpportunities(
  userId: string,
  days: number = OPS_THRESHOLDS.hotOpportunityDays,
): Promise<HotOpportunity[]> {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  const rows = await db
    .select({
      id: opportunities.id,
      companyId: opportunities.companyId,
      companyName: companies.name,
      title: opportunities.title,
      status: opportunities.status,
      temperature: opportunities.temperature,
      priority: opportunities.priority,
      estimatedValueEur: opportunities.estimatedValueEur,
      expectedCloseDate: opportunities.expectedCloseDate,
    })
    .from(opportunities)
    .innerJoin(companies, eq(opportunities.companyId, companies.id))
    .where(
      and(
        eq(opportunities.userId, userId),
        isNotNull(opportunities.expectedCloseDate),
        lte(opportunities.expectedCloseDate, futureDate),
        not(inArray(opportunities.status, TERMINAL_STATUSES)),
      ),
    )
    .orderBy(asc(opportunities.expectedCloseDate));

  return rows
    .filter((r) => r.expectedCloseDate !== null)
    .map((r) => {
      const d = daysFromNow(r.expectedCloseDate!);
      return {
        ...r,
        expectedCloseDate: r.expectedCloseDate!,
        daysUntilClose: d,
        isOverdue: d < 0,
      };
    });
}

// ─── Cross-sell Candidates ──────────────────────────────────────────────

/**
 * Companies with incomplete service portfolios — ranked by potential.
 */
export async function getCrossSellCandidates(
  userId: string,
  limit: number = OPS_THRESHOLDS.briefMaxItems,
): Promise<CrossSellCandidate[]> {
  // Get all companies with their services
  const allCompanies = await db
    .select({
      id: companies.id,
      name: companies.name,
    })
    .from(companies)
    .where(eq(companies.userId, userId));

  if (allCompanies.length === 0) return [];

  const companyIds = allCompanies.map((c) => c.id);

  const allServices = await db
    .select({
      id: services.id,
      companyId: services.companyId,
      type: services.type,
      status: services.status,
      currentSpendEur: services.currentSpendEur,
    })
    .from(services)
    .where(inArray(services.companyId, companyIds));

  // Group services by company
  const servicesByCompany = new Map<number, typeof allServices>();
  for (const svc of allServices) {
    const list = servicesByCompany.get(svc.companyId) || [];
    list.push(svc);
    servicesByCompany.set(svc.companyId, list);
  }

  const allTypes = SERVICE_TYPES as readonly string[];
  const candidates: CrossSellCandidate[] = [];

  for (const company of allCompanies) {
    const svcs = servicesByCompany.get(company.id) || [];
    if (svcs.length === 0) continue; // Skip companies with no services at all (not yet in pipeline)

    const activeTypes = Array.from(new Set(svcs.map((s) => s.type)));
    const missing = allTypes.filter((t) => !activeTypes.includes(t));

    if (missing.length === 0) continue; // Full portfolio

    const contracted = svcs.filter((s) => s.status === "contracted");
    const totalSpend = svcs.reduce((sum, s) => sum + (s.currentSpendEur || 0), 0);

    // Priority: companies with more existing spend + more contracted = higher potential
    const reasons: string[] = [];
    let priority: "alta" | "media" | "baja" = "baja";

    if (contracted.length >= 2 && totalSpend > 500) {
      priority = "alta";
      reasons.push(`${contracted.length} servicios contratados con gasto de ${totalSpend.toFixed(0)}€`);
    } else if (contracted.length >= 1 || totalSpend > 200) {
      priority = "media";
      if (contracted.length >= 1) reasons.push(`${contracted.length} servicio(s) contratado(s)`);
      if (totalSpend > 0) reasons.push(`Gasto actual: ${totalSpend.toFixed(0)}€`);
    } else {
      reasons.push("Empresa en fase de prospección");
    }

    const missingLabels = missing.map((t) => VERTICAL_META[t as ServiceType]?.label || t);
    reasons.push(`Verticales disponibles: ${missingLabels.join(", ")}`);

    candidates.push({
      companyId: company.id,
      companyName: company.name,
      activeVerticals: activeTypes,
      missingVerticals: missing,
      missingCount: missing.length,
      totalCurrentSpend: totalSpend,
      contractedCount: contracted.length,
      priority,
      reasons,
    });
  }

  // Sort: alta first, then media, then baja; within same priority, by totalSpend desc
  const priorityOrder = { alta: 0, media: 1, baja: 2 };
  candidates.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.totalCurrentSpend - a.totalCurrentSpend;
  });

  return candidates.slice(0, limit);
}

// ─── Daily Commercial Brief ─────────────────────────────────────────────

/**
 * Aggregated daily brief for a commercial user.
 */
export async function getDailyCommercialBrief(userId: string): Promise<DailyBrief> {
  const max = OPS_THRESHOLDS.briefMaxItems;

  const [expiring, stale, hot, crossSell, overdueFollowUpsRaw, taskSummary, todayTasksRaw, overdueTasksRaw, inactiveRaw, notifSummary] = await Promise.all([
    getExpiringServices(userId, OPS_THRESHOLDS.expiringDays),
    getStaleOpportunities(userId, OPS_THRESHOLDS.staleOpportunityDays),
    getHotOpportunities(userId, OPS_THRESHOLDS.hotOpportunityDays),
    getCrossSellCandidates(userId, max),
    // Phase 8 — Activity & Tasks
    getOverdueFollowUps(userId, max),
    getTaskCountsSummary(userId),
    getTodayTasks(userId),
    getOverdueTasks(userId, max),
    getCompaniesWithoutRecentActivity(userId, 14, max),
    // Phase 9 — Notifications
    getNotificationSummary(userId),
  ]);

  const overdue = expiring.filter((s) => s.urgency === "overdue");
  const expiringNonOverdue = expiring.filter((s) => s.urgency !== "overdue");

  return {
    date: new Date().toISOString().split("T")[0],
    summary: {
      expiringCount: expiringNonOverdue.length,
      overdueCount: overdue.length,
      staleOpportunitiesCount: stale.length,
      hotOpportunitiesCount: hot.length,
      crossSellCandidatesCount: crossSell.length,
      // Phase 8
      pendingTasksCount: taskSummary.totalActive,
      overdueTasksCount: taskSummary.overdue,
      todayTasksCount: taskSummary.dueToday,
      overdueFollowUpsCount: overdueFollowUpsRaw.length,
      inactiveCompaniesCount: inactiveRaw.length,
    },
    expiring: expiringNonOverdue.slice(0, max),
    overdue: overdue.slice(0, max),
    staleOpportunities: stale.slice(0, max),
    hotOpportunities: hot.slice(0, max),
    crossSellCandidates: crossSell.slice(0, max),
    // Phase 8
    overdueFollowUps: overdueFollowUpsRaw.map((f) => ({
      companyName: f.companyName,
      nextStep: f.activity.nextStep || "",
      dueAt: f.activity.dueAt ? f.activity.dueAt.toISOString() : null,
    })),
    todayTasks: todayTasksRaw.map((t) => ({
      title: t.task.title,
      priority: t.task.priority,
      companyId: t.task.companyId,
    })),
    overdueTasks: overdueTasksRaw.map((t) => ({
      title: t.task.title,
      priority: t.task.priority,
      dueAt: t.task.dueAt ? t.task.dueAt.toISOString() : null,
      companyId: t.task.companyId,
    })),
    inactiveCompanies: inactiveRaw.map((c) => ({
      companyId: c.companyId,
      companyName: c.companyName,
      daysSinceActivity: c.daysSinceActivity,
    })),
    // Phase 9
    notifications: notifSummary,
  };
}

// ─── Company Operational Context ─────────────────────────────────────────

/**
 * Per-company operational context: expiring, stale, cross-sell, recommended actions.
 */
export async function getCompanyOpsContext(
  companyId: number,
  userId: string,
): Promise<CompanyOpsContext | null> {
  // Verify ownership
  const [company] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)))
    .limit(1);

  if (!company) return null;

  // Get company services
  const companySvcs = await db
    .select()
    .from(services)
    .where(eq(services.companyId, companyId))
    .orderBy(asc(services.expiryDate));

  // Get company opportunities
  const companyOpps = await db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.companyId, companyId),
        eq(opportunities.userId, userId),
      ),
    )
    .orderBy(desc(opportunities.updatedAt));

  // Expiring services
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + OPS_THRESHOLDS.expiringDays);

  const expiringServices: ExpiringService[] = companySvcs
    .filter((s) => s.expiryDate && s.expiryDate <= futureDate && (s.status === "contracted" || s.status === "offered"))
    .map((s) => {
      const d = daysFromNow(s.expiryDate!);
      return {
        id: s.id,
        companyId: s.companyId,
        companyName: company.name,
        type: s.type,
        status: s.status,
        currentProvider: s.currentProvider,
        currentSpendEur: s.currentSpendEur,
        expiryDate: s.expiryDate!,
        daysUntilExpiry: d,
        urgency: d < 0 ? "overdue" as const : d <= OPS_THRESHOLDS.urgentExpiringDays ? "urgent" as const : "soon" as const,
      };
    });

  // Active & stale opportunities
  const activeOpps = companyOpps.filter((o) => !TERMINAL_STATUSES.includes(o.status));
  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - OPS_THRESHOLDS.staleOpportunityDays);

  const staleOpportunities: StaleOpportunity[] = activeOpps
    .filter((o) => o.updatedAt && o.updatedAt <= staleCutoff)
    .map((o) => ({
      id: o.id,
      companyId: o.companyId,
      companyName: company.name,
      title: o.title,
      status: o.status,
      temperature: o.temperature,
      priority: o.priority,
      estimatedValueEur: o.estimatedValueEur,
      updatedAt: o.updatedAt,
      daysSinceUpdate: daysSince(o.updatedAt),
      expectedCloseDate: o.expectedCloseDate,
    }));

  const hotOpportunities: HotOpportunity[] = activeOpps
    .filter((o) => o.expectedCloseDate && o.expectedCloseDate <= futureDate)
    .map((o) => {
      const d = daysFromNow(o.expectedCloseDate!);
      return {
        id: o.id,
        companyId: o.companyId,
        companyName: company.name,
        title: o.title,
        status: o.status,
        temperature: o.temperature,
        priority: o.priority,
        estimatedValueEur: o.estimatedValueEur,
        expectedCloseDate: o.expectedCloseDate!,
        daysUntilClose: d,
        isOverdue: d < 0,
      };
    });

  // Cross-sell analysis
  const allTypes = SERVICE_TYPES as readonly string[];
  const activeVerticals = Array.from(new Set(companySvcs.map((s) => s.type)));
  const missingVerticals = allTypes.filter((t) => !activeVerticals.includes(t));

  const crossSellReasons: string[] = [];
  if (missingVerticals.length > 0) {
    const labels = missingVerticals.map((t) => VERTICAL_META[t as ServiceType]?.label || t);
    crossSellReasons.push(`Verticales no cubiertas: ${labels.join(", ")}`);
  }
  const contracted = companySvcs.filter((s) => s.status === "contracted");
  if (contracted.length >= 2) {
    crossSellReasons.push(`${contracted.length} servicios contratados — cliente consolidado`);
  }

  // Recommended actions
  const actions: string[] = [];
  const overdueExpiring = expiringServices.filter((s) => s.urgency === "overdue");
  const urgentExpiring = expiringServices.filter((s) => s.urgency === "urgent");

  if (overdueExpiring.length > 0) {
    actions.push(`⚠️ ${overdueExpiring.length} servicio(s) vencido(s) — contactar urgentemente para renovación`);
  }
  if (urgentExpiring.length > 0) {
    actions.push(`🔔 ${urgentExpiring.length} servicio(s) venciendo en <30 días — preparar propuesta de renovación`);
  }
  if (staleOpportunities.length > 0) {
    actions.push(`📋 ${staleOpportunities.length} oportunidad(es) estancada(s) — retomar seguimiento`);
  }
  const overdueOpps = hotOpportunities.filter((o) => o.isOverdue);
  if (overdueOpps.length > 0) {
    actions.push(`🔥 ${overdueOpps.length} oportunidad(es) con fecha de cierre pasada — decidir o reprogramar`);
  }
  if (missingVerticals.length > 0 && contracted.length >= 1) {
    actions.push(`💡 Cross-sell: ${missingVerticals.length} verticales disponibles para ofrecer`);
  }
  // Phase 8 — Last activity + pending tasks / Phase 9 — Notifications
  const [lastAct, companyTasks, companyNotifs] = await Promise.all([
    getLastActivityForCompany(companyId, userId),
    listTasksByCompany(companyId, userId, false, 20),
    listCompanyNotifications(userId, companyId, 50),
  ]);

  let daysSinceLastActivity: number | null = null;
  if (lastAct) {
    daysSinceLastActivity = daysSince(lastAct.createdAt ? new Date(lastAct.createdAt) : null);
    if (daysSinceLastActivity > 14) {
      actions.push(`📭 Sin actividad desde hace ${daysSinceLastActivity} días — considerar contacto`);
    }
  } else {
    actions.push("📭 Sin actividad registrada — primera visita o contacto pendiente");
  }

  if (companyTasks.length > 0) {
    const overdueTasks = companyTasks.filter(
      (t) => t.dueAt && new Date(t.dueAt) < new Date() && t.status !== "completada" && t.status !== "cancelada"
    );
    if (overdueTasks.length > 0) {
      actions.push(`📋 ${overdueTasks.length} tarea(s) vencida(s) — requieren atención`);
    }
  }

  if (actions.length === 0) {
    actions.push("✅ Sin acciones urgentes — empresa al día");
  }

  return {
    companyId: company.id,
    companyName: company.name,
    expiringServices,
    activeOpportunities: hotOpportunities,
    staleOpportunities,
    crossSell: {
      activeVerticals,
      missingVerticals,
      reasons: crossSellReasons,
    },
    recommendedActions: actions,
    // Phase 8
    lastActivity: lastAct
      ? { type: lastAct.type, summary: lastAct.summary, createdAt: lastAct.createdAt?.toISOString() || "" }
      : null,
    daysSinceLastActivity,
    pendingTasks: companyTasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    })),
    // Phase 9 — Active alerts count
    activeAlerts: companyNotifs.filter(
      (n) => n.notification.status === "new" || n.notification.status === "seen"
    ).length,
  };
}
