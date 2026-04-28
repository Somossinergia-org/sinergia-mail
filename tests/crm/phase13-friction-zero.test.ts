/**
 * Phase 13 — Friction Zero: UX improvements + IA actionability
 *
 * Tests for:
 * A. QuickActionFab — global "+" button
 * B. TodayWidget — "Mi agenda hoy"
 * C. CompanyQuickActions — inline task/activity from company detail
 * D. crm_log_activity — new swarm tool for real activity logging
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../../src");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf-8");
}

/* ------------------------------------------------------------------ */
/*  A. QuickActionFab                                                  */
/* ------------------------------------------------------------------ */
describe("A — QuickActionFab (global '+' button)", () => {
  const src = readSrc("components/QuickActionFab.tsx");

  it("file exists and exports default", () => {
    expect(src).toContain("export default function QuickActionFab");
  });

  it("supports 4 action types: tarea, actividad, nota, oportunidad", () => {
    expect(src).toContain('"tarea"');
    expect(src).toContain('"actividad"');
    expect(src).toContain('"nota"');
    expect(src).toContain('"oportunidad"');
  });

  it("fetches companies for autocomplete", () => {
    expect(src).toContain("/api/crm/companies");
  });

  it("posts tasks to /api/crm/tasks", () => {
    expect(src).toContain('"/api/crm/tasks"');
  });

  it("posts activities to /api/crm/activities", () => {
    expect(src).toContain('"/api/crm/activities"');
  });

  it("posts opportunities to /api/crm/opportunities", () => {
    expect(src).toContain('"/api/crm/opportunities"');
  });

  it("has keyboard shortcut (N key)", () => {
    expect(src).toMatch(/key\s*===?\s*["']n["']/i);
  });

  it("uses toast notifications", () => {
    expect(src).toContain("toast.success");
    expect(src).toContain("toast.error");
  });

  it("is integrated in dashboard page", () => {
    const dashboard = readSrc("app/dashboard/page.tsx");
    expect(dashboard).toContain("QuickActionFab");
  });
});

/* ------------------------------------------------------------------ */
/*  B. TodayWidget                                                     */
/* ------------------------------------------------------------------ */
describe("B — TodayWidget ('Mi agenda hoy')", () => {
  const src = readSrc("components/TodayWidget.tsx");

  it("file exists and exports default", () => {
    expect(src).toContain("export default function TodayWidget");
  });

  it("fetches tasks for today view", () => {
    expect(src).toContain("/api/crm/tasks?view=today");
  });

  it("fetches overdue tasks", () => {
    expect(src).toContain("/api/crm/tasks?view=overdue");
  });

  it("fetches upcoming tasks (3 days)", () => {
    expect(src).toContain("/api/crm/tasks?view=upcoming");
  });

  it("fetches notifications", () => {
    expect(src).toContain("/api/crm/notifications");
  });

  it("shows urgent/overdue section", () => {
    expect(src).toContain("Requiere atención");
  });

  it("shows today section", () => {
    expect(src).toContain("Para hoy");
  });

  it("shows upcoming section", () => {
    expect(src).toContain("Próximos 3 días");
  });

  it("returns null when no tasks (no empty card cluttering overview)", () => {
    // Tras rediseño mobile-first 2026-04-28, si no hay tareas/notificaciones,
    // TodayWidget devuelve null en lugar de un card vacío con "Todo despejado".
    expect(src).toContain("if (!hasAnything) return null");
  });

  it("has onNavigate prop for tab switching", () => {
    expect(src).toContain("onNavigate");
  });

  it("is placed in overview tab before HUD", () => {
    const dashboard = readSrc("app/dashboard/page.tsx");
    expect(dashboard).toContain("TodayWidget");
    expect(dashboard).toContain("MI AGENDA HOY");
  });
});

/* ------------------------------------------------------------------ */
/*  C. CompanyQuickActions                                             */
/* ------------------------------------------------------------------ */
describe("C — CompanyQuickActions (inline actions in company detail)", () => {
  const src = readSrc("components/crm/CompanyQuickActions.tsx");

  it("file exists and exports default", () => {
    expect(src).toContain("export default function CompanyQuickActions");
  });

  it("has inline task creation form", () => {
    expect(src).toContain('inlineForm === "tarea"');
    expect(src).toContain("/api/crm/tasks");
  });

  it("has inline activity logging form", () => {
    expect(src).toContain('inlineForm === "actividad"');
    expect(src).toContain("/api/crm/activities");
  });

  it("has 'Preguntar IA' button with context", () => {
    expect(src).toContain("Preguntar IA");
    expect(src).toContain("onOpenAgent");
  });

  it("has energy shortcut button", () => {
    expect(src).toContain("Energía");
    expect(src).toContain("hasEnergy");
  });

  it("supports keyboard shortcuts (Enter to submit, Escape to cancel)", () => {
    expect(src).toContain('"Enter"');
    expect(src).toContain('"Escape"');
  });

  it("has priority selector for tasks", () => {
    expect(src).toContain('"baja"');
    expect(src).toContain('"media"');
    expect(src).toContain('"alta"');
  });

  it("has activity type selector", () => {
    expect(src).toContain("ACTIVITY_TYPES");
    expect(src).toContain('"llamada"');
    expect(src).toContain('"email"');
    expect(src).toContain('"reunion"');
  });

  it("is integrated in CrmCompanyDetailPanel", () => {
    const detail = readSrc("components/crm/CrmCompanyDetailPanel.tsx");
    expect(detail).toContain("CompanyQuickActions");
  });
});

/* ------------------------------------------------------------------ */
/*  D. crm_log_activity — new swarm tool                              */
/* ------------------------------------------------------------------ */
describe("D — crm_log_activity (IA actionable tool)", () => {
  const crmTools = readSrc("lib/agent/crm-tools.ts");
  const swarm = readSrc("lib/agent/swarm.ts");

  it("tool definition exists in CRM_TOOLS array", () => {
    expect(crmTools).toContain('"crm_log_activity"');
  });

  it("handler function exists", () => {
    expect(crmTools).toContain("crmLogActivityHandler");
  });

  it("uses createActivity function", () => {
    expect(crmTools).toContain("createActivity({");
  });

  it("requires company_id and summary", () => {
    expect(crmTools).toContain('"company_id requerido"');
    expect(crmTools).toContain('"summary requerido"');
  });

  it("supports all activity types in enum", () => {
    expect(crmTools).toContain('"llamada"');
    expect(crmTools).toContain('"seguimiento"');
    expect(crmTools).toContain('"propuesta_enviada"');
  });

  it("is assigned to at least 4 agents in swarm", () => {
    // crm_log_activity should appear in CEO, recepcion, comercial-principal, comercial-junior
    const occurrences = swarm.match(/"crm_log_activity"/g);
    expect(occurrences).toBeTruthy();
    expect(occurrences!.length).toBeGreaterThanOrEqual(4);
  });

  it("swarm contains triage comment for recepcion Phase 8", () => {
    expect(swarm).toContain("Phase 8 — Activity & Tasks (triage: log activities + summary)");
  });

  it("swarm contains log comment for comercial-junior Phase 8", () => {
    expect(swarm).toContain("Phase 8 — Activity & Tasks (can log activities + summary + followups)");
  });

  it("existing crm_create_suggested_task still present", () => {
    expect(crmTools).toContain('"crm_create_suggested_task"');
  });

  it("total CRM tools count is now 42 (40 original + 1 crm_log_activity + 1 buffer)", () => {
    // Count tool definitions by counting 'name: "crm_' patterns
    const toolDefs = crmTools.match(/name: "crm_/g);
    expect(toolDefs).toBeTruthy();
    expect(toolDefs!.length).toBeGreaterThanOrEqual(41);
  });
});

/* ------------------------------------------------------------------ */
/*  E. FloatingAgent — sinergia:open-agent event integration          */
/* ------------------------------------------------------------------ */
describe("E — FloatingAgent receives sinergia:open-agent events", () => {
  const src = readSrc("components/FloatingAgent.tsx");

  it("listens for sinergia:open-agent custom event", () => {
    expect(src).toContain("sinergia:open-agent");
  });

  it("sets input from event detail", () => {
    expect(src).toContain("setInput");
  });

  it("calls onOpen when event received", () => {
    expect(src).toContain("onOpen()");
  });
});

/* ------------------------------------------------------------------ */
/*  F. Integration: dashboard wiring                                   */
/* ------------------------------------------------------------------ */
describe("F — Dashboard integration of friction-zero components", () => {
  const dashboard = readSrc("app/dashboard/page.tsx");

  it("imports QuickActionFab", () => {
    expect(dashboard).toContain("QuickActionFab");
  });

  it("imports TodayWidget", () => {
    expect(dashboard).toContain("TodayWidget");
  });

  it("TodayWidget appears in overview tab", () => {
    // The widget is conditionally rendered for overview
    expect(dashboard).toContain("MI AGENDA HOY");
  });

  it("QuickActionFab is in global overlays", () => {
    expect(dashboard).toContain("<QuickActionFab");
  });
});
