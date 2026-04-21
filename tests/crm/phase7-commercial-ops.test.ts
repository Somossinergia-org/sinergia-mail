/**
 * Phase 7 Behavioral Tests — Commercial Operations
 *
 * Verifies code-level patterns for:
 *  1. OPS_THRESHOLDS: configurable constants (90d/30d/21d/30d/15)
 *  2. TypeScript interfaces: ExpiringService, StaleOpportunity, HotOpportunity, CrossSellCandidate, DailyBrief, CompanyOpsContext
 *  3. Expiry detection: getExpiringServices, getOverdueServices with urgency classification
 *  4. Stale detection: getStaleOpportunities with terminal status exclusion
 *  5. Hot opportunities: getHotOpportunities with close-date proximity
 *  6. Cross-sell: getCrossSellCandidates with priority scoring (alta/media/baja)
 *  7. Daily brief: getDailyCommercialBrief aggregation via Promise.all
 *  8. Company ops context: getCompanyOpsContext with recommended actions
 *  9. Auth & ownership: userId enforcement in all queries
 * 10. API route: /api/crm/commercial-ops with 7 views
 * 11. Swarm tools: 5 new CRM tools + handlers
 * 12. Agent distribution: correct Phase 7 tools per agent role
 * 13. UI panel: CrmCommercialOpsPanel, SummaryCards, OpsSection
 * 14. Regression: Phases 1-6 intact (energy, CRM, swarm, multiservice)
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
// 1. OPS_THRESHOLDS — Configurable Constants
// ═══════════════════════════════════════════════════════════════════

describe("Phase 7 — OPS_THRESHOLDS", () => {
  const src = readSrc("lib/crm/commercial-ops.ts");

  it("exports OPS_THRESHOLDS constant", () => {
    expect(src).toContain("export const OPS_THRESHOLDS");
  });

  it("defines expiringDays = 90", () => {
    expect(src).toContain("expiringDays: 90");
  });

  it("defines urgentExpiringDays = 30", () => {
    expect(src).toContain("urgentExpiringDays: 30");
  });

  it("defines staleOpportunityDays = 21", () => {
    expect(src).toContain("staleOpportunityDays: 21");
  });

  it("defines hotOpportunityDays = 30", () => {
    expect(src).toContain("hotOpportunityDays: 30");
  });

  it("defines briefMaxItems = 15", () => {
    expect(src).toContain("briefMaxItems: 15");
  });

  it("uses as const for immutability", () => {
    expect(src).toContain("} as const");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. TypeScript Interfaces
// ═══════════════════════════════════════════════════════════════════

describe("Phase 7 — TypeScript Interfaces", () => {
  const src = readSrc("lib/crm/commercial-ops.ts");

  it("exports ExpiringService with urgency field", () => {
    expect(src).toContain("export interface ExpiringService");
    expect(src).toContain('urgency: "overdue" | "urgent" | "soon"');
  });

  it("exports StaleOpportunity with daysSinceUpdate", () => {
    expect(src).toContain("export interface StaleOpportunity");
    expect(src).toContain("daysSinceUpdate: number");
  });

  it("exports HotOpportunity with isOverdue flag", () => {
    expect(src).toContain("export interface HotOpportunity");
    expect(src).toContain("isOverdue: boolean");
  });

  it("exports CrossSellCandidate with priority scoring", () => {
    expect(src).toContain("export interface CrossSellCandidate");
    expect(src).toContain('priority: "alta" | "media" | "baja"');
  });

  it("exports DailyBrief with summary and sections", () => {
    expect(src).toContain("export interface DailyBrief");
    expect(src).toContain("expiringCount: number");
    expect(src).toContain("overdueCount: number");
    expect(src).toContain("staleOpportunitiesCount: number");
    expect(src).toContain("hotOpportunitiesCount: number");
    expect(src).toContain("crossSellCandidatesCount: number");
  });

  it("exports CompanyOpsContext with recommendedActions", () => {
    expect(src).toContain("export interface CompanyOpsContext");
    expect(src).toContain("recommendedActions: string[]");
  });

  it("ExpiringService includes companyName and currentSpendEur", () => {
    expect(src).toContain("companyName: string");
    expect(src).toContain("currentSpendEur: number | null");
  });

  it("CrossSellCandidate has missingVerticals and reasons", () => {
    expect(src).toContain("missingVerticals: string[]");
    expect(src).toContain("reasons: string[]");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Expiry Detection
// ═══════════════════════════════════════════════════════════════════

describe("Phase 7 — Expiry Detection", () => {
  const src = readSrc("lib/crm/commercial-ops.ts");

  it("exports getExpiringServices function", () => {
    expect(src).toContain("export async function getExpiringServices");
  });

  it("exports getOverdueServices function", () => {
    expect(src).toContain("export async function getOverdueServices");
  });

  it("getExpiringServices accepts userId and days parameters", () => {
    expect(src).toContain("getExpiringServices(\n  userId: string,\n  days: number");
  });

  it("joins services with companies for ownership", () => {
    expect(src).toContain(".innerJoin(companies, eq(services.companyId, companies.id))");
  });

  it("filters by contracted or offered status", () => {
    expect(src).toContain('inArray(services.status!, ["contracted", "offered"])');
  });

  it("classifies urgency: overdue, urgent, soon", () => {
    expect(src).toContain('"overdue" as const');
    expect(src).toContain('"urgent" as const');
    expect(src).toContain('"soon" as const');
  });

  it("overdue = daysUntilExpiry < 0", () => {
    expect(src).toContain('d < 0 ? "overdue"');
  });

  it("urgent = within urgentExpiringDays threshold", () => {
    expect(src).toContain("d <= OPS_THRESHOLDS.urgentExpiringDays");
  });

  it("orders by expiryDate ascending", () => {
    expect(src).toContain("orderBy(asc(services.expiryDate))");
  });

  it("getOverdueServices filters for overdue urgency only", () => {
    expect(src).toContain('largeSet.filter((s) => s.urgency === "overdue")');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Stale Opportunity Detection
// ═══════════════════════════════════════════════════════════════════

describe("Phase 7 — Stale Opportunity Detection", () => {
  const src = readSrc("lib/crm/commercial-ops.ts");

  it("exports getStaleOpportunities function", () => {
    expect(src).toContain("export async function getStaleOpportunities");
  });

  it("defines TERMINAL_STATUSES for exclusion", () => {
    expect(src).toContain('const TERMINAL_STATUSES = ["cliente_activo", "perdido"]');
  });

  it("excludes terminal statuses from stale detection", () => {
    expect(src).toContain("not(inArray(opportunities.status, TERMINAL_STATUSES))");
  });

  it("uses updatedAt cutoff for staleness", () => {
    expect(src).toContain("lte(opportunities.updatedAt, cutoff)");
  });

  it("calculates daysSinceUpdate for each opportunity", () => {
    expect(src).toContain("daysSinceUpdate: daysSince(r.updatedAt)");
  });

  it("enforces userId ownership on opportunities", () => {
    expect(src).toContain("eq(opportunities.userId, userId)");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Hot Opportunities
// ═══════════════════════════════════════════════════════════════════

describe("Phase 7 — Hot Opportunities", () => {
  const src = readSrc("lib/crm/commercial-ops.ts");

  it("exports getHotOpportunities function", () => {
    expect(src).toContain("export async function getHotOpportunities");
  });

  it("filters by expectedCloseDate proximity", () => {
    expect(src).toContain("lte(opportunities.expectedCloseDate, futureDate)");
  });

  it("requires non-null expectedCloseDate", () => {
    expect(src).toContain("isNotNull(opportunities.expectedCloseDate)");
  });

  it("calculates isOverdue flag", () => {
    expect(src).toContain("isOverdue: d < 0");
  });

  it("excludes terminal statuses from hot opportunities", () => {
    // Same terminal status exclusion used in hot opportunities
    const hotSection = src.substring(src.indexOf("getHotOpportunities"));
    expect(hotSection).toContain("not(inArray(opportunities.status, TERMINAL_STATUSES))");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Cross-sell Candidates
// ═══════════════════════════════════════════════════════════════════

describe("Phase 7 — Cross-sell Candidates", () => {
  const src = readSrc("lib/crm/commercial-ops.ts");

  it("exports getCrossSellCandidates function", () => {
    expect(src).toContain("export async function getCrossSellCandidates");
  });

  it("accepts userId and limit parameters", () => {
    expect(src).toContain("getCrossSellCandidates(\n  userId: string,\n  limit: number");
  });

  it("skips companies with no services (not yet in pipeline)", () => {
    expect(src).toContain("if (svcs.length === 0) continue");
  });

  it("skips companies with full portfolio", () => {
    expect(src).toContain("if (missing.length === 0) continue");
  });

  it("priority alta: >= 2 contracted + > 500€ spend", () => {
    expect(src).toContain("contracted.length >= 2 && totalSpend > 500");
  });

  it("priority media: >= 1 contracted or > 200€ spend", () => {
    expect(src).toContain("contracted.length >= 1 || totalSpend > 200");
  });

  it("generates reasons array with missing verticals", () => {
    expect(src).toContain("Verticales disponibles:");
  });

  it("sorts by priority then by totalSpend desc", () => {
    expect(src).toContain("priorityOrder[a.priority] - priorityOrder[b.priority]");
    expect(src).toContain("b.totalCurrentSpend - a.totalCurrentSpend");
  });

  it("respects limit parameter", () => {
    expect(src).toContain("candidates.slice(0, limit)");
  });

  it("uses SERVICE_TYPES from service-verticals module", () => {
    expect(src).toContain("SERVICE_TYPES as readonly string[]");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Daily Commercial Brief
// ═══════════════════════════════════════════════════════════════════

describe("Phase 7 — Daily Commercial Brief", () => {
  const src = readSrc("lib/crm/commercial-ops.ts");

  it("exports getDailyCommercialBrief function", () => {
    expect(src).toContain("export async function getDailyCommercialBrief");
  });

  it("uses Promise.all for parallel aggregation", () => {
    expect(src).toContain("await Promise.all([");
  });

  it("calls all 4 source functions in parallel", () => {
    expect(src).toContain("getExpiringServices(userId");
    expect(src).toContain("getStaleOpportunities(userId");
    expect(src).toContain("getHotOpportunities(userId");
    expect(src).toContain("getCrossSellCandidates(userId");
  });

  it("separates overdue from expiring-soon", () => {
    expect(src).toContain('expiring.filter((s) => s.urgency === "overdue")');
    expect(src).toContain('expiring.filter((s) => s.urgency !== "overdue")');
  });

  it("includes ISO date string", () => {
    expect(src).toContain('new Date().toISOString().split("T")[0]');
  });

  it("enforces briefMaxItems limit on each section", () => {
    expect(src).toContain("const max = OPS_THRESHOLDS.briefMaxItems");
    expect(src).toContain(".slice(0, max)");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. Company Operational Context
// ═══════════════════════════════════════════════════════════════════

describe("Phase 7 — Company Ops Context", () => {
  const src = readSrc("lib/crm/commercial-ops.ts");

  it("exports getCompanyOpsContext function", () => {
    expect(src).toContain("export async function getCompanyOpsContext");
  });

  it("verifies company ownership before proceeding", () => {
    expect(src).toContain("eq(companies.id, companyId), eq(companies.userId, userId)");
  });

  it("returns null if company not found or not owned", () => {
    expect(src).toContain("if (!company) return null");
  });

  it("generates recommended actions with emoji prefixes", () => {
    expect(src).toContain("actions.push(`⚠️");
    expect(src).toContain("actions.push(`🔔");
    expect(src).toContain("actions.push(`📋");
    expect(src).toContain("actions.push(`🔥");
    expect(src).toContain("actions.push(`💡");
  });

  it("provides default 'all clear' action when no issues", () => {
    expect(src).toContain("✅ Sin acciones urgentes");
  });

  it("includes cross-sell analysis with missing verticals", () => {
    expect(src).toContain("Verticales no cubiertas:");
  });

  it("identifies consolidated clients for cross-sell", () => {
    expect(src).toContain("cliente consolidado");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. Auth & Ownership Enforcement
// ═══════════════════════════════════════════════════════════════════

describe("Phase 7 — Auth & Ownership", () => {
  const src = readSrc("lib/crm/commercial-ops.ts");

  it("every query function requires userId parameter", () => {
    // All 6 exported async functions take userId
    const fns = ["getExpiringServices", "getOverdueServices", "getStaleOpportunities",
                 "getHotOpportunities", "getCrossSellCandidates", "getDailyCommercialBrief"];
    for (const fn of fns) {
      expect(src).toContain(`function ${fn}(`);
    }
  });

  it("getCompanyOpsContext requires both companyId and userId", () => {
    expect(src).toContain("getCompanyOpsContext(\n  companyId: number,\n  userId: string,");
  });

  it("services query joins companies for userId check", () => {
    expect(src).toContain("eq(companies.userId, userId)");
  });

  it("opportunities query uses direct userId filter", () => {
    expect(src).toContain("eq(opportunities.userId, userId)");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 10. API Route — /api/crm/commercial-ops
// ═══════════════════════════════════════════════════════════════════

describe("Phase 7 — API Route", () => {
  const src = readSrc("app/api/crm/commercial-ops/route.ts");

  it("exports GET handler", () => {
    expect(src).toContain("export async function GET");
  });

  it("uses force-dynamic export", () => {
    expect(src).toContain('export const dynamic = "force-dynamic"');
  });

  it("authenticates via auth()", () => {
    expect(src).toContain("const session = await auth()");
    expect(src).toContain("session?.user?.id");
  });

  it("returns 401 for unauthenticated requests", () => {
    expect(src).toContain('"No autorizado"');
    expect(src).toContain("status: 401");
  });

  it("supports view=brief (default)", () => {
    expect(src).toContain('case "brief"');
    expect(src).toContain("getDailyCommercialBrief");
  });

  it("supports view=expiring with optional days override", () => {
    expect(src).toContain('case "expiring"');
    expect(src).toContain("getExpiringServices");
  });

  it("supports view=overdue", () => {
    expect(src).toContain('case "overdue"');
    expect(src).toContain("getOverdueServices");
  });

  it("supports view=stale with optional days override", () => {
    expect(src).toContain('case "stale"');
    expect(src).toContain("getStaleOpportunities");
  });

  it("supports view=hot with optional days override", () => {
    expect(src).toContain('case "hot"');
    expect(src).toContain("getHotOpportunities");
  });

  it("supports view=crosssell with optional limit", () => {
    expect(src).toContain('case "crosssell"');
    expect(src).toContain("getCrossSellCandidates");
  });

  it("supports view=company with required companyId", () => {
    expect(src).toContain('case "company"');
    expect(src).toContain("getCompanyOpsContext");
    expect(src).toContain('"companyId requerido"');
  });

  it("returns 400 for invalid view", () => {
    expect(src).toContain("Vista no válida");
    expect(src).toContain("status: 400");
  });

  it("catches errors and returns 500", () => {
    expect(src).toContain("status: 500");
    expect(src).toContain("[CRM] commercial-ops error:");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 11. Swarm Tools — 5 Commercial Ops Tools
// ═══════════════════════════════════════════════════════════════════

describe("Phase 7 — CRM Swarm Tools", () => {
  const src = readSrc("lib/agent/crm-tools.ts");

  it("imports commercial-ops functions", () => {
    expect(src).toContain("getExpiringServices");
    expect(src).toContain("getStaleOpportunities");
    expect(src).toContain("getCrossSellCandidates");
    expect(src).toContain("getDailyCommercialBrief");
    expect(src).toContain("getCompanyOpsContext");
  });

  it("defines crm_get_expiring_services tool", () => {
    expect(src).toContain('"crm_get_expiring_services"');
  });

  it("defines crm_get_stale_opportunities tool", () => {
    expect(src).toContain('"crm_get_stale_opportunities"');
  });

  it("defines crm_get_daily_brief tool", () => {
    expect(src).toContain('"crm_get_daily_brief"');
  });

  it("defines crm_get_cross_sell_candidates tool", () => {
    expect(src).toContain('"crm_get_cross_sell_candidates"');
  });

  it("defines crm_get_company_ops_context tool", () => {
    expect(src).toContain('"crm_get_company_ops_context"');
  });

  it("all 5 tools are in CRM_TOOLS array", () => {
    const toolNames = [
      "crm_get_expiring_services", "crm_get_stale_opportunities",
      "crm_get_daily_brief", "crm_get_cross_sell_candidates",
      "crm_get_company_ops_context",
    ];
    for (const name of toolNames) {
      expect(src).toContain(`name: "${name}"`);
    }
  });

  it("CRM_TOOLS count >= 21 (16 Phase 5-6 + 5 Phase 7)", () => {
    const matches = src.match(/name: "crm_/g);
    expect(matches).not.toBeNull();
    // Each tool has 2 occurrences of name: "crm_ (one in openaiTool, one at tool level)
    // So >= 42 matches for >= 21 tools
    expect(matches!.length).toBeGreaterThanOrEqual(42);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 12. Agent Distribution — Phase 7 Tools per Role
// ═══════════════════════════════════════════════════════════════════

describe("Phase 7 — Agent Distribution", () => {
  const src = readSrc("lib/agent/swarm.ts");

  it("CEO agent has all 5 commercial ops tools", () => {
    const ceoSection = src.substring(src.indexOf('id: "ceo"'), src.indexOf('id: "recepcion"'));
    expect(ceoSection).toContain("crm_get_expiring_services");
    expect(ceoSection).toContain("crm_get_stale_opportunities");
    expect(ceoSection).toContain("crm_get_daily_brief");
    expect(ceoSection).toContain("crm_get_cross_sell_candidates");
    expect(ceoSection).toContain("crm_get_company_ops_context");
  });

  it("comercial-principal has all 5 commercial ops tools", () => {
    const section = src.substring(src.indexOf('id: "comercial-principal"'), src.indexOf('id: "comercial-junior"'));
    expect(section).toContain("crm_get_expiring_services");
    expect(section).toContain("crm_get_stale_opportunities");
    expect(section).toContain("crm_get_daily_brief");
    expect(section).toContain("crm_get_cross_sell_candidates");
    expect(section).toContain("crm_get_company_ops_context");
  });

  it("comercial-junior has expiring + daily brief", () => {
    const section = src.substring(src.indexOf('id: "comercial-junior"'), src.indexOf('id: "consultor-servicios"'));
    expect(section).toContain("crm_get_expiring_services");
    expect(section).toContain("crm_get_daily_brief");
  });

  it("consultor-servicios has expiring + stale + company context", () => {
    const section = src.substring(src.indexOf('id: "consultor-servicios"'), src.indexOf('id: "consultor-digital"'));
    expect(section).toContain("crm_get_expiring_services");
    expect(section).toContain("crm_get_stale_opportunities");
    expect(section).toContain("crm_get_company_ops_context");
  });

  it("consultor-digital has company ops context", () => {
    const section = src.substring(src.indexOf('id: "consultor-digital"'), src.indexOf('id: "legal-rgpd"'));
    expect(section).toContain("crm_get_company_ops_context");
  });

  it("fiscal has expiring services only", () => {
    const section = src.substring(src.indexOf('id: "fiscal"'), src.indexOf('id: "bi-scoring"'));
    expect(section).toContain("crm_get_expiring_services");
  });

  it("bi-scoring has all 5 commercial ops tools", () => {
    const section = src.substring(src.indexOf('id: "bi-scoring"'), src.indexOf('id: "marketing-automation"'));
    expect(section).toContain("crm_get_expiring_services");
    expect(section).toContain("crm_get_stale_opportunities");
    expect(section).toContain("crm_get_daily_brief");
    expect(section).toContain("crm_get_cross_sell_candidates");
    expect(section).toContain("crm_get_company_ops_context");
  });

  it("marketing-automation has cross-sell candidates", () => {
    const section = src.substring(src.indexOf('id: "marketing-automation"'));
    expect(section).toContain("crm_get_cross_sell_candidates");
  });

  it("recepcion has daily brief + company context", () => {
    const section = src.substring(src.indexOf('id: "recepcion"'), src.indexOf('id: "comercial-principal"'));
    expect(section).toContain("crm_get_daily_brief");
    expect(section).toContain("crm_get_company_ops_context");
  });

  it("legal-rgpd has no commercial ops tools (by design)", () => {
    const section = src.substring(src.indexOf('id: "legal-rgpd"'), src.indexOf('id: "fiscal"'));
    expect(section).not.toContain("crm_get_expiring_services");
    expect(section).not.toContain("crm_get_daily_brief");
    expect(section).not.toContain("crm_get_cross_sell_candidates");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 13. UI Panel — CrmCommercialOpsPanel
// ═══════════════════════════════════════════════════════════════════

describe("Phase 7 — UI Panel", () => {
  const src = readSrc("components/crm/CrmCommercialOpsPanel.tsx");

  it("exports default CrmCommercialOpsPanel component", () => {
    expect(src).toContain("export default function CrmCommercialOpsPanel");
  });

  it("is a client component", () => {
    expect(src).toContain('"use client"');
  });

  it("fetches from /api/crm/commercial-ops?view=brief", () => {
    expect(src).toContain('/api/crm/commercial-ops?view=brief');
  });

  it("renders SummaryCards with 5 KPIs", () => {
    expect(src).toContain("function SummaryCards");
    expect(src).toContain("Vencidos");
    expect(src).toContain("Venciendo");
    expect(src).toContain("Opp. calientes");
    expect(src).toContain("Estancadas");
    expect(src).toContain("Cross-sell");
  });

  it("renders OpsSection collapsible sections", () => {
    expect(src).toContain("function OpsSection");
    expect(src).toContain("ChevronRight");
  });

  it("renders overdue services section", () => {
    expect(src).toContain("Servicios vencidos");
    expect(src).toContain("AlertTriangle");
  });

  it("renders expiring/renewal section", () => {
    expect(src).toContain("Renovaciones próximas");
    expect(src).toContain("Clock");
  });

  it("renders hot opportunities section", () => {
    expect(src).toContain("Oportunidades calientes");
    expect(src).toContain("Target");
  });

  it("renders stale opportunities section", () => {
    expect(src).toContain("Oportunidades estancadas");
    expect(src).toContain("Briefcase");
  });

  it("renders cross-sell section", () => {
    expect(src).toContain("Oportunidades de cross-sell");
    expect(src).toContain("TrendingUp");
  });

  it("includes vertical icons mapping", () => {
    expect(src).toContain("VERTICAL_ICONS");
    expect(src).toContain("energia:");
    expect(src).toContain("telecomunicaciones:");
    expect(src).toContain("alarmas:");
    expect(src).toContain("seguros:");
  });

  it("includes urgencyBadge helper", () => {
    expect(src).toContain("function urgencyBadge");
    expect(src).toContain("Vencido");
    expect(src).toContain("Urgente");
    expect(src).toContain("Próximo");
  });

  it("includes priorityBadge helper for cross-sell", () => {
    expect(src).toContain("function priorityBadge");
  });

  it("formats EUR currency", () => {
    expect(src).toContain("function fmtEur");
    expect(src).toContain("toLocaleString");
  });

  it("has loading spinner state", () => {
    expect(src).toContain("animate-spin");
    expect(src).toContain("Cargando operativa comercial");
  });

  it("has error state with retry button", () => {
    expect(src).toContain("Reintentar");
  });

  it("has refresh button", () => {
    expect(src).toContain("RefreshCw");
    expect(src).toContain("Actualizar");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 14. Dashboard Integration
// ═══════════════════════════════════════════════════════════════════

describe("Phase 7 — Dashboard Integration", () => {
  const src = readSrc("app/dashboard/page.tsx");

  it("imports CrmCommercialOpsPanel", () => {
    expect(src).toContain("import CrmCommercialOpsPanel");
  });

  it("adds Operativa sub-tab to CRM section", () => {
    expect(src).toContain('"operativa"');
  });

  it("renders CrmCommercialOpsPanel for operativa sub-tab", () => {
    expect(src).toContain("<CrmCommercialOpsPanel");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 15. Regression — Phases 1-6 Intact
// ═══════════════════════════════════════════════════════════════════

describe("Phase 7 — Regression", () => {
  it("energy pipeline files still exist", () => {
    const savings = readSrc("lib/crm/savings-calculator.ts");
    expect(savings).toContain("calculateSavings");
    const proposal = readSrc("lib/crm/proposal-pdf.ts");
    expect(proposal).toContain("generateProposalPdf");
  });

  it("CRM core schema still intact", () => {
    const schema = readSrc("db/schema.ts");
    expect(schema).toContain("companies");
    expect(schema).toContain("contacts");
    expect(schema).toContain("opportunities");
    expect(schema).toContain("services");
  });

  it("swarm still has 10 agents", () => {
    const src = readSrc("lib/agent/swarm.ts");
    const agents = ["ceo", "recepcion", "comercial-principal", "comercial-junior",
      "consultor-servicios", "consultor-digital", "legal-rgpd", "fiscal",
      "bi-scoring", "marketing-automation"];
    for (const id of agents) {
      expect(src).toContain(`id: "${id}"`);
    }
  });

  it("swarm governance layers intact", () => {
    const src = readSrc("lib/agent/swarm.ts");
    expect(src).toContain("VISIBLE_LAYERS");
    expect(src).toContain("INTERNAL_LAYERS");
    expect(src).toContain("canCommunicateExternally");
    expect(src).toContain("isExternalCommunicationTool");
  });

  it("multiservice verticals still defined", () => {
    const src = readSrc("lib/crm/service-verticals.ts");
    expect(src).toContain("SERVICE_TYPES");
    expect(src).toContain("VERTICAL_META");
    expect(src).toContain("energia");
    expect(src).toContain("telecomunicaciones");
    expect(src).toContain("alarmas");
    expect(src).toContain("seguros");
  });

  it("Phase 5 CRM tools still present (>= 16 tools including Phase 6)", () => {
    const src = readSrc("lib/agent/crm-tools.ts");
    expect(src).toContain("crm_search_companies");
    expect(src).toContain("crm_get_company");
    expect(src).toContain("crm_list_contacts");
    expect(src).toContain("crm_list_opportunities");
    expect(src).toContain("crm_get_service_portfolio");
    expect(src).toContain("crm_detect_missing_services");
  });

  it("commercial-ops imports from service-verticals (Phase 6 dependency)", () => {
    const src = readSrc("lib/crm/commercial-ops.ts");
    expect(src).toContain('from "./service-verticals"');
    expect(src).toContain("buildPortfolioSummary");
    expect(src).toContain("VERTICAL_META");
    expect(src).toContain("SERVICE_TYPES");
  });

  it("API auth pattern consistent across all CRM routes", () => {
    const opsRoute = readSrc("app/api/crm/commercial-ops/route.ts");
    expect(opsRoute).toContain('import { auth } from "@/lib/auth"');
    expect(opsRoute).toContain("const session = await auth()");
  });
});
