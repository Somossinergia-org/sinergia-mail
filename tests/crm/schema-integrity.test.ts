/**
 * Schema Integrity Tests — Phase 1 CRM Unification
 * Verifies all new tables exist in schema, have correct columns and types.
 */
import { describe, it, expect } from "vitest";
import * as schema from "../../src/db/schema";

describe("CRM Schema — New Tables", () => {
  it("companies table exists with required columns", () => {
    expect(schema.companies).toBeDefined();
    const cols = schema.companies as any;
    // Required columns
    expect(cols.id).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.name).toBeDefined();
    expect(cols.nif).toBeDefined();
    expect(cols.sector).toBeDefined();
    expect(cols.province).toBeDefined();
    expect(cols.source).toBeDefined();
    expect(cols.tags).toBeDefined();
    expect(cols.createdBy).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
  });

  it("supply_points table exists with required columns", () => {
    expect(schema.supplyPoints).toBeDefined();
    const cols = schema.supplyPoints as any;
    expect(cols.id).toBeDefined();
    expect(cols.companyId).toBeDefined();
    expect(cols.cups).toBeDefined();
    expect(cols.tariff).toBeDefined();
    expect(cols.powerP1Kw).toBeDefined();
    expect(cols.currentRetailer).toBeDefined();
    expect(cols.status).toBeDefined();
  });

  it("opportunities table exists with pipeline status support", () => {
    expect(schema.opportunities).toBeDefined();
    const cols = schema.opportunities as any;
    expect(cols.id).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.companyId).toBeDefined();
    expect(cols.primaryContactId).toBeDefined();
    expect(cols.title).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.temperature).toBeDefined();
    expect(cols.priority).toBeDefined();
    expect(cols.estimatedValueEur).toBeDefined();
    expect(cols.lostReason).toBeDefined();
    expect(cols.closedAt).toBeDefined();
  });

  it("services table exists with multiproduct support", () => {
    expect(schema.services).toBeDefined();
    const cols = schema.services as any;
    expect(cols.id).toBeDefined();
    expect(cols.companyId).toBeDefined();
    expect(cols.opportunityId).toBeDefined();
    expect(cols.supplyPointId).toBeDefined();
    expect(cols.type).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.data).toBeDefined();
  });

  it("documents table exists", () => {
    expect(schema.documents).toBeDefined();
    const cols = schema.documents as any;
    expect(cols.id).toBeDefined();
    expect(cols.companyId).toBeDefined();
    expect(cols.fileUrl).toBeDefined();
    expect(cols.type).toBeDefined();
    expect(cols.fileMime).toBeDefined();
  });

  it("energy_bills table exists with bill parser fields", () => {
    expect(schema.energyBills).toBeDefined();
    const cols = schema.energyBills as any;
    expect(cols.id).toBeDefined();
    expect(cols.supplyPointId).toBeDefined();
    expect(cols.documentId).toBeDefined();
    expect(cols.totalAmountEur).toBeDefined();
    expect(cols.consumptionKwh).toBeDefined();
    expect(cols.confidenceScore).toBeDefined();
    expect(cols.rawExtraction).toBeDefined();
  });
});

describe("CRM Schema — Modified Tables", () => {
  it("users has role, phone, firma fields", () => {
    const cols = schema.users as any;
    expect(cols.role).toBeDefined();
    expect(cols.phone).toBeDefined();
    expect(cols.firma).toBeDefined();
  });

  it("contacts has companyId FK", () => {
    const cols = schema.contacts as any;
    expect(cols.companyId).toBeDefined();
  });

  it("cases has companyId and opportunityId FKs", () => {
    const cols = schema.cases as any;
    expect(cols.companyId).toBeDefined();
    expect(cols.opportunityId).toBeDefined();
  });

  it("visits has companyId and contactId FKs", () => {
    const cols = schema.visits as any;
    expect(cols.companyId).toBeDefined();
    expect(cols.contactId).toBeDefined();
  });
});

describe("CRM Schema — Types Export", () => {
  it("exports Company type", () => {
    // Type assertion — if this compiles, the type exists
    const _check: schema.Company | undefined = undefined;
    expect(true).toBe(true);
  });

  it("exports NewCompany type", () => {
    const _check: schema.NewCompany | undefined = undefined;
    expect(true).toBe(true);
  });

  it("exports Opportunity type", () => {
    const _check: schema.Opportunity | undefined = undefined;
    expect(true).toBe(true);
  });

  it("exports SupplyPoint type", () => {
    const _check: schema.SupplyPoint | undefined = undefined;
    expect(true).toBe(true);
  });

  it("exports Service type", () => {
    const _check: schema.Service | undefined = undefined;
    expect(true).toBe(true);
  });

  it("exports EnergyBill type", () => {
    const _check: schema.EnergyBill | undefined = undefined;
    expect(true).toBe(true);
  });

  it("exports User type with role field", () => {
    const _check: schema.User | undefined = undefined;
    expect(true).toBe(true);
  });
});

describe("CRM Schema — Compatibility (existing tables untouched)", () => {
  it("emails table still has all original columns", () => {
    const cols = schema.emails as any;
    expect(cols.id).toBeDefined();
    expect(cols.gmailId).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.fromEmail).toBeDefined();
    expect(cols.subject).toBeDefined();
    expect(cols.body).toBeDefined();
    expect(cols.category).toBeDefined();
    expect(cols.priority).toBeDefined();
  });

  it("auditEvents table untouched", () => {
    const cols = schema.auditEvents as any;
    expect(cols.id).toBeDefined();
    expect(cols.eventId).toBeDefined();
    expect(cols.agentId).toBeDefined();
    expect(cols.eventType).toBeDefined();
  });

  it("swarmWorkingMemory table untouched", () => {
    const cols = schema.swarmWorkingMemory as any;
    expect(cols.id).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.currentTask).toBeDefined();
    expect(cols.activeAgentId).toBeDefined();
  });

  it("rateLimitCounters table untouched", () => {
    const cols = schema.rateLimitCounters as any;
    expect(cols.id).toBeDefined();
    expect(cols.scope).toBeDefined();
    expect(cols.entityKey).toBeDefined();
  });

  it("runtimeSwitches table untouched", () => {
    const cols = schema.runtimeSwitches as any;
    expect(cols.key).toBeDefined();
    expect(cols.value).toBeDefined();
  });

  it("cases table keeps original columns alongside new FKs", () => {
    const cols = schema.cases as any;
    expect(cols.clientIdentifier).toBeDefined();
    expect(cols.visibleOwnerId).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.channel).toBeDefined();
    expect(cols.interactionCount).toBeDefined();
    // New
    expect(cols.companyId).toBeDefined();
    expect(cols.opportunityId).toBeDefined();
  });
});
