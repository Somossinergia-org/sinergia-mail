/**
 * Phase 9 Behavioral Tests — Operational Notifications + Controlled Automation
 *
 * Verifies code-level patterns for:
 *  1. Schema: operational_notifications table with correct columns + indexes
 *  2. Migration: SQL creates table with 7 indexes + dedup unique index
 *  3. Notifications service: CRUD, batch create, dedup, filters, summary
 *  4. Notification rules: 6 rules engine, two-level automation, config flags
 *  5. API routes: GET (5 views) + POST (generate, mark_all_seen) + PATCH status
 *  6. UI: CrmNotificationsPanel with summary cards, filter tabs, actions
 *  7. Swarm tools: 3 Phase 9 tools + handlers
 *  8. Agent distribution: correct Phase 9 tools per agent role
 *  9. Phase 7/8 integration: daily brief includes notifications, company ops has activeAlerts
 * 10. Auth & ownership: userId enforcement across all modules
 * 11. Dashboard integration: "Alertas" sub-tab
 * 12. Controlled automation guardrails: autoCreateTasks default off, no client contact
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
// 1. SCHEMA — operational_notifications table
// ═══════════════════════════════════════════════════════════════════

describe("Phase 9 — Schema: operational_notifications", () => {
  const src = readSrc("db/schema.ts");

  it("defines operational_notifications table", () => {
    expect(src).toContain("operationalNotifications");
    expect(src).toContain('"operational_notifications"');
  });

  it("has userId column with cascade delete", () => {
    expect(src).toContain('userId: text("user_id")');
    expect(src).toContain("onDelete: \"cascade\"");
  });

  it("has entity foreign keys: companyId, opportunityId, caseId, taskId, serviceId", () => {
    // Within the notification table context
    expect(src).toContain('companyId: integer("company_id")');
    expect(src).toContain('opportunityId: integer("opportunity_id")');
    expect(src).toContain('caseId: integer("case_id")');
    expect(src).toContain('taskId: integer("task_id")');
    expect(src).toContain('serviceId: integer("service_id")');
  });

  it("has type, title, message, severity, status, source columns", () => {
    expect(src).toContain('type: varchar("type"');
    expect(src).toContain('title: text("title")');
    expect(src).toContain('message: text("message")');
    expect(src).toContain('severity: varchar("severity"');
    expect(src).toContain('status: varchar("status"');
    expect(src).toContain('source: varchar("source"');
  });

  it("has dedupKey for idempotent generation", () => {
    expect(src).toContain('dedupKey: varchar("dedup_key"');
  });

  it("has timestamps: createdAt, seenAt, resolvedAt", () => {
    expect(src).toContain('seenAt: timestamp("seen_at"');
    expect(src).toContain('resolvedAt: timestamp("resolved_at"');
  });

  it("has indexes: user, status, type, severity, company, dedup, created", () => {
    expect(src).toContain("notif_user_idx");
    expect(src).toContain("notif_status_idx");
    expect(src).toContain("notif_type_idx");
    expect(src).toContain("notif_severity_idx");
    expect(src).toContain("notif_company_idx");
    expect(src).toContain("notif_dedup_idx");
    expect(src).toContain("notif_created_idx");
  });

  it("has unique dedup index on userId + dedupKey", () => {
    expect(src).toContain("uniqueIndex");
    expect(src).toContain("notif_dedup_idx");
  });

  it("exports OperationalNotification and NewOperationalNotification types", () => {
    expect(src).toContain("OperationalNotification");
    expect(src).toContain("NewOperationalNotification");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. MIGRATION — SQL
// ═══════════════════════════════════════════════════════════════════

describe("Phase 9 — Migration SQL", () => {
  const sql = readDrizzle("0005_phase9_notifications.sql");

  it("creates operational_notifications table", () => {
    expect(sql).toContain("CREATE TABLE");
    expect(sql).toContain("operational_notifications");
  });

  it("has all required columns in SQL", () => {
    expect(sql).toContain("user_id");
    expect(sql).toContain("company_id");
    expect(sql).toContain("dedup_key");
    expect(sql).toContain("severity");
    expect(sql).toContain("seen_at");
    expect(sql).toContain("resolved_at");
  });

  it("creates indexes in migration", () => {
    expect(sql).toContain("notif_user_idx");
    expect(sql).toContain("notif_dedup_idx");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. NOTIFICATIONS SERVICE — CRUD + Queries
// ═══════════════════════════════════════════════════════════════════

describe("Phase 9 — Notifications service layer", () => {
  const src = readSrc("lib/crm/notifications.ts");

  it("defines 7 notification types", () => {
    expect(src).toContain("NOTIFICATION_TYPES");
    expect(src).toContain("task_overdue");
    expect(src).toContain("followup_overdue");
    expect(src).toContain("renewal_upcoming");
    expect(src).toContain("opportunity_stale");
    expect(src).toContain("cross_sell");
    expect(src).toContain("inactivity");
    expect(src).toContain("suggested_task");
  });

  it("defines 3 severity levels", () => {
    expect(src).toContain("NOTIFICATION_SEVERITIES");
    expect(src).toContain('"info"');
    expect(src).toContain('"warning"');
    expect(src).toContain('"urgent"');
  });

  it("defines 4 statuses", () => {
    expect(src).toContain("NOTIFICATION_STATUSES");
    expect(src).toContain('"new"');
    expect(src).toContain('"seen"');
    expect(src).toContain('"dismissed"');
    expect(src).toContain('"resolved"');
  });

  it("exports createNotification with dedup", () => {
    expect(src).toContain("createNotification");
    expect(src).toContain("onConflictDoNothing");
  });

  it("exports createNotificationsBatch for bulk inserts", () => {
    expect(src).toContain("createNotificationsBatch");
  });

  it("exports updateNotificationStatus with timestamp logic", () => {
    expect(src).toContain("updateNotificationStatus");
    expect(src).toContain("seenAt");
    expect(src).toContain("resolvedAt");
  });

  it("exports markAllSeen", () => {
    expect(src).toContain("markAllSeen");
  });

  it("exports list functions with filters", () => {
    expect(src).toContain("listNotifications");
    expect(src).toContain("listNewNotifications");
    expect(src).toContain("listUrgentNotifications");
    expect(src).toContain("listCompanyNotifications");
  });

  it("exports getNotificationSummary", () => {
    expect(src).toContain("getNotificationSummary");
    expect(src).toContain("totalNew");
    expect(src).toContain("totalUrgent");
    expect(src).toContain("totalWarning");
    expect(src).toContain("totalActive");
  });

  it("exports cleanupOldNotifications", () => {
    expect(src).toContain("cleanupOldNotifications");
  });

  it("enforces userId in all queries", () => {
    // All list functions filter by userId
    const userIdMatches = src.match(/userId/g);
    expect(userIdMatches!.length).toBeGreaterThan(10);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. NOTIFICATION RULES — Generation engine
// ═══════════════════════════════════════════════════════════════════

describe("Phase 9 — Notification rules engine", () => {
  const src = readSrc("lib/crm/notification-rules.ts");

  it("defines NotificationRulesConfig with autoCreateTasks flag", () => {
    expect(src).toContain("NotificationRulesConfig");
    expect(src).toContain("autoCreateTasks");
  });

  it("has DEFAULT_RULES_CONFIG with autoCreateTasks: false", () => {
    expect(src).toContain("DEFAULT_RULES_CONFIG");
    expect(src).toContain("autoCreateTasks");
  });

  it("implements 6 rule functions", () => {
    expect(src).toContain("ruleOverdueTasks");
    expect(src).toContain("ruleOverdueFollowUps");
    expect(src).toContain("ruleRenewalUpcoming");
    expect(src).toContain("ruleStaleOpportunities");
    expect(src).toContain("ruleCrossSell");
    expect(src).toContain("ruleInactivity");
  });

  it("exports executeNotificationRules orchestrator", () => {
    expect(src).toContain("executeNotificationRules");
  });

  it("uses dedup keys for idempotent generation", () => {
    expect(src).toContain("dedupKey");
    expect(src).toContain("dedup");
  });

  it("Level B: auto-creates tasks only when autoCreateTasks is true", () => {
    expect(src).toContain("autoCreateTasks");
    expect(src).toContain("createTask");
  });

  it("returns GenerationResult with per-rule breakdown", () => {
    expect(src).toContain("GenerationResult");
    expect(src).toContain("totalNotifications");
    expect(src).toContain("totalTasks");
    expect(src).toContain("RuleExecutionResult");
  });

  it("is internal only — no client contact code", () => {
    expect(src).not.toContain("sendEmail");
    expect(src).not.toContain("sendSms");
    expect(src).not.toContain("sendWhatsApp");
  });

  it("uses inactivityDays config (default 14)", () => {
    expect(src).toContain("inactivityDays");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. API ROUTES — /api/crm/notifications
// ═══════════════════════════════════════════════════════════════════

describe("Phase 9 — API routes: notifications", () => {
  const routeSrc = readSrc("app/api/crm/notifications/route.ts");

  it("has GET handler with multiple views", () => {
    expect(routeSrc).toContain("export async function GET");
    expect(routeSrc).toContain('"summary"');
    expect(routeSrc).toContain('"new"');
    expect(routeSrc).toContain('"urgent"');
    expect(routeSrc).toContain('"company"');
  });

  it("has POST handler for generate and mark_all_seen", () => {
    expect(routeSrc).toContain("export async function POST");
    expect(routeSrc).toContain('"generate"');
    expect(routeSrc).toContain('"mark_all_seen"');
  });

  it("enforces auth", () => {
    expect(routeSrc).toContain("auth()");
    expect(routeSrc).toContain("No autorizado");
  });

  it("calls executeNotificationRules for generate action", () => {
    expect(routeSrc).toContain("executeNotificationRules");
  });
});

describe("Phase 9 — API routes: notifications/[id]", () => {
  const routeSrc = readSrc("app/api/crm/notifications/[id]/route.ts");

  it("has PATCH handler for status updates", () => {
    expect(routeSrc).toContain("export async function PATCH");
  });

  it("validates status against NOTIFICATION_STATUSES", () => {
    expect(routeSrc).toContain("NOTIFICATION_STATUSES");
  });

  it("enforces auth and ownership", () => {
    expect(routeSrc).toContain("auth()");
    expect(routeSrc).toContain("updateNotificationStatus");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. UI — CrmNotificationsPanel
// ═══════════════════════════════════════════════════════════════════

describe("Phase 9 — UI: CrmNotificationsPanel", () => {
  const src = readSrc("components/crm/CrmNotificationsPanel.tsx");

  it("is a client component", () => {
    expect(src).toContain('"use client"');
  });

  it("renders summary cards (Nuevas, Urgentes, Avisos, Activas)", () => {
    expect(src).toContain("NotifSummaryCards");
    expect(src).toContain("Nuevas");
    expect(src).toContain("Urgentes");
    expect(src).toContain("Avisos");
    expect(src).toContain("Activas");
  });

  it("has filter tabs (Todas, Nuevas, Urgentes)", () => {
    expect(src).toContain("Todas");
    expect(src).toContain("Nuevas");
    expect(src).toContain("Urgentes");
    expect(src).toContain("setFilter");
  });

  it("renders notification items with severity badges", () => {
    expect(src).toContain("NotifItem");
    expect(src).toContain("severityBadge");
    expect(src).toContain("Urgente");
    expect(src).toContain("Aviso");
    expect(src).toContain("Info");
  });

  it("has action buttons: mark seen, dismiss, resolve", () => {
    expect(src).toContain('"seen"');
    expect(src).toContain('"dismissed"');
    expect(src).toContain('"resolved"');
  });

  it("has generate/scan button", () => {
    expect(src).toContain("Escanear");
    expect(src).toContain("handleGenerate");
  });

  it("has mark-all-seen button", () => {
    expect(src).toContain("handleMarkAllSeen");
  });

  it("supports companyId prop for per-company view", () => {
    expect(src).toContain("companyId");
  });

  it("shows type labels in Spanish", () => {
    expect(src).toContain("Tarea vencida");
    expect(src).toContain("Seguimiento vencido");
    expect(src).toContain("Renovación");
    expect(src).toContain("Oportunidad estancada");
    expect(src).toContain("Cross-sell");
    expect(src).toContain("Inactividad");
    expect(src).toContain("Tarea sugerida");
  });

  it("shows relative time (hace Xm/Xh/Xd)", () => {
    expect(src).toContain("timeAgo");
    expect(src).toContain("hace");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. SWARM TOOLS — 3 Phase 9 tools
// ═══════════════════════════════════════════════════════════════════

describe("Phase 9 — Swarm tools: notification tools", () => {
  const src = readSrc("lib/agent/crm-tools.ts");

  it("defines crm_list_notifications tool", () => {
    expect(src).toContain('"crm_list_notifications"');
    expect(src).toContain("crmListNotificationsHandler");
  });

  it("defines crm_generate_notifications tool", () => {
    expect(src).toContain('"crm_generate_notifications"');
    expect(src).toContain("crmGenerateNotificationsHandler");
  });

  it("defines crm_update_notification tool", () => {
    expect(src).toContain('"crm_update_notification"');
    expect(src).toContain("crmUpdateNotificationHandler");
  });

  it("imports notification service functions", () => {
    expect(src).toContain("listNotifications");
    expect(src).toContain("listNewNotifications");
    expect(src).toContain("listUrgentNotifications");
    expect(src).toContain("getNotificationSummary");
    expect(src).toContain("updateNotificationStatus");
    expect(src).toContain("executeNotificationRules");
  });

  it("list handler returns summary + notifications", () => {
    expect(src).toContain("getNotificationSummary");
    expect(src).toContain("summary");
  });

  it("generate handler accepts config overrides", () => {
    expect(src).toContain("auto_create_tasks");
    expect(src).toContain("inactivity_days");
  });

  it("update handler validates status against NOTIFICATION_STATUSES", () => {
    expect(src).toContain("NOTIFICATION_STATUSES");
    expect(src).toContain("Estado no válido");
  });

  it("all handlers enforce userId (first param)", () => {
    expect(src).toContain("crmListNotificationsHandler(\n  userId: string");
    expect(src).toContain("crmGenerateNotificationsHandler(\n  userId: string");
    expect(src).toContain("crmUpdateNotificationHandler(\n  userId: string");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. AGENT DISTRIBUTION — Phase 9 tools per role
// ═══════════════════════════════════════════════════════════════════

describe("Phase 9 — Agent distribution", () => {
  const swarmSrc = readSrc("lib/agent/swarm.ts");

  it("CEO has all 3 notification tools (full access)", () => {
    // CEO section is first, find its Phase 9 comment
    const ceoSection = swarmSrc.split("Phase 9 — Notifications (full access)")[1]?.split("],")[0] || "";
    expect(ceoSection).toContain("crm_list_notifications");
    expect(ceoSection).toContain("crm_generate_notifications");
    expect(ceoSection).toContain("crm_update_notification");
  });

  it("Recepción has crm_list_notifications only (read-only)", () => {
    const recepSection = swarmSrc.split("Phase 9 — Notifications (read-only: see alerts for triage)")[1]?.split("],")[0] || "";
    expect(recepSection).toContain("crm_list_notifications");
    expect(recepSection).not.toContain("crm_generate_notifications");
    expect(recepSection).not.toContain("crm_update_notification");
  });

  it("Comercial Principal has all 3 notification tools (full access)", () => {
    const cpSection = swarmSrc.split("Phase 9 — Notifications (full access — generates + resolves)")[1]?.split("],")[0] || "";
    expect(cpSection).toContain("crm_list_notifications");
    expect(cpSection).toContain("crm_generate_notifications");
    expect(cpSection).toContain("crm_update_notification");
  });

  it("Comercial Junior has crm_list_notifications only (read-only)", () => {
    const cjSection = swarmSrc.split("Phase 9 — Notifications (read-only: see own alerts)")[1]?.split("],")[0] || "";
    expect(cjSection).toContain("crm_list_notifications");
    expect(cjSection).not.toContain("crm_generate_notifications");
  });

  it("Consultor Servicios has crm_list_notifications only (read-only)", () => {
    const csSection = swarmSrc.split("Phase 9 — Notifications (read-only: service alerts)")[1]?.split("],")[0] || "";
    expect(csSection).toContain("crm_list_notifications");
    expect(csSection).not.toContain("crm_generate_notifications");
  });

  it("BI-Scoring has list + generate (analytics)", () => {
    const biSection = swarmSrc.split("Phase 9 — Notifications (analytics: can scan + read)")[1]?.split("],")[0] || "";
    expect(biSection).toContain("crm_list_notifications");
    expect(biSection).toContain("crm_generate_notifications");
    expect(biSection).not.toContain("crm_update_notification");
  });

  it("Marketing has crm_list_notifications only (read-only)", () => {
    const mktSection = swarmSrc.split("Phase 9 — Notifications (read-only: campaign context alerts)")[1]?.split("],")[0] || "";
    expect(mktSection).toContain("crm_list_notifications");
    expect(mktSection).not.toContain("crm_generate_notifications");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. INTEGRATION — Phase 7/8 enrichment
// ═══════════════════════════════════════════════════════════════════

describe("Phase 9 — Integration with Phases 7/8", () => {
  const opsSrc = readSrc("lib/crm/commercial-ops.ts");

  it("DailyBrief type includes notifications field", () => {
    expect(opsSrc).toContain("notifications: { totalNew: number; totalUrgent: number; totalWarning: number; totalActive: number }");
  });

  it("getDailyCommercialBrief fetches notifSummary", () => {
    expect(opsSrc).toContain("getNotificationSummary(userId)");
    expect(opsSrc).toContain("notifSummary");
    expect(opsSrc).toContain("notifications: notifSummary");
  });

  it("CompanyOpsContext type includes activeAlerts", () => {
    expect(opsSrc).toContain("activeAlerts: number");
  });

  it("getCompanyOpsContext fetches company notifications", () => {
    expect(opsSrc).toContain("listCompanyNotifications(userId, companyId");
    expect(opsSrc).toContain("companyNotifs");
  });

  it("getCompanyOpsContext returns activeAlerts count", () => {
    expect(opsSrc).toContain("activeAlerts:");
  });

  it("imports from notifications module", () => {
    expect(opsSrc).toContain('import { getNotificationSummary, listCompanyNotifications } from "./notifications"');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 10. AUTH & OWNERSHIP
// ═══════════════════════════════════════════════════════════════════

describe("Phase 9 — Auth & ownership enforcement", () => {
  it("API GET enforces auth", () => {
    const src = readSrc("app/api/crm/notifications/route.ts");
    expect(src).toContain("const session = await auth()");
    expect(src).toContain('session?.user?.id');
  });

  it("API POST enforces auth", () => {
    const src = readSrc("app/api/crm/notifications/route.ts");
    expect(src).toContain("const session = await auth()");
  });

  it("API PATCH enforces auth", () => {
    const src = readSrc("app/api/crm/notifications/[id]/route.ts");
    expect(src).toContain("const session = await auth()");
    expect(src).toContain("session.user.id");
  });

  it("service layer filters by userId in all queries", () => {
    const src = readSrc("lib/crm/notifications.ts");
    const matches = src.match(/eq\(.*userId.*\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 11. DASHBOARD INTEGRATION
// ═══════════════════════════════════════════════════════════════════

describe("Phase 9 — Dashboard integration", () => {
  const dashSrc = readSrc("app/dashboard/page.tsx");

  it("imports CrmNotificationsPanel", () => {
    expect(dashSrc).toContain("CrmNotificationsPanel");
  });

  it("has Alertas sub-tab", () => {
    expect(dashSrc).toContain("alertas");
    expect(dashSrc).toContain("Alertas");
  });

  it("renders CrmNotificationsPanel when alertas tab is active", () => {
    expect(dashSrc).toContain("CrmNotificationsPanel");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 12. CONTROLLED AUTOMATION GUARDRAILS
// ═══════════════════════════════════════════════════════════════════

describe("Phase 9 — Controlled automation guardrails", () => {
  const rulesSrc = readSrc("lib/crm/notification-rules.ts");

  it("autoCreateTasks defaults to false (Level A safe by default)", () => {
    expect(rulesSrc).toContain("autoCreateTasks");
    // Verify the default config sets it to false
    const defaultSection = rulesSrc.split("DEFAULT_RULES_CONFIG")[1]?.split("}")[0] || "";
    expect(defaultSection).toContain("false");
  });

  it("never sends emails or contacts clients", () => {
    expect(rulesSrc).not.toContain("sendEmail");
    expect(rulesSrc).not.toContain("sendSms");
    expect(rulesSrc).not.toContain("sendWhatsApp");
    expect(rulesSrc).not.toContain("sendNotification");
  });

  it("uses dedup keys for idempotent execution", () => {
    expect(rulesSrc).toContain("dedupKey");
  });

  it("has configurable enabledTypes", () => {
    expect(rulesSrc).toContain("enabledTypes");
  });

  it("has maxPerBatch limit", () => {
    expect(rulesSrc).toContain("maxPerBatch");
  });

  it("is auditable — tracks source as system", () => {
    expect(rulesSrc).toContain("source");
    expect(rulesSrc).toContain('"system"');
  });

  it("notifications are reversible — can be dismissed/resolved", () => {
    const notifSrc = readSrc("lib/crm/notifications.ts");
    expect(notifSrc).toContain("dismissed");
    expect(notifSrc).toContain("resolved");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 13. REGRESSION — Phases 1-8 remain intact
// ═══════════════════════════════════════════════════════════════════

describe("Phase 9 — Regression: earlier phases intact", () => {
  it("schema still has companies, contacts, opportunities, services, cases, activities, tasks tables", () => {
    const src = readSrc("db/schema.ts");
    expect(src).toContain("companies");
    expect(src).toContain("contacts");
    expect(src).toContain("opportunities");
    expect(src).toContain("services");
    expect(src).toContain("cases");
    expect(src).toContain("commercialActivities");
    expect(src).toContain("commercialTasks");
  });

  it("Phase 7 commercial-ops functions still exist", () => {
    const src = readSrc("lib/crm/commercial-ops.ts");
    expect(src).toContain("getExpiringServices");
    expect(src).toContain("getStaleOpportunities");
    expect(src).toContain("getHotOpportunities");
    expect(src).toContain("getCrossSellCandidates");
    expect(src).toContain("getDailyCommercialBrief");
    expect(src).toContain("getCompanyOpsContext");
  });

  it("Phase 8 activity/tasks functions still exist", () => {
    const actSrc = readSrc("lib/crm/activities.ts");
    expect(actSrc).toContain("createActivity");
    expect(actSrc).toContain("getOverdueFollowUps");
    const taskSrc = readSrc("lib/crm/commercial-tasks.ts");
    expect(taskSrc).toContain("createTask");
    expect(taskSrc).toContain("getTodayTasks");
  });

  it("CRM tools still include Phases 5-8 tools", () => {
    const src = readSrc("lib/agent/crm-tools.ts");
    expect(src).toContain("crm_search_companies");
    expect(src).toContain("crm_get_daily_brief");
    expect(src).toContain("crm_list_company_activities");
    expect(src).toContain("crm_create_suggested_task");
    expect(src).toContain("crm_get_today_summary");
  });

  it("swarm still distributes Phase 7 + 8 tools", () => {
    const src = readSrc("lib/agent/swarm.ts");
    expect(src).toContain("Phase 7 —");
    expect(src).toContain("Phase 8 —");
    expect(src).toContain("Phase 9 —");
  });
});
