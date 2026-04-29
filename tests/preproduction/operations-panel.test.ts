/**
 * PREPRODUCTION TESTS — Operations Panel
 *
 * Validates:
 *   OP1: API route files exist with correct structure
 *   OP2: Components exist with correct exports
 *   OP3: Dashboard integration
 *   OP4: Auth protection on all routes
 *   OP5: Case list API structure
 *   OP6: Case detail API structure
 *   OP7: Activity API structure
 *   OP8: Health API structure
 *   OP9: Empty state handling
 *   OP10: Timeline event types coverage
 *   OP11: Ownership visibility
 *   OP12: Blocked/violation events in views
 *   OP13: Sidebar + mobile nav integration
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ─── OP1: API route files ───────────────────────────────────────────────

describe("OP1: API route files exist", () => {
  const routes = [
    "src/app/api/operations/cases/route.ts",
    "src/app/api/operations/cases/[id]/route.ts",
    "src/app/api/operations/activity/route.ts",
    "src/app/api/operations/health/route.ts",
  ];

  for (const route of routes) {
    it(`${route} exists`, () => {
      expect(fileExists(route)).toBe(true);
    });
  }

  it("all routes export GET handler", () => {
    for (const route of routes) {
      const content = readFile(route);
      expect(content).toMatch(/export async function GET/);
    }
  });

  it("all routes use force-dynamic", () => {
    for (const route of routes) {
      const content = readFile(route);
      expect(content).toContain("force-dynamic");
    }
  });
});

// ─── OP2: Component files ───────────────────────────────────────────────

describe("OP2: Component files exist", () => {
  const components = [
    "src/components/operations/OperationsPanel.tsx",
    "src/components/operations/OperationsHealthPanel.tsx",
    "src/components/operations/OperationsActivityPanel.tsx",
    "src/components/operations/OperationsCaseListPanel.tsx",
    "src/components/operations/OperationsCaseDetailPanel.tsx",
  ];

  for (const comp of components) {
    it(`${comp.split("/").pop()} exists`, () => {
      expect(fileExists(comp)).toBe(true);
    });
  }

  it("OperationsPanel has default export", () => {
    const content = readFile("src/components/operations/OperationsPanel.tsx");
    expect(content).toMatch(/export default function OperationsPanel/);
  });

  it("OperationsPanel imports all sub-panels", () => {
    const content = readFile("src/components/operations/OperationsPanel.tsx");
    expect(content).toContain("OperationsHealthPanel");
    expect(content).toContain("OperationsActivityPanel");
    expect(content).toContain("OperationsCaseListPanel");
    expect(content).toContain("OperationsCaseDetailPanel");
  });
});

// ─── OP3: Dashboard integration ─────────────────────────────────────────

describe("OP3: Dashboard integration", () => {
  const dashboard = readFile("src/app/dashboard/page.tsx");

  it("imports OperationsPanel", () => {
    expect(dashboard).toMatch(/import OperationsPanel from.*operations\/OperationsPanel/);
  });

  it("renders OperationsPanel inside ia tab (extraído de Ajustes 2026-04-29)", () => {
    // Phase 12: operaciones absorbed into config as sub-tab
    // 2026-04-29: extraído al nuevo tab IA principal del sidebar.
    const iaIdx = dashboard.indexOf('activeTab === "ia"');
    expect(iaIdx).toBeGreaterThan(-1);
    const section = dashboard.slice(iaIdx, iaIdx + 2000);
    expect(section).toContain('"operaciones"');
    expect(section).toContain("<OperationsPanel");
  });

  it("config tab exists in TAB_TITLES as Ajustes", () => {
    expect(dashboard).toContain('config: "Ajustes"');
  });
});

// ─── OP4: Auth protection ───────────────────────────────────────────────

describe("OP4: Auth protection on routes", () => {
  const routes = [
    "src/app/api/operations/cases/route.ts",
    "src/app/api/operations/cases/[id]/route.ts",
    "src/app/api/operations/activity/route.ts",
    "src/app/api/operations/health/route.ts",
  ];

  for (const route of routes) {
    it(`${route.split("/").pop()} checks auth`, () => {
      const content = readFile(route);
      expect(content).toContain("auth()");
      expect(content).toContain("session?.user?.id");
      expect(content).toContain("No autorizado");
      expect(content).toContain("401");
    });
  }
});

// ─── OP5: Case list API ────────────────────────────────────────────────

describe("OP5: Case list API structure", () => {
  const content = readFile("src/app/api/operations/cases/route.ts");

  it("supports status filter", () => {
    expect(content).toContain("statusFilter");
    expect(content).toContain('params.get("status")');
  });

  it("supports owner filter", () => {
    expect(content).toContain("ownerFilter");
    expect(content).toContain('params.get("owner")');
  });

  it("supports search", () => {
    expect(content).toContain('params.get("search")');
    expect(content).toContain("like");
  });

  it("supports pagination", () => {
    expect(content).toContain("limit");
    expect(content).toContain("offset");
    expect(content).toContain("hasMore");
  });

  it("enriches with alert counts from audit_events", () => {
    expect(content).toContain("alertsByCaseId");
    expect(content).toContain("blocks");
    expect(content).toContain("violations");
    expect(content).toContain("delegations");
  });

  it("filters by userId for security", () => {
    expect(content).toContain("session.user.id");
    expect(content).toContain("schema.cases.userId");
  });
});

// ─── OP6: Case detail API ───────────────────────────────────────────────

describe("OP6: Case detail API structure", () => {
  const content = readFile("src/app/api/operations/cases/[id]/route.ts");

  it("returns 404 for missing case", () => {
    expect(content).toContain("Caso no encontrado");
    expect(content).toContain("404");
  });

  it("returns timeline from audit_events", () => {
    expect(content).toContain("timeline");
    expect(content).toContain("schema.auditEvents");
  });

  it("categorizes blocked events", () => {
    expect(content).toContain("blockedEvents");
    expect(content).toContain("tool_blocked");
    expect(content).toContain("external_message_blocked");
  });

  it("categorizes governance violations", () => {
    expect(content).toContain("violations");
    expect(content).toContain("governance_rule_triggered");
    expect(content).toContain("ownership_conflict_detected");
    expect(content).toContain("visibility_violation_detected");
  });

  it("extracts delegations", () => {
    expect(content).toContain("delegations");
    expect(content).toContain("agent_delegated");
  });

  it("extracts owner transitions", () => {
    expect(content).toContain("ownerTransitions");
    expect(content).toContain("case_owner_changed");
  });

  it("extracts external communications", () => {
    expect(content).toContain("externalComms");
    expect(content).toContain("external_message_sent");
  });

  it("identifies agents involved", () => {
    expect(content).toContain("agentsInvolved");
  });

  it("returns stats summary", () => {
    expect(content).toContain("totalEvents");
    expect(content).toContain("totalBlocks");
    expect(content).toContain("totalViolations");
  });
});

// ─── OP7: Activity API ─────────────────────────────────────────────────

describe("OP7: Activity API structure", () => {
  const content = readFile("src/app/api/operations/activity/route.ts");

  it("supports type filter", () => {
    expect(content).toContain('"all"');
    expect(content).toContain('"blocked"');
    expect(content).toContain('"violations"');
    expect(content).toContain('"delegations"');
    expect(content).toContain('"external"');
  });

  it("supports window parameter", () => {
    expect(content).toContain('params.get("window")');
    expect(content).toContain("windowSec");
  });

  it("filters by userId", () => {
    expect(content).toContain("session.user.id");
  });

  it("orders by createdAt desc", () => {
    expect(content).toContain("desc(schema.auditEvents.createdAt)");
  });
});

// ─── OP8: Health API ────────────────────────────────────────────────────

describe("OP8: Health API structure", () => {
  const content = readFile("src/app/api/operations/health/route.ts");

  it("computes case counts by status", () => {
    expect(content).toContain("casesByStatus");
    expect(content).toContain("schema.cases.status");
  });

  it("detects stale cases", () => {
    expect(content).toContain("staleCases");
    expect(content).toContain("staleThreshold");
  });

  it("counts recent blocks", () => {
    expect(content).toContain("recentBlocks");
    expect(content).toContain("tool_blocked");
  });

  it("counts recent violations", () => {
    expect(content).toContain("recentViolations");
    expect(content).toContain("governance_rule_triggered");
  });

  it("identifies active agents", () => {
    expect(content).toContain("activeAgents");
    expect(content).toContain("activeLastHour");
  });

  it("identifies blocked agents", () => {
    expect(content).toContain("blockedAgents");
    expect(content).toContain("blockedLast24h");
  });

  it("identifies cases with blocks/violations", () => {
    expect(content).toContain("casesWithBlocks");
    expect(content).toContain("casesWithViolations");
  });

  it("returns generatedAt timestamp", () => {
    expect(content).toContain("generatedAt");
  });
});

// ─── OP9: Empty state handling ──────────────────────────────────────────

describe("OP9: Empty state handling in components", () => {
  it("CaseListPanel shows empty state", () => {
    const content = readFile("src/components/operations/OperationsCaseListPanel.tsx");
    expect(content).toContain("Sin casos encontrados");
  });

  it("ActivityPanel shows empty state", () => {
    const content = readFile("src/components/operations/OperationsActivityPanel.tsx");
    expect(content).toContain("Sin actividad en la ventana seleccionada");
  });

  it("HealthPanel shows loading state", () => {
    const content = readFile("src/components/operations/OperationsHealthPanel.tsx");
    expect(content).toContain("Cargando salud operativa");
  });

  it("HealthPanel shows error state with retry", () => {
    const content = readFile("src/components/operations/OperationsHealthPanel.tsx");
    expect(content).toContain("Reintentar");
  });

  it("CaseDetailPanel shows error state with back button", () => {
    const content = readFile("src/components/operations/OperationsCaseDetailPanel.tsx");
    expect(content).toContain("Volver");
  });
});

// ─── OP10: Timeline event types ────────────────────────────────────────

describe("OP10: Timeline event types coverage", () => {
  const content = readFile("src/components/operations/OperationsCaseDetailPanel.tsx");

  const requiredEventTypes = [
    "case_created",
    "case_owner_changed",
    "case_escalated",
    "tool_called",
    "tool_blocked",
    "agent_delegated",
    "external_message_blocked",
    "external_message_sent",
    "governance_rule_triggered",
    "ownership_conflict_detected",
    "visibility_violation_detected",
  ];

  for (const eventType of requiredEventTypes) {
    it(`renders ${eventType}`, () => {
      expect(content).toContain(eventType);
    });
  }

  it("has timeline filter categories", () => {
    expect(content).toContain('"block"');
    expect(content).toContain('"governance"');
    expect(content).toContain('"delegation"');
    expect(content).toContain('"external"');
    expect(content).toContain('"ownership"');
  });
});

// ─── OP11: Ownership visibility ─────────────────────────────────────────

describe("OP11: Ownership visibility", () => {
  it("CaseListPanel shows owner per case", () => {
    const content = readFile("src/components/operations/OperationsCaseListPanel.tsx");
    expect(content).toContain("visibleOwnerId");
    expect(content).toContain("Sin asignar");
    expect(content).toContain("AGENT_NAMES");
  });

  it("CaseDetailPanel shows owner card", () => {
    const content = readFile("src/components/operations/OperationsCaseDetailPanel.tsx");
    expect(content).toContain("Owner visible");
    expect(content).toContain("ownerTransitions");
    expect(content).toContain("cambio(s) de owner");
  });

  it("CaseDetailPanel marks current owner in agents list", () => {
    const content = readFile("src/components/operations/OperationsCaseDetailPanel.tsx");
    expect(content).toContain("(owner)");
  });

  it("Case detail API returns owner transitions", () => {
    const content = readFile("src/app/api/operations/cases/[id]/route.ts");
    expect(content).toContain("case_owner_changed");
    expect(content).toContain("ownerTransitions");
  });
});

// ─── OP12: Blocked/violation events visibility ─────────────────────────

describe("OP12: Blocked/violation events visibility", () => {
  it("CaseListPanel shows alert badges per case", () => {
    const content = readFile("src/components/operations/OperationsCaseListPanel.tsx");
    expect(content).toContain("alerts");
    expect(content).toContain("blocks");
    expect(content).toContain("violations");
  });

  it("CaseDetailPanel shows block/violation stats", () => {
    const content = readFile("src/components/operations/OperationsCaseDetailPanel.tsx");
    expect(content).toContain("totalBlocks");
    expect(content).toContain("totalViolations");
    expect(content).toContain("bloqueo(s)");
    expect(content).toContain("violación(es)");
  });

  it("ActivityPanel has blocked filter", () => {
    const content = readFile("src/components/operations/OperationsActivityPanel.tsx");
    expect(content).toContain('"blocked"');
    expect(content).toContain("Bloqueos");
  });

  it("ActivityPanel has violations filter", () => {
    const content = readFile("src/components/operations/OperationsActivityPanel.tsx");
    expect(content).toContain('"violations"');
    expect(content).toContain("Violaciones");
  });

  it("HealthPanel shows blocks and violations KPIs", () => {
    const content = readFile("src/components/operations/OperationsHealthPanel.tsx");
    expect(content).toContain("Bloqueos (1h)");
    expect(content).toContain("Violaciones (1h)");
  });

  it("HealthPanel shows blocked agents", () => {
    const content = readFile("src/components/operations/OperationsHealthPanel.tsx");
    expect(content).toContain("Agentes bloqueados");
    expect(content).toContain("blockedLast24h");
  });
});

// ─── OP13: Sidebar + mobile nav ────────────────────────────────────────

describe("OP13: Sidebar + mobile nav integration", () => {
  it("Sidebar has config tab", () => {
    const content = readFile("src/components/Sidebar.tsx");
    expect(content).toMatch(/\| "config"/);
    expect(content).toContain('"Ajustes"');
  });

  it("Sidebar has ia tab (operaciones es sub-tab de IA tras 2026-04-29)", () => {
    const content = readFile("src/components/Sidebar.tsx");
    expect(content).toMatch(/\| "ia"/);
    expect(content).toContain('id: "ia"');
  });

  it("Sidebar has config nav item with Ajustes label", () => {
    const content = readFile("src/components/Sidebar.tsx");
    expect(content).toContain('id: "config"');
    expect(content).toContain('label: "Ajustes"');
  });

  it("MobileBottomNav has ia entry (operaciones es sub-tab de IA)", () => {
    const content = readFile("src/components/MobileBottomNav.tsx");
    expect(content).toContain('id: "ia"');
  });
});
