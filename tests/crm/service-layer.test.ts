/**
 * Service Layer Tests — Phase 1 CRM Unification
 * Tests the CRM service modules exist and export the expected functions.
 * Note: actual DB operations can't be tested without a real DB connection.
 * These verify the API surface and function signatures.
 */
import { describe, it, expect } from "vitest";

describe("Companies Service", () => {
  it("exports CRUD functions", async () => {
    const mod = await import("../../src/lib/crm/companies");
    expect(typeof mod.createCompany).toBe("function");
    expect(typeof mod.getCompany).toBe("function");
    expect(typeof mod.listCompanies).toBe("function");
    expect(typeof mod.updateCompany).toBe("function");
    expect(typeof mod.deleteCompany).toBe("function");
    expect(typeof mod.countCompanies).toBe("function");
  });
});

describe("Opportunities Service", () => {
  it("exports CRUD + pipeline functions", async () => {
    const mod = await import("../../src/lib/crm/opportunities");
    expect(typeof mod.createOpportunity).toBe("function");
    expect(typeof mod.getOpportunity).toBe("function");
    expect(typeof mod.listOpportunities).toBe("function");
    expect(typeof mod.updateOpportunity).toBe("function");
    expect(typeof mod.updateOpportunityStatus).toBe("function");
    expect(typeof mod.deleteOpportunity).toBe("function");
    expect(typeof mod.getPipelineStats).toBe("function");
  });
});

describe("Services Service", () => {
  it("exports CRUD functions", async () => {
    const mod = await import("../../src/lib/crm/services");
    expect(typeof mod.createService).toBe("function");
    expect(typeof mod.getService).toBe("function");
    expect(typeof mod.listServicesByCompany).toBe("function");
    expect(typeof mod.listServicesByOpportunity).toBe("function");
    expect(typeof mod.updateService).toBe("function");
    expect(typeof mod.deleteService).toBe("function");
  });
});

describe("Supply Points Service", () => {
  it("exports CRUD functions", async () => {
    const mod = await import("../../src/lib/crm/supply-points");
    expect(typeof mod.createSupplyPoint).toBe("function");
    expect(typeof mod.getSupplyPoint).toBe("function");
    expect(typeof mod.getSupplyPointByCups).toBe("function");
    expect(typeof mod.listSupplyPointsByCompany).toBe("function");
    expect(typeof mod.updateSupplyPoint).toBe("function");
    expect(typeof mod.deleteSupplyPoint).toBe("function");
  });
});

describe("Contacts Service (CRM extension)", () => {
  it("exports linking functions", async () => {
    const mod = await import("../../src/lib/crm/contacts");
    expect(typeof mod.linkContactToCompany).toBe("function");
    expect(typeof mod.unlinkContactFromCompany).toBe("function");
    expect(typeof mod.listContactsByCompany).toBe("function");
    expect(typeof mod.listUnlinkedContacts).toBe("function");
  });
});

describe("Auth Roles", () => {
  it("exports role functions", async () => {
    const mod = await import("../../src/lib/auth/roles");
    expect(typeof mod.getUserRole).toBe("function");
    expect(typeof mod.hasMinRole).toBe("function");
    expect(typeof mod.isValidRole).toBe("function");
    expect(typeof mod.setUserRole).toBe("function");
  });
});
