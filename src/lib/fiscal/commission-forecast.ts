/**
 * Commission Forecast — proyección de ingresos por comisiones para fiscal+BI.
 *
 * Cruza:
 *   services activos (status="contracted")
 *   × commission_rates vigentes (matched por commissionRateId o provider+tariff)
 *   × commission_payouts (broker que paga, IVA aplicable)
 *
 * Devuelve:
 *   - totalEsperado (sin IVA + con IVA)
 *   - desglose por broker (quién te paga)
 *   - desglose por provider energético
 *   - desglose por vertical (energia/telefonia/...)
 *   - desglose por mes (para planificar tesorería)
 *
 * Uso:
 *   - fiscal — preview Modelo 303 (IVA repercutido futuro)
 *   - bi-scoring — margen por comercial / KAM / vertical
 *   - comercial-principal — valor de cartera por empresa
 *   - ceo — vista ejecutiva
 */

import { db, schema } from "@/db";
import { eq, and, inArray, isNotNull } from "drizzle-orm";

export interface CommissionForecastInput {
  userId: string;
  /** Rango de proyección. Por defecto: próximos 12 meses. */
  fromDate?: Date;
  toDate?: Date;
  /** Filtrar por vertical (energia | telecomunicaciones | seguros | ...) */
  category?: string;
  /** Filtrar por broker que paga (id de companies). */
  payerCompanyId?: number;
  /** Estados a incluir. Default: ["contracted", "offered"] (activados + tramitados). */
  statuses?: string[];
}

export interface CommissionForecastSummary {
  generatedAt: string;
  rangeFrom: string;
  rangeTo: string;
  totals: {
    activeServices: number;
    matchedRates: number;
    unmatchedServices: number;
    totalSinIvaEur: number;
    totalConIvaEur: number;
    totalIvaEur: number;
  };
  byProvider: Array<{
    provider: string;
    services: number;
    totalSinIvaEur: number;
    totalConIvaEur: number;
    payerName: string | null;
    ivaRate: number;
  }>;
  byCategory: Array<{
    category: string;
    services: number;
    totalSinIvaEur: number;
    totalConIvaEur: number;
  }>;
  unmatchedSamples: Array<{
    serviceId: number;
    provider: string | null;
    tariff: string | null;
    reason: string;
  }>;
}

/**
 * Calcula la previsión de comisiones para un usuario.
 * Single-shot computation (no caché). En prod se podría memoizar 5min.
 */
export async function getCommissionForecast(
  input: CommissionForecastInput,
): Promise<CommissionForecastSummary> {
  const now = new Date();
  const fromDate = input.fromDate ?? now;
  const toDate = input.toDate ?? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const statuses = input.statuses ?? ["contracted", "offered"];

  // 1. Cargar servicios del usuario con estados activos.
  //    contracted = ACTIVADO (ya cobrando)
  //    offered    = TRAMITADO (firmado, pendiente activación)
  const services = await db
    .select({
      id: schema.services.id,
      companyId: schema.services.companyId,
      type: schema.services.type,
      status: schema.services.status,
      provider: schema.services.provider,
      tariff: schema.services.tariff,
      commissionRateId: schema.services.commissionRateId,
      commissionEstimatedEur: schema.services.commissionEstimatedEur,
      contractDate: schema.services.contractDate,
      expiryDate: schema.services.expiryDate,
    })
    .from(schema.services)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.services.companyId))
    .where(
      and(
        eq(schema.companies.userId, input.userId),
        inArray(schema.services.status, statuses),
      ),
    );

  // 2. Cargar commission_rates referenciadas (en una sola query).
  const rateIds = Array.from(new Set(services.map((s) => s.commissionRateId).filter(Boolean) as number[]));
  const rates = rateIds.length
    ? await db.select().from(schema.commissionRates)
    : [];
  const rateMap = new Map(rates.map((r) => [r.id, r]));

  // 3. Cargar payouts (broker mapping).
  const payouts = await db.query.commissionPayouts.findMany({
    where: eq(schema.commissionPayouts.userId, input.userId),
  });
  const payoutMap = new Map(payouts.map((p) => [p.provider.toUpperCase(), p]));

  // 4. Cargar nombres de brokers (companies referenciadas en payouts).
  const brokerIds = Array.from(new Set(payouts.map((p) => p.payerCompanyId).filter(Boolean) as number[]));
  const brokers = brokerIds.length
    ? await db.query.companies.findMany({
        where: and(
          eq(schema.companies.userId, input.userId),
        ),
      })
    : [];
  const brokerMap = new Map(brokers.map((b) => [b.id, b]));

  // 5. Agregar.
  let activeServices = 0;
  let matchedRates = 0;
  let unmatchedServices = 0;
  let totalSinIvaEur = 0;
  let totalConIvaEur = 0;

  const byProviderMap = new Map<
    string,
    {
      services: number;
      totalSinIvaEur: number;
      totalConIvaEur: number;
      payerName: string | null;
      ivaRate: number;
    }
  >();
  const byCategoryMap = new Map<
    string,
    { services: number; totalSinIvaEur: number; totalConIvaEur: number }
  >();
  const unmatchedSamples: CommissionForecastSummary["unmatchedSamples"] = [];

  for (const svc of services) {
    activeServices++;
    if (input.category && svc.type !== input.category) continue;

    const provider = (svc.provider || "").toUpperCase();
    const payout = payoutMap.get(provider);
    if (input.payerCompanyId && payout?.payerCompanyId !== input.payerCompanyId) continue;
    const ivaRate = payout?.ivaRate ?? 21;

    const rate = svc.commissionRateId ? rateMap.get(svc.commissionRateId) : null;
    let estimadoSinIva: number | null = null;

    if (rate) {
      estimadoSinIva = rate.commissionSinIva ?? null;
      matchedRates++;
    } else if (svc.commissionEstimatedEur) {
      // El importador pudo poblar commissionEstimatedEur con el con-IVA;
      // lo invertimos al sin-IVA para consistencia.
      estimadoSinIva = svc.commissionEstimatedEur / (1 + ivaRate / 100);
    } else {
      unmatchedServices++;
      if (unmatchedSamples.length < 20) {
        unmatchedSamples.push({
          serviceId: svc.id,
          provider: svc.provider,
          tariff: svc.tariff,
          reason: !svc.provider
            ? "service sin provider"
            : !svc.tariff
              ? "service sin tariff"
              : "no se encontró rate vigente para (provider, tariff)",
        });
      }
      continue;
    }

    if (estimadoSinIva === null || estimadoSinIva <= 0) continue;

    const conIva = estimadoSinIva * (1 + ivaRate / 100);
    totalSinIvaEur += estimadoSinIva;
    totalConIvaEur += conIva;

    // byProvider
    const payerName =
      payout?.payerCompanyId && brokerMap.has(payout.payerCompanyId)
        ? brokerMap.get(payout.payerCompanyId)!.name
        : payout?.payerName || null;
    const provKey = provider || "(sin provider)";
    const provEntry = byProviderMap.get(provKey) ?? {
      services: 0,
      totalSinIvaEur: 0,
      totalConIvaEur: 0,
      payerName,
      ivaRate,
    };
    provEntry.services++;
    provEntry.totalSinIvaEur += estimadoSinIva;
    provEntry.totalConIvaEur += conIva;
    byProviderMap.set(provKey, provEntry);

    // byCategory (=service.type)
    const catKey = svc.type;
    const catEntry = byCategoryMap.get(catKey) ?? {
      services: 0,
      totalSinIvaEur: 0,
      totalConIvaEur: 0,
    };
    catEntry.services++;
    catEntry.totalSinIvaEur += estimadoSinIva;
    catEntry.totalConIvaEur += conIva;
    byCategoryMap.set(catKey, catEntry);
  }

  return {
    generatedAt: now.toISOString(),
    rangeFrom: fromDate.toISOString(),
    rangeTo: toDate.toISOString(),
    totals: {
      activeServices,
      matchedRates,
      unmatchedServices,
      totalSinIvaEur: round2(totalSinIvaEur),
      totalConIvaEur: round2(totalConIvaEur),
      totalIvaEur: round2(totalConIvaEur - totalSinIvaEur),
    },
    byProvider: Array.from(byProviderMap.entries())
      .map(([provider, v]) => ({ provider, ...v, totalSinIvaEur: round2(v.totalSinIvaEur), totalConIvaEur: round2(v.totalConIvaEur) }))
      .sort((a, b) => b.totalConIvaEur - a.totalConIvaEur),
    byCategory: Array.from(byCategoryMap.entries())
      .map(([category, v]) => ({ category, ...v, totalSinIvaEur: round2(v.totalSinIvaEur), totalConIvaEur: round2(v.totalConIvaEur) }))
      .sort((a, b) => b.totalConIvaEur - a.totalConIvaEur),
    unmatchedSamples,
  };
}

/** Total comisión esperada para una empresa concreta (cartera value). */
export async function getCommissionForecastForCompany(
  userId: string,
  companyId: number,
): Promise<{ companyId: number; activeServices: number; totalSinIvaEur: number; totalConIvaEur: number; services: Array<{ id: number; provider: string | null; tariff: string | null; estimadoSinIva: number | null }> }> {
  const services = await db
    .select({
      id: schema.services.id,
      provider: schema.services.provider,
      tariff: schema.services.tariff,
      commissionRateId: schema.services.commissionRateId,
      commissionEstimatedEur: schema.services.commissionEstimatedEur,
    })
    .from(schema.services)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.services.companyId))
    .where(
      and(
        eq(schema.companies.userId, userId),
        eq(schema.companies.id, companyId),
        inArray(schema.services.status, ["contracted", "offered"]),
      ),
    );

  const rateIds = services.map((s) => s.commissionRateId).filter(Boolean) as number[];
  const rates = rateIds.length ? await db.select().from(schema.commissionRates) : [];
  const rateMap = new Map(rates.map((r) => [r.id, r]));

  let totalSinIva = 0;
  let totalConIva = 0;
  const breakdown = services.map((s) => {
    const r = s.commissionRateId ? rateMap.get(s.commissionRateId) : null;
    const sinIva = r?.commissionSinIva ?? (s.commissionEstimatedEur ? s.commissionEstimatedEur / 1.21 : null);
    const conIva = sinIva ? sinIva * 1.21 : null;
    if (sinIva) totalSinIva += sinIva;
    if (conIva) totalConIva += conIva;
    return { id: s.id, provider: s.provider, tariff: s.tariff, estimadoSinIva: sinIva };
  });

  return {
    companyId,
    activeServices: services.length,
    totalSinIvaEur: round2(totalSinIva),
    totalConIvaEur: round2(totalConIva),
    services: breakdown,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
