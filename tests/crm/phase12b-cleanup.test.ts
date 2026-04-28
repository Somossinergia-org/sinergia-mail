/**
 * Phase 12b — Aggressive Cleanup Tests
 * Validates 9→6 tab reduction: workspace + agente-ia absorbed into config (Admin)
 * facturas absorbed into finanzas. Zero breakage of Phases 1-12.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const srcDir = resolve(import.meta.dirname!, "../../src");

function readSrc(relPath: string): string {
  return readFileSync(resolve(srcDir, relPath), "utf-8");
}

// ─── 1. Sidebar — exactly 6 tabs ────────────────────────────────────
describe("Phase 12b — Sidebar 6-tab structure", () => {
  const sidebar = readSrc("components/Sidebar.tsx");

  test("Tab type has exactly 6 members", () => {
    const matches = sidebar.match(/\| "[\w-]+"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(6);
  });

  test("Tab type includes the 6 correct tabs", () => {
    expect(sidebar).toContain('"overview"');
    expect(sidebar).toContain('"crm"');
    expect(sidebar).toContain('"emails"');
    expect(sidebar).toContain('"campanas"');
    expect(sidebar).toContain('"finanzas"');
    expect(sidebar).toContain('"config"');
  });

  test("Tab type does NOT include removed tabs", () => {
    expect(sidebar).not.toMatch(/\| "facturas"/);
    expect(sidebar).not.toMatch(/\| "workspace"/);
    expect(sidebar).not.toMatch(/\| "agente-ia"/);
    expect(sidebar).not.toMatch(/\| "automatizacion"/);
    expect(sidebar).not.toMatch(/\| "outreach"/);
    expect(sidebar).not.toMatch(/\| "entrenar-ia"/);
    expect(sidebar).not.toMatch(/\| "operaciones"/);
  });

  test("CRM is visible and prominent", () => {
    expect(sidebar).toContain('"crm"');
    expect(sidebar).toContain('"CRM"');
  });

  test("Config renamed to Ajustes", () => {
    expect(sidebar).toContain('"Ajustes"');
  });
});

// ─── 2. Dashboard — 6 tabs only ─────────────────────────────────────
describe("Phase 12b — Dashboard tab structure", () => {
  const dashboard = readSrc("app/dashboard/page.tsx");

  test("TAB_TITLES has exactly 6 entries", () => {
    const titlesBlock = dashboard.slice(
      dashboard.indexOf("const TAB_TITLES"),
      dashboard.indexOf("};", dashboard.indexOf("const TAB_TITLES")) + 2
    );
    const entries = titlesBlock.match(/\w+: "/g);
    expect(entries).not.toBeNull();
    expect(entries!.length).toBe(6);
  });

  test("No standalone workspace tab section", () => {
    expect(dashboard).not.toMatch(/activeTab === ["']workspace["']/);
  });

  test("No standalone agente-ia tab section", () => {
    expect(dashboard).not.toMatch(/activeTab === ["']agente-ia["']/);
  });

  test("No standalone facturas tab section", () => {
    expect(dashboard).not.toMatch(/activeTab === ["']facturas["']/);
  });
});

// ─── 3. Admin tab absorbs workspace + agente-ia ─────────────────────
describe("Phase 12b — Admin tab absorbs all", () => {
  const dashboard = readSrc("app/dashboard/page.tsx");
  const cfgIdx = dashboard.indexOf('activeTab === "config"');
  const section = dashboard.slice(cfgIdx, cfgIdx + 4000);

  test("Config tab exists", () => {
    expect(cfgIdx).toBeGreaterThan(-1);
  });

  // Refactor 2026-04-28 (Fase 1 reorg): Ajustes solo conserva configuración real.
  // Calendario/Drive/Importar → atajos en Inicio
  // WordPress → Campañas
  // Tareas (Google) → eliminado (duplicado de CRM > Tareas)
  // Conocimiento (brain) → eliminado del menu (lo usa el chat IA internamente)
  // Base Operativa → fundido con Operaciones

  test("Admin secciones IA + Sistema (no Herramientas)", () => {
    expect(section).toContain('"monitor-ia"');
    expect(section).toContain('"memoria"');
    expect(section).toContain('"entrenar"');
  });

  test("Admin sub-tabs reales (config + sistema)", () => {
    expect(section).toContain('"operaciones"');
    expect(section).toContain('"agent-config"');
    expect(section).toContain('"integraciones"');
    expect(section).toContain('"signature"');
    expect(section).toContain('"rgpd"');
  });

  test("Admin renders settings + IA panels", () => {
    expect(section).toContain("<AgentOfficeMap");
    expect(section).toContain("<MemoriaPanel");
    expect(section).toContain("<FineTuningPanel");
    expect(section).toContain("<OperationsPanel");
    expect(section).toContain("<AgentConfigPanel");
    expect(section).toContain("<IntegracionesPanel");
    expect(section).toContain("<SignaturePanel");
    expect(section).toContain("<RGPDPanel");
    expect(section).toContain("<OpsConfigPanel");  // ahora junto a Operaciones
  });

  test("Admin tiene 8 sub-tabs (3 Cuenta + 5 Sistema)", () => {
    const tabsBlock = section.slice(0, section.indexOf("{(sub)"));
    const tabIds = tabsBlock.match(/id: "/g);
    expect(tabIds).not.toBeNull();
    expect(tabIds!.length).toBe(8);
  });
});

// ─── 4. Finanzas — no energy (moved to CRM) ─────────────────────────
describe("Phase 12b — Finanzas without energy", () => {
  const dashboard = readSrc("app/dashboard/page.tsx");
  const finIdx = dashboard.indexOf('{activeTab === "finanzas" && (');
  const section = dashboard.slice(finIdx, finIdx + 1500);

  test("Finanzas tab section exists", () => {
    expect(finIdx).toBeGreaterThan(-1);
  });

  test("Finanzas has 5 sub-tabs (no energia)", () => {
    const tabsBlock = section.slice(0, section.indexOf("{(sub)"));
    const tabIds = tabsBlock.match(/id: "/g);
    expect(tabIds).not.toBeNull();
    expect(tabIds!.length).toBe(5);
  });

  test("Finanzas does NOT contain energia sub-tab", () => {
    const tabsBlock = section.slice(0, section.indexOf("{(sub)"));
    expect(tabsBlock).not.toContain('"energia"');
  });

  test("Finanzas renders InvoicePanel (recibidas)", () => {
    expect(section).toContain("<InvoicePanel");
  });

  test("Finanzas renders FacturarPanel (emitidas)", () => {
    expect(section).toContain("<FacturarPanel");
  });
});

// ─── 4b. CRM has Energía sub-tab ───────────────────────────────────
describe("Phase 12b — Energy lives in CRM", () => {
  const dashboard = readSrc("app/dashboard/page.tsx");
  const crmIdx = dashboard.indexOf('{activeTab === "crm"');
  const section = dashboard.slice(crmIdx, crmIdx + 3500);

  test("CRM has energia sub-tab", () => {
    expect(section).toContain('"energia"');
    expect(section).toContain('"Energía"');
  });

  test("CRM renders BillParserPanel for energia", () => {
    expect(section).toContain("<BillParserPanel");
  });

  test("CRM tiene 9 sub-tabs (refactor 2026-04-28: 12→9)", () => {
    // Eliminados: Visitas, Operativa, Scoring (fundidos en Actividad)
    // Energía movida de Especializado → Negocio
    const tabsBlock = section.slice(0, section.indexOf("{(sub)"));
    const tabIds = tabsBlock.match(/id: "/g);
    expect(tabIds).not.toBeNull();
    expect(tabIds!.length).toBe(9);
  });
});

// ─── 5. MobileBottomNav — 6 tabs ───────────────────────────────────
describe("Phase 12b — MobileBottomNav", () => {
  const mobile = readSrc("components/MobileBottomNav.tsx");

  test("No removed tabs in mobile nav", () => {
    expect(mobile).not.toContain('"facturas"');
    expect(mobile).not.toContain('"workspace"');
    expect(mobile).not.toContain('"agente-ia"');
    expect(mobile).not.toContain('"automatizacion"');
    expect(mobile).not.toContain('"outreach"');
  });

  test("ITEMS has 6 visibles tabs (refactor 2026-04-28 fase 1: 5→6 con Campañas)", () => {
    // Campañas vuelve al bottom nav (era exiliado al sidebar tras el primer
    // rediseño móvil). 6 tabs caben en 360px con icon-only y label compacto.
    const itemsIdx = mobile.indexOf("const ITEMS");
    const itemsEnd = mobile.indexOf("];", itemsIdx);
    const section = mobile.slice(itemsIdx, itemsEnd);
    const items = section.match(/id: "/g);
    expect(items).not.toBeNull();
    expect(items!.length).toBe(6);
  });

  test("CRM en BottomNav", () => {
    const itemsIdx = mobile.indexOf("const ITEMS");
    const itemsEnd = mobile.indexOf("];", itemsIdx);
    const section = mobile.slice(itemsIdx, itemsEnd);
    expect(section).toContain('"crm"');
  });

  test("Las 6 tabs principales presentes (overview, crm, emails, campanas, finanzas, config)", () => {
    expect(mobile).toContain('"overview"');
    expect(mobile).toContain('"crm"');
    expect(mobile).toContain('"emails"');
    expect(mobile).toContain('"campanas"');
    expect(mobile).toContain('"finanzas"');
    expect(mobile).toContain('"config"');
  });
});

// ─── 6. CommandPalette — no old tabs ────────────────────────────────
describe("Phase 12b — CommandPalette", () => {
  const cmd = readSrc("components/CommandPalette.tsx");

  test("No removed tab references", () => {
    expect(cmd).not.toContain('"facturas"');
    expect(cmd).not.toContain('"workspace"');
    expect(cmd).not.toContain('"agente-ia"');
    expect(cmd).not.toContain('"automatizacion"');
    expect(cmd).not.toContain('"outreach"');
  });

  test("Has all 6 tabs", () => {
    expect(cmd).toContain('"overview"');
    expect(cmd).toContain('"crm"');
    expect(cmd).toContain('"emails"');
    expect(cmd).toContain('"campanas"');
    expect(cmd).toContain('"finanzas"');
    expect(cmd).toContain('"config"');
  });

  test("Has Ajustes command", () => {
    expect(cmd).toContain("Ajustes");
  });
});

// ─── 7. AgentBriefing — no old tab references ──────────────────────
describe("Phase 12b — AgentBriefing", () => {
  const briefing = readSrc("components/AgentBriefing.tsx");

  test("No reference to agente-ia", () => {
    expect(briefing).not.toContain('"agente-ia"');
  });

  test("No reference to workspace", () => {
    expect(briefing).not.toContain('"workspace"');
  });
});

// ─── 8. Memory engine — no old tab references ──────────────────────
describe("Phase 12b — Memory engine", () => {
  const mem = readSrc("lib/agent/memory-engine.ts");

  test("Maps to finanzas for invoices", () => {
    expect(mem).toContain('"finanzas"');
    expect(mem).not.toContain('"facturas"');
  });

  test("Maps energy topics to crm (not finanzas or energia)", () => {
    expect(mem).toMatch(/cups.*"crm"/);
  });

  test("Maps to campanas", () => {
    expect(mem).toContain('"campanas"');
  });
});

// ─── 9. UniversalSearch — no old tab references ────────────────────
describe("Phase 12b — UniversalSearch", () => {
  const search = readSrc("components/UniversalSearch.tsx");

  test("No reference to facturas tab", () => {
    expect(search).not.toContain('handleNav("facturas")');
  });

  test("Uses finanzas for invoice navigation", () => {
    expect(search).toContain('handleNav("finanzas")');
  });
});

// ─── 10. Regression — all panels still imported ─────────────────────
describe("Phase 12b — No regression on panel imports", () => {
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
    expect(dashboard).toContain("InvoicePanel");
    expect(dashboard).toContain("AlertasPanel");
    expect(dashboard).toContain("ForecastPanel");
    expect(dashboard).toContain("BillParserPanel");
    expect(dashboard).toContain("InformesPanel");
    expect(dashboard).toContain("FacturarPanel");
  });

  test("Workspace panels still imported and rendered in Admin", () => {
    expect(dashboard).toContain("CalendarPanel");
    expect(dashboard).toContain("DrivePanel");
    expect(dashboard).toContain("TasksPanel");
  });

  test("IA panels still imported and rendered in Admin", () => {
    expect(dashboard).toContain("AgentOfficeMap");
    expect(dashboard).toContain("KnowledgePanel");
    expect(dashboard).toContain("MemoriaPanel");
    expect(dashboard).toContain("FineTuningPanel");
  });

  test("Operations + Config panels still imported", () => {
    expect(dashboard).toContain("OperationsPanel");
    expect(dashboard).toContain("AgentConfigPanel");
    expect(dashboard).toContain("IntegracionesPanel");
    expect(dashboard).toContain("SignaturePanel");
    expect(dashboard).toContain("RGPDPanel");
  });

  test("Scoring, Visits, Contactos still in CRM", () => {
    expect(dashboard).toContain("<ScoringPanel");
    expect(dashboard).toContain("<VisitsPanel");
    expect(dashboard).toContain("<ContactosPanel");
  });
});

// ─── 11. Client type per vertical ──────────────────────────────────
describe("Phase 12b — Client type per vertical", () => {
  const verticals = readSrc("lib/crm/service-verticals.ts");

  test("Exports CLIENT_TYPES constant", () => {
    expect(verticals).toContain("CLIENT_TYPES");
    expect(verticals).toContain('"particular"');
    expect(verticals).toContain('"autonomo"');
    expect(verticals).toContain('"empresa"');
  });

  test("VERTICALS_WITH_PARTICULAR includes only physical-service verticals", () => {
    expect(verticals).toContain("VERTICALS_WITH_PARTICULAR");
    const particularBlock = verticals.slice(
      verticals.indexOf("VERTICALS_WITH_PARTICULAR"),
      verticals.indexOf("] as const;", verticals.indexOf("VERTICALS_WITH_PARTICULAR"))
    );
    expect(particularBlock).toContain('"energia"');
    expect(particularBlock).toContain('"telecomunicaciones"');
    expect(particularBlock).toContain('"alarmas"');
    expect(particularBlock).toContain('"seguros"');
    expect(particularBlock).not.toContain('"agentes_ia"');
    expect(particularBlock).not.toContain('"web"');
    expect(particularBlock).not.toContain('"crm"');
    expect(particularBlock).not.toContain('"aplicaciones"');
  });

  test("VERTICALS_B2B_ONLY includes only digital-service verticals", () => {
    expect(verticals).toContain("VERTICALS_B2B_ONLY");
    const b2bBlock = verticals.slice(
      verticals.indexOf("VERTICALS_B2B_ONLY"),
      verticals.indexOf("] as const;", verticals.indexOf("VERTICALS_B2B_ONLY"))
    );
    expect(b2bBlock).toContain('"agentes_ia"');
    expect(b2bBlock).toContain('"web"');
    expect(b2bBlock).toContain('"crm"');
    expect(b2bBlock).toContain('"aplicaciones"');
  });

  test("Exports getClientTypesForVertical function", () => {
    expect(verticals).toContain("getClientTypesForVertical");
  });

  test("Exports isValidClientTypeForVertical function", () => {
    expect(verticals).toContain("isValidClientTypeForVertical");
  });

  test("Services API validates client type", () => {
    const api = readSrc("app/api/crm/services/route.ts");
    expect(api).toContain("isValidClientTypeForVertical");
    expect(api).toContain("clientType");
  });
});

// ─── 12. Agent routing — particular → junior, empresa → principal ───
describe("Phase 12b — Agent routing uses client type", () => {
  const knowledge = readSrc("lib/agent/agent-knowledge.ts");

  test("Comercial Junior handles particulares", () => {
    const definitionIdx = knowledge.indexOf('"comercial-junior": {');
    expect(definitionIdx).toBeGreaterThan(-1);
    const juniorSection = knowledge.slice(definitionIdx, definitionIdx + 500);
    expect(juniorSection.toLowerCase()).toMatch(/particular/);
  });

  test("Comercial Principal handles empresas", () => {
    const definitionIdx = knowledge.indexOf('"comercial-principal": {');
    expect(definitionIdx).toBeGreaterThan(-1);
    const principalSection = knowledge.slice(definitionIdx, definitionIdx + 500);
    expect(principalSection.toLowerCase()).toMatch(/empresa/);
  });
});
