/**
 * Phase 2 CRM API Tests
 * Validates new API routes, service functions, and integrations.
 */
import { describe, it, expect } from "vitest";

describe("CRM Cases Link Service", () => {
  it("exports link/unlink functions", async () => {
    const mod = await import("../../src/lib/crm/cases-link");
    expect(typeof mod.linkCaseToCompany).toBe("function");
    expect(typeof mod.unlinkCaseFromCompany).toBe("function");
    expect(typeof mod.linkCaseToOpportunity).toBe("function");
    expect(typeof mod.unlinkCaseFromOpportunity).toBe("function");
    expect(typeof mod.listCasesByCompany).toBe("function");
    expect(typeof mod.listCasesByOpportunity).toBe("function");
  });
});

describe("CRM Contacts Service (Phase 1+2)", () => {
  it("exports all contact linking functions", async () => {
    const mod = await import("../../src/lib/crm/contacts");
    expect(typeof mod.linkContactToCompany).toBe("function");
    expect(typeof mod.unlinkContactFromCompany).toBe("function");
    expect(typeof mod.listContactsByCompany).toBe("function");
    expect(typeof mod.listUnlinkedContacts).toBe("function");
  });
});

describe("CRM Companies Service", () => {
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

describe("CRM Opportunities Service", () => {
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

describe("CRM Services Service", () => {
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

describe("CRM Supply Points Service", () => {
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
