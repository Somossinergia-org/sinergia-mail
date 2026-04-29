/**
 * Executive Metrics — BI layer for management dashboard.
 *
 * Phase 11: Aggregation layer over Phases 1-10 data.
 * Provides executive-level KPIs, pipeline analysis, vertical metrics,
 * operational summaries and energy overview.
 *
 * No new schema — aggregation over existing tables via services + minimal DB queries.
 */

import { db } from "@/db";
import {
  companies,
  opportunities,
  services,
  energyBills,
  supplyPoints,
  commercialActivities,
} from "@/db/schema";
import { eq, and, sql, gte, count } from "drizzle-orm";

import { countCompanies } from "./companies";
import { getPipelineStats } from "./opportunities";
import { getTaskCountsSummary, type TaskCountsSummary } from "./commercial-tasks";
import { getNotificationSummary } from "./notifications";
import { getRecentActivity } from "./activities";
import {
  getExpiringServices,
  getStaleOpportunities,
  getHotOpportunities,
  getCrossSellCandidates,
} from "./commercial-ops";
import { SERVICE_TYPES, type ServiceType } from "./service-verticals";

// ─── Types ────────────────────────────────────────────────────────────

export interface ExecutiveSummary {
  generatedAt: string;
  userId: string;
  kpis: ExecutiveKPIs;
  pipeline: PipelineMetrics;
  verticals: VerticalMetrics;
  operational: OperationalMetrics;
  energy: EnergyMetrics;
  recentActivitySummary: string[];
}

export interface ExecutiveKPIs {
  totalCompanies: number;
  totalOpportunities: number;
  totalActiveOpportunities: number;
  totalPipelineValueEur: number;
  totalServicesContracted: number;
  totalServicesOffered: number;
  hotOpportunities: number;
  staleOpportunities: number;
  crossSellCandidates: number;
  renewalsUpcoming: number;
  tasksOverdue: number;
  followupsOverdue: number;
  alertsNew: number;
  alertsUrgent: number;
}

export interface PipelineMetrics {
  /** Array of {status, count, totalValue} for each pipeline stage */
  byStatus: { status: string; count: number; totalValue: number }[];
  /** Opportunity counts by temperature */
  byTemperature: { temperature: string; count: number }[];
  /** Active non-terminal opportunities */
  totalActive: number;
  /** Expected close within 30 days */
  closingSoon: number;
  /** Value of hot opportunities */
  hotValue: number;
  /** Won (cliente_activo) value */
  wonValue: number;
  /** Lost count */
  lostCount: number;
}

export interface VerticalMetrics {
  byVertical: VerticalBreakdown[];
  topVertical: string | null;
  worstCovered: string | null;
  totalCurrentSpend: number;
  totalEstimatedSavings: number;
}

export interface VerticalBreakdown {
  vertical: ServiceType;
  label: string;
  contracted: number;
  offered: number;
  prospecting: number;
  cancelled: number;
  total: number;
  currentSpendEur: number;
  estimatedSavingsEur: number;
}

export interface OperationalMetrics {
  tasks: TaskCountsSummary;
  notifications: { totalNew: number; totalUrgent: number; totalWarning: number; totalActive: number };
  recentActivityCount: number;
  staleOpportunitiesCount: number;
  expiringServicesCount: number;
  crossSellCount: number;
}

export interface EnergyMetrics {
  totalSupplyPoints: number;
  totalBillsParsed: number;
  totalBilledEur: number;
  avgMonthlyEur: number;
  totalEstimatedSavings: number;
}

// ─── Vertical Labels ─────────────────────────────────────────────────

const VERTICAL_LABELS: Record<ServiceType, string> = {
  energia: "Energía",
  telecomunicaciones: "Telecomunicaciones",
  alarmas: "Alarmas",
  seguros: "Seguros",
  agentes_ia: "Agentes IA",
  web: "Web",
  crm: "CRM",
  aplicaciones: "Aplicaciones",
};

// ─── Terminal pipeline states ────────────────────────────────────────

const TERMINAL_STATUSES = ["cliente_activo", "perdido"];

// ─── Full Executive Summary ──────────────────────────────────────────

export async function getExecutiveSummary(userId: string): Promise<ExecutiveSummary> {
  const [pipeline, verticals, operational, energy] = await Promise.all([
    getPipelineMetrics(userId),
    getVerticalMetrics(userId),
    getOperationalMetrics(userId),
    getEnergyMetrics(userId),
  ]);

  const kpis = buildKPIs(pipeline, verticals, operational, energy, userId);

  // Recent activity as text summary (last 5)
  const recent = await getRecentActivity(userId, 5);
  const recentActivitySummary = recent.map(
    (r) =>
      `${r.activity.type}: ${r.activity.summary ?? ""} — ${r.companyName ?? "Sin empresa"}`,
  );

  return {
    generatedAt: new Date().toISOString(),
    userId,
    kpis: await kpis,
    pipeline,
    verticals,
    operational,
    energy,
    recentActivitySummary,
  };
}

// ─── KPIs builder ────────────────────────────────────────────────────

async function buildKPIs(
  pipeline: PipelineMetrics,
  verticals: VerticalMetrics,
  ops: OperationalMetrics,
  energy: EnergyMetrics,
  userId: string,
): Promise<ExecutiveKPIs> {
  const totalCompanies = await countCompanies(userId);

  const totalOpportunities = pipeline.byStatus.reduce((s, r) => s + r.count, 0);
  const totalPipelineValueEur = pipeline.byStatus.reduce((s, r) => s + r.totalValue, 0);

  const totalServicesContracted = verticals.byVertical.reduce((s, v) => s + v.contracted, 0);
  const totalServicesOffered = verticals.byVertical.reduce((s, v) => s + v.offered, 0);

  // Count overdue followups from operational data (we reuse notification counts here)
  // Tasks overdue is already in ops.tasks
  return {
    totalCompanies,
    totalOpportunities,
    totalActiveOpportunities: pipeline.totalActive,
    totalPipelineValueEur,
    totalServicesContracted,
    totalServicesOffered,
    hotOpportunities: pipeline.closingSoon,
    staleOpportunities: ops.staleOpportunitiesCount,
    crossSellCandidates: ops.crossSellCount,
    renewalsUpcoming: ops.expiringServicesCount,
    tasksOverdue: ops.tasks.overdue,
    followupsOverdue: 0, // included in notification counts
    alertsNew: ops.notifications.totalNew,
    alertsUrgent: ops.notifications.totalUrgent,
  };
}

// ─── Pipeline Metrics ────────────────────────────────────────────────

export async function getPipelineMetrics(userId: string): Promise<PipelineMetrics> {
  const [byStatus, byTemp, hotOpps] = await Promise.all([
    getPipelineStats(userId),
    getTemperatureStats(userId),
    getHotOpportunities(userId, 30),
  ]);

  const totalActive = byStatus
    .filter((r) => !TERMINAL_STATUSES.includes(r.status))
    .reduce((s, r) => s + Number(r.count), 0);

  const wonRow = byStatus.find((r) => r.status === "cliente_activo");
  const lostRow = byStatus.find((r) => r.status === "perdido");

  const hotValue = hotOpps.reduce((s, o) => s + (o.estimatedValueEur ?? 0), 0);

  return {
    byStatus: byStatus.map((r) => ({
      status: r.status,
      count: Number(r.count),
      totalValue: Number(r.totalValue),
    })),
    byTemperature: byTemp,
    totalActive,
    closingSoon: hotOpps.length,
    hotValue,
    wonValue: wonRow ? Number(wonRow.totalValue) : 0,
    lostCount: lostRow ? Number(lostRow.count) : 0,
  };
}

async function getTemperatureStats(userId: string) {
  const rows = await db
    .select({
      temperature: opportunities.temperature,
      count: sql<number>`count(*)`,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.userId, userId),
        sql`${opportunities.status} NOT IN ('cliente_activo', 'perdido')`,
      ),
    )
    .groupBy(opportunities.temperature);

  return rows.map((r) => ({
    temperature: r.temperature ?? "sin_definir",
    count: Number(r.count),
  }));
}

// ─── Vertical Metrics ────────────────────────────────────────────────

export async function getVerticalMetrics(userId: string): Promise<VerticalMetrics> {
  // Fetch all services for this user's companies
  const rows = await db
    .select({
      type: services.type,
      status: services.status,
      currentSpendEur: services.currentSpendEur,
      estimatedSavings: services.estimatedSavings,
    })
    .from(services)
    .innerJoin(companies, eq(services.companyId, companies.id))
    .where(eq(companies.userId, userId));

  const byVertical: VerticalBreakdown[] = SERVICE_TYPES.map((t) => {
    const svcForType = rows.filter((r) => r.type === t);
    return {
      vertical: t,
      label: VERTICAL_LABELS[t] ?? t,
      contracted: svcForType.filter((r) => r.status === "contracted").length,
      offered: svcForType.filter((r) => r.status === "offered").length,
      prospecting: svcForType.filter((r) => r.status === "prospecting").length,
      cancelled: svcForType.filter((r) => r.status === "cancelled").length,
      total: svcForType.length,
      currentSpendEur: svcForType.reduce((s, r) => s + (r.currentSpendEur ? Number(r.currentSpendEur) : 0), 0),
      estimatedSavingsEur: svcForType.reduce((s, r) => s + (r.estimatedSavings ? Number(r.estimatedSavings) : 0), 0),
    };
  });

  const totalCurrentSpend = byVertical.reduce((s, v) => s + v.currentSpendEur, 0);
  const totalEstimatedSavings = byVertical.reduce((s, v) => s + v.estimatedSavingsEur, 0);

  // Top vertical by contracted count
  const sorted = [...byVertical].sort((a, b) => b.contracted - a.contracted);
  const topVertical = sorted[0]?.contracted > 0 ? sorted[0].vertical : null;

  // Worst covered = fewest total services (excluding zero-activity verticals is debatable;
  // here we pick the vertical with least total but > 0, or the first with 0)
  const worstSorted = [...byVertical].sort((a, b) => a.total - b.total);
  const worstCovered = worstSorted[0]?.vertical ?? null;

  return {
    byVertical,
    topVertical,
    worstCovered,
    totalCurrentSpend,
    totalEstimatedSavings,
  };
}

// ─── Operational Metrics ─────────────────────────────────────────────

export async function getOperationalMetrics(userId: string): Promise<OperationalMetrics> {
  const [tasks, notifications, stale, expiring, crossSell, recentActs] = await Promise.all([
    getTaskCountsSummary(userId),
    getNotificationSummary(userId),
    getStaleOpportunities(userId, 30),
    getExpiringServices(userId, 90),
    getCrossSellCandidates(userId, 100),
    getRecentActivity(userId, 30),
  ]);

  return {
    tasks,
    notifications,
    recentActivityCount: recentActs.length,
    staleOpportunitiesCount: stale.length,
    expiringServicesCount: expiring.length,
    crossSellCount: crossSell.length,
  };
}

// ─── Energy Metrics ──────────────────────────────────────────────────

export async function getEnergyMetrics(userId: string): Promise<EnergyMetrics> {
  // Supply points count for this user's companies
  const spCountRows = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(supplyPoints)
    .innerJoin(companies, eq(supplyPoints.companyId, companies.id))
    .where(eq(companies.userId, userId));

  const totalSupplyPoints = Number(spCountRows[0]?.cnt ?? 0);

  // Energy bills aggregate
  const billStats = await db
    .select({
      totalBills: sql<number>`count(*)`,
      totalBilled: sql<number>`COALESCE(SUM(${energyBills.totalAmountEur}), 0)`,
    })
    .from(energyBills)
    .innerJoin(supplyPoints, eq(energyBills.supplyPointId, supplyPoints.id))
    .innerJoin(companies, eq(supplyPoints.companyId, companies.id))
    .where(eq(companies.userId, userId));

  const totalBillsParsed = Number(billStats[0]?.totalBills ?? 0);
  const totalBilledEur = Number(billStats[0]?.totalBilled ?? 0);
  const avgMonthlyEur = totalBillsParsed > 0 ? totalBilledEur / totalBillsParsed : 0;

  // Estimated savings from energy services
  const savingsRows = await db
    .select({
      totalSavings: sql<number>`COALESCE(SUM(${services.estimatedSavings}), 0)`,
    })
    .from(services)
    .innerJoin(companies, eq(services.companyId, companies.id))
    .where(and(eq(companies.userId, userId), eq(services.type, "energia")));

  const totalEstimatedSavings = Number(savingsRows[0]?.totalSavings ?? 0);

  return {
    totalSupplyPoints,
    totalBillsParsed,
    totalBilledEur,
    avgMonthlyEur,
    totalEstimatedSavings,
  };
}
