/**
 * Phase 12 — Product Consolidation Tests (updated for Phase 12b: 6 tabs)
 * Validates navigation merge, absorption, reorder — zero breakage of Phases 1-11
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const srcDir = resolve(import.meta.dirname!, "../../src");

function readSrc(relPath: string): string {
  return readFileSync(resolve(srcDir, relPath), "utf-8");
}

// ─── 1. Sidebar Tab Type — 6 tabs after 12b cleanup ─────────────────
describe("Phase 12 — Sidebar consolidation", () => {
  const sidebar = readSrc("components/Sidebar.tsx");

  test("Tab type has exactly 6 members", () => {
    const matches = sidebar.match(/\| "[\w-]+"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(6);
  });

  test("Tab type includes campanas (merged automatizacion+outreach)", () => {
    expect(sidebar).toContain('"campanas"');
  });

  test("Tab type does NOT include removed tabs", () => {
    expect(sidebar).not.toMatch(/\| "automatizacion"/);
    expect(sidebar).not.toMatch(/\| "outreach"/);
    expect(sidebar).not.toMatch(/\| "entrenar-ia"/);
    expect(sidebar).not.toMatch(/\| "operaciones"/);
  });

  test("Tab type preserves core tabs", () => {
    expect(sidebar).toContain('"overview"');
    expect(sidebar).toContain('"emails"');
    expect(sidebar).toContain('"crm"');
    expect(sidebar).toContain('"finanzas"');
    expect(sidebar).toContain('"config"');
  });

  test("Config renamed to Ajustes", () => {
    expect(sidebar).toContain('"Ajustes"');
  });
});

// ─── 2. Dashboard — merged tabs ──────────────────────────────────────
describe("Phase 12 — Dashboard tab merges", () => {
  const dashboard = readSrc("app/dashboard/page.tsx");

  test("TAB_TITLES has campanas entry", () => {
    expect(dashboard).toContain('campanas: "Campañas"');
  });

  test("TAB_TITLES does NOT have old entries", () => {
    expect(dashboard).not.toContain("automatizacion:");
    expect(dashboard).not.toContain("outreach:");
    expect(dashboard).not.toContain('"entrenar-ia":');
    expect(dashboard).not.toContain("operaciones:");
  });

  test("Campañas tab merges 6 sub-tabs (batch+templates+rules+sequences+omnicanal+campaigns)", () => {
    const campIdx = dashboard.indexOf('{activeTab === "campanas"');
    expect(campIdx).toBeGreaterThan(-1);
    const section = dashboard.slice(campIdx, campIdx + 800);
    expect(section).toContain('"batch"');
    expect(section).toContain('"templates"');
    expect(section).toContain('"rules"');
    expect(section).toContain('"sequences"');
    expect(section).toContain('"omnicanal"');
    expect(section).toContain('"campaigns"');
  });

  test("Campañas tab renders all 6 panels", () => {
    const campIdx = dashboard.indexOf('{activeTab === "campanas"');
    const section = dashboard.slice(campIdx, campIdx + 1200);
    expect(section).toContain("<AutomatizacionPanel");
    expect(section).toContain("<TemplatesPanel");
    expect(section).toContain("<RulesPanel");
    expect(section).toContain("<SequencesPanel");
    expect(section).toContain("<OutboundPanel");
    expect(section).toContain("<CampaignPanel");
  });
});

// ─── 3. Entrenar IA absorbed into Admin (was agente-ia, now config) ──
describe("Phase 12 — Entrenar IA absorbed into Admin", () => {
  const dashboard = readSrc("app/dashboard/page.tsx");

  test("Admin tab has entrenar sub-tab", () => {
    const cfgIdx = dashboard.indexOf('{activeTab === "config"');
    expect(cfgIdx).toBeGreaterThan(-1);
    const section = dashboard.slice(cfgIdx, cfgIdx + 2000);
    expect(section).toContain('"entrenar"');
  });

  test("Entrenar sub-tab renders FineTuningPanel", () => {
    const cfgIdx = dashboard.indexOf('{activeTab === "config"');
    const section = dashboard.slice(cfgIdx, cfgIdx + 4000);
    expect(section).toContain("<FineTuningPanel");
  });

  test("No standalone entrenar-ia tab in dashboard", () => {
    expect(dashboard).not.toMatch(/activeTab === ["']entrenar-ia["']/);
  });
});

// ─── 4. Operaciones absorbed into Config (Admin) ─────────────────────
describe("Phase 12 — Operaciones absorbed into Admin", () => {
  const dashboard = readSrc("app/dashboard/page.tsx");

  test("Config tab has operaciones sub-tab", () => {
    const cfgIdx = dashboard.indexOf('{activeTab === "config"');
    expect(cfgIdx).toBeGreaterThan(-1);
    const section = dashboard.slice(cfgIdx, cfgIdx + 2000);
    expect(section).toContain('"operaciones"');
  });

  test("Operaciones sub-tab renders OperationsPanel", () => {
    const cfgIdx = dashboard.indexOf('{activeTab === "config"');
    const section = dashboard.slice(cfgIdx, cfgIdx + 4000);
    expect(section).toContain("<OperationsPanel");
  });

  test("No standalone operaciones tab in dashboard", () => {
    expect(dashboard).not.toMatch(/activeTab === ["']operaciones["']/);
  });

  test("Config renamed to Ajustes in TAB_TITLES", () => {
    expect(dashboard).toContain('config: "Ajustes"');
  });
});

// ─── 5. CRM sub-tabs reordered by priority ───────────────────────────
describe("Phase 12 — CRM sub-tab reorder", () => {
  const dashboard = readSrc("app/dashboard/page.tsx");

  test("CRM sub-tabs grouped by sections: Día a día → Negocio → Análisis → Especializado", () => {
    const crmIdx = dashboard.indexOf('{activeTab === "crm"');
    expect(crmIdx).toBeGreaterThan(-1);
    const section = dashboard.slice(crmIdx, crmIdx + 3500);

    // Día a día (agenda, tareas, alertas) viene antes que Negocio (empresas, oportunidades)
    const agendaPos = section.indexOf('"agenda"');
    const empresasPos = section.indexOf('"empresas"');
    const direccionPos = section.indexOf('"direccion"');
    const energiaPos = section.indexOf('"energia"');

    expect(agendaPos).toBeGreaterThan(-1);
    expect(agendaPos).toBeLessThan(empresasPos);
    expect(empresasPos).toBeLessThan(direccionPos);
    expect(direccionPos).toBeLessThan(energiaPos);
  });
});

// ─── 6. MobileBottomNav consolidation ────────────────────────────────
describe("Phase 12 — MobileBottomNav", () => {
  const mobile = readSrc("components/MobileBottomNav.tsx");

  test("No removed tabs in mobile nav", () => {
    expect(mobile).not.toContain('"automatizacion"');
    expect(mobile).not.toContain('"outreach"');
    expect(mobile).not.toContain('"entrenar-ia"');
    expect(mobile).not.toContain('"operaciones"');
  });

  test("Has campanas in secondary nav", () => {
    expect(mobile).toContain('"campanas"');
  });
});

// ─── 7. CommandPalette consolidation ─────────────────────────────────
describe("Phase 12 — CommandPalette", () => {
  const cmd = readSrc("components/CommandPalette.tsx");

  test("No removed tab references in command palette", () => {
    expect(cmd).not.toContain('"automatizacion"');
    expect(cmd).not.toContain('"outreach"');
  });

  test("Has Campañas command", () => {
    expect(cmd).toContain("Campañas");
    expect(cmd).toContain('"campanas"');
  });

  test("Has Ajustes command (renamed from Administración)", () => {
    expect(cmd).toContain("Ajustes");
  });
});

// ─── 8. AgentBriefing updated ────────────────────────────────────────
describe("Phase 12 — AgentBriefing references", () => {
  const briefing = readSrc("components/AgentBriefing.tsx");

  test("No reference to automatizacion", () => {
    expect(briefing).not.toContain('"automatizacion"');
  });

  test("References campanas instead", () => {
    expect(briefing).toContain('"campanas"');
  });
});

// ─── 9. Memory engine updated ────────────────────────────────────────
describe("Phase 12 — Memory engine topic mapping", () => {
  const mem = readSrc("lib/agent/memory-engine.ts");

  test("Maps to campanas instead of automatizacion", () => {
    expect(mem).toContain('"campanas"');
    expect(mem).not.toContain('"automatizacion"');
  });
});

// ─── 10. Regression — all Phase 1-11 panels still imported ───────────
describe("Phase 12 — No regression on panel imports", () => {
  const dashboard = readSrc("app/dashboard/page.tsx");

  test("CRM panels still imported", () => {
    expect(dashboard).toContain("CrmPanel");
    expect(dashboard).toContain("CrmOpportunitiesPanel");
    expect(dashboard).toContain("CrmCommercialOpsPanel");
    expect(dashboard).toContain("CrmActivityPanel");
    expect(dashboard).toContain("CrmTasksPanel");
    expect(dashboard).toContain("CrmNotificationsPanel");
    expect(dashboard).toContain("CrmAgendaPanel");
    expect(dashboard).toContain("CrmExecutivePanel");
  });

  test("Financial panels still imported", () => {
    expect(dashboard).toContain("AlertasPanel");
    expect(dashboard).toContain("ForecastPanel");
    expect(dashboard).toContain("BillParserPanel");
    expect(dashboard).toContain("InformesPanel");
  });

  test("OperationsPanel still imported and rendered", () => {
    expect(dashboard).toContain("OperationsPanel");
  });

  test("FineTuningPanel still imported and rendered", () => {
    expect(dashboard).toContain("FineTuningPanel");
  });

  test("Scoring, Visits, Contactos still in CRM", () => {
    expect(dashboard).toContain("<ScoringPanel");
    expect(dashboard).toContain("<VisitsPanel");
    expect(dashboard).toContain("<ContactosPanel");
  });
});
