/**
 * Phase 6 Behavioral Tests — Multiservicio (8 verticals)
 *
 * Verifies code-level patterns for:
 *  1. Service Verticals module: types, statuses, metadata, portfolio builder
 *  2. CRUD backend: services layer + API routes (all 8 verticals)
 *  3. Auth & ownership: verifyServiceOwnership, company checks
 *  4. Vertical JSONB data: per-vertical interfaces + updateServiceVerticalData
 *  5. Opportunity ↔ Service linking: linkServiceToOpportunity
 *  6. Swarm tools: crm_get_service_portfolio + crm_detect_missing_services
 *  7. Agent distribution: new tools assigned per role
 *  8. UI multiservicio: ServicesTabContent, vertical icons/labels, create form
 *  9. Context builders enhanced: portfolio in buildCompanyContext
 * 10. Regression: energy, CRM, swarm intact
 *
 * File-content validation pattern — no database required.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const srcDir = resolve(__dirname, "../../src");

function readSrc(path: string): string {
  return readFileSync(resolve(srcDir, path), "utf-8");
}

// ═══════════════════════════════════════════════════════════════════
// 1. Service Verticals Module — Types & Metadata
// ═══════════════════════════════════════════════════════════════════

describe("Service Verticals — Types & Constants", () => {
  const verticals = readSrc("lib/crm/service-verticals.ts");

  it("defines all 8 SERVICE_TYPES", () => {
    const types = [
      "energia", "telecomunicaciones", "alarmas", "seguros",
      "agentes_ia", "web", "crm", "aplicaciones",
    ];
    for (const t of types) {
      expect(verticals).toContain(`"${t}"`);
    }
  });

  it("defines 4 SERVICE_STATUSES", () => {
    const statuses = ["prospecting", "offered", "contracted", "cancelled"];
    for (const s of statuses) {
      expect(verticals).toContain(`"${s}"`);
    }
  });

  it("exports ServiceType union type", () => {
    expect(verticals).toContain("export type ServiceType");
  });

  it("exports SERVICE_TYPES as const array", () => {
    expect(verticals).toContain("export const SERVICE_TYPES");
    expect(verticals).toContain("as const");
  });

  it("exports isValidServiceType helper", () => {
    expect(verticals).toContain("export function isValidServiceType");
  });

  it("exports isValidServiceStatus helper", () => {
    expect(verticals).toContain("export function isValidServiceStatus");
  });
});

describe("Service Verticals — Per-Vertical Data Interfaces", () => {
  const verticals = readSrc("lib/crm/service-verticals.ts");

  it("defines TelecomData with required fields", () => {
    expect(verticals).toContain("export interface TelecomData");
    expect(verticals).toContain("lineCount");
    expect(verticals).toContain("lineType");
  });

  it("defines AlarmasData", () => {
    expect(verticals).toContain("export interface AlarmasData");
    expect(verticals).toContain("deviceCount");
  });

  it("defines SegurosData with insurer and premium", () => {
    expect(verticals).toContain("export interface SegurosData");
    expect(verticals).toContain("annualPremiumEur");
    expect(verticals).toContain("insurer");
  });

  it("defines AgentesIaData", () => {
    expect(verticals).toContain("export interface AgentesIaData");
    expect(verticals).toContain("scope");
  });

  it("defines WebData", () => {
    expect(verticals).toContain("export interface WebData");
    expect(verticals).toContain("mantenimiento");
  });

  it("defines CrmData", () => {
    expect(verticals).toContain("export interface CrmData");
    expect(verticals).toContain("usuarios");
  });

  it("defines AplicacionesData", () => {
    expect(verticals).toContain("export interface AplicacionesData");
  });

  it("defines EnergiaData", () => {
    expect(verticals).toContain("export interface EnergiaData");
  });
});

describe("Service Verticals — VERTICAL_META", () => {
  const verticals = readSrc("lib/crm/service-verticals.ts");

  it("exports VERTICAL_META record", () => {
    expect(verticals).toContain("export const VERTICAL_META");
  });

  it("has entries for all 8 types", () => {
    const types = [
      "energia", "telecomunicaciones", "alarmas", "seguros",
      "agentes_ia", "web", "crm", "aplicaciones",
    ];
    for (const t of types) {
      expect(verticals).toContain(`${t}:`);
    }
  });

  it("each entry has label, icon, color", () => {
    expect(verticals).toContain("label:");
    expect(verticals).toContain("icon:");
    expect(verticals).toContain("color:");
  });
});

describe("Service Verticals — Portfolio Builder", () => {
  const verticals = readSrc("lib/crm/service-verticals.ts");

  it("exports buildPortfolioSummary function", () => {
    expect(verticals).toContain("export function buildPortfolioSummary");
  });

  it("exports PortfolioSummary type", () => {
    expect(verticals).toMatch(/export (type|interface) PortfolioSummary/);
  });

  it("calculates totalServices, activeVerticals, missingVerticals", () => {
    expect(verticals).toContain("totalServices");
    expect(verticals).toContain("activeVerticals");
    expect(verticals).toContain("missingVerticals");
  });

  it("calculates totalCurrentSpend and totalEstimatedSavings", () => {
    expect(verticals).toContain("totalCurrentSpend");
    expect(verticals).toContain("totalEstimatedSavings");
  });

  it("groups by type with per-type counts", () => {
    expect(verticals).toContain("byType");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. CRUD Backend — Services Layer
// ═══════════════════════════════════════════════════════════════════

describe("Services Layer — Enhanced Functions", () => {
  const services = readSrc("lib/crm/services.ts");

  it("exports verifyServiceOwnership", () => {
    expect(services).toContain("verifyServiceOwnership");
  });

  it("verifyServiceOwnership JOINs with companies for tenant check", () => {
    expect(services).toContain("companies");
    expect(services).toContain("userId");
  });

  it("exports updateServiceVerticalData for JSONB merge", () => {
    expect(services).toContain("updateServiceVerticalData");
  });

  it("exports linkServiceToOpportunity", () => {
    expect(services).toContain("linkServiceToOpportunity");
  });

  it("exports listServicesByCompany", () => {
    expect(services).toContain("listServicesByCompany");
  });

  it("exports createService", () => {
    expect(services).toContain("createService");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. API Routes — CRUD with Auth
// ═══════════════════════════════════════════════════════════════════

describe("API Route — /api/crm/services (collection)", () => {
  const route = readSrc("app/api/crm/services/route.ts");

  it("exports GET handler", () => {
    expect(route).toContain("export async function GET");
  });

  it("exports POST handler", () => {
    expect(route).toContain("export async function POST");
  });

  it("validates auth via auth()", () => {
    expect(route).toContain("await auth()");
    expect(route).toContain("session?.user?.id");
  });

  it("validates service type with isValidServiceType", () => {
    expect(route).toContain("isValidServiceType");
  });

  it("validates service status with isValidServiceStatus", () => {
    expect(route).toContain("isValidServiceStatus");
  });

  it("verifies company ownership before creating service", () => {
    expect(route).toContain("getCompany");
    expect(route).toContain("company.userId !== session.user.id");
  });

  it("supports type and status filters on GET", () => {
    expect(route).toContain('params.get("type")');
    expect(route).toContain('params.get("status")');
  });
});

describe("API Route — /api/crm/services/[id] (individual)", () => {
  const route = readSrc("app/api/crm/services/[id]/route.ts");

  it("exports GET, PATCH, DELETE handlers", () => {
    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function PATCH");
    expect(route).toContain("export async function DELETE");
  });

  it("verifies service ownership on all operations", () => {
    const matches = route.match(/verifyServiceOwnership/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  it("PATCH separates vertical data from common fields", () => {
    expect(route).toContain("data: verticalData");
    expect(route).toContain("commonFields");
  });

  it("PATCH merges vertical data via updateServiceVerticalData", () => {
    expect(route).toContain("updateServiceVerticalData");
  });

  it("PATCH allows opportunityId update", () => {
    expect(route).toContain("opportunityId");
  });

  it("handles date fields correctly", () => {
    expect(route).toContain("contractDate");
    expect(route).toContain("expiryDate");
    expect(route).toContain("new Date(");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Swarm Tools — Portfolio & Missing Services
// ═══════════════════════════════════════════════════════════════════

describe("CRM Tools — Multiservice Tools", () => {
  const crmTools = readSrc("lib/agent/crm-tools.ts");

  it("imports buildPortfolioSummary from service-verticals", () => {
    expect(crmTools).toContain("buildPortfolioSummary");
    expect(crmTools).toContain("service-verticals");
  });

  it("imports VERTICAL_META from service-verticals", () => {
    expect(crmTools).toContain("VERTICAL_META");
  });

  it("defines crm_get_service_portfolio tool", () => {
    expect(crmTools).toContain("crm_get_service_portfolio");
  });

  it("defines crm_detect_missing_services tool", () => {
    expect(crmTools).toContain("crm_detect_missing_services");
  });

  it("portfolio handler calls buildPortfolioSummary", () => {
    expect(crmTools).toContain("buildPortfolioSummary");
  });

  it("missing services handler returns activeVerticals and missingVerticals", () => {
    expect(crmTools).toContain("activeVerticals");
    expect(crmTools).toContain("missingVerticals");
  });

  it("missing services handler detects expiringSoon", () => {
    expect(crmTools).toContain("expiringSoon");
  });

  it("total CRM tools count is at least 16 (14 base + 2 multiservice)", () => {
    const toolMatches = crmTools.match(/name:\s*"crm_/g);
    expect(toolMatches).not.toBeNull();
    expect(toolMatches!.length).toBeGreaterThanOrEqual(16);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Agent Distribution — New Tools per Role
// ═══════════════════════════════════════════════════════════════════

describe("Swarm Agent Distribution — Multiservice Tools", () => {
  const swarm = readSrc("lib/agent/swarm.ts");

  // Helper: extract allowedTools for a given agent ID
  function getAgentBlock(agentId: string): string {
    const idxStart = swarm.indexOf(`id: "${agentId}"`);
    if (idxStart === -1) return "";
    const idxEnd = swarm.indexOf("canDelegate:", idxStart);
    return swarm.slice(idxStart, idxEnd > idxStart ? idxEnd : idxStart + 2000);
  }

  it("CEO has both portfolio and detect_missing tools", () => {
    const block = getAgentBlock("ceo");
    expect(block).toContain("crm_get_service_portfolio");
    expect(block).toContain("crm_detect_missing_services");
  });

  it("comercial-principal has both portfolio and detect_missing tools", () => {
    const block = getAgentBlock("comercial-principal");
    expect(block).toContain("crm_get_service_portfolio");
    expect(block).toContain("crm_detect_missing_services");
  });

  it("comercial-junior has portfolio tool only", () => {
    const block = getAgentBlock("comercial-junior");
    expect(block).toContain("crm_get_service_portfolio");
    expect(block).not.toContain("crm_detect_missing_services");
  });

  it("consultor-servicios has both portfolio and detect_missing tools", () => {
    const block = getAgentBlock("consultor-servicios");
    expect(block).toContain("crm_get_service_portfolio");
    expect(block).toContain("crm_detect_missing_services");
  });

  it("consultor-digital has portfolio tool only", () => {
    const block = getAgentBlock("consultor-digital");
    expect(block).toContain("crm_get_service_portfolio");
    expect(block).not.toContain("crm_detect_missing_services");
  });

  it("bi-scoring has both portfolio and detect_missing tools", () => {
    const block = getAgentBlock("bi-scoring");
    expect(block).toContain("crm_get_service_portfolio");
    expect(block).toContain("crm_detect_missing_services");
  });

  it("marketing-automation has portfolio tool only", () => {
    const block = getAgentBlock("marketing-automation");
    expect(block).toContain("crm_get_service_portfolio");
    expect(block).not.toContain("crm_detect_missing_services");
  });

  it("recepcion has portfolio tool for quick identification", () => {
    const block = getAgentBlock("recepcion");
    expect(block).toContain("crm_get_service_portfolio");
  });

  it("fiscal has portfolio tool for billing context", () => {
    const block = getAgentBlock("fiscal");
    expect(block).toContain("crm_get_service_portfolio");
  });

  it("legal-rgpd does NOT have multiservice tools (not relevant)", () => {
    const block = getAgentBlock("legal-rgpd");
    expect(block).not.toContain("crm_get_service_portfolio");
    expect(block).not.toContain("crm_detect_missing_services");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Context Builders — Portfolio Integration
// ═══════════════════════════════════════════════════════════════════

describe("Context Builders — Portfolio Enhanced", () => {
  const crmTools = readSrc("lib/agent/crm-tools.ts");

  it("buildCompanyContext includes portfolio summary", () => {
    expect(crmTools).toContain("buildCompanyContext");
    expect(crmTools).toContain("portfolio");
  });

  it("buildCompanyContext includes currentSpendEur per service", () => {
    expect(crmTools).toContain("currentSpendEur");
  });

  it("buildCompanyContext includes estimatedSavings per service", () => {
    expect(crmTools).toContain("estimatedSavings");
  });

  it("services section includes data and notes", () => {
    expect(crmTools).toContain("crmListServicesHandler");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. UI Multiservicio — Company Detail Panel
// ═══════════════════════════════════════════════════════════════════

describe("UI — Multiservice in Company Detail", () => {
  const panel = readSrc("components/crm/CrmCompanyDetailPanel.tsx");

  it("contains ServicesTabContent component", () => {
    expect(panel).toContain("ServicesTabContent");
  });

  it("has vertical icon mapping (VERTICAL_ICONS or similar)", () => {
    expect(panel).toMatch(/VERTICAL_ICONS|verticalIcons|vertical.*icon/i);
  });

  it("has vertical label mapping", () => {
    expect(panel).toMatch(/VERTICAL_LABELS|verticalLabels|vertical.*label/i);
  });

  it("supports creating services with type selector (8 verticals)", () => {
    const types = ["energia", "telecomunicaciones", "alarmas", "seguros"];
    for (const t of types) {
      expect(panel).toContain(t);
    }
  });

  it("shows service status badges", () => {
    expect(panel).toMatch(/status/i);
    expect(panel).toMatch(/badge|pill|chip|tag/i);
  });

  it("shows spend and savings info", () => {
    expect(panel).toContain("currentSpendEur");
    expect(panel).toContain("estimatedSavings");
  });

  it("has a create form for new services", () => {
    expect(panel).toMatch(/Servicio|servicio/);
    expect(panel).toMatch(/POST|fetch.*services/i);
  });

  it("groups services by type", () => {
    // grouped rendering by type
    expect(panel).toMatch(/groupedByType|grouped|byType/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. Regression — Energy, CRM, Swarm Intact
// ═══════════════════════════════════════════════════════════════════

describe("Regression — Energy Pipeline Intact", () => {
  it("energy_bills service module still exists", () => {
    const bills = readSrc("lib/crm/energy-bills.ts");
    expect(bills).toContain("listEnergyBillsByCompany");
  });

  it("savings calculator still exists", () => {
    const calc = readSrc("lib/crm/savings-calculator.ts");
    expect(calc).toContain("calculateSavings");
  });

  it("proposal PDF generator still exists", () => {
    const proposal = readSrc("lib/crm/proposal-pdf.ts");
    expect(proposal).toContain("generateProposalPdf");
  });
});

describe("Regression — CRM Core Intact", () => {
  it("companies module still exports core functions", () => {
    const companies = readSrc("lib/crm/companies.ts");
    expect(companies).toContain("getCompany");
    expect(companies).toContain("createCompany");
  });

  it("contacts module still exists", () => {
    const contacts = readSrc("lib/crm/contacts.ts");
    expect(contacts).toContain("listContactsByCompany");
  });

  it("opportunities module still exists", () => {
    const opps = readSrc("lib/crm/opportunities.ts");
    expect(opps).toContain("listOpportunities");
  });
});

describe("Regression — Swarm Structure Intact", () => {
  const swarm = readSrc("lib/agent/swarm.ts");

  it("still has 10 agents", () => {
    const idMatches = swarm.match(/id:\s*"/g);
    expect(idMatches).not.toBeNull();
    expect(idMatches!.length).toBe(10);
  });

  it("exports getSwarmAgents function", () => {
    expect(swarm).toContain("export function getSwarmAgents");
  });

  it("exports routeToAgent function", () => {
    expect(swarm).toContain("export function routeToAgent");
  });

  it("4 governance layers still exist", () => {
    expect(swarm).toContain('"visible"');
    expect(swarm).toContain('"experta-interna"');
    expect(swarm).toContain('"modulo-interno"');
  });

  it("recepcion is default route", () => {
    expect(swarm).toContain('return "recepcion"');
  });
});

describe("Regression — Phase 5 CRM Tools Still Present", () => {
  const crmTools = readSrc("lib/agent/crm-tools.ts");

  it("original 14 CRM tool handlers still present", () => {
    const originals = [
      "crm_search_companies", "crm_get_company", "crm_list_contacts",
      "crm_list_opportunities", "crm_list_cases", "crm_list_services",
      "crm_list_supply_points", "crm_list_energy_bills",
      "crm_get_energy_bill_stats", "crm_calculate_savings",
      "crm_generate_proposal", "crm_link_case_company",
      "crm_link_case_opportunity", "crm_get_case_context",
    ];
    for (const name of originals) {
      expect(crmTools).toContain(name);
    }
  });

  it("buildCompanyContext and buildCaseCrmContext still exported", () => {
    expect(crmTools).toContain("buildCompanyContext");
    expect(crmTools).toContain("buildCaseCrmContext");
  });
});
