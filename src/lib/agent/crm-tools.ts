/**
 * CRM & Energy Tools for the Swarm — Phase 5
 *
 * Real tool handlers that connect agents to the CRM backend.
 * Every handler enforces tenant isolation via userId ownership check.
 *
 * Tools:
 *  CRM: crm_search_companies, crm_get_company, crm_list_contacts,
 *       crm_list_opportunities, crm_list_cases, crm_list_services
 *  Energy: crm_list_supply_points, crm_list_energy_bills,
 *          crm_get_energy_bill_stats, crm_calculate_savings, crm_generate_proposal
 *  Linking: crm_link_case_company, crm_link_case_opportunity, crm_get_case_context
 *
 * Context builders:
 *  buildCompanyContext(userId, companyId) — full company snapshot for agent prompts
 *  buildCaseCrmContext(userId, caseId) — CRM context for a case
 */

import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { ToolHandlerResult } from "./tools";
import { listCompanies, getCompany } from "@/lib/crm/companies";
import { listContactsByCompany } from "@/lib/crm/contacts";
import { listOpportunities } from "@/lib/crm/opportunities";
import { listServicesByCompany } from "@/lib/crm/services";
import { buildPortfolioSummary, VERTICAL_META } from "@/lib/crm/service-verticals";
import {
  getExpiringServices,
  getStaleOpportunities,
  getCrossSellCandidates,
  getDailyCommercialBrief,
  getCompanyOpsContext,
} from "@/lib/crm/commercial-ops";
import {
  listActivitiesByCompany,
  getLastActivityForCompany,
  getOverdueFollowUps,
  getRecentActivity,
  createActivity,
  type ActivityType,
} from "@/lib/crm/activities";
import {
  listTasksByCompany,
  createTask,
  getTodayTasks,
  getOverdueTasks,
  getTaskCountsSummary,
} from "@/lib/crm/commercial-tasks";
// Phase 9 — Notifications
import {
  listNotifications,
  listNewNotifications,
  listUrgentNotifications,
  getNotificationSummary,
  updateNotificationStatus,
  markAllSeen,
  type NotificationStatus,
  NOTIFICATION_STATUSES,
} from "@/lib/crm/notifications";
import { executeNotificationRules, type NotificationRulesConfig } from "@/lib/crm/notification-rules";
// Phase 10 — Operational Agenda
import { buildOperationalAgenda, buildWeeklySummary, getCompanyAgenda } from "@/lib/crm/operational-agenda";
// Phase 11 — Executive Metrics (BI)
import {
  getExecutiveSummary,
  getPipelineMetrics,
  getVerticalMetrics,
} from "@/lib/crm/executive-metrics";
import { listSupplyPointsByCompany } from "@/lib/crm/supply-points";
import {
  listEnergyBillsByCompany,
  getEnergyBillsStats,
} from "@/lib/crm/energy-bills";
import { calculateSavingsFromBills } from "@/lib/crm/savings-calculator";
import {
  listCasesByCompany,
  linkCaseToCompany,
  unlinkCaseFromCompany,
  linkCaseToOpportunity,
} from "@/lib/crm/cases-link";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { logger, logError } from "@/lib/logger";
import { fmtEur } from "@/lib/format";

const log = logger.child({ component: "crm-tools" });

// ─── Ownership Helper ─────────────────────────────────────────────────

/**
 * Verify that a company belongs to the given userId.
 * Returns the company or null. All CRM tools MUST call this.
 */
async function verifyCompanyOwnership(companyId: number, userId: string) {
  const company = await getCompany(companyId);
  if (!company || company.userId !== userId) return null;
  return company;
}

/**
 * Verify that a case belongs to the given userId.
 */
async function verifyCaseOwnership(caseId: number, userId: string) {
  const [c] = await db
    .select()
    .from(schema.cases)
    .where(and(eq(schema.cases.id, caseId), eq(schema.cases.userId, userId)))
    .limit(1);
  return c ?? null;
}

// ═══════════════════════════════════════════════════════════════════════
// CRM TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════

// ── 1. crm_search_companies ─────────────────────────────────────────

async function crmSearchCompaniesHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const search = (args.search as string) || undefined;
    const province = (args.province as string) || undefined;
    const limit = Math.min((args.limit as number) || 20, 50);

    const companies = await listCompanies({ userId, search, province, limit });
    return {
      ok: true,
      count: companies.length,
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        nif: c.nif,
        sector: c.sector,
        city: c.city,
        province: c.province,
        phone: c.phone,
        email: c.email,
        source: c.source,
      })),
    };
  } catch (e) {
    logError(log, e, { userId }, "crm_search_companies failed");
    return { ok: false, error: "Error buscando empresas" };
  }
}

// ── 2. crm_get_company ──────────────────────────────────────────────

async function crmGetCompanyHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = args.company_id as number;
    if (!companyId) return { ok: false, error: "company_id requerido" };

    const company = await verifyCompanyOwnership(companyId, userId);
    if (!company) return { ok: false, error: "Empresa no encontrada o sin acceso" };

    return { ok: true, company };
  } catch (e) {
    logError(log, e, { userId }, "crm_get_company failed");
    return { ok: false, error: "Error obteniendo empresa" };
  }
}

// ── 3. crm_list_contacts ────────────────────────────────────────────

async function crmListContactsHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = args.company_id as number;
    if (!companyId) return { ok: false, error: "company_id requerido" };

    if (!(await verifyCompanyOwnership(companyId, userId))) {
      return { ok: false, error: "Empresa no encontrada o sin acceso" };
    }

    const contacts = await listContactsByCompany(companyId);
    return {
      ok: true,
      count: contacts.length,
      contacts: contacts.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        category: c.category,
        temperature: c.temperature,
        score: c.score,
        lastContactedAt: c.lastContactedAt,
      })),
    };
  } catch (e) {
    logError(log, e, { userId }, "crm_list_contacts failed");
    return { ok: false, error: "Error listando contactos" };
  }
}

// ── 4. crm_list_opportunities ───────────────────────────────────────

async function crmListOpportunitiesHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = args.company_id as number;
    if (!companyId) return { ok: false, error: "company_id requerido" };

    if (!(await verifyCompanyOwnership(companyId, userId))) {
      return { ok: false, error: "Empresa no encontrada o sin acceso" };
    }

    const opportunities = await listOpportunities({ userId, companyId });
    return {
      ok: true,
      count: opportunities.length,
      opportunities: opportunities.map((o) => ({
        id: o.id,
        title: o.title,
        status: o.status,
        temperature: o.temperature,
        priority: o.priority,
        estimatedValueEur: o.estimatedValueEur,
        expectedCloseDate: o.expectedCloseDate,
        source: o.source,
        createdAt: o.createdAt,
      })),
    };
  } catch (e) {
    logError(log, e, { userId }, "crm_list_opportunities failed");
    return { ok: false, error: "Error listando oportunidades" };
  }
}

// ── 5. crm_list_cases ───────────────────────────────────────────────

async function crmListCasesHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = args.company_id as number;
    if (!companyId) return { ok: false, error: "company_id requerido" };

    if (!(await verifyCompanyOwnership(companyId, userId))) {
      return { ok: false, error: "Empresa no encontrada o sin acceso" };
    }

    const cases = await listCasesByCompany(companyId, userId);
    return {
      ok: true,
      count: cases.length,
      cases: cases.map((c) => ({
        id: c.id,
        subject: c.subject,
        status: c.status,
        channel: c.channel,
        visibleOwnerId: c.visibleOwnerId,
        interactionCount: c.interactionCount,
        createdAt: c.createdAt,
      })),
    };
  } catch (e) {
    logError(log, e, { userId }, "crm_list_cases failed");
    return { ok: false, error: "Error listando casos" };
  }
}

// ── 6. crm_list_services ────────────────────────────────────────────

async function crmListServicesHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = args.company_id as number;
    if (!companyId) return { ok: false, error: "company_id requerido" };

    if (!(await verifyCompanyOwnership(companyId, userId))) {
      return { ok: false, error: "Empresa no encontrada o sin acceso" };
    }

    const services = await listServicesByCompany(companyId);
    return {
      ok: true,
      count: services.length,
      services: services.map((s) => ({
        id: s.id,
        type: s.type,
        status: s.status,
        currentProvider: s.currentProvider,
        currentSpendEur: s.currentSpendEur,
        offeredPriceEur: s.offeredPriceEur,
        estimatedSavings: s.estimatedSavings,
        contractDate: s.contractDate,
        expiryDate: s.expiryDate,
        data: s.data,
        notes: s.notes,
        opportunityId: s.opportunityId,
      })),
    };
  } catch (e) {
    logError(log, e, { userId }, "crm_list_services failed");
    return { ok: false, error: "Error listando servicios" };
  }
}

// ── 6b. crm_get_service_portfolio ──────────────────────────────────

async function crmGetServicePortfolioHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = args.company_id as number;
    if (!companyId) return { ok: false, error: "company_id requerido" };

    if (!(await verifyCompanyOwnership(companyId, userId))) {
      return { ok: false, error: "Empresa no encontrada o sin acceso" };
    }

    const services = await listServicesByCompany(companyId);
    const portfolio = buildPortfolioSummary(services);
    return { ok: true, portfolio };
  } catch (e) {
    logError(log, e, { userId }, "crm_get_service_portfolio failed");
    return { ok: false, error: "Error obteniendo portfolio de servicios" };
  }
}

// ── 6c. crm_detect_missing_services ────────────────────────────────

async function crmDetectMissingServicesHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = args.company_id as number;
    if (!companyId) return { ok: false, error: "company_id requerido" };

    if (!(await verifyCompanyOwnership(companyId, userId))) {
      return { ok: false, error: "Empresa no encontrada o sin acceso" };
    }

    const services = await listServicesByCompany(companyId);
    const portfolio = buildPortfolioSummary(services);

    // Build upsell opportunities
    const upsellOpportunities = portfolio.missingVerticals.map((type) => ({
      vertical: type,
      label: VERTICAL_META[type]?.label ?? type,
      reason: `La empresa no tiene ningún servicio de tipo ${VERTICAL_META[type]?.label ?? type}`,
    }));

    // Detect expiring services (within 90 days)
    const now = new Date();
    const expiringSoon = services
      .filter((s) => {
        if (!s.expiryDate || s.status === "cancelled") return false;
        const diff = new Date(s.expiryDate).getTime() - now.getTime();
        return diff > 0 && diff < 90 * 24 * 60 * 60 * 1000;
      })
      .map((s) => ({
        serviceId: s.id,
        type: s.type,
        currentProvider: s.currentProvider,
        expiryDate: s.expiryDate,
      }));

    return {
      ok: true,
      activeVerticals: portfolio.activeVerticals,
      missingVerticals: portfolio.missingVerticals,
      upsellOpportunities,
      expiringSoon,
      totalServices: portfolio.totalServices,
    };
  } catch (e) {
    logError(log, e, { userId }, "crm_detect_missing_services failed");
    return { ok: false, error: "Error detectando servicios faltantes" };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ENERGY TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════

// ── 7. crm_list_supply_points ───────────────────────────────────────

async function crmListSupplyPointsHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = args.company_id as number;
    if (!companyId) return { ok: false, error: "company_id requerido" };

    if (!(await verifyCompanyOwnership(companyId, userId))) {
      return { ok: false, error: "Empresa no encontrada o sin acceso" };
    }

    const sps = await listSupplyPointsByCompany(companyId);
    return {
      ok: true,
      count: sps.length,
      supplyPoints: sps.map((sp) => ({
        id: sp.id,
        cups: sp.cups,
        address: sp.address,
        tariff: sp.tariff,
        currentRetailer: sp.currentRetailer,
        powerP1Kw: sp.powerP1Kw,
        powerP2Kw: sp.powerP2Kw,
        annualConsumptionKwh: sp.annualConsumptionKwh,
        monthlySpendEur: sp.monthlySpendEur,
        status: sp.status,
      })),
    };
  } catch (e) {
    logError(log, e, { userId }, "crm_list_supply_points failed");
    return { ok: false, error: "Error listando suministros" };
  }
}

// ── 8. crm_list_energy_bills ────────────────────────────────────────

async function crmListEnergyBillsHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = args.company_id as number;
    if (!companyId) return { ok: false, error: "company_id requerido" };

    // listEnergyBillsByCompany already verifies ownership internally
    const bills = await listEnergyBillsByCompany(companyId, userId);
    return {
      ok: true,
      count: bills.length,
      bills: bills.map((b) => ({
        id: b.id,
        cups: b.cups,
        billingPeriodStart: b.billingPeriodStart,
        billingPeriodEnd: b.billingPeriodEnd,
        retailer: b.retailer,
        totalAmountEur: b.totalAmountEur,
        confidenceScore: b.confidenceScore,
      })),
    };
  } catch (e) {
    logError(log, e, { userId }, "crm_list_energy_bills failed");
    return { ok: false, error: "Error listando facturas energéticas" };
  }
}

// ── 9. crm_get_energy_bill_stats ────────────────────────────────────

async function crmGetEnergyBillStatsHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = args.company_id as number;
    if (!companyId) return { ok: false, error: "company_id requerido" };

    if (!(await verifyCompanyOwnership(companyId, userId))) {
      return { ok: false, error: "Empresa no encontrada o sin acceso" };
    }

    const stats = await getEnergyBillsStats(companyId);
    return { ok: true, stats };
  } catch (e) {
    logError(log, e, { userId }, "crm_get_energy_bill_stats failed");
    return { ok: false, error: "Error obteniendo estadísticas de facturas" };
  }
}

// ── 10. crm_calculate_savings ───────────────────────────────────────

async function crmCalculateSavingsHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = args.company_id as number;
    if (!companyId) return { ok: false, error: "company_id requerido" };

    const bills = await listEnergyBillsByCompany(companyId, userId);
    if (bills.length === 0) {
      return { ok: false, error: "No hay facturas para calcular ahorro" };
    }

    // Cast to EnergyBill[] shape for the calculator
    const savings = calculateSavingsFromBills(bills as any);
    return {
      ok: true,
      currentProvider: savings.currentProvider,
      currentAnnualCost: savings.currentAnnualCost,
      bestAlternative: savings.bestAlternative,
      potentialSavingsEur: savings.potentialSavingsEur,
      potentialSavingsPct: savings.potentialSavingsPct,
      recommendations: savings.recommendations,
      topComparisons: savings.allComparisons.slice(0, 5).map((c) => ({
        provider: c.provider,
        tariffName: c.tariffName,
        type: c.type,
        estimatedAnnualCost: c.estimatedAnnualCost,
        savingsVsCurrent: c.savingsVsCurrent,
      })),
    };
  } catch (e) {
    logError(log, e, { userId }, "crm_calculate_savings failed");
    return { ok: false, error: "Error calculando ahorro" };
  }
}

// ── 11. crm_generate_proposal ───────────────────────────────────────
// Note: This returns metadata, not the PDF binary. The agent can reference
// the proposal endpoint or inform the user they can download it from the UI.

async function crmGenerateProposalHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = args.company_id as number;
    if (!companyId) return { ok: false, error: "company_id requerido" };

    const company = await verifyCompanyOwnership(companyId, userId);
    if (!company) return { ok: false, error: "Empresa no encontrada o sin acceso" };

    const bills = await listEnergyBillsByCompany(companyId, userId);
    if (bills.length === 0) {
      return { ok: false, error: "No hay facturas para generar propuesta" };
    }

    const savings = calculateSavingsFromBills(bills as any);

    return {
      ok: true,
      proposalReady: true,
      companyName: company.name,
      currentProvider: savings.currentProvider,
      currentAnnualCost: fmtEur(savings.currentAnnualCost),
      bestAlternative: `${savings.bestAlternative.provider} (${savings.bestAlternative.tariffName})`,
      potentialSavings: `${fmtEur(savings.potentialSavingsEur)}€/año (${savings.potentialSavingsPct}%)`,
      recommendations: savings.recommendations,
      downloadEndpoint: `/api/crm/energy-bills/proposal`,
      message: `Propuesta lista para ${company.name}. El usuario puede descargar el PDF desde la pestaña Energía de la empresa.`,
    };
  } catch (e) {
    logError(log, e, { userId }, "crm_generate_proposal failed");
    return { ok: false, error: "Error generando propuesta" };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LINKING / CONTEXT TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════

// ── 12. crm_link_case_company ───────────────────────────────────────

async function crmLinkCaseCompanyHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const caseId = args.case_id as number;
    const companyId = args.company_id as number;
    if (!caseId || !companyId) return { ok: false, error: "case_id y company_id requeridos" };

    // Verify ownership of both
    if (!(await verifyCaseOwnership(caseId, userId))) {
      return { ok: false, error: "Caso no encontrado o sin acceso" };
    }
    if (!(await verifyCompanyOwnership(companyId, userId))) {
      return { ok: false, error: "Empresa no encontrada o sin acceso" };
    }

    const updated = await linkCaseToCompany(caseId, companyId);
    return { ok: true, case: updated, message: `Caso ${caseId} vinculado a empresa ${companyId}` };
  } catch (e) {
    logError(log, e, { userId }, "crm_link_case_company failed");
    return { ok: false, error: "Error vinculando caso a empresa" };
  }
}

// ── 13. crm_link_case_opportunity ───────────────────────────────────

async function crmLinkCaseOpportunityHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const caseId = args.case_id as number;
    const opportunityId = args.opportunity_id as number;
    if (!caseId || !opportunityId) return { ok: false, error: "case_id y opportunity_id requeridos" };

    if (!(await verifyCaseOwnership(caseId, userId))) {
      return { ok: false, error: "Caso no encontrado o sin acceso" };
    }

    // Verify opportunity belongs to user
    const [opp] = await db
      .select()
      .from(schema.opportunities)
      .where(and(eq(schema.opportunities.id, opportunityId), eq(schema.opportunities.userId, userId)))
      .limit(1);
    if (!opp) return { ok: false, error: "Oportunidad no encontrada o sin acceso" };

    const updated = await linkCaseToOpportunity(caseId, opportunityId);
    return { ok: true, case: updated, message: `Caso ${caseId} vinculado a oportunidad ${opportunityId}` };
  } catch (e) {
    logError(log, e, { userId }, "crm_link_case_opportunity failed");
    return { ok: false, error: "Error vinculando caso a oportunidad" };
  }
}

// ── 14. crm_get_case_context ────────────────────────────────────────

async function crmGetCaseContextHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const caseId = args.case_id as number;
    if (!caseId) return { ok: false, error: "case_id requerido" };

    const caseRecord = await verifyCaseOwnership(caseId, userId);
    if (!caseRecord) return { ok: false, error: "Caso no encontrado o sin acceso" };

    return { ok: true, context: await buildCaseCrmContext(userId, caseId) };
  } catch (e) {
    logError(log, e, { userId }, "crm_get_case_context failed");
    return { ok: false, error: "Error obteniendo contexto CRM del caso" };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CONTEXT BUILDERS — for agent prompts
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a comprehensive company context snapshot for agent prompts.
 * Returns a structured object with all relevant CRM data.
 * Enforces tenant isolation via userId.
 */
export async function buildCompanyContext(userId: string, companyId: number) {
  const company = await verifyCompanyOwnership(companyId, userId);
  if (!company) return null;

  const [contacts, opportunities, services, supplyPoints, billStats] = await Promise.all([
    listContactsByCompany(companyId),
    listOpportunities({ userId, companyId }),
    listServicesByCompany(companyId),
    listSupplyPointsByCompany(companyId),
    getEnergyBillsStats(companyId),
  ]);

  const openOpps = opportunities.filter((o) => !["contrato_firmado", "cliente_activo", "perdido"].includes(o.status));
  const activeServices = services.filter((s) => s.status === "contracted");

  return {
    company: {
      id: company.id,
      name: company.name,
      nif: company.nif,
      sector: company.sector,
      city: company.city,
      province: company.province,
      phone: company.phone,
      email: company.email,
      source: company.source,
    },
    contacts: contacts.slice(0, 10).map((c) => ({
      name: c.name, email: c.email, phone: c.phone, category: c.category,
    })),
    opportunities: {
      total: opportunities.length,
      open: openOpps.length,
      items: openOpps.slice(0, 5).map((o) => ({
        id: o.id, title: o.title, status: o.status, temperature: o.temperature,
        estimatedValueEur: o.estimatedValueEur,
      })),
    },
    services: {
      total: services.length,
      active: activeServices.length,
      types: Array.from(new Set(services.map((s) => s.type))),
      portfolio: buildPortfolioSummary(services),
      items: services.slice(0, 10).map((s) => ({
        type: s.type, status: s.status, currentProvider: s.currentProvider,
        currentSpendEur: s.currentSpendEur, estimatedSavings: s.estimatedSavings,
      })),
    },
    energy: {
      supplyPoints: supplyPoints.length,
      cups: supplyPoints.map((sp) => sp.cups).filter(Boolean),
      totalBills: billStats.totalBills,
      totalCost: billStats.totalCost,
      avgMonthlyCost: billStats.avgMonthlyCost,
      latestBillDate: billStats.latestBillDate,
    },
  };
}

/**
 * Build CRM context for a case. Looks up linked company/opportunity
 * and enriches with full CRM data.
 */
export async function buildCaseCrmContext(userId: string, caseId: number) {
  const caseRecord = await verifyCaseOwnership(caseId, userId);
  if (!caseRecord) return null;

  const result: Record<string, unknown> = {
    caseId: caseRecord.id,
    subject: caseRecord.subject,
    status: caseRecord.status,
    channel: caseRecord.channel,
    visibleOwnerId: caseRecord.visibleOwnerId,
    companyId: caseRecord.companyId,
    opportunityId: caseRecord.opportunityId,
  };

  // Enrich with company context if linked
  if (caseRecord.companyId) {
    const companyCtx = await buildCompanyContext(userId, caseRecord.companyId);
    if (companyCtx) {
      result.companyContext = companyCtx;
    }
  }

  // Enrich with opportunity detail if linked
  if (caseRecord.opportunityId) {
    const [opp] = await db
      .select()
      .from(schema.opportunities)
      .where(and(eq(schema.opportunities.id, caseRecord.opportunityId), eq(schema.opportunities.userId, userId)))
      .limit(1);
    if (opp) {
      result.opportunity = {
        id: opp.id,
        title: opp.title,
        status: opp.status,
        temperature: opp.temperature,
        estimatedValueEur: opp.estimatedValueEur,
        expectedCloseDate: opp.expectedCloseDate,
      };
    }
  }

  return result;
}

// ── Phase 7 — Commercial Ops Handlers ───────────────────────────────

async function crmGetExpiringServicesHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const days = typeof args.days === "number" ? args.days : 90;
    const results = await getExpiringServices(userId, days);
    return {
      ok: true,
      data: {
        total: results.length,
        overdue: results.filter((s) => s.urgency === "overdue").length,
        urgent: results.filter((s) => s.urgency === "urgent").length,
        soon: results.filter((s) => s.urgency === "soon").length,
        services: results.map((s) => ({
          id: s.id, companyName: s.companyName, type: s.type,
          provider: s.currentProvider, spend: s.currentSpendEur,
          expiryDate: s.expiryDate, daysUntilExpiry: s.daysUntilExpiry,
          urgency: s.urgency,
        })),
      },
    };
  } catch (err) {
    logError(log, err, { userId }, "crmGetExpiringServices failed");
    return { ok: false, error: "Error obteniendo servicios venciendo" };
  }
}

async function crmGetStaleOpportunitiesHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const days = typeof args.days === "number" ? args.days : 21;
    const results = await getStaleOpportunities(userId, days);
    return {
      ok: true,
      data: {
        total: results.length,
        opportunities: results.map((o) => ({
          id: o.id, companyName: o.companyName, title: o.title,
          status: o.status, temperature: o.temperature, priority: o.priority,
          value: o.estimatedValueEur, daysSinceUpdate: o.daysSinceUpdate,
        })),
      },
    };
  } catch (err) {
    logError(log, err, { userId }, "crmGetStaleOpportunities failed");
    return { ok: false, error: "Error obteniendo oportunidades estancadas" };
  }
}

async function crmGetDailyBriefHandler(
  userId: string,
  _args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const brief = await getDailyCommercialBrief(userId);
    return { ok: true, data: brief };
  } catch (err) {
    logError(log, err, { userId }, "crmGetDailyBrief failed");
    return { ok: false, error: "Error generando brief diario" };
  }
}

async function crmGetCrossSellCandidatesHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const limit = typeof args.limit === "number" ? args.limit : 15;
    const candidates = await getCrossSellCandidates(userId, limit);
    return {
      ok: true,
      data: {
        total: candidates.length,
        candidates: candidates.map((c) => ({
          companyId: c.companyId, companyName: c.companyName,
          priority: c.priority, contractedCount: c.contractedCount,
          totalSpend: c.totalCurrentSpend, missingVerticals: c.missingVerticals,
          reasons: c.reasons,
        })),
      },
    };
  } catch (err) {
    logError(log, err, { userId }, "crmGetCrossSellCandidates failed");
    return { ok: false, error: "Error obteniendo candidatos de cross-sell" };
  }
}

async function crmGetCompanyOpsContextHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = Number(args.company_id);
    if (!companyId) return { ok: false, error: "company_id requerido" };

    const ctx = await getCompanyOpsContext(companyId, userId);
    if (!ctx) return { ok: false, error: "Empresa no encontrada" };
    return { ok: true, data: ctx };
  } catch (err) {
    logError(log, err, { userId }, "crmGetCompanyOpsContext failed");
    return { ok: false, error: "Error obteniendo contexto operativo" };
  }
}

// ── Phase 8 — Activity & Tasks Handlers ──────────────────────────────

async function crmListCompanyActivitiesHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = Number(args.company_id);
    if (!companyId) return { ok: false, error: "company_id requerido" };
    const company = await verifyCompanyOwnership(companyId, userId);
    if (!company) return { ok: false, error: "Empresa no encontrada" };

    const limit = typeof args.limit === "number" ? args.limit : 20;
    const activities = await listActivitiesByCompany(companyId, userId, limit);
    const lastActivity = await getLastActivityForCompany(companyId, userId);

    return {
      ok: true,
      companyName: company.name,
      lastActivity: lastActivity ? {
        type: lastActivity.type,
        summary: lastActivity.summary,
        date: lastActivity.createdAt,
        nextStep: lastActivity.nextStep,
        dueAt: lastActivity.dueAt,
      } : null,
      total: activities.length,
      activities: activities.map((a) => ({
        id: a.id, type: a.type, summary: a.summary,
        outcome: a.outcome, nextStep: a.nextStep,
        dueAt: a.dueAt, createdAt: a.createdAt,
      })),
    };
  } catch (err) {
    logError(log, err, { userId }, "crmListCompanyActivities failed");
    return { ok: false, error: "Error listando actividad" };
  }
}

async function crmGetPendingFollowupsHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const limit = typeof args.limit === "number" ? args.limit : 20;
    const overdue = await getOverdueFollowUps(userId, limit);
    return {
      ok: true,
      total: overdue.length,
      followUps: overdue.map((f) => ({
        activityId: f.activity.id,
        companyName: f.companyName,
        type: f.activity.type,
        nextStep: f.activity.nextStep,
        dueAt: f.activity.dueAt,
        originalSummary: f.activity.summary,
      })),
    };
  } catch (err) {
    logError(log, err, { userId }, "crmGetPendingFollowups failed");
    return { ok: false, error: "Error obteniendo seguimientos pendientes" };
  }
}

async function crmListCompanyTasksHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = args.company_id ? Number(args.company_id) : undefined;
    const opportunityId = args.opportunity_id ? Number(args.opportunity_id) : undefined;

    if (!companyId && !opportunityId) {
      return { ok: false, error: "company_id o opportunity_id requerido" };
    }

    let tasks;
    if (companyId) {
      tasks = await listTasksByCompany(companyId, userId, false, 30);
    } else {
      const { listTasksByOpportunity: listByOpp } = await import("@/lib/crm/commercial-tasks");
      tasks = await listByOpp(opportunityId!, userId, 30);
    }

    return {
      ok: true,
      total: tasks.length,
      tasks: tasks.map((t) => ({
        id: t.id, title: t.title, priority: t.priority,
        status: t.status, dueAt: t.dueAt, source: t.source,
      })),
    };
  } catch (err) {
    logError(log, err, { userId }, "crmListCompanyTasks failed");
    return { ok: false, error: "Error listando tareas" };
  }
}

async function crmCreateSuggestedTaskHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const title = args.title as string;
    if (!title) return { ok: false, error: "title requerido" };

    const task = await createTask({
      userId,
      companyId: args.company_id ? Number(args.company_id) : null,
      opportunityId: args.opportunity_id ? Number(args.opportunity_id) : null,
      title,
      priority: (args.priority as "alta" | "media" | "baja") ?? "media",
      dueAt: args.due_at ? new Date(args.due_at as string) : null,
      source: (args.source as "suggested" | "followup" | "renewal") ?? "suggested",
    });

    return { ok: true, taskId: task.id, title: task.title, status: task.status };
  } catch (err) {
    logError(log, err, { userId }, "crmCreateSuggestedTask failed");
    return { ok: false, error: "Error creando tarea sugerida" };
  }
}

async function crmLogActivityHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = args.company_id ? Number(args.company_id) : null;
    const type = (args.type as string) ?? "nota";
    const summary = args.summary as string;
    if (!summary) return { ok: false, error: "summary requerido" };
    if (!companyId) return { ok: false, error: "company_id requerido" };

    const activity = await createActivity({
      userId,
      companyId,
      type: type as Parameters<typeof createActivity>[0]["type"],
      summary,
      outcome: (args.outcome as string) ?? null,
      nextStep: (args.next_step as string) ?? null,
      contactId: args.contact_id ? Number(args.contact_id) : null,
      opportunityId: args.opportunity_id ? Number(args.opportunity_id) : null,
    });

    return { ok: true, activityId: activity.id, type: activity.type, summary: activity.summary };
  } catch (err) {
    logError(log, err, { userId }, "crmLogActivity failed");
    return { ok: false, error: "Error registrando actividad" };
  }
}

async function crmGetTodaySummaryHandler(
  userId: string,
  _args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const [todayTasks, overdueTasks, taskCounts, overdueFollowups, recentAct] = await Promise.all([
      getTodayTasks(userId),
      getOverdueTasks(userId, 10),
      getTaskCountsSummary(userId),
      getOverdueFollowUps(userId, 10),
      getRecentActivity(userId, 5),
    ]);

    return {
      ok: true,
      data: {
        taskSummary: taskCounts,
        todayTasks: todayTasks.map((t) => ({
          id: t.task.id, title: t.task.title, priority: t.task.priority,
          companyName: t.companyName, dueAt: t.task.dueAt,
        })),
        overdueTasks: overdueTasks.map((t) => ({
          id: t.task.id, title: t.task.title, priority: t.task.priority,
          companyName: t.companyName, dueAt: t.task.dueAt,
        })),
        overdueFollowUps: overdueFollowups.map((f) => ({
          companyName: f.companyName, nextStep: f.activity.nextStep,
          dueAt: f.activity.dueAt,
        })),
        recentActivity: recentAct.map((a) => ({
          type: a.activity.type, companyName: a.companyName,
          summary: a.activity.summary, date: a.activity.createdAt,
        })),
      },
    };
  } catch (err) {
    logError(log, err, { userId }, "crmGetTodaySummary failed");
    return { ok: false, error: "Error generando resumen del día" };
  }
}

// ── Phase 9 — Notification Handlers ──────────────────────────────────

async function crmListNotificationsHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const filter = (args.filter as string) || "all";
    const limit = typeof args.limit === "number" ? args.limit : 30;

    let notifications;
    if (filter === "new") {
      notifications = await listNewNotifications(userId, limit);
    } else if (filter === "urgent") {
      notifications = await listUrgentNotifications(userId, limit);
    } else {
      notifications = await listNotifications(userId, { limit });
    }

    const summary = await getNotificationSummary(userId);

    return {
      ok: true,
      summary,
      total: notifications.length,
      notifications: notifications.map((n) => ({
        id: n.notification.id,
        type: n.notification.type,
        title: n.notification.title,
        message: n.notification.message,
        severity: n.notification.severity,
        status: n.notification.status,
        companyName: n.companyName,
        companyId: n.notification.companyId,
        createdAt: n.notification.createdAt,
      })),
    };
  } catch (err) {
    logError(log, err, { userId }, "crmListNotifications failed");
    return { ok: false, error: "Error listando notificaciones" };
  }
}

async function crmGenerateNotificationsHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const config: Partial<NotificationRulesConfig> = {};
    if (typeof args.auto_create_tasks === "boolean") {
      config.autoCreateTasks = args.auto_create_tasks;
    }
    if (typeof args.inactivity_days === "number") {
      config.inactivityDays = args.inactivity_days;
    }

    const result = await executeNotificationRules(userId, config);
    return {
      ok: true,
      data: {
        totalNotifications: result.totalNotifications,
        totalTasks: result.totalTasks,
        rules: result.rules.map((r) => ({
          rule: r.rule,
          notificationsCreated: r.notificationsCreated,
          tasksCreated: r.tasksCreated,
          skipped: r.skipped,
        })),
        executedAt: result.executedAt,
      },
    };
  } catch (err) {
    logError(log, err, { userId }, "crmGenerateNotifications failed");
    return { ok: false, error: "Error generando notificaciones" };
  }
}

async function crmUpdateNotificationHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const notifId = Number(args.notification_id);
    if (!notifId) return { ok: false, error: "notification_id requerido" };

    const status = args.status as string;
    if (!status || !NOTIFICATION_STATUSES.includes(status as NotificationStatus)) {
      return { ok: false, error: `Estado no válido. Usa: ${NOTIFICATION_STATUSES.join(", ")}` };
    }

    const updated = await updateNotificationStatus(notifId, userId, status as NotificationStatus);
    if (!updated) return { ok: false, error: "Notificación no encontrada" };

    return { ok: true, notification: { id: updated.id, status: updated.status } };
  } catch (err) {
    logError(log, err, { userId }, "crmUpdateNotification failed");
    return { ok: false, error: "Error actualizando notificación" };
  }
}

// ── Phase 10 — Operational Agenda Handlers ───────────────────────────

async function crmGetAgendaTodayHandler(
  userId: string,
  _args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const agenda = await buildOperationalAgenda(userId);
    return {
      ok: true,
      data: {
        summary: agenda.summary,
        overdue: agenda.overdue.items.slice(0, 15),
        today: agenda.today.items,
        overloadWarning: agenda.summary.overloadWarning,
      },
    };
  } catch (err) {
    logError(log, err, { userId }, "crmGetAgendaToday failed");
    return { ok: false, error: "Error obteniendo agenda de hoy" };
  }
}

async function crmGetAgendaWeekHandler(
  userId: string,
  _args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const weekly = await buildWeeklySummary(userId);
    return {
      ok: true,
      data: {
        topActions: weekly.topActions,
        weekTotals: weekly.weekTotals,
        priorities: weekly.priorities,
        overdueCount: weekly.overdue.length,
        days: weekly.days.map((d) => ({
          date: d.date,
          label: d.dayLabel,
          itemCount: d.items.length,
          tasks: d.taskCount,
          followups: d.followupCount,
          renewals: d.renewalCount,
          items: d.items.slice(0, 10),
        })),
      },
    };
  } catch (err) {
    logError(log, err, { userId }, "crmGetAgendaWeek failed");
    return { ok: false, error: "Error obteniendo agenda semanal" };
  }
}

async function crmGetAgendaCompanyHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const companyId = Number(args.company_id);
    if (!companyId) return { ok: false, error: "company_id requerido" };

    const result = await getCompanyAgenda(userId, companyId);
    return {
      ok: true,
      data: {
        totalItems: result.items.length,
        overdueCount: result.overdue.length,
        upcomingCount: result.upcoming.length,
        overdue: result.overdue,
        upcoming: result.upcoming,
      },
    };
  } catch (err) {
    logError(log, err, { userId }, "crmGetAgendaCompany failed");
    return { ok: false, error: "Error obteniendo agenda de empresa" };
  }
}

// ── Phase 11 — Executive BI Handlers ──────────────────────────────────

async function crmGetExecutiveSummaryHandler(
  userId: string,
  _args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const summary = await getExecutiveSummary(userId);
    return {
      ok: true,
      data: {
        kpis: summary.kpis,
        pipeline: {
          totalActive: summary.pipeline.totalActive,
          closingSoon: summary.pipeline.closingSoon,
          hotValue: summary.pipeline.hotValue,
          wonValue: summary.pipeline.wonValue,
          lostCount: summary.pipeline.lostCount,
        },
        verticals: {
          topVertical: summary.verticals.topVertical,
          worstCovered: summary.verticals.worstCovered,
          totalCurrentSpend: summary.verticals.totalCurrentSpend,
          totalEstimatedSavings: summary.verticals.totalEstimatedSavings,
        },
        operational: summary.operational,
        energy: summary.energy,
        recentActivity: summary.recentActivitySummary,
      },
    };
  } catch (err) {
    logError(log, err, { userId }, "crmGetExecutiveSummary failed");
    return { ok: false, error: "Error obteniendo resumen ejecutivo" };
  }
}

async function crmGetPipelineStatusHandler(
  userId: string,
  _args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const pipeline = await getPipelineMetrics(userId);
    return {
      ok: true,
      data: {
        byStatus: pipeline.byStatus,
        byTemperature: pipeline.byTemperature,
        totalActive: pipeline.totalActive,
        closingSoon: pipeline.closingSoon,
        hotValue: pipeline.hotValue,
        wonValue: pipeline.wonValue,
        lostCount: pipeline.lostCount,
      },
    };
  } catch (err) {
    logError(log, err, { userId }, "crmGetPipelineStatus failed");
    return { ok: false, error: "Error obteniendo estado del pipeline" };
  }
}

async function crmGetVerticalMetricsHandler(
  userId: string,
  _args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const verticals = await getVerticalMetrics(userId);
    return {
      ok: true,
      data: {
        byVertical: verticals.byVertical.map((v) => ({
          vertical: v.vertical,
          label: v.label,
          contracted: v.contracted,
          offered: v.offered,
          prospecting: v.prospecting,
          total: v.total,
          spend: v.currentSpendEur,
          savings: v.estimatedSavingsEur,
        })),
        topVertical: verticals.topVertical,
        worstCovered: verticals.worstCovered,
        totalCurrentSpend: verticals.totalCurrentSpend,
        totalEstimatedSavings: verticals.totalEstimatedSavings,
      },
    };
  } catch (err) {
    logError(log, err, { userId }, "crmGetVerticalMetrics failed");
    return { ok: false, error: "Error obteniendo métricas por vertical" };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS REGISTRY (OpenAI function calling format)
// ═══════════════════════════════════════════════════════════════════════

import type { SuperToolDefinition } from "./super-tools";

export const CRM_TOOLS: SuperToolDefinition[] = [
  // ── CRM ────────────────────────────────────────────────────────────
  {
    name: "crm_search_companies",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_search_companies",
        description: "Buscar empresas en el CRM por nombre, NIF, email, provincia. Devuelve lista resumida. Usar para localizar empresas antes de consultar detalle.",
        parameters: {
          type: "object",
          properties: {
            search: { type: "string", description: "Texto a buscar (nombre, NIF o email)" },
            province: { type: "string", description: "Filtrar por provincia" },
            limit: { type: "number", description: "Máximo resultados (default 20, max 50)" },
          },
        },
      },
    },
    handler: crmSearchCompaniesHandler,
  },
  {
    name: "crm_get_company",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_get_company",
        description: "Obtener detalle completo de una empresa por ID. Incluye datos fiscales, dirección, sector, contacto.",
        parameters: {
          type: "object",
          properties: { company_id: { type: "number", description: "ID de la empresa" } },
          required: ["company_id"],
        },
      },
    },
    handler: crmGetCompanyHandler,
  },
  {
    name: "crm_list_contacts",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_list_contacts",
        description: "Listar contactos vinculados a una empresa. Incluye email, teléfono, scoring, última actividad.",
        parameters: {
          type: "object",
          properties: { company_id: { type: "number", description: "ID de la empresa" } },
          required: ["company_id"],
        },
      },
    },
    handler: crmListContactsHandler,
  },
  {
    name: "crm_list_opportunities",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_list_opportunities",
        description: "Listar oportunidades de venta de una empresa. Incluye estado pipeline (pendiente→cliente_activo), temperatura, valor estimado.",
        parameters: {
          type: "object",
          properties: { company_id: { type: "number", description: "ID de la empresa" } },
          required: ["company_id"],
        },
      },
    },
    handler: crmListOpportunitiesHandler,
  },
  {
    name: "crm_list_cases",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_list_cases",
        description: "Listar casos (tickets/interacciones del swarm) vinculados a una empresa.",
        parameters: {
          type: "object",
          properties: { company_id: { type: "number", description: "ID de la empresa" } },
          required: ["company_id"],
        },
      },
    },
    handler: crmListCasesHandler,
  },
  {
    name: "crm_list_services",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_list_services",
        description: "Listar servicios contratados/ofertados a una empresa. Tipos: energia, telecomunicaciones, alarmas, seguros, agentes_ia, web, crm, aplicaciones.",
        parameters: {
          type: "object",
          properties: { company_id: { type: "number", description: "ID de la empresa" } },
          required: ["company_id"],
        },
      },
    },
    handler: crmListServicesHandler,
  },
  {
    name: "crm_get_service_portfolio",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_get_service_portfolio",
        description: "Obtener resumen del portfolio multiservicio de una empresa: verticales activos/faltantes, contratados/ofertados por tipo, gasto total, ahorro estimado. Ideal para detectar oportunidades de cross-sell.",
        parameters: {
          type: "object",
          properties: { company_id: { type: "number", description: "ID de la empresa" } },
          required: ["company_id"],
        },
      },
    },
    handler: crmGetServicePortfolioHandler,
  },
  {
    name: "crm_detect_missing_services",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_detect_missing_services",
        description: "Detectar servicios que la empresa NO tiene contratados ni ofertados (oportunidades de upsell) y servicios próximos a vencer (renovación). Devuelve verticales faltantes y servicios expirando en 90 días.",
        parameters: {
          type: "object",
          properties: { company_id: { type: "number", description: "ID de la empresa" } },
          required: ["company_id"],
        },
      },
    },
    handler: crmDetectMissingServicesHandler,
  },

  // ── ENERGY ─────────────────────────────────────────────────────────
  {
    name: "crm_list_supply_points",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_list_supply_points",
        description: "Listar puntos de suministro eléctrico de una empresa. Incluye CUPS, tarifa, potencia, comercializadora actual.",
        parameters: {
          type: "object",
          properties: { company_id: { type: "number", description: "ID de la empresa" } },
          required: ["company_id"],
        },
      },
    },
    handler: crmListSupplyPointsHandler,
  },
  {
    name: "crm_list_energy_bills",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_list_energy_bills",
        description: "Listar facturas energéticas parseadas de una empresa. Incluye periodo, comercializadora, importe, confianza del parseo.",
        parameters: {
          type: "object",
          properties: { company_id: { type: "number", description: "ID de la empresa" } },
          required: ["company_id"],
        },
      },
    },
    handler: crmListEnergyBillsHandler,
  },
  {
    name: "crm_get_energy_bill_stats",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_get_energy_bill_stats",
        description: "Obtener estadísticas agregadas de facturas energéticas: total facturas, coste total, media mensual, última fecha.",
        parameters: {
          type: "object",
          properties: { company_id: { type: "number", description: "ID de la empresa" } },
          required: ["company_id"],
        },
      },
    },
    handler: crmGetEnergyBillStatsHandler,
  },
  {
    name: "crm_calculate_savings",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_calculate_savings",
        description: "Calcular ahorro energético potencial para una empresa basándose en sus facturas parseadas. Compara contra tarifas del mercado y devuelve mejor alternativa, ahorro estimado y recomendaciones.",
        parameters: {
          type: "object",
          properties: { company_id: { type: "number", description: "ID de la empresa" } },
          required: ["company_id"],
        },
      },
    },
    handler: crmCalculateSavingsHandler,
  },
  {
    name: "crm_generate_proposal",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_generate_proposal",
        description: "Preparar propuesta de ahorro energético para una empresa. Devuelve resumen con datos clave y endpoint de descarga del PDF. Requiere facturas parseadas previas.",
        parameters: {
          type: "object",
          properties: { company_id: { type: "number", description: "ID de la empresa" } },
          required: ["company_id"],
        },
      },
    },
    handler: crmGenerateProposalHandler,
  },

  // ── LINKING / CONTEXT ──────────────────────────────────────────────
  {
    name: "crm_link_case_company",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_link_case_company",
        description: "Vincular un caso del swarm a una empresa del CRM. Permite enriquecer el caso con contexto de negocio.",
        parameters: {
          type: "object",
          properties: {
            case_id: { type: "number", description: "ID del caso" },
            company_id: { type: "number", description: "ID de la empresa" },
          },
          required: ["case_id", "company_id"],
        },
      },
    },
    handler: crmLinkCaseCompanyHandler,
  },
  {
    name: "crm_link_case_opportunity",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_link_case_opportunity",
        description: "Vincular un caso del swarm a una oportunidad del CRM.",
        parameters: {
          type: "object",
          properties: {
            case_id: { type: "number", description: "ID del caso" },
            opportunity_id: { type: "number", description: "ID de la oportunidad" },
          },
          required: ["case_id", "opportunity_id"],
        },
      },
    },
    handler: crmLinkCaseOpportunityHandler,
  },
  {
    name: "crm_get_case_context",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_get_case_context",
        description: "Obtener contexto CRM completo de un caso. Si el caso está vinculado a empresa, devuelve: empresa, contactos, oportunidades, servicios, suministros, facturas, ahorro. Usar antes de responder a un cliente para tener contexto de negocio real.",
        parameters: {
          type: "object",
          properties: { case_id: { type: "number", description: "ID del caso" } },
          required: ["case_id"],
        },
      },
    },
    handler: crmGetCaseContextHandler,
  },
  // ── Phase 7 — Commercial Ops Tools ──────────────────────────────────
  {
    name: "crm_get_expiring_services",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_get_expiring_services",
        description: "Listar servicios con vencimiento próximo o vencidos. Devuelve servicios con expiryDate cercana, urgencia (overdue/urgent/soon), proveedor y gasto. Usar para detectar renovaciones pendientes.",
        parameters: {
          type: "object",
          properties: {
            days: { type: "number", description: "Ventana en días (default 90). Incluye vencidos." },
          },
          required: [],
        },
      },
    },
    handler: crmGetExpiringServicesHandler,
  },
  {
    name: "crm_get_stale_opportunities",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_get_stale_opportunities",
        description: "Listar oportunidades estancadas (sin actualizar en N días). Detecta oportunidades que necesitan seguimiento o decisión.",
        parameters: {
          type: "object",
          properties: {
            days: { type: "number", description: "Días sin actividad para considerar estancada (default 21)" },
          },
          required: [],
        },
      },
    },
    handler: crmGetStaleOpportunitiesHandler,
  },
  {
    name: "crm_get_daily_brief",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_get_daily_brief",
        description: "Resumen diario comercial: vencimientos, oportunidades calientes, estancadas, cross-sell. Resumen agregado ideal para responder '¿qué tengo que revisar hoy?'.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
    handler: crmGetDailyBriefHandler,
  },
  {
    name: "crm_get_cross_sell_candidates",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_get_cross_sell_candidates",
        description: "Listar empresas candidatas a cross-sell: portfolio incompleto, con prioridad (alta/media/baja), razones y verticales faltantes.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Máximo de candidatos (default 15)" },
          },
          required: [],
        },
      },
    },
    handler: crmGetCrossSellCandidatesHandler,
  },
  {
    name: "crm_get_company_ops_context",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_get_company_ops_context",
        description: "Contexto operativo completo de una empresa: servicios venciendo, oportunidades activas y estancadas, cross-sell disponible, acciones recomendadas. Ideal para preparar una visita o llamada comercial.",
        parameters: {
          type: "object",
          properties: {
            company_id: { type: "number", description: "ID de la empresa" },
          },
          required: ["company_id"],
        },
      },
    },
    handler: crmGetCompanyOpsContextHandler,
  },
  // ── Phase 8 — Activity & Tasks Tools ─────────────────────────────
  {
    name: "crm_list_company_activities",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_list_company_activities",
        description: "Listar actividad comercial reciente de una empresa: llamadas, emails, visitas, seguimientos. Incluye última actividad, próximas acciones y seguimientos pendientes.",
        parameters: {
          type: "object",
          properties: {
            company_id: { type: "number", description: "ID de la empresa" },
            limit: { type: "number", description: "Máximo de actividades (default 20)" },
          },
          required: ["company_id"],
        },
      },
    },
    handler: crmListCompanyActivitiesHandler,
  },
  {
    name: "crm_get_pending_followups",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_get_pending_followups",
        description: "Obtener seguimientos pendientes y vencidos: actividades con próxima acción que han pasado su fecha. Ideal para '¿qué tengo pendiente?'.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Máximo de resultados (default 20)" },
          },
          required: [],
        },
      },
    },
    handler: crmGetPendingFollowupsHandler,
  },
  {
    name: "crm_list_company_tasks",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_list_company_tasks",
        description: "Listar tareas comerciales activas de una empresa o de una oportunidad. Incluye prioridad, estado, fecha de vencimiento y origen.",
        parameters: {
          type: "object",
          properties: {
            company_id: { type: "number", description: "ID de la empresa" },
            opportunity_id: { type: "number", description: "ID de la oportunidad (opcional)" },
          },
          required: [],
        },
      },
    },
    handler: crmListCompanyTasksHandler,
  },
  {
    name: "crm_create_suggested_task",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_create_suggested_task",
        description: "Crear una tarea comercial sugerida. Usalo cuando el análisis revela algo que debe hacerse (renovación, seguimiento, cross-sell). El comercial puede aceptarla o rechazarla.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Título de la tarea" },
            company_id: { type: "number", description: "ID de la empresa" },
            opportunity_id: { type: "number", description: "ID de la oportunidad (opcional)" },
            priority: { type: "string", enum: ["alta", "media", "baja"], description: "Prioridad" },
            due_at: { type: "string", description: "Fecha límite ISO (opcional)" },
            source: { type: "string", enum: ["suggested", "followup", "renewal"], description: "Origen de la sugerencia" },
          },
          required: ["title"],
        },
      },
    },
    handler: crmCreateSuggestedTaskHandler,
  },
  {
    name: "crm_get_today_summary",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_get_today_summary",
        description: "Resumen operativo del día: tareas de hoy, vencidas, seguimientos pendientes, actividad reciente. La respuesta ideal a '¿qué tengo que hacer hoy?'.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
    handler: crmGetTodaySummaryHandler,
  },
  // ── Phase 9 — Notification Tools ──────────────────────────────────
  {
    name: "crm_list_notifications",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_list_notifications",
        description: "Listar notificaciones operativas del usuario: alertas de vencimientos, seguimientos pendientes, cross-sell, inactividad. Incluye resumen con conteos (nuevas, urgentes, avisos, activas).",
        parameters: {
          type: "object",
          properties: {
            filter: { type: "string", enum: ["all", "new", "urgent"], description: "Filtro: all (todas activas), new (sin leer), urgent (solo urgentes). Default: all" },
            limit: { type: "number", description: "Máximo de notificaciones (default 30)" },
          },
          required: [],
        },
      },
    },
    handler: crmListNotificationsHandler,
  },
  {
    name: "crm_generate_notifications",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_generate_notifications",
        description: "Escanear datos del CRM y generar notificaciones operativas: tareas vencidas, seguimientos pendientes, renovaciones, oportunidades estancadas, cross-sell e inactividad. Idempotente (no genera duplicados). Opcionalmente auto-crea tareas sugeridas.",
        parameters: {
          type: "object",
          properties: {
            auto_create_tasks: { type: "boolean", description: "Si true, crea automáticamente tareas para renovaciones/seguimientos urgentes. Default: false (solo notificaciones)" },
            inactivity_days: { type: "number", description: "Días sin actividad para alertar (default 14)" },
          },
          required: [],
        },
      },
    },
    handler: crmGenerateNotificationsHandler,
  },
  {
    name: "crm_update_notification",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_update_notification",
        description: "Actualizar estado de una notificación: marcar como vista, descartada o resuelta.",
        parameters: {
          type: "object",
          properties: {
            notification_id: { type: "number", description: "ID de la notificación" },
            status: { type: "string", enum: ["seen", "dismissed", "resolved"], description: "Nuevo estado" },
          },
          required: ["notification_id", "status"],
        },
      },
    },
    handler: crmUpdateNotificationHandler,
  },
  // ── Phase 10 — Operational Agenda Tools ────────────────────────────
  {
    name: "crm_get_agenda_today",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_get_agenda_today",
        description: "Agenda operativa de hoy: tareas, seguimientos, renovaciones, oportunidades y alertas agrupados temporalmente. Incluye vencidos y resumen de prioridades. La respuesta ideal a '¿qué tengo hoy?' con datos reales.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
    handler: crmGetAgendaTodayHandler,
  },
  {
    name: "crm_get_agenda_week",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_get_agenda_week",
        description: "Resumen semanal operativo: 7 días con tareas, seguimientos y renovaciones por día. Incluye prioridades, totales, vencidos y acciones principales. La respuesta ideal a '¿qué tengo esta semana?'.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
    handler: crmGetAgendaWeekHandler,
  },
  {
    name: "crm_get_agenda_company",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_get_agenda_company",
        description: "Agenda operativa de una empresa: items vencidos y próximos (tareas, seguimientos, renovaciones, oportunidades). Útil al abrir una empresa para ver qué hay pendiente.",
        parameters: {
          type: "object",
          properties: {
            company_id: { type: "number", description: "ID de la empresa" },
          },
          required: ["company_id"],
        },
      },
    },
    handler: crmGetAgendaCompanyHandler,
  },

  // ── Phase 11 — Executive BI Tools ─────────────────────────────────
  {
    name: "crm_get_executive_summary",
    openaiTool: {
      type: "function" as const,
      function: {
        name: "crm_get_executive_summary",
        description:
          "Returns a full executive summary: KPIs, pipeline, verticals, operational metrics, energy overview and recent activity. Use when asked for overall business status or management report.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    handler: crmGetExecutiveSummaryHandler,
  },
  {
    name: "crm_get_pipeline_status",
    openaiTool: {
      type: "function" as const,
      function: {
        name: "crm_get_pipeline_status",
        description:
          "Returns pipeline metrics: opportunities by status, by temperature, active count, closing soon, won value, lost count. Use when asked about sales funnel or pipeline health.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    handler: crmGetPipelineStatusHandler,
  },
  {
    name: "crm_get_vertical_metrics",
    openaiTool: {
      type: "function" as const,
      function: {
        name: "crm_get_vertical_metrics",
        description:
          "Returns metrics per service vertical: contracted vs offered vs prospecting, spend, savings, top vertical, worst covered. Use when asked about verticals, service distribution or cross-sell landscape.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    handler: crmGetVerticalMetricsHandler,
  },
  {
    name: "crm_log_activity",
    openaiTool: {
      type: "function" as const,
      function: {
        name: "crm_log_activity",
        description:
          "Registrar una actividad comercial real (llamada, email, visita, nota, seguimiento, etc.) vinculada a una empresa. Usar cuando el usuario pide registrar un seguimiento, anotar una llamada, o dejar constancia de una interacción.",
        parameters: {
          type: "object",
          properties: {
            company_id: { type: "number", description: "ID de la empresa (obligatorio)" },
            type: {
              type: "string",
              enum: ["llamada", "email", "whatsapp", "visita", "nota", "seguimiento", "cambio_estado", "tarea_completada", "renovacion", "propuesta_enviada"],
              description: "Tipo de actividad",
            },
            summary: { type: "string", description: "Resumen de la actividad" },
            outcome: { type: "string", description: "Resultado de la actividad (opcional)" },
            next_step: { type: "string", description: "Próximo paso sugerido (opcional)" },
            contact_id: { type: "number", description: "ID del contacto (opcional)" },
            opportunity_id: { type: "number", description: "ID de la oportunidad (opcional)" },
          },
          required: ["company_id", "type", "summary"],
        },
      },
    },
    handler: crmLogActivityHandler,
  },
];

/** All CRM tool names for quick reference */
export const CRM_TOOL_NAMES = CRM_TOOLS.map((t) => t.name);
