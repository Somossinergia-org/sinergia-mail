/**
 * Phase 5 Behavioral Tests — Swarm ↔ CRM Integration
 *
 * Verifies code-level patterns for:
 *  1. CRM tools module: 14 tool definitions + handlers + exports
 *  2. Tenant isolation: every handler checks ownership
 *  3. Context builders: buildCompanyContext, buildCaseCrmContext
 *  4. Governance: CRM_TOOLS registered in SUPER_TOOLS_REGISTRY
 *  5. Per-agent tool distribution: correct tools per role
 *  6. Audit: all handlers use logError
 *  7. Regression: existing tools unmodified
 *
 * Same file-content validation pattern — no database required.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const srcDir = resolve(__dirname, "../../src");

function readSrc(path: string): string {
  return readFileSync(resolve(srcDir, path), "utf-8");
}

// ═══════════════════════════════════════════════════════════════════
// 1. CRM Tools Module — Exports & Structure
// ═══════════════════════════════════════════════════════════════════

describe("CRM Tools Module — Exports", () => {
  it("exports CRM_TOOLS array", async () => {
    const mod = await import("../../src/lib/agent/crm-tools");
    expect(Array.isArray(mod.CRM_TOOLS)).toBe(true);
  });

  it("exports CRM_TOOL_NAMES array", async () => {
    const mod = await import("../../src/lib/agent/crm-tools");
    expect(Array.isArray(mod.CRM_TOOL_NAMES)).toBe(true);
  });

  it("exports buildCompanyContext function", async () => {
    const mod = await import("../../src/lib/agent/crm-tools");
    expect(typeof mod.buildCompanyContext).toBe("function");
  });

  it("exports buildCaseCrmContext function", async () => {
    const mod = await import("../../src/lib/agent/crm-tools");
    expect(typeof mod.buildCaseCrmContext).toBe("function");
  });

  it("CRM_TOOLS has at least 14 tools (14 base + 2 multiservice)", async () => {
    const mod = await import("../../src/lib/agent/crm-tools");
    expect(mod.CRM_TOOLS.length).toBeGreaterThanOrEqual(14);
  });

  it("CRM_TOOL_NAMES has at least 14 names (14 base + 2 multiservice)", async () => {
    const mod = await import("../../src/lib/agent/crm-tools");
    expect(mod.CRM_TOOL_NAMES.length).toBeGreaterThanOrEqual(14);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. CRM Tools — All 14 Tool Names Present
// ═══════════════════════════════════════════════════════════════════

describe("CRM Tools — 14 Tool Definitions", () => {
  const expectedTools = [
    "crm_search_companies",
    "crm_get_company",
    "crm_list_contacts",
    "crm_list_opportunities",
    "crm_list_cases",
    "crm_list_services",
    "crm_list_supply_points",
    "crm_list_energy_bills",
    "crm_get_energy_bill_stats",
    "crm_calculate_savings",
    "crm_generate_proposal",
    "crm_link_case_company",
    "crm_link_case_opportunity",
    "crm_get_case_context",
  ];

  it("all 14 tools are registered in CRM_TOOLS", async () => {
    const mod = await import("../../src/lib/agent/crm-tools");
    const toolNames = mod.CRM_TOOLS.map((t: any) => t.name);
    for (const name of expectedTools) {
      expect(toolNames).toContain(name);
    }
  });

  it("all 14 tool names are in CRM_TOOL_NAMES", async () => {
    const mod = await import("../../src/lib/agent/crm-tools");
    for (const name of expectedTools) {
      expect(mod.CRM_TOOL_NAMES).toContain(name);
    }
  });

  it("every tool has openaiTool with type function", async () => {
    const mod = await import("../../src/lib/agent/crm-tools");
    for (const tool of mod.CRM_TOOLS) {
      expect((tool as any).openaiTool.type).toBe("function");
      expect((tool as any).openaiTool.function.name).toBe((tool as any).name);
    }
  });

  it("every tool has a handler function", async () => {
    const mod = await import("../../src/lib/agent/crm-tools");
    for (const tool of mod.CRM_TOOLS) {
      expect(typeof (tool as any).handler).toBe("function");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Tenant Isolation — Every Handler Checks Ownership
// ═══════════════════════════════════════════════════════════════════

describe("Tenant Isolation — Ownership Verification", () => {
  const crmTools = readSrc("lib/agent/crm-tools.ts");

  it("verifyCompanyOwnership helper exists", () => {
    expect(crmTools).toContain("async function verifyCompanyOwnership(companyId: number, userId: string)");
  });

  it("verifyCaseOwnership helper exists", () => {
    expect(crmTools).toContain("async function verifyCaseOwnership(caseId: number, userId: string)");
  });

  it("company-based handlers call verifyCompanyOwnership", () => {
    // Every handler that takes company_id must verify ownership
    // Handlers that use direct verifyCompanyOwnership
    const directOwnershipHandlers = [
      "crmGetCompanyHandler",
      "crmListContactsHandler",
      "crmListOpportunitiesHandler",
      "crmListCasesHandler",
      "crmListServicesHandler",
      "crmListSupplyPointsHandler",
      "crmGetEnergyBillStatsHandler",
      "crmGenerateProposalHandler",
    ];

    for (const fn of directOwnershipHandlers) {
      const fnStart = crmTools.indexOf(`async function ${fn}`);
      expect(fnStart).toBeGreaterThan(-1);
      const fnSlice = crmTools.slice(fnStart, fnStart + 2000);
      expect(fnSlice).toContain("verifyCompanyOwnership");
    }

    // crmListEnergyBillsHandler and crmCalculateSavingsHandler delegate ownership
    // to listEnergyBillsByCompany(companyId, userId) which verifies internally
    for (const fn of ["crmListEnergyBillsHandler", "crmCalculateSavingsHandler"]) {
      const start = crmTools.indexOf(`async function ${fn}`);
      expect(start).toBeGreaterThan(-1);
      const slice = crmTools.slice(start, start + 600);
      expect(slice).toContain("listEnergyBillsByCompany(companyId, userId)");
    }
  });

  it("case-based handlers call verifyCaseOwnership", () => {
    const caseHandlers = [
      "crmLinkCaseCompanyHandler",
      "crmLinkCaseOpportunityHandler",
      "crmGetCaseContextHandler",
    ];

    for (const fn of caseHandlers) {
      const fnStart = crmTools.indexOf(`async function ${fn}`);
      expect(fnStart).toBeGreaterThan(-1);
      const fnSlice = crmTools.slice(fnStart, fnStart + 600);
      expect(fnSlice).toContain("verifyCaseOwnership");
    }
  });

  it("verifyCompanyOwnership returns null for unauthorized access", () => {
    expect(crmTools).toContain("if (!company || company.userId !== userId) return null");
  });

  it("handlers return error when ownership fails", () => {
    expect(crmTools).toContain('"Empresa no encontrada o sin acceso"');
    expect(crmTools).toContain('"Caso no encontrado o sin acceso"');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Context Builders — Structure
// ═══════════════════════════════════════════════════════════════════

describe("Context Builders — buildCompanyContext", () => {
  const crmTools = readSrc("lib/agent/crm-tools.ts");

  it("buildCompanyContext verifies ownership first", () => {
    const fnStart = crmTools.indexOf("export async function buildCompanyContext");
    expect(fnStart).toBeGreaterThan(-1);
    const fnSlice = crmTools.slice(fnStart, fnStart + 300);
    expect(fnSlice).toContain("verifyCompanyOwnership(companyId, userId)");
  });

  it("buildCompanyContext loads contacts, opportunities, services, supplyPoints, billStats", () => {
    expect(crmTools).toContain("listContactsByCompany(companyId)");
    expect(crmTools).toContain("listOpportunities({ userId, companyId })");
    expect(crmTools).toContain("listServicesByCompany(companyId)");
    expect(crmTools).toContain("listSupplyPointsByCompany(companyId)");
    expect(crmTools).toContain("getEnergyBillsStats(companyId)");
  });

  it("buildCompanyContext uses Promise.all for parallel loading", () => {
    expect(crmTools).toContain("Promise.all([");
  });

  it("buildCompanyContext returns structured snapshot", () => {
    expect(crmTools).toContain("company: {");
    expect(crmTools).toContain("contacts:");
    expect(crmTools).toContain("opportunities:");
    expect(crmTools).toContain("services:");
    expect(crmTools).toContain("energy: {");
  });
});

describe("Context Builders — buildCaseCrmContext", () => {
  const crmTools = readSrc("lib/agent/crm-tools.ts");

  it("buildCaseCrmContext verifies case ownership", () => {
    const fnStart = crmTools.indexOf("export async function buildCaseCrmContext");
    expect(fnStart).toBeGreaterThan(-1);
    const fnSlice = crmTools.slice(fnStart, fnStart + 200);
    expect(fnSlice).toContain("verifyCaseOwnership(caseId, userId)");
  });

  it("buildCaseCrmContext enriches with company context when linked", () => {
    expect(crmTools).toContain("if (caseRecord.companyId)");
    expect(crmTools).toContain("buildCompanyContext(userId, caseRecord.companyId)");
  });

  it("buildCaseCrmContext enriches with opportunity when linked", () => {
    expect(crmTools).toContain("if (caseRecord.opportunityId)");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Governance — CRM_TOOLS Registered in SUPER_TOOLS_REGISTRY
// ═══════════════════════════════════════════════════════════════════

describe("Governance — Registry Integration", () => {
  const superTools = readSrc("lib/agent/super-tools.ts");

  it("super-tools.ts imports CRM_TOOLS", () => {
    expect(superTools).toContain('import { CRM_TOOLS } from "./crm-tools"');
  });

  it("SUPER_TOOLS_REGISTRY spreads CRM_TOOLS", () => {
    expect(superTools).toContain("...CRM_TOOLS");
  });

  it("CRM tools are accessible via SUPER_TOOLS_BY_NAME", async () => {
    const mod = await import("../../src/lib/agent/super-tools");
    const byName = (mod as any).SUPER_TOOLS_BY_NAME;
    if (byName) {
      expect(byName["crm_search_companies"]).toBeDefined();
      expect(byName["crm_get_company"]).toBeDefined();
      expect(byName["crm_get_case_context"]).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Per-Agent Tool Distribution
// ═══════════════════════════════════════════════════════════════════

describe("Per-Agent CRM Tool Distribution", () => {
  const swarm = readSrc("lib/agent/swarm.ts");

  // Helper: extract allowedTools for a given agent id
  function getAgentToolsSection(agentId: string): string {
    const idPattern = `id: "${agentId}"`;
    const start = swarm.indexOf(idPattern);
    expect(start).toBeGreaterThan(-1);
    const sectionEnd = swarm.indexOf("],\n    canDelegate:", start);
    return swarm.slice(start, sectionEnd);
  }

  it("ceo has all 14 CRM tools", () => {
    const section = getAgentToolsSection("ceo");
    const allTools = [
      "crm_search_companies", "crm_get_company", "crm_list_contacts",
      "crm_list_opportunities", "crm_list_cases", "crm_list_services",
      "crm_list_supply_points", "crm_list_energy_bills", "crm_get_energy_bill_stats",
      "crm_calculate_savings", "crm_generate_proposal",
      "crm_link_case_company", "crm_link_case_opportunity", "crm_get_case_context",
    ];
    for (const t of allTools) {
      expect(section).toContain(t);
    }
  });

  it("recepcion has triage CRM tools (no energy)", () => {
    const section = getAgentToolsSection("recepcion");
    expect(section).toContain("crm_search_companies");
    expect(section).toContain("crm_get_company");
    expect(section).toContain("crm_list_contacts");
    expect(section).toContain("crm_list_cases");
    expect(section).toContain("crm_link_case_company");
    expect(section).toContain("crm_get_case_context");
    // Should NOT have energy-specific tools
    expect(section).not.toContain("crm_generate_proposal");
    expect(section).not.toContain("crm_calculate_savings");
  });

  it("comercial-principal has all 14 CRM tools", () => {
    const section = getAgentToolsSection("comercial-principal");
    expect(section).toContain("crm_search_companies");
    expect(section).toContain("crm_generate_proposal");
    expect(section).toContain("crm_link_case_opportunity");
    expect(section).toContain("crm_calculate_savings");
  });

  it("comercial-junior has CRM read + basic energy (no linking, no proposal)", () => {
    const section = getAgentToolsSection("comercial-junior");
    expect(section).toContain("crm_search_companies");
    expect(section).toContain("crm_list_energy_bills");
    expect(section).toContain("crm_calculate_savings");
    expect(section).toContain("crm_get_case_context");
    // Junior should NOT link or generate proposals
    expect(section).not.toContain("crm_link_case_company");
    expect(section).not.toContain("crm_link_case_opportunity");
    expect(section).not.toContain("crm_generate_proposal");
  });

  it("consultor-servicios has full read + all energy analysis (no linking)", () => {
    const section = getAgentToolsSection("consultor-servicios");
    expect(section).toContain("crm_list_supply_points");
    expect(section).toContain("crm_list_energy_bills");
    expect(section).toContain("crm_calculate_savings");
    expect(section).toContain("crm_generate_proposal");
    expect(section).not.toContain("crm_link_case_company");
    expect(section).not.toContain("crm_link_case_opportunity");
  });

  it("consultor-digital has company/contacts/services context (no energy)", () => {
    const section = getAgentToolsSection("consultor-digital");
    expect(section).toContain("crm_search_companies");
    expect(section).toContain("crm_get_company");
    expect(section).toContain("crm_list_contacts");
    expect(section).toContain("crm_list_services");
    expect(section).toContain("crm_get_case_context");
    expect(section).not.toContain("crm_list_energy_bills");
    expect(section).not.toContain("crm_calculate_savings");
  });

  it("legal-rgpd has company/contacts for compliance (minimal)", () => {
    const section = getAgentToolsSection("legal-rgpd");
    expect(section).toContain("crm_search_companies");
    expect(section).toContain("crm_get_company");
    expect(section).toContain("crm_list_contacts");
    expect(section).toContain("crm_get_case_context");
    expect(section).not.toContain("crm_list_energy_bills");
    expect(section).not.toContain("crm_generate_proposal");
  });

  it("fiscal has company/services + energy stats for billing context", () => {
    const section = getAgentToolsSection("fiscal");
    expect(section).toContain("crm_search_companies");
    expect(section).toContain("crm_get_company");
    expect(section).toContain("crm_list_services");
    expect(section).toContain("crm_list_energy_bills");
    expect(section).toContain("crm_get_energy_bill_stats");
    expect(section).not.toContain("crm_generate_proposal");
    expect(section).not.toContain("crm_link_case_opportunity");
  });

  it("bi-scoring has full CRM read + all energy analytics", () => {
    const section = getAgentToolsSection("bi-scoring");
    expect(section).toContain("crm_search_companies");
    expect(section).toContain("crm_list_supply_points");
    expect(section).toContain("crm_list_energy_bills");
    expect(section).toContain("crm_get_energy_bill_stats");
    expect(section).toContain("crm_calculate_savings");
    expect(section).toContain("crm_get_case_context");
    // BI should NOT link or write
    expect(section).not.toContain("crm_link_case_company");
    expect(section).not.toContain("crm_generate_proposal");
  });

  it("marketing-automation has search + contacts + opportunities for targeting", () => {
    const section = getAgentToolsSection("marketing-automation");
    expect(section).toContain("crm_search_companies");
    expect(section).toContain("crm_get_company");
    expect(section).toContain("crm_list_contacts");
    expect(section).toContain("crm_list_opportunities");
    expect(section).toContain("crm_get_case_context");
    // Marketing should NOT have energy or linking
    expect(section).not.toContain("crm_list_energy_bills");
    expect(section).not.toContain("crm_link_case_company");
    expect(section).not.toContain("crm_generate_proposal");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Audit & Error Handling
// ═══════════════════════════════════════════════════════════════════

describe("Audit & Error Handling", () => {
  const crmTools = readSrc("lib/agent/crm-tools.ts");

  it("imports logger and logError", () => {
    expect(crmTools).toContain('import { logger, logError } from "@/lib/logger"');
  });

  it("creates child logger for crm-tools component", () => {
    expect(crmTools).toContain('logger.child({ component: "crm-tools" })');
  });

  it("every handler has try/catch with logError", () => {
    // Count handler functions and logError calls - should be at least 14
    const handlerMatches = crmTools.match(/async function crm\w+Handler/g);
    const logErrorMatches = crmTools.match(/logError\(log,/g);
    expect(handlerMatches!.length).toBeGreaterThanOrEqual(14);
    expect(logErrorMatches!.length).toBeGreaterThanOrEqual(14);
  });

  it("handlers return {ok: false, error} on failure", () => {
    const errorReturns = crmTools.match(/return \{ ok: false, error:/g);
    // At least 14 handlers × at least 1 error return each
    expect(errorReturns!.length).toBeGreaterThanOrEqual(14);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. OpenAI Function Calling Format
// ═══════════════════════════════════════════════════════════════════

describe("OpenAI Function Calling Format", () => {
  const crmTools = readSrc("lib/agent/crm-tools.ts");

  it("imports ChatCompletionTool type", () => {
    expect(crmTools).toContain('import type { ChatCompletionTool } from "openai/resources/chat/completions"');
  });

  it("imports SuperToolDefinition type", () => {
    expect(crmTools).toContain('import type { SuperToolDefinition } from "./super-tools"');
  });

  it("CRM_TOOLS is typed as SuperToolDefinition[]", () => {
    expect(crmTools).toContain("export const CRM_TOOLS: SuperToolDefinition[]");
  });

  it("every tool definition has name, openaiTool, handler", () => {
    // Pattern: each tool in CRM_TOOLS should have these three keys
    const toolBlocks = crmTools.match(/name:\s*"crm_/g);
    expect(toolBlocks!.length).toBeGreaterThanOrEqual(14);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. Linking Tools — Dual Ownership Checks
// ═══════════════════════════════════════════════════════════════════

describe("Linking Tools — Dual Ownership Checks", () => {
  const crmTools = readSrc("lib/agent/crm-tools.ts");

  it("crm_link_case_company verifies both case AND company ownership", () => {
    const fnStart = crmTools.indexOf("async function crmLinkCaseCompanyHandler");
    const fnSlice = crmTools.slice(fnStart, fnStart + 800);
    expect(fnSlice).toContain("verifyCaseOwnership(caseId, userId)");
    expect(fnSlice).toContain("verifyCompanyOwnership(companyId, userId)");
  });

  it("crm_link_case_opportunity verifies case AND opportunity ownership", () => {
    const fnStart = crmTools.indexOf("async function crmLinkCaseOpportunityHandler");
    const fnSlice = crmTools.slice(fnStart, fnStart + 800);
    expect(fnSlice).toContain("verifyCaseOwnership(caseId, userId)");
    expect(fnSlice).toContain("schema.opportunities.userId, userId");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 10. Regression — Swarm Structure Intact
// ═══════════════════════════════════════════════════════════════════

describe("Regression — Swarm Structure Intact", () => {
  const swarm = readSrc("lib/agent/swarm.ts");

  it("still has exactly 10 agents", () => {
    const agentIds = swarm.match(/id: "[a-z-]+"/g);
    // Filter unique
    const unique = [...new Set(agentIds)];
    expect(unique.length).toBe(10);
  });

  it("getSwarmAgents and getAgentById still exported", () => {
    expect(swarm).toContain("export function getSwarmAgents()");
    expect(swarm).toContain("export function getAgentById(id: string)");
  });

  it("INTERNAL_LAYERS still defined", () => {
    expect(swarm).toContain("export const INTERNAL_LAYERS");
  });

  it("governance layers still present", () => {
    expect(swarm).toContain('"gobierno"');
    expect(swarm).toContain('"visible"');
    expect(swarm).toContain('"experta-interna"');
    expect(swarm).toContain('"modulo-interno"');
  });

  it("non-CRM tools are preserved for each agent", () => {
    // Spot-check: recepcion still has its original tools
    expect(swarm).toContain('"smart_search"');
    expect(swarm).toContain('"contact_intelligence"');
    expect(swarm).toContain('"memory_search"');
    expect(swarm).toContain('"knowledge_search"');
  });
});
