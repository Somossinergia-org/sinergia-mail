/**
 * Phase 11 Behavioral Tests — Executive BI & Management Dashboard
 *
 * Verifies code-level patterns for:
 *  1. Backend: executive-metrics.ts types, builders, aggregation
 *  2. API route: /api/crm/executive with view=full|pipeline|verticals|ops|energy
 *  3. UI: CrmExecutivePanel with KPIs, views, vertical table, pipeline bar
 *  4. Swarm tools: 3 Phase 11 BI tools + handlers
 *  5. Agent distribution: correct Phase 11 tools per agent role
 *  6. Dashboard integration: "Direccion" sub-tab
 *  7. Integration with Phases 7-10: reuses existing services, no new schema
 *  8. Auth & ownership: userId enforcement
 *  9. No design breakage: existing tabs preserved
 * 10. Regression: Phases 1-10 untouched
 *
 * File-content validation pattern — no database required.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const srcDir = resolve(__dirname, "../../src");

function readSrc(path: string): string {
  return readFileSync(resolve(srcDir, path), "utf-8");
}

// ─── 1. Backend: executive-metrics.ts ────────────────────────────────

describe("Phase 11 — Backend: executive-metrics.ts", () => {
  const src = readSrc("lib/crm/executive-metrics.ts");

  it("exports ExecutiveSummary interface", () => {
    expect(src).toContain("export interface ExecutiveSummary");
    expect(src).toContain("kpis: ExecutiveKPIs");
    expect(src).toContain("pipeline: PipelineMetrics");
    expect(src).toContain("verticals: VerticalMetrics");
    expect(src).toContain("operational: OperationalMetrics");
    expect(src).toContain("energy: EnergyMetrics");
  });

  it("exports ExecutiveKPIs with required fields", () => {
    expect(src).toContain("export interface ExecutiveKPIs");
    expect(src).toContain("totalCompanies: number");
    expect(src).toContain("totalOpportunities: number");
    expect(src).toContain("totalPipelineValueEur: number");
    expect(src).toContain("totalServicesContracted: number");
    expect(src).toContain("hotOpportunities: number");
    expect(src).toContain("staleOpportunities: number");
    expect(src).toContain("crossSellCandidates: number");
    expect(src).toContain("renewalsUpcoming: number");
    expect(src).toContain("tasksOverdue: number");
    expect(src).toContain("alertsNew: number");
    expect(src).toContain("alertsUrgent: number");
  });

  it("exports PipelineMetrics with funnel data", () => {
    expect(src).toContain("export interface PipelineMetrics");
    expect(src).toContain("byStatus:");
    expect(src).toContain("byTemperature:");
    expect(src).toContain("totalActive: number");
    expect(src).toContain("closingSoon: number");
    expect(src).toContain("hotValue: number");
    expect(src).toContain("wonValue: number");
    expect(src).toContain("lostCount: number");
  });

  it("exports VerticalMetrics with breakdown", () => {
    expect(src).toContain("export interface VerticalMetrics");
    expect(src).toContain("byVertical: VerticalBreakdown[]");
    expect(src).toContain("topVertical: string | null");
    expect(src).toContain("worstCovered: string | null");
    expect(src).toContain("totalCurrentSpend: number");
    expect(src).toContain("totalEstimatedSavings: number");
  });

  it("exports VerticalBreakdown with per-vertical counts", () => {
    expect(src).toContain("export interface VerticalBreakdown");
    expect(src).toContain("contracted: number");
    expect(src).toContain("offered: number");
    expect(src).toContain("prospecting: number");
    expect(src).toContain("currentSpendEur: number");
    expect(src).toContain("estimatedSavingsEur: number");
  });

  it("exports OperationalMetrics", () => {
    expect(src).toContain("export interface OperationalMetrics");
    expect(src).toContain("tasks: TaskCountsSummary");
    expect(src).toContain("notifications:");
    expect(src).toContain("recentActivityCount: number");
    expect(src).toContain("staleOpportunitiesCount: number");
    expect(src).toContain("expiringServicesCount: number");
  });

  it("exports EnergyMetrics", () => {
    expect(src).toContain("export interface EnergyMetrics");
    expect(src).toContain("totalSupplyPoints: number");
    expect(src).toContain("totalBillsParsed: number");
    expect(src).toContain("totalBilledEur: number");
    expect(src).toContain("totalEstimatedSavings: number");
  });

  it("exports getExecutiveSummary(userId)", () => {
    expect(src).toContain("export async function getExecutiveSummary(userId: string)");
  });

  it("exports getPipelineMetrics(userId)", () => {
    expect(src).toContain("export async function getPipelineMetrics(userId: string)");
  });

  it("exports getVerticalMetrics(userId)", () => {
    expect(src).toContain("export async function getVerticalMetrics(userId: string)");
  });

  it("exports getOperationalMetrics(userId)", () => {
    expect(src).toContain("export async function getOperationalMetrics(userId: string)");
  });

  it("exports getEnergyMetrics(userId)", () => {
    expect(src).toContain("export async function getEnergyMetrics(userId: string)");
  });

  it("uses parallel fetching via Promise.all", () => {
    expect(src).toContain("Promise.all");
  });

  it("imports from Phase 7 commercial-ops", () => {
    expect(src).toContain("getExpiringServices");
    expect(src).toContain("getStaleOpportunities");
    expect(src).toContain("getHotOpportunities");
    expect(src).toContain("getCrossSellCandidates");
  });

  it("imports from Phase 8 tasks", () => {
    expect(src).toContain("getTaskCountsSummary");
  });

  it("imports from Phase 9 notifications", () => {
    expect(src).toContain("getNotificationSummary");
  });

  it("imports pipeline stats from opportunities", () => {
    expect(src).toContain("getPipelineStats");
  });

  it("imports countCompanies", () => {
    expect(src).toContain("countCompanies");
  });

  it("imports SERVICE_TYPES for vertical iteration", () => {
    expect(src).toContain("SERVICE_TYPES");
  });

  it("covers all 8 verticals", () => {
    expect(src).toContain("energia");
    expect(src).toContain("telecomunicaciones");
    expect(src).toContain("alarmas");
    expect(src).toContain("seguros");
    expect(src).toContain("agentes_ia");
    expect(src).toContain("web");
    expect(src).toContain("crm");
    expect(src).toContain("aplicaciones");
  });

  it("has no new schema — uses existing tables via joins", () => {
    expect(src).not.toContain("CREATE TABLE");
    expect(src).not.toContain("pgTable(");
  });
});

// ─── 2. API route: /api/crm/executive ───────────────────────────────

describe("Phase 11 — API route: /api/crm/executive", () => {
  const src = readSrc("app/api/crm/executive/route.ts");

  it("exports GET handler", () => {
    expect(src).toContain("export async function GET");
  });

  it("enforces auth via auth()", () => {
    expect(src).toContain("await auth()");
    expect(src).toContain("session?.user?.id");
    expect(src).toContain("401");
  });

  it("supports view=full (default)", () => {
    expect(src).toContain("getExecutiveSummary");
  });

  it("supports view=pipeline", () => {
    expect(src).toContain('"pipeline"');
    expect(src).toContain("getPipelineMetrics");
  });

  it("supports view=verticals", () => {
    expect(src).toContain('"verticals"');
    expect(src).toContain("getVerticalMetrics");
  });

  it("supports view=ops", () => {
    expect(src).toContain('"ops"');
    expect(src).toContain("getOperationalMetrics");
  });

  it("supports view=energy", () => {
    expect(src).toContain('"energy"');
    expect(src).toContain("getEnergyMetrics");
  });

  it("uses force-dynamic", () => {
    expect(src).toContain('export const dynamic = "force-dynamic"');
  });

  it("handles errors with 500", () => {
    expect(src).toContain("catch");
    expect(src).toContain("500");
  });
});

// ─── 3. UI: CrmExecutivePanel ───────────────────────────────────────

describe("Phase 11 — UI: CrmExecutivePanel", () => {
  const src = readSrc("components/crm/CrmExecutivePanel.tsx");

  it("is a client component", () => {
    expect(src).toContain('"use client"');
  });

  it("has KpiCard component", () => {
    expect(src).toContain("KpiCard");
  });

  it("has Section wrapper component", () => {
    expect(src).toContain("Section");
  });

  it("has 5 view modes: resumen, pipeline, verticales, operativa, energia", () => {
    expect(src).toContain('"resumen"');
    expect(src).toContain('"pipeline"');
    expect(src).toContain('"verticales"');
    expect(src).toContain('"operativa"');
    expect(src).toContain('"energia"');
  });

  it("has PipelineBar component", () => {
    expect(src).toContain("PipelineBar");
  });

  it("has VerticalTable component", () => {
    expect(src).toContain("VerticalTable");
  });

  it("shows KPIs for companies, opportunities, pipeline, services", () => {
    expect(src).toContain("Empresas");
    expect(src).toContain("Oportunidades");
    expect(src).toContain("Pipeline");
    expect(src).toContain("Contratados");
  });

  it("shows alert KPIs: calientes, estancadas, tareas vencidas, alertas", () => {
    expect(src).toContain("Calientes");
    expect(src).toContain("Estancadas");
    expect(src).toContain("Tareas vencidas");
    expect(src).toContain("Alertas");
  });

  it("shows energy metrics", () => {
    expect(src).toContain("Supply points");
    expect(src).toContain("Facturas");
    expect(src).toContain("Total facturado");
    expect(src).toContain("Ahorro estimado");
  });

  it("shows temperature badges", () => {
    expect(src).toContain("caliente");
    expect(src).toContain("tibio");
    expect(src).toContain("frio");
  });

  it("fetches from /api/crm/executive", () => {
    expect(src).toContain("/api/crm/executive");
  });

  it("handles loading state", () => {
    expect(src).toContain("loading");
    expect(src).toContain("setLoading");
  });

  it("shows generation timestamp", () => {
    expect(src).toContain("generatedAt");
    expect(src).toContain("Generado:");
  });

  it("uses fmtEur for currency formatting", () => {
    expect(src).toContain("fmtEur");
  });
});

// ─── 4. Swarm tools: 3 Phase 11 BI tools ────────────────────────────

describe("Phase 11 — Swarm tools in crm-tools.ts", () => {
  const src = readSrc("lib/agent/crm-tools.ts");

  it("imports from executive-metrics", () => {
    expect(src).toContain('from "@/lib/crm/executive-metrics"');
    expect(src).toContain("getExecutiveSummary");
    expect(src).toContain("getPipelineMetrics");
    expect(src).toContain("getVerticalMetrics");
  });

  it("defines crm_get_executive_summary tool", () => {
    expect(src).toContain('"crm_get_executive_summary"');
  });

  it("defines crm_get_pipeline_status tool", () => {
    expect(src).toContain('"crm_get_pipeline_status"');
  });

  it("defines crm_get_vertical_metrics tool", () => {
    expect(src).toContain('"crm_get_vertical_metrics"');
  });

  it("has handler for executive summary", () => {
    expect(src).toContain("crmGetExecutiveSummaryHandler");
  });

  it("has handler for pipeline status", () => {
    expect(src).toContain("crmGetPipelineStatusHandler");
  });

  it("has handler for vertical metrics", () => {
    expect(src).toContain("crmGetVerticalMetricsHandler");
  });

  it("handlers use userId as first parameter", () => {
    expect(src).toMatch(/crmGetExecutiveSummaryHandler[\s\S]*?userId/);
    expect(src).toMatch(/crmGetPipelineStatusHandler[\s\S]*?userId/);
    expect(src).toMatch(/crmGetVerticalMetricsHandler[\s\S]*?userId/);
  });
});

// ─── 5. Agent distribution ──────────────────────────────────────────

describe("Phase 11 — Agent distribution in swarm.ts", () => {
  const src = readSrc("lib/agent/swarm.ts");

  it("CEO has all 3 executive BI tools", () => {
    expect(src).toContain("Phase 11 — Executive BI");
    const ceoMatch = src.match(/ceo[\s\S]*?crm_get_executive_summary[\s\S]*?crm_get_pipeline_status[\s\S]*?crm_get_vertical_metrics/);
    expect(ceoMatch).not.toBeNull();
  });

  it("Comercial Principal has all 3 BI tools", () => {
    const match = src.match(/comercial-principal[\s\S]*?Phase 11[\s\S]*?crm_get_executive_summary[\s\S]*?crm_get_pipeline_status[\s\S]*?crm_get_vertical_metrics/);
    expect(match).not.toBeNull();
  });

  it("BI-Scoring has all 3 BI tools (full analytics)", () => {
    const match = src.match(/bi-scoring[\s\S]*?Phase 11[\s\S]*?crm_get_executive_summary[\s\S]*?crm_get_pipeline_status[\s\S]*?crm_get_vertical_metrics/);
    expect(match).not.toBeNull();
  });

  it("Recepción has pipeline status only (limited)", () => {
    const match = src.match(/recepcion[\s\S]*?Phase 11[\s\S]*?crm_get_pipeline_status/);
    expect(match).not.toBeNull();
  });

  it("has Phase 11 comments on all distributions", () => {
    const comments = src.match(/Phase 11 — Executive BI/g) || [];
    expect(comments.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── 6. Dashboard integration ───────────────────────────────────────

describe("Phase 11 — Dashboard integration", () => {
  const src = readSrc("app/dashboard/page.tsx");

  it("imports CrmExecutivePanel", () => {
    expect(src).toContain('import CrmExecutivePanel from "@/components/crm/CrmExecutivePanel"');
  });

  it("has Direccion sub-tab", () => {
    expect(src).toContain('"direccion"');
  });

  it("Direccion tab positioned after Operativa (UX reorder: daily→operational→reference)", () => {
    const direccionIdx = src.indexOf('"direccion"');
    const agendaIdx = src.indexOf('"agenda"');
    const operativaIdx = src.indexOf('"operativa"');
    expect(direccionIdx).toBeGreaterThan(agendaIdx);
    expect(direccionIdx).toBeGreaterThan(operativaIdx);
  });

  it("renders CrmExecutivePanel for direccion sub-tab", () => {
    expect(src).toContain('sub === "direccion" && <CrmExecutivePanel');
  });

  it("preserves all previous CRM sub-tabs", () => {
    expect(src).toContain('"agenda"');
    expect(src).toContain('"operativa"');
    expect(src).toContain('"alertas"');
    expect(src).toContain('"actividad"');
    expect(src).toContain('"tareas"');
    expect(src).toContain('"empresas"');
    expect(src).toContain('"oportunidades"');
    expect(src).toContain('"contactos"');
    expect(src).toContain('"scoring"');
    expect(src).toContain('"visits"');
  });
});

// ─── 7. Integration with Phases 7-10 ────────────────────────────────

describe("Phase 11 — Integration with existing phases", () => {
  const src = readSrc("lib/crm/executive-metrics.ts");

  it("uses Phase 7 commercial-ops for stale/hot/cross-sell", () => {
    expect(src).toContain('from "./commercial-ops"');
  });

  it("uses Phase 8 tasks for task counts", () => {
    expect(src).toContain('from "./commercial-tasks"');
  });

  it("uses Phase 8 activities for recent activity", () => {
    expect(src).toContain('from "./activities"');
  });

  it("uses Phase 9 notifications for alert counts", () => {
    expect(src).toContain('from "./notifications"');
  });

  it("uses existing getPipelineStats from opportunities", () => {
    expect(src).toContain('from "./opportunities"');
    expect(src).toContain("getPipelineStats");
  });

  it("uses service-verticals for SERVICE_TYPES", () => {
    expect(src).toContain('from "./service-verticals"');
  });
});

// ─── 8. Auth & ownership ────────────────────────────────────────────

describe("Phase 11 — Auth & ownership enforcement", () => {
  it("API route enforces auth()", () => {
    const route = readSrc("app/api/crm/executive/route.ts");
    expect(route).toContain("await auth()");
    expect(route).toContain("401");
  });

  it("all backend functions require userId", () => {
    const src = readSrc("lib/crm/executive-metrics.ts");
    expect(src).toContain("getExecutiveSummary(userId: string)");
    expect(src).toContain("getPipelineMetrics(userId: string)");
    expect(src).toContain("getVerticalMetrics(userId: string)");
    expect(src).toContain("getOperationalMetrics(userId: string)");
    expect(src).toContain("getEnergyMetrics(userId: string)");
  });

  it("service joins enforce userId via companies.userId", () => {
    const src = readSrc("lib/crm/executive-metrics.ts");
    expect(src).toContain("eq(companies.userId, userId)");
  });
});

// ─── 9. No design breakage ──────────────────────────────────────────

describe("Phase 11 — Design preservation", () => {
  const dash = readSrc("app/dashboard/page.tsx");

  it("all existing main tabs preserved", () => {
    expect(dash).toContain("overview");
    expect(dash).toContain("crm");
  });

  it("CRM still has 11+ sub-tabs (including new ones)", () => {
    const tabMatches = dash.match(/\{ id: "/g) || [];
    expect(tabMatches.length).toBeGreaterThanOrEqual(11);
  });

  it("existing CRM components still imported", () => {
    expect(dash).toContain("CrmPanel");
    expect(dash).toContain("CrmOpportunitiesPanel");
    expect(dash).toContain("CrmCommercialOpsPanel");
    expect(dash).toContain("CrmActivityPanel");
    expect(dash).toContain("CrmTasksPanel");
    expect(dash).toContain("CrmNotificationsPanel");
    expect(dash).toContain("CrmAgendaPanel");
  });
});

// ─── 10. Regression: Phases 1-10 untouched ──────────────────────────

describe("Phase 11 — Regression", () => {
  it("Phase 10 agenda tools still present in swarm", () => {
    const swarm = readSrc("lib/agent/swarm.ts");
    expect(swarm).toContain("Phase 10 — Operational Agenda");
    expect(swarm).toContain('"crm_get_agenda_today"');
    expect(swarm).toContain('"crm_get_agenda_week"');
    expect(swarm).toContain('"crm_get_agenda_company"');
  });

  it("Phase 9 notification tools still present", () => {
    const tools = readSrc("lib/agent/crm-tools.ts");
    expect(tools).toContain('"crm_list_notifications"');
    expect(tools).toContain('"crm_generate_notifications"');
    expect(tools).toContain('"crm_update_notification"');
  });

  it("Phase 10 agenda tools still in crm-tools.ts", () => {
    const tools = readSrc("lib/agent/crm-tools.ts");
    expect(tools).toContain('"crm_get_agenda_today"');
    expect(tools).toContain('"crm_get_agenda_week"');
    expect(tools).toContain('"crm_get_agenda_company"');
  });

  it("Phase 7 commercial-ops service untouched", () => {
    const ops = readSrc("lib/crm/commercial-ops.ts");
    expect(ops).toContain("getExpiringServices");
    expect(ops).toContain("getDailyCommercialBrief");
  });

  it("schema has no Phase 11 modifications", () => {
    const schema = readFileSync(resolve(srcDir, "db/schema.ts"), "utf-8");
    expect(schema).not.toContain("executive");
    expect(schema).not.toContain("bi_metrics");
  });
});
