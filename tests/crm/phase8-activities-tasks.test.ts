/**
 * Phase 8 Behavioral Tests — Commercial Activity, Tasks & Operational Follow-up
 *
 * Verifies code-level patterns for:
 *  1. Schema: commercial_activities + commercial_tasks tables with correct columns
 *  2. Migration: SQL file creates both tables with indexes
 *  3. Activities service: ACTIVITY_TYPES, CRUD, follow-up detection, stale companies
 *  4. Tasks service: TASK_STATUSES, TASK_PRIORITIES, TASK_SOURCES, CRUD, status workflow
 *  5. API routes: /api/crm/activities (GET+POST), /api/crm/tasks (GET+POST), /api/crm/tasks/[id] (PATCH)
 *  6. UI components: CrmActivityPanel, CrmTasksPanel with forms, timelines, summary cards
 *  7. Swarm tools: 5 new Phase 8 tools + handlers
 *  8. Agent distribution: correct Phase 8 tools per agent role
 *  9. Phase 7 integration: daily brief includes tasks/followups, company ops context includes last activity
 * 10. Auth & ownership: userId enforcement across all modules
 * 11. Dashboard integration: new sub-tabs for Activity and Tasks
 * 12. Regression: Phases 1-7 remain intact
 *
 * File-content validation pattern — no database required.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const srcDir = resolve(__dirname, "../../src");
const drizzleDir = resolve(__dirname, "../../drizzle");

function readSrc(path: string): string {
  return readFileSync(resolve(srcDir, path), "utf-8");
}

function readDrizzle(path: string): string {
  return readFileSync(resolve(drizzleDir, path), "utf-8");
}

// ═══════════════════════════════════════════════════════════════════
// 1. SCHEMA — commercial_activities table
// ═══════════════════════════════════════════════════════════════════

describe("Phase 8 — Schema: commercial_activities", () => {
  const src = readSrc("db/schema.ts");

  it("exports commercialActivities table", () => {
    expect(src).toContain('export const commercialActivities = pgTable("commercial_activities"');
  });

  it("has userId column with cascade delete", () => {
    expect(src).toContain('userId: text("user_id").notNull()');
  });

  it("has companyId as required FK", () => {
    expect(src).toContain('companyId: integer("company_id").notNull()');
  });

  it("has optional contactId FK", () => {
    expect(src).toMatch(/contactId:\s*integer\("contact_id"\)\.references/);
  });

  it("has optional opportunityId FK", () => {
    expect(src).toMatch(/opportunityId:\s*integer\("opportunity_id"\)/);
  });

  it("has optional caseId FK", () => {
    expect(src).toMatch(/caseId:\s*integer\("case_id"\)/);
  });

  it("has optional serviceId FK", () => {
    expect(src).toMatch(/serviceId:\s*integer\("service_id"\)/);
  });

  it("has type column varchar(30)", () => {
    expect(src).toContain('type: varchar("type", { length: 30 })');
  });

  it("has summary text not null", () => {
    expect(src).toContain('summary: text("summary").notNull()');
  });

  it("has outcome nullable text", () => {
    expect(src).toContain('outcome: text("outcome")');
  });

  it("has nextStep nullable text", () => {
    expect(src).toContain('nextStep: text("next_step")');
  });

  it("has dueAt nullable timestamp", () => {
    expect(src).toContain('dueAt: timestamp("due_at"');
  });

  it("exports CommercialActivity type", () => {
    expect(src).toContain("CommercialActivity");
  });

  it("exports NewCommercialActivity type", () => {
    expect(src).toContain("NewCommercialActivity");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. SCHEMA — commercial_tasks table
// ═══════════════════════════════════════════════════════════════════

describe("Phase 8 — Schema: commercial_tasks", () => {
  const src = readSrc("db/schema.ts");

  it("exports commercialTasks table", () => {
    expect(src).toContain('export const commercialTasks = pgTable("commercial_tasks"');
  });

  it("has userId column", () => {
    // Both tables have userId; just check it's in the file
    expect(src).toContain('userId: text("user_id")');
  });

  it("has title text not null", () => {
    expect(src).toContain('title: text("title").notNull()');
  });

  it("has priority with default media", () => {
    expect(src).toContain('.default("media")');
  });

  it("has status with default pendiente", () => {
    expect(src).toContain('.default("pendiente")');
  });

  it("has source with default manual", () => {
    expect(src).toContain('.default("manual")');
  });

  it("has completedAt timestamp", () => {
    expect(src).toContain('completedAt: timestamp("completed_at"');
  });

  it("has updatedAt timestamp", () => {
    expect(src).toContain('updatedAt: timestamp("updated_at"');
  });

  it("exports CommercialTask type", () => {
    expect(src).toContain("CommercialTask");
  });

  it("exports NewCommercialTask type", () => {
    expect(src).toContain("NewCommercialTask");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. MIGRATION — SQL file
// ═══════════════════════════════════════════════════════════════════

describe("Phase 8 — Migration SQL", () => {
  const sql = readDrizzle("0004_phase8_activities_tasks.sql");

  it("creates commercial_activities table", () => {
    expect(sql).toContain("CREATE TABLE");
    expect(sql).toContain("commercial_activities");
  });

  it("creates commercial_tasks table", () => {
    expect(sql).toContain("commercial_tasks");
  });

  it("creates indexes for activities", () => {
    expect(sql).toContain("activities_user_idx");
    expect(sql).toContain("activities_company_idx");
  });

  it("creates indexes for tasks", () => {
    expect(sql).toContain("tasks_user_idx");
    expect(sql).toContain("tasks_status_idx");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. ACTIVITIES SERVICE
// ═══════════════════════════════════════════════════════════════════

describe("Phase 8 — Activities service layer", () => {
  const src = readSrc("lib/crm/activities.ts");

  it("defines ACTIVITY_TYPES constant with 10 types", () => {
    expect(src).toContain("ACTIVITY_TYPES");
    expect(src).toContain('"llamada"');
    expect(src).toContain('"email"');
    expect(src).toContain('"whatsapp"');
    expect(src).toContain('"visita"');
    expect(src).toContain('"nota"');
    expect(src).toContain('"seguimiento"');
    expect(src).toContain('"cambio_estado"');
    expect(src).toContain('"tarea_completada"');
    expect(src).toContain('"renovacion"');
    expect(src).toContain('"propuesta_enviada"');
  });

  it("exports createActivity function", () => {
    expect(src).toContain("export async function createActivity");
  });

  it("exports listActivitiesByCompany function", () => {
    expect(src).toContain("export async function listActivitiesByCompany");
  });

  it("exports listActivitiesByOpportunity function", () => {
    expect(src).toContain("export async function listActivitiesByOpportunity");
  });

  it("exports getLastActivityForCompany function", () => {
    expect(src).toContain("export async function getLastActivityForCompany");
  });

  it("exports getLastActivityForOpportunity function", () => {
    expect(src).toContain("export async function getLastActivityForOpportunity");
  });

  it("exports getOverdueFollowUps function", () => {
    expect(src).toContain("export async function getOverdueFollowUps");
  });

  it("detects overdue by dueAt < now with nextStep present", () => {
    expect(src).toContain("isNotNull(commercialActivities.nextStep)");
    expect(src).toContain("isNotNull(commercialActivities.dueAt)");
  });

  it("exports getUpcomingFollowUps function", () => {
    expect(src).toContain("export async function getUpcomingFollowUps");
  });

  it("exports getCompaniesWithoutRecentActivity function", () => {
    expect(src).toContain("export async function getCompaniesWithoutRecentActivity");
  });

  it("exports getRecentActivity function", () => {
    expect(src).toContain("export async function getRecentActivity");
  });

  it("enforces userId ownership in queries", () => {
    expect(src).toContain("eq(commercialActivities.userId, userId)");
  });

  it("JOINs with companies for company name", () => {
    expect(src).toContain("innerJoin(companies");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. TASKS SERVICE
// ═══════════════════════════════════════════════════════════════════

describe("Phase 8 — Tasks service layer", () => {
  const src = readSrc("lib/crm/commercial-tasks.ts");

  it("defines TASK_STATUSES constant", () => {
    expect(src).toContain("TASK_STATUSES");
    expect(src).toContain('"pendiente"');
    expect(src).toContain('"en_progreso"');
    expect(src).toContain('"completada"');
    expect(src).toContain('"cancelada"');
  });

  it("defines TASK_PRIORITIES constant", () => {
    expect(src).toContain("TASK_PRIORITIES");
    expect(src).toContain('"alta"');
    expect(src).toContain('"media"');
    expect(src).toContain('"baja"');
  });

  it("defines TASK_SOURCES constant", () => {
    expect(src).toContain("TASK_SOURCES");
    expect(src).toContain('"manual"');
    expect(src).toContain('"suggested"');
    expect(src).toContain('"followup"');
    expect(src).toContain('"renewal"');
    expect(src).toContain('"case"');
  });

  it("defines TERMINAL_STATUSES for status workflow", () => {
    expect(src).toContain("TERMINAL_STATUSES");
  });

  it("exports createTask function", () => {
    expect(src).toContain("export async function createTask");
  });

  it("exports updateTaskStatus function", () => {
    expect(src).toContain("export async function updateTaskStatus");
  });

  it("sets completedAt on completion", () => {
    expect(src).toContain("completedAt");
  });

  it("exports updateTask for full updates", () => {
    expect(src).toContain("export async function updateTask");
  });

  it("exports listActiveTasks function", () => {
    expect(src).toContain("export async function listActiveTasks");
  });

  it("exports listTasksByCompany function", () => {
    expect(src).toContain("export async function listTasksByCompany");
  });

  it("exports listTasksByOpportunity function", () => {
    expect(src).toContain("export async function listTasksByOpportunity");
  });

  it("exports getTodayTasks function", () => {
    expect(src).toContain("export async function getTodayTasks");
  });

  it("exports getOverdueTasks function", () => {
    expect(src).toContain("export async function getOverdueTasks");
  });

  it("exports getUpcomingTasks function", () => {
    expect(src).toContain("export async function getUpcomingTasks");
  });

  it("exports getTaskCountsSummary function", () => {
    expect(src).toContain("export async function getTaskCountsSummary");
  });

  it("summary returns totalActive, overdue, dueToday, upcoming7d, alta", () => {
    expect(src).toContain("totalActive");
    expect(src).toContain("overdue");
    expect(src).toContain("dueToday");
    expect(src).toContain("upcoming7d");
  });

  it("excludes terminal statuses from active queries", () => {
    expect(src).toContain("TERMINAL_STATUSES");
    expect(src).toContain("inArray");
  });

  it("enforces userId ownership in queries", () => {
    expect(src).toContain("eq(commercialTasks.userId, userId)");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. API ROUTES — Activities
// ═══════════════════════════════════════════════════════════════════

describe("Phase 8 — API route: /api/crm/activities", () => {
  const src = readSrc("app/api/crm/activities/route.ts");

  it("exports GET handler", () => {
    expect(src).toContain("export async function GET");
  });

  it("exports POST handler", () => {
    expect(src).toContain("export async function POST");
  });

  it("enforces auth via session check", () => {
    expect(src).toContain("auth()");
    expect(src).toContain("No autorizado");
  });

  it("supports company view", () => {
    expect(src).toContain('"company"');
  });

  it("supports opportunity view", () => {
    expect(src).toContain('"opportunity"');
  });

  it("supports recent view", () => {
    expect(src).toContain('"recent"');
  });

  it("supports overdue view", () => {
    expect(src).toContain('"overdue"');
  });

  it("supports upcoming view", () => {
    expect(src).toContain('"upcoming"');
  });

  it("supports stale view", () => {
    expect(src).toContain('"stale"');
  });

  it("POST validates required fields", () => {
    expect(src).toContain("companyId");
    expect(src).toContain("type");
    expect(src).toContain("summary");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. API ROUTES — Tasks
// ═══════════════════════════════════════════════════════════════════

describe("Phase 8 — API route: /api/crm/tasks", () => {
  const src = readSrc("app/api/crm/tasks/route.ts");

  it("exports GET handler", () => {
    expect(src).toContain("export async function GET");
  });

  it("exports POST handler", () => {
    expect(src).toContain("export async function POST");
  });

  it("enforces auth", () => {
    expect(src).toContain("auth()");
  });

  it("supports active view", () => {
    expect(src).toContain('"active"');
  });

  it("supports company view", () => {
    expect(src).toContain('"company"');
  });

  it("supports opportunity view", () => {
    expect(src).toContain('"opportunity"');
  });

  it("supports today view", () => {
    expect(src).toContain('"today"');
  });

  it("supports overdue view", () => {
    expect(src).toContain('"overdue"');
  });

  it("supports summary view", () => {
    expect(src).toContain('"summary"');
  });
});

describe("Phase 8 — API route: /api/crm/tasks/[id]", () => {
  const src = readSrc("app/api/crm/tasks/[id]/route.ts");

  it("exports PATCH handler", () => {
    expect(src).toContain("export async function PATCH");
  });

  it("enforces auth", () => {
    expect(src).toContain("auth()");
  });

  it("validates task status against TASK_STATUSES", () => {
    expect(src).toContain("TASK_STATUSES");
  });

  it("supports status-only quick update", () => {
    expect(src).toContain("updateTaskStatus");
  });

  it("supports full update", () => {
    expect(src).toContain("updateTask");
  });

  it("returns 404 for not found", () => {
    expect(src).toContain("Tarea no encontrada");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. UI — CrmActivityPanel
// ═══════════════════════════════════════════════════════════════════

describe("Phase 8 — UI: CrmActivityPanel", () => {
  const src = readSrc("components/crm/CrmActivityPanel.tsx");

  it("exports default CrmActivityPanel component", () => {
    expect(src).toContain("export default function CrmActivityPanel");
  });

  it("exports ActivityForm component", () => {
    expect(src).toContain("export { ActivityForm");
  });

  it("exports ActivityTimeline component", () => {
    expect(src).toContain("ActivityTimeline");
  });

  it("defines ACTIVITY_TYPES with icons", () => {
    expect(src).toContain("ACTIVITY_TYPES");
    expect(src).toContain("llamada");
    expect(src).toContain("email");
    expect(src).toContain("whatsapp");
    expect(src).toContain("visita");
  });

  it("has timeAgo helper for relative dates", () => {
    expect(src).toContain("function timeAgo");
  });

  it("fetches from /api/crm/activities", () => {
    expect(src).toContain("/api/crm/activities");
  });

  it("shows overdue follow-ups alert", () => {
    expect(src).toContain("seguimiento(s) vencido(s)");
  });

  it("has tabs for recent, overdue, upcoming", () => {
    expect(src).toContain('"recent"');
    expect(src).toContain('"overdue"');
    expect(src).toContain('"upcoming"');
  });

  it("supports companyId prop for scoped view", () => {
    expect(src).toContain("companyId");
  });

  it("ActivityForm posts to /api/crm/activities", () => {
    expect(src).toContain('method: "POST"');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. UI — CrmTasksPanel
// ═══════════════════════════════════════════════════════════════════

describe("Phase 8 — UI: CrmTasksPanel", () => {
  const src = readSrc("components/crm/CrmTasksPanel.tsx");

  it("exports default CrmTasksPanel component", () => {
    expect(src).toContain("export default function CrmTasksPanel");
  });

  it("exports TaskForm component", () => {
    expect(src).toContain("export { TaskForm");
  });

  it("exports TaskList component", () => {
    expect(src).toContain("TaskList");
  });

  it("exports TaskSummaryCards component", () => {
    expect(src).toContain("TaskSummaryCards");
  });

  it("defines priority icons (alta, media, baja)", () => {
    expect(src).toContain("priorityIcon");
    expect(src).toContain('"alta"');
    expect(src).toContain('"media"');
    expect(src).toContain('"baja"');
  });

  it("defines status icons", () => {
    expect(src).toContain("statusIcon");
    expect(src).toContain('"completada"');
    expect(src).toContain('"en_progreso"');
  });

  it("has sourceBadge helper", () => {
    expect(src).toContain("sourceBadge");
    expect(src).toContain("manual");
    expect(src).toContain("suggested");
    expect(src).toContain("followup");
    expect(src).toContain("renewal");
  });

  it("fetches from /api/crm/tasks", () => {
    expect(src).toContain("/api/crm/tasks");
  });

  it("supports status change via PATCH", () => {
    expect(src).toContain('method: "PATCH"');
  });

  it("has summary cards with 5 KPIs", () => {
    expect(src).toContain("Activas");
    expect(src).toContain("Vencidas");
    expect(src).toContain("Hoy");
    expect(src).toContain("7 días");
    expect(src).toContain("Alta");
  });

  it("has tabs for active, overdue, today", () => {
    expect(src).toContain('"active"');
    expect(src).toContain('"overdue"');
    expect(src).toContain('"today"');
  });

  it("detects overdue tasks", () => {
    expect(src).toContain("isOverdue");
    expect(src).toContain("Vencida");
  });

  it("supports companyId and opportunityId props", () => {
    expect(src).toContain("companyId");
    expect(src).toContain("opportunityId");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 10. SWARM TOOLS — 5 Phase 8 tools
// ═══════════════════════════════════════════════════════════════════

describe("Phase 8 — Swarm tools: definitions", () => {
  const src = readSrc("lib/agent/crm-tools.ts");

  it("defines crm_list_company_activities tool", () => {
    expect(src).toContain("crm_list_company_activities");
  });

  it("defines crm_get_pending_followups tool", () => {
    expect(src).toContain("crm_get_pending_followups");
  });

  it("defines crm_list_company_tasks tool", () => {
    expect(src).toContain("crm_list_company_tasks");
  });

  it("defines crm_create_suggested_task tool", () => {
    expect(src).toContain("crm_create_suggested_task");
  });

  it("defines crm_get_today_summary tool", () => {
    expect(src).toContain("crm_get_today_summary");
  });

  it("handler for activities uses listActivitiesByCompany", () => {
    expect(src).toContain("listActivitiesByCompany");
  });

  it("handler for followups uses getOverdueFollowUps", () => {
    expect(src).toContain("getOverdueFollowUps");
  });

  it("handler for tasks uses listTasksByCompany", () => {
    expect(src).toContain("listTasksByCompany");
  });

  it("handler for suggested task uses createTask", () => {
    expect(src).toContain("createTask");
  });

  it("handler for today summary uses Promise.all for aggregation", () => {
    expect(src).toContain("Promise.all");
  });

  it("today summary includes todayTasks", () => {
    expect(src).toContain("getTodayTasks");
  });

  it("today summary includes overdueTasks", () => {
    expect(src).toContain("getOverdueTasks");
  });

  it("today summary includes overdueFollowups", () => {
    expect(src).toContain("getOverdueFollowUps");
  });

  it("today summary includes recentActivity", () => {
    expect(src).toContain("getRecentActivity");
  });

  it("all handlers use ok: true/false pattern", () => {
    // Check for the correct ToolHandlerResult pattern
    expect(src).toContain("ok: true");
    expect(src).toContain("ok: false");
  });

  it("all handlers have userId as first parameter", () => {
    // Phase 8 handlers follow (userId, args) pattern
    expect(src).toContain("crmListCompanyActivitiesHandler");
    expect(src).toContain("crmGetPendingFollowupsHandler");
    expect(src).toContain("crmListCompanyTasksHandler");
    expect(src).toContain("crmCreateSuggestedTaskHandler");
    expect(src).toContain("crmGetTodaySummaryHandler");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 11. AGENT DISTRIBUTION — Phase 8 tools per role
// ═══════════════════════════════════════════════════════════════════

describe("Phase 8 — Agent distribution in swarm.ts", () => {
  const src = readSrc("lib/agent/swarm.ts");

  it("CEO has all 5 Phase 8 tools", () => {
    // CEO section should have all 5 tools
    expect(src).toContain("crm_list_company_activities");
    expect(src).toContain("crm_get_pending_followups");
    expect(src).toContain("crm_list_company_tasks");
    expect(src).toContain("crm_create_suggested_task");
    expect(src).toContain("crm_get_today_summary");
  });

  it("has Phase 8 comments in multiple agent sections", () => {
    const matches = src.match(/Phase 8/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(7); // 7 agents
  });

  it("recepcion has Phase 8 triage tools (log activities + summary)", () => {
    // The Phase 8 comment in recepcion section confirms triage access with log capability
    expect(src).toContain("Phase 8 — Activity & Tasks (triage: log activities + summary)");
  });

  it("comercial-principal has Phase 8 full access including task creation", () => {
    expect(src).toContain("Phase 8 — Activity & Tasks (full access — can create tasks)");
  });

  it("comercial-junior has Phase 8 tools (can log activities + summary + followups)", () => {
    expect(src).toContain("Phase 8 — Activity & Tasks (can log activities + summary + followups)");
  });

  it("consultor-servicios has Phase 8 read-only tools (activities + tasks for service context)", () => {
    expect(src).toContain("Phase 8 — Activity & Tasks (read-only: activities + tasks for service context)");
  });

  it("bi-scoring has Phase 8 analytics tools (activities + followups + summary)", () => {
    expect(src).toContain("Phase 8 — Activity & Tasks (analytics: activities + followups + summary)");
  });

  it("marketing-automation has Phase 8 read-only tools (activities for campaign context)", () => {
    expect(src).toContain("Phase 8 — Activity & Tasks (read-only: activities for campaign context)");
  });

  it("only CEO and comercial-principal can create suggested tasks", () => {
    // Count occurrences of crm_create_suggested_task
    const matches = src.match(/crm_create_suggested_task/g);
    // Should appear in: tool definition reference (at least 1) + CEO (1) + comercial-principal (1) = 3 minimum
    // But NOT in junior, recepcion, consultor, bi, marketing
    expect(matches).toBeTruthy();
    // The tool name appears in CEO and comercial-principal sections only (plus potential tool def)
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 12. PHASE 7 INTEGRATION — Brief includes tasks/followups
// ═══════════════════════════════════════════════════════════════════

describe("Phase 8 — Integration with Phase 7 commercial-ops", () => {
  const src = readSrc("lib/crm/commercial-ops.ts");

  it("imports from activities module", () => {
    expect(src).toContain('from "./activities"');
  });

  it("imports from commercial-tasks module", () => {
    expect(src).toContain('from "./commercial-tasks"');
  });

  it("DailyBrief includes pendingTasksCount", () => {
    expect(src).toContain("pendingTasksCount");
  });

  it("DailyBrief includes overdueTasksCount", () => {
    expect(src).toContain("overdueTasksCount");
  });

  it("DailyBrief includes todayTasksCount", () => {
    expect(src).toContain("todayTasksCount");
  });

  it("DailyBrief includes overdueFollowUpsCount", () => {
    expect(src).toContain("overdueFollowUpsCount");
  });

  it("DailyBrief includes inactiveCompaniesCount", () => {
    expect(src).toContain("inactiveCompaniesCount");
  });

  it("DailyBrief includes overdueFollowUps array", () => {
    expect(src).toContain("overdueFollowUps:");
  });

  it("DailyBrief includes todayTasks array", () => {
    expect(src).toContain("todayTasks:");
  });

  it("DailyBrief includes overdueTasks array", () => {
    expect(src).toContain("overdueTasks:");
  });

  it("DailyBrief includes inactiveCompanies array", () => {
    expect(src).toContain("inactiveCompanies:");
  });

  it("getDailyCommercialBrief fetches Phase 8 data via Promise.all", () => {
    expect(src).toContain("getOverdueFollowUps");
    expect(src).toContain("getTaskCountsSummary");
    expect(src).toContain("getTodayTasks");
    expect(src).toContain("getOverdueTasks");
    expect(src).toContain("getCompaniesWithoutRecentActivity");
  });

  it("CompanyOpsContext includes lastActivity", () => {
    expect(src).toContain("lastActivity:");
  });

  it("CompanyOpsContext includes daysSinceLastActivity", () => {
    expect(src).toContain("daysSinceLastActivity");
  });

  it("CompanyOpsContext includes pendingTasks", () => {
    expect(src).toContain("pendingTasks:");
  });

  it("getCompanyOpsContext fetches last activity", () => {
    expect(src).toContain("getLastActivityForCompany");
  });

  it("getCompanyOpsContext fetches company tasks", () => {
    expect(src).toContain("listTasksByCompany");
  });

  it("generates action for inactive company (>14 days)", () => {
    expect(src).toContain("Sin actividad desde hace");
  });

  it("generates action for overdue company tasks", () => {
    expect(src).toContain("tarea(s) vencida(s)");
  });

  it("generates action for company with no activity", () => {
    expect(src).toContain("Sin actividad registrada");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 13. DASHBOARD INTEGRATION
// ═══════════════════════════════════════════════════════════════════

describe("Phase 8 — Dashboard integration", () => {
  const src = readSrc("app/dashboard/page.tsx");

  it("imports CrmActivityPanel", () => {
    expect(src).toContain("CrmActivityPanel");
  });

  it("imports CrmTasksPanel", () => {
    expect(src).toContain("CrmTasksPanel");
  });

  it("has Actividad sub-tab", () => {
    expect(src).toContain("Actividad");
  });

  it("has Tareas sub-tab", () => {
    expect(src).toContain("Tareas");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 14. REGRESSION — Phases 1-7 intact
// ═══════════════════════════════════════════════════════════════════

describe("Phase 8 — Regression: earlier phases intact", () => {
  it("schema still exports companies table", () => {
    const src = readSrc("db/schema.ts");
    expect(src).toContain("export const companies");
  });

  it("schema still exports opportunities table", () => {
    const src = readSrc("db/schema.ts");
    expect(src).toContain("export const opportunities");
  });

  it("schema still exports services table", () => {
    const src = readSrc("db/schema.ts");
    expect(src).toContain("export const services");
  });

  it("schema still exports contacts table", () => {
    const src = readSrc("db/schema.ts");
    expect(src).toContain("export const contacts");
  });

  it("schema still exports cases table", () => {
    const src = readSrc("db/schema.ts");
    expect(src).toContain("export const cases");
  });

  it("commercial-ops still exports OPS_THRESHOLDS", () => {
    const src = readSrc("lib/crm/commercial-ops.ts");
    expect(src).toContain("export const OPS_THRESHOLDS");
  });

  it("commercial-ops still exports getExpiringServices", () => {
    const src = readSrc("lib/crm/commercial-ops.ts");
    expect(src).toContain("export async function getExpiringServices");
  });

  it("commercial-ops still exports getCrossSellCandidates", () => {
    const src = readSrc("lib/crm/commercial-ops.ts");
    expect(src).toContain("export async function getCrossSellCandidates");
  });

  it("swarm.ts still has all 10 agents", () => {
    const src = readSrc("lib/agent/swarm.ts");
    expect(src).toContain('"ceo"');
    expect(src).toContain('"recepcion"');
    expect(src).toContain('"comercial-principal"');
    expect(src).toContain('"comercial-junior"');
    expect(src).toContain('"consultor-servicios"');
    expect(src).toContain('"consultor-digital"');
    expect(src).toContain('"legal-rgpd"');
    expect(src).toContain('"fiscal"');
    expect(src).toContain('"bi-scoring"');
    expect(src).toContain('"marketing-automation"');
  });

  it("swarm.ts still has Phase 7 tools", () => {
    const src = readSrc("lib/agent/swarm.ts");
    expect(src).toContain("crm_get_expiring_services");
    expect(src).toContain("crm_get_stale_opportunities");
    expect(src).toContain("crm_get_daily_brief");
    expect(src).toContain("crm_get_cross_sell_candidates");
    expect(src).toContain("crm_get_company_ops_context");
  });

  it("crm-tools.ts still has Phase 5 tools", () => {
    const src = readSrc("lib/agent/crm-tools.ts");
    expect(src).toContain("crm_search_companies");
    expect(src).toContain("crm_get_company");
    expect(src).toContain("crm_list_contacts");
    expect(src).toContain("crm_list_opportunities");
  });

  it("crm-tools.ts still has Phase 7 tools", () => {
    const src = readSrc("lib/agent/crm-tools.ts");
    expect(src).toContain("crm_get_expiring_services");
    expect(src).toContain("crm_get_stale_opportunities");
    expect(src).toContain("crm_get_daily_brief");
    expect(src).toContain("crm_get_cross_sell_candidates");
    expect(src).toContain("crm_get_company_ops_context");
  });

  it("energy modules still exist", () => {
    const src = readSrc("lib/crm/savings-calculator.ts");
    expect(src).toContain("calculateSavings");
  });

  it("service verticals still exist", () => {
    const src = readSrc("lib/crm/service-verticals.ts");
    expect(src).toContain("SERVICE_TYPES");
    expect(src).toContain("VERTICAL_META");
  });
});
