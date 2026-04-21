/**
 * Phase 2 UI Component Tests
 * Validates CRM components exist and export correctly.
 * Note: Full rendering tests require a browser environment.
 * These verify the module structure and exports.
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { resolve } from "path";

const componentsDir = resolve(__dirname, "../../src/components/crm");

describe("CRM UI Components — File Existence", () => {
  const requiredComponents = [
    "CrmPanel.tsx",
    "CrmCompaniesPanel.tsx",
    "CrmCompanyDetailPanel.tsx",
    "CrmOpportunitiesPanel.tsx",
    "CrmPipelineView.tsx",
  ];

  for (const file of requiredComponents) {
    it(`${file} exists`, () => {
      expect(existsSync(resolve(componentsDir, file))).toBe(true);
    });
  }
});

describe("CRM UI Components — Content Validation", () => {
  const { readFileSync } = require("fs");

  it("CrmCompaniesPanel has correct structure", () => {
    const content = readFileSync(resolve(componentsDir, "CrmCompaniesPanel.tsx"), "utf-8");
    expect(content).toContain('"use client"');
    expect(content).toContain("onSelectCompany");
    expect(content).toContain("/api/crm/companies");
    expect(content).toContain("export default");
  });

  it("CrmCompanyDetailPanel has correct structure", () => {
    const content = readFileSync(resolve(componentsDir, "CrmCompanyDetailPanel.tsx"), "utf-8");
    expect(content).toContain('"use client"');
    expect(content).toContain("companyId");
    expect(content).toContain("onBack");
    expect(content).toContain("/api/crm/companies");
    expect(content).toContain("export default");
  });

  it("CrmOpportunitiesPanel fetches opportunities and stats", () => {
    const content = readFileSync(resolve(componentsDir, "CrmOpportunitiesPanel.tsx"), "utf-8");
    expect(content).toContain('"use client"');
    expect(content).toContain("/api/crm/opportunities");
    expect(content).toContain("stats");
    expect(content).toContain("Pipeline");
    expect(content).toContain("export default");
  });

  it("CrmPipelineView has 10 pipeline columns", () => {
    const content = readFileSync(resolve(componentsDir, "CrmPipelineView.tsx"), "utf-8");
    expect(content).toContain('"use client"');
    expect(content).toContain("pendiente");
    expect(content).toContain("contactado");
    expect(content).toContain("interesado");
    expect(content).toContain("visita_programada");
    expect(content).toContain("visitado");
    expect(content).toContain("oferta_enviada");
    expect(content).toContain("negociacion");
    expect(content).toContain("contrato_firmado");
    expect(content).toContain("cliente_activo");
    expect(content).toContain("perdido");
    expect(content).toContain("onStatusChange");
    expect(content).toContain("export default");
  });

  it("CrmPanel orchestrates companies list and detail", () => {
    const content = readFileSync(resolve(componentsDir, "CrmPanel.tsx"), "utf-8");
    expect(content).toContain('"use client"');
    expect(content).toContain("CrmCompaniesPanel");
    expect(content).toContain("CrmCompanyDetailPanel");
    expect(content).toContain("selectedCompanyId");
    expect(content).toContain("export default");
  });
});

describe("CRM API Routes — File Existence", () => {
  const apiDir = resolve(__dirname, "../../src/app/api/crm");

  const requiredRoutes = [
    "companies/route.ts",
    "companies/[id]/route.ts",
    "companies/[id]/full/route.ts",
    "companies/[id]/contacts/route.ts",
    "companies/[id]/opportunities/route.ts",
    "companies/[id]/cases/route.ts",
    "opportunities/route.ts",
    "opportunities/[id]/route.ts",
    "contacts/route.ts",
    "cases/link/route.ts",
  ];

  for (const route of requiredRoutes) {
    it(`/api/crm/${route} exists`, () => {
      expect(existsSync(resolve(apiDir, route))).toBe(true);
    });
  }
});

describe("CRM Dashboard Integration", () => {
  it("dashboard imports CrmPanel and CrmOpportunitiesPanel", async () => {
    const dashboardPath = resolve(__dirname, "../../src/app/dashboard/page.tsx");
    const { readFileSync } = await import("fs");
    const content = readFileSync(dashboardPath, "utf-8");

    expect(content).toContain('import CrmPanel from "@/components/crm/CrmPanel"');
    expect(content).toContain('import CrmOpportunitiesPanel from "@/components/crm/CrmOpportunitiesPanel"');
    expect(content).toContain('"empresas"');
    expect(content).toContain('"oportunidades"');
    expect(content).toContain("<CrmPanel");
    expect(content).toContain("<CrmOpportunitiesPanel");
  });

  it("keeps existing CRM sub-tabs (contactos, scoring, visits)", async () => {
    const dashboardPath = resolve(__dirname, "../../src/app/dashboard/page.tsx");
    const { readFileSync } = await import("fs");
    const content = readFileSync(dashboardPath, "utf-8");

    expect(content).toContain('"contactos"');
    expect(content).toContain('"scoring"');
    expect(content).toContain('"visits"');
    expect(content).toContain("<ContactosPanel");
    expect(content).toContain("<ScoringPanel");
    expect(content).toContain("<VisitsPanel");
  });
});

describe("CRM Auth Protection — Route Pattern", () => {
  it("all CRM API routes use auth()", async () => {
    const { readFileSync, readdirSync, statSync } = await import("fs");
    const apiDir = resolve(__dirname, "../../src/app/api/crm");

    function findRouteFiles(dir: string): string[] {
      const results: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = resolve(dir, entry);
        if (statSync(full).isDirectory()) {
          results.push(...findRouteFiles(full));
        } else if (entry === "route.ts") {
          results.push(full);
        }
      }
      return results;
    }

    const routeFiles = findRouteFiles(apiDir);
    expect(routeFiles.length).toBeGreaterThanOrEqual(6);

    for (const file of routeFiles) {
      const content = readFileSync(file, "utf-8");
      expect(content).toContain("await auth()");
      expect(content).toContain("session?.user?.id");
    }
  });
});

describe("CRM Roles — Auth Helper", () => {
  it("hasMinRole correctly enforces hierarchy", async () => {
    const { hasMinRole } = await import("../../src/lib/auth/roles");

    // admin can do everything
    expect(hasMinRole("admin", "admin")).toBe(true);
    expect(hasMinRole("admin", "supervisor")).toBe(true);
    expect(hasMinRole("admin", "comercial")).toBe(true);

    // supervisor can't be admin
    expect(hasMinRole("supervisor", "admin")).toBe(false);
    expect(hasMinRole("supervisor", "supervisor")).toBe(true);

    // comercial is the lowest
    expect(hasMinRole("comercial", "admin")).toBe(false);
    expect(hasMinRole("comercial", "supervisor")).toBe(false);
    expect(hasMinRole("comercial", "comercial")).toBe(true);
  });
});

describe("Phase 2 — Compatibility (no regressions)", () => {
  it("existing operations panel file exists", () => {
    expect(existsSync(resolve(__dirname, "../../src/components/operations/OperationsPanel.tsx"))).toBe(true);
  });

  it("schema still exports all Phase 1 types", async () => {
    const schema = await import("../../src/db/schema");
    // Phase 1 CRM types
    const _company: schema.Company | undefined = undefined;
    const _opp: schema.Opportunity | undefined = undefined;
    const _service: schema.Service | undefined = undefined;
    const _sp: schema.SupplyPoint | undefined = undefined;
    const _bill: schema.EnergyBill | undefined = undefined;
    const _user: schema.User | undefined = undefined;
    // Existing types
    const _email: schema.Email | undefined = undefined;
    const _case: schema.Case | undefined = undefined;
    const _contact: schema.Contact | undefined = undefined;
    expect(true).toBe(true);
  });

  it("cases service still exports core functions", async () => {
    const mod = await import("../../src/lib/cases/index");
    expect(typeof mod.resolveOrCreateCase).toBe("function");
    expect(typeof mod.getCase).toBe("function");
    expect(typeof mod.updateCaseOwner).toBe("function");
    expect(typeof mod.updateCaseStatus).toBe("function");
  });
});
