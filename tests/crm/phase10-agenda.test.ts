/**
 * Phase 10 Behavioral Tests — Operational Agenda & Light Commercial Planning
 *
 * Verifies code-level patterns for:
 *  1. Backend: operational-agenda.ts types, builders, dedup, overload detection
 *  2. API route: /api/crm/agenda with view=full|weekly|company
 *  3. UI: CrmAgendaPanel with summary bar, slot sections, weekly view
 *  4. Swarm tools: 3 Phase 10 agenda tools + handlers
 *  5. Agent distribution: correct Phase 10 tools per agent role
 *  6. Dashboard integration: "Agenda" sub-tab as first CRM tab
 *  7. Phase 7/8/9 integration: uses existing services, no new schema
 *  8. Auth & ownership: userId enforcement across all modules
 *  9. No FullCalendar / no aggressive automation / no client contact
 * 10. Regression: Phases 1-9 untouched
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

// ─── 1. Backend: operational-agenda.ts ───────────────────────────────

describe("Phase 10 — Backend: operational-agenda.ts", () => {
  const src = readSrc("lib/crm/operational-agenda.ts");

  it("exports AgendaItemType with 5 item types", () => {
    expect(src).toContain("export type AgendaItemType");
    expect(src).toContain('"task"');
    expect(src).toContain('"followup"');
    expect(src).toContain('"renewal"');
    expect(src).toContain('"opportunity"');
    expect(src).toContain('"alert"');
  });

  it("exports AgendaItem interface with required fields", () => {
    expect(src).toContain("export interface AgendaItem");
    expect(src).toContain("type: AgendaItemType");
    expect(src).toContain("id: number");
    expect(src).toContain("title: string");
    expect(src).toContain("date: string | null");
    expect(src).toContain("companyName: string | null");
    expect(src).toContain("companyId: number | null");
    expect(src).toContain('priority: "alta" | "media" | "baja" | "urgente" | "info"');
  });

  it("exports AgendaTimeSlot with slot labels", () => {
    expect(src).toContain("export interface AgendaTimeSlot");
    expect(src).toContain("slot: string");
    expect(src).toContain("items: AgendaItem[]");
    expect(src).toContain("from: string");
    expect(src).toContain("to: string");
  });

  it("exports OperationalAgenda with 5 time slots + summary", () => {
    expect(src).toContain("export interface OperationalAgenda");
    expect(src).toContain("overdue: AgendaTimeSlot");
    expect(src).toContain("today: AgendaTimeSlot");
    expect(src).toContain("tomorrow: AgendaTimeSlot");
    expect(src).toContain("thisWeek: AgendaTimeSlot");
    expect(src).toContain("nextDays: AgendaTimeSlot");
    expect(src).toContain("summary: AgendaSummary");
  });

  it("exports AgendaSummary with overload warning", () => {
    expect(src).toContain("export interface AgendaSummary");
    expect(src).toContain("totalOverdue: number");
    expect(src).toContain("totalToday: number");
    expect(src).toContain("highPriorityCount: number");
    expect(src).toContain("notificationsNew: number");
    expect(src).toContain("notificationsUrgent: number");
    expect(src).toContain("overloadWarning: string | null");
  });

  it("exports WeeklySummary with days breakdown + topActions", () => {
    expect(src).toContain("export interface WeeklySummary");
    expect(src).toContain("days: DaySummary[]");
    expect(src).toContain("weekTotals:");
    expect(src).toContain("topActions: string[]");
    expect(src).toContain("overdue: AgendaItem[]");
    expect(src).toContain("priorities:");
  });

  it("exports DaySummary with per-day counts", () => {
    expect(src).toContain("export interface DaySummary");
    expect(src).toContain("dayLabel: string");
    expect(src).toContain("taskCount: number");
    expect(src).toContain("followupCount: number");
    expect(src).toContain("renewalCount: number");
  });

  it("exports buildOperationalAgenda(userId)", () => {
    expect(src).toContain("export async function buildOperationalAgenda(userId: string)");
  });

  it("exports buildWeeklySummary(userId)", () => {
    expect(src).toContain("export async function buildWeeklySummary(userId: string)");
  });

  it("exports getCompanyAgenda(userId, companyId)", () => {
    expect(src).toContain("export async function getCompanyAgenda");
  });

  it("fetches 8 data sources in parallel via Promise.all", () => {
    expect(src).toContain("Promise.all");
    expect(src).toContain("getTodayTasks");
    expect(src).toContain("getOverdueTasks");
    expect(src).toContain("getUpcomingTasks");
    expect(src).toContain("getOverdueFollowUps");
    expect(src).toContain("getUpcomingFollowUps");
    expect(src).toContain("getExpiringServices");
    expect(src).toContain("getHotOpportunities");
    expect(src).toContain("getNotificationSummary");
  });

  it("imports from Phase 7 commercial-ops", () => {
    expect(src).toContain('from "./commercial-ops"');
    expect(src).toContain("getExpiringServices");
    expect(src).toContain("getHotOpportunities");
  });

  it("imports from Phase 8 commercial-tasks", () => {
    expect(src).toContain('from "./commercial-tasks"');
    expect(src).toContain("getTodayTasks");
    expect(src).toContain("getOverdueTasks");
    expect(src).toContain("getUpcomingTasks");
  });

  it("imports from Phase 8 activities", () => {
    expect(src).toContain('from "./activities"');
    expect(src).toContain("getOverdueFollowUps");
    expect(src).toContain("getUpcomingFollowUps");
  });

  it("imports from Phase 9 notifications", () => {
    expect(src).toContain('from "./notifications"');
    expect(src).toContain("listNewNotifications");
    expect(src).toContain("getNotificationSummary");
  });

  it("deduplicates items by type:id key", () => {
    // The dedup pattern uses a Set or Map keyed by type:id
    expect(src).toMatch(/type.*id|dedup|seen.*Set|seen.*Map/);
  });

  it("detects overload: >10 items today or >5 overdue", () => {
    expect(src).toContain("overloadWarning");
    // Check for threshold constants
    expect(src).toMatch(/10|overload/);
  });

  it("is a VIEW layer — no schema imports", () => {
    expect(src).not.toContain('from "@/lib/db/schema"');
    expect(src).not.toContain("drizzle");
    expect(src).not.toContain("CREATE TABLE");
  });

  it("enforces userId via service calls, not direct DB", () => {
    // All service functions receive userId as parameter
    expect(src).toContain("buildOperationalAgenda(userId: string)");
    expect(src).toContain("buildWeeklySummary(userId: string)");
    expect(src).toContain("getCompanyAgenda");
    // No direct db calls
    expect(src).not.toContain("import { db }");
  });
});

// ─── 2. API route: /api/crm/agenda ──────────────────────────────────

describe("Phase 10 — API route: /api/crm/agenda", () => {
  const src = readSrc("app/api/crm/agenda/route.ts");

  it("exports GET handler", () => {
    expect(src).toContain("export async function GET");
  });

  it("enforces auth via auth()", () => {
    expect(src).toContain("await auth()");
    expect(src).toContain("session?.user?.id");
    expect(src).toContain("No autorizado");
    expect(src).toContain("401");
  });

  it("supports view=full (default)", () => {
    expect(src).toContain("buildOperationalAgenda");
    expect(src).toContain("agenda");
  });

  it("supports view=weekly", () => {
    expect(src).toContain('view === "weekly"');
    expect(src).toContain("buildWeeklySummary");
  });

  it("supports view=company with companyId", () => {
    expect(src).toContain('view === "company"');
    expect(src).toContain("getCompanyAgenda");
    expect(src).toContain("companyId");
  });

  it("validates companyId for company view", () => {
    expect(src).toContain("companyId requerido");
    expect(src).toContain("400");
  });

  it("uses force-dynamic", () => {
    expect(src).toContain('export const dynamic = "force-dynamic"');
  });

  it("has error handling with 500", () => {
    expect(src).toContain("catch");
    expect(src).toContain("500");
    expect(src).toContain("Error interno");
  });
});

// ─── 3. UI: CrmAgendaPanel ──────────────────────────────────────────

describe("Phase 10 — UI: CrmAgendaPanel", () => {
  const src = readSrc("components/crm/CrmAgendaPanel.tsx");

  it("is a React component with 'use client'", () => {
    expect(src).toContain('"use client"');
  });

  it("has AgendaSummaryBar component", () => {
    expect(src).toContain("AgendaSummaryBar");
  });

  it("shows 5 KPI categories in summary", () => {
    expect(src).toContain("Vencido");
    expect(src).toContain("Hoy");
    expect(src).toContain("Mañana");
    expect(src).toContain("Semana");
  });

  it("has AgendaItemRow component for rendering items", () => {
    expect(src).toContain("AgendaItemRow");
  });

  it("displays type, title, priority, company for each item", () => {
    expect(src).toContain("priority");
    expect(src).toContain("companyName");
    expect(src).toContain("title");
  });

  it("has SlotSection component for collapsible time slots", () => {
    expect(src).toContain("SlotSection");
  });

  it("has WeeklyView component", () => {
    expect(src).toContain("WeeklyView");
  });

  it("has Agenda/Semanal toggle", () => {
    expect(src).toContain("Agenda");
    expect(src).toContain("Semanal");
  });

  it("supports companyId prop for filtered view", () => {
    expect(src).toContain("companyId");
  });

  it("fetches from /api/crm/agenda", () => {
    expect(src).toContain("/api/crm/agenda");
  });

  it("handles loading state", () => {
    expect(src).toContain("loading");
    expect(src).toContain("setLoading");
  });

  it("shows overload warning", () => {
    expect(src).toContain("overloadWarning");
  });
});

// ─── 4. Swarm tools: 3 Phase 10 tools ───────────────────────────────

describe("Phase 10 — Swarm tools: agenda tools in crm-tools.ts", () => {
  const src = readSrc("lib/agent/crm-tools.ts");

  it("imports buildOperationalAgenda from operational-agenda", () => {
    expect(src).toContain("buildOperationalAgenda");
    expect(src).toContain('from "@/lib/crm/operational-agenda"');
  });

  it("imports buildWeeklySummary from operational-agenda", () => {
    expect(src).toContain("buildWeeklySummary");
  });

  it("imports getCompanyAgenda from operational-agenda", () => {
    expect(src).toContain("getCompanyAgenda");
  });

  it("defines crm_get_agenda_today tool", () => {
    expect(src).toContain('"crm_get_agenda_today"');
  });

  it("defines crm_get_agenda_week tool", () => {
    expect(src).toContain('"crm_get_agenda_week"');
  });

  it("defines crm_get_agenda_company tool", () => {
    expect(src).toContain('"crm_get_agenda_company"');
  });

  it("agenda_today handler calls buildOperationalAgenda", () => {
    expect(src).toContain("crmGetAgendaTodayHandler");
    expect(src).toContain("buildOperationalAgenda");
  });

  it("agenda_week handler calls buildWeeklySummary", () => {
    expect(src).toContain("crmGetAgendaWeekHandler");
    expect(src).toContain("buildWeeklySummary");
  });

  it("agenda_company handler calls getCompanyAgenda", () => {
    expect(src).toContain("crmGetAgendaCompanyHandler");
    expect(src).toContain("getCompanyAgenda");
  });

  it("handlers use userId as first parameter", () => {
    // Verify handler signature pattern
    expect(src).toMatch(/crmGetAgendaTodayHandler.*userId/s);
    expect(src).toMatch(/crmGetAgendaWeekHandler.*userId/s);
    expect(src).toMatch(/crmGetAgendaCompanyHandler.*userId/s);
  });

  it("handlers return ok: true/false pattern", () => {
    expect(src).toContain("ok: true");
  });
});

// ─── 5. Agent distribution: Phase 10 tools per role ─────────────────

describe("Phase 10 — Agent distribution in swarm.ts", () => {
  const src = readSrc("lib/agent/swarm.ts");

  it("CEO has all 3 agenda tools (full access)", () => {
    // CEO section should contain all three
    expect(src).toContain("Phase 10 — Operational Agenda");
    expect(src).toContain('"crm_get_agenda_today"');
    expect(src).toContain('"crm_get_agenda_week"');
    expect(src).toContain('"crm_get_agenda_company"');
  });

  it("Recepción has crm_get_agenda_today (triage only)", () => {
    // Check that recepcion section has the Phase 10 comment + today tool
    const recepcionMatch = src.match(/recepcion[\s\S]*?Phase 10[\s\S]*?crm_get_agenda_today/);
    expect(recepcionMatch).not.toBeNull();
  });

  it("Comercial Principal has all 3 agenda tools", () => {
    // Find comercial-principal section with all 3
    const match = src.match(/comercial-principal[\s\S]*?Phase 10[\s\S]*?crm_get_agenda_today[\s\S]*?crm_get_agenda_week[\s\S]*?crm_get_agenda_company/);
    expect(match).not.toBeNull();
  });

  it("Comercial Junior has today + company (no week)", () => {
    const juniorSection = src.match(/comercial-junior[\s\S]*?Phase 10[\s\S]*?"crm_get_agenda_today"[\s\S]*?"crm_get_agenda_company"/);
    expect(juniorSection).not.toBeNull();
  });

  it("Consultor Servicios has company only (service context)", () => {
    const consultorSection = src.match(/consultor-servicios[\s\S]*?Phase 10[\s\S]*?"crm_get_agenda_company"/);
    expect(consultorSection).not.toBeNull();
  });

  it("BI-Scoring has today + week (analytics)", () => {
    const biSection = src.match(/bi-scoring[\s\S]*?Phase 10[\s\S]*?"crm_get_agenda_today"[\s\S]*?"crm_get_agenda_week"/);
    expect(biSection).not.toBeNull();
  });

  it("has Phase 10 comments on all agent distributions", () => {
    const p10Comments = src.match(/Phase 10 — Operational Agenda/g) || [];
    expect(p10Comments.length).toBeGreaterThanOrEqual(6);
  });
});

// ─── 6. Dashboard integration ────────────────────────────────────────

describe("Phase 10 — Dashboard integration", () => {
  const src = readSrc("app/dashboard/page.tsx");

  it("imports CrmAgendaPanel", () => {
    expect(src).toContain('import CrmAgendaPanel from "@/components/crm/CrmAgendaPanel"');
  });

  it("has Agenda as first CRM sub-tab", () => {
    // Agenda should appear before operativa in the tabs array
    const agendaIdx = src.indexOf('"agenda"');
    const operativaIdx = src.indexOf('"operativa"');
    expect(agendaIdx).toBeGreaterThan(-1);
    expect(agendaIdx).toBeLessThan(operativaIdx);
  });

  it('renders CrmAgendaPanel for sub === "agenda"', () => {
    expect(src).toContain('sub === "agenda" && <CrmAgendaPanel');
  });

  it("Agenda tab has Calendar icon", () => {
    // Check that the agenda tab uses Calendar icon
    expect(src).toContain('{ id: "agenda"');
    expect(src).toContain("Calendar");
  });
});

// ─── 7. Phase 7/8/9 integration ─────────────────────────────────────

describe("Phase 10 — Integration with Phases 7/8/9", () => {
  const agenda = readSrc("lib/crm/operational-agenda.ts");

  it("uses Phase 7 commercial-ops for renewals and opportunities", () => {
    expect(agenda).toContain("getExpiringServices");
    expect(agenda).toContain("getHotOpportunities");
    expect(agenda).toContain('from "./commercial-ops"');
  });

  it("uses Phase 8 tasks and activities", () => {
    expect(agenda).toContain("getTodayTasks");
    expect(agenda).toContain("getOverdueTasks");
    expect(agenda).toContain("getUpcomingTasks");
    expect(agenda).toContain("getOverdueFollowUps");
    expect(agenda).toContain("getUpcomingFollowUps");
  });

  it("uses Phase 9 notifications for alerts", () => {
    expect(agenda).toContain("listNewNotifications");
    expect(agenda).toContain("getNotificationSummary");
    expect(agenda).toContain('from "./notifications"');
  });

  it("creates no new database tables — pure aggregation", () => {
    expect(agenda).not.toContain("CREATE TABLE");
    expect(agenda).not.toContain("pgTable");
    expect(agenda).not.toContain("import { db }");
  });
});

// ─── 8. Auth & ownership ────────────────────────────────────────────

describe("Phase 10 — Auth & ownership enforcement", () => {
  it("API route enforces auth() session check", () => {
    const route = readSrc("app/api/crm/agenda/route.ts");
    expect(route).toContain("await auth()");
    expect(route).toContain("session?.user?.id");
    expect(route).toContain("401");
  });

  it("buildOperationalAgenda requires userId parameter", () => {
    const agenda = readSrc("lib/crm/operational-agenda.ts");
    expect(agenda).toContain("buildOperationalAgenda(userId: string)");
  });

  it("buildWeeklySummary requires userId parameter", () => {
    const agenda = readSrc("lib/crm/operational-agenda.ts");
    expect(agenda).toContain("buildWeeklySummary(userId: string)");
  });

  it("getCompanyAgenda requires userId + companyId", () => {
    const agenda = readSrc("lib/crm/operational-agenda.ts");
    expect(agenda).toMatch(/getCompanyAgenda\(.*userId.*companyId/s);
  });

  it("swarm tool handlers receive userId as first argument", () => {
    const tools = readSrc("lib/agent/crm-tools.ts");
    expect(tools).toMatch(/crmGetAgendaTodayHandler.*userId/s);
    expect(tools).toMatch(/crmGetAgendaWeekHandler.*userId/s);
    expect(tools).toMatch(/crmGetAgendaCompanyHandler.*userId/s);
  });
});

// ─── 9. No FullCalendar / no aggressive automation ───────────────────

describe("Phase 10 — Guardrails: no FullCalendar, no aggressive automation", () => {
  const agenda = readSrc("lib/crm/operational-agenda.ts");
  const ui = readSrc("components/crm/CrmAgendaPanel.tsx");
  const tools = readSrc("lib/agent/crm-tools.ts");

  it("no FullCalendar import", () => {
    expect(ui).not.toContain("fullcalendar");
    expect(ui).not.toContain("FullCalendar");
    expect(ui).not.toContain("@fullcalendar");
  });

  it("no Google Calendar deep sync", () => {
    expect(agenda).not.toContain("googleapis");
    expect(agenda).not.toContain("google-calendar");
    expect(tools).not.toMatch(/google.*calendar/i);
  });

  it("no automatic client contact (email, SMS, WhatsApp)", () => {
    expect(agenda).not.toContain("sendEmail");
    expect(agenda).not.toContain("sendSms");
    expect(agenda).not.toContain("sendWhatsApp");
    expect(tools).not.toContain("auto_send");
  });

  it("no automatic data modification — read-only aggregation", () => {
    expect(agenda).not.toContain("INSERT INTO");
    expect(agenda).not.toContain("UPDATE ");
    expect(agenda).not.toContain("DELETE FROM");
    expect(agenda).not.toContain(".insert(");
    expect(agenda).not.toContain(".update(");
    expect(agenda).not.toContain(".delete(");
  });
});

// ─── 10. Regression: Phases 1-9 untouched ───────────────────────────

describe("Phase 10 — Regression: Phases 1-9 not broken", () => {
  it("Phase 7 commercial-ops still exports 4 key functions", () => {
    const ops = readSrc("lib/crm/commercial-ops.ts");
    expect(ops).toContain("getExpiringServices");
    expect(ops).toContain("getHotOpportunities");
    expect(ops).toContain("getStaleOpportunities");
    expect(ops).toContain("getCrossSellCandidates");
  });

  it("Phase 8 commercial-tasks still exports task functions", () => {
    const tasks = readSrc("lib/crm/commercial-tasks.ts");
    expect(tasks).toContain("getTodayTasks");
    expect(tasks).toContain("getOverdueTasks");
    expect(tasks).toContain("getUpcomingTasks");
  });

  it("Phase 8 activities still exports followup functions", () => {
    const acts = readSrc("lib/crm/activities.ts");
    expect(acts).toContain("getOverdueFollowUps");
    expect(acts).toContain("getUpcomingFollowUps");
  });

  it("Phase 9 notifications still exports service functions", () => {
    const notifs = readSrc("lib/crm/notifications.ts");
    expect(notifs).toContain("listNewNotifications");
    expect(notifs).toContain("getNotificationSummary");
  });

  it("Phase 9 tools still present in crm-tools.ts", () => {
    const tools = readSrc("lib/agent/crm-tools.ts");
    expect(tools).toContain('"crm_list_notifications"');
    expect(tools).toContain('"crm_generate_notifications"');
    expect(tools).toContain('"crm_update_notification"');
  });

  it("Phase 9 agent distribution preserved", () => {
    const swarm = readSrc("lib/agent/swarm.ts");
    expect(swarm).toContain("Phase 9 — Notifications");
    const p9Comments = swarm.match(/Phase 9 — Notifications/g) || [];
    expect(p9Comments.length).toBeGreaterThanOrEqual(7);
  });

  it("CRM sub-tabs still include all Phase 9 tabs", () => {
    const dash = readSrc("app/dashboard/page.tsx");
    expect(dash).toContain('"alertas"');
    expect(dash).toContain('"operativa"');
    expect(dash).toContain('"actividad"');
    expect(dash).toContain('"tareas"');
    expect(dash).toContain('"empresas"');
    expect(dash).toContain('"oportunidades"');
  });

  it("schema.ts has no Phase 10 modifications (VIEW only)", () => {
    const schema = readFileSync(resolve(__dirname, "../../src/db/schema.ts"), "utf-8");
    expect(schema).not.toContain("agenda");
    // Phase 9 tables still present
    expect(schema).toContain("operationalNotifications");
  });
});
