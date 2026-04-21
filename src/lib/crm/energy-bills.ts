/**
 * Energy Bills Service — CRUD and persistence for parsed electricity bills.
 * Links bills to supply points and documents, with company-level aggregation.
 */

import { db } from "@/db";
import {
  energyBills,
  supplyPoints,
  documents,
  companies,
  type NewEnergyBill,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { ParsedBill } from "@/lib/bill-parser";
import {
  getSupplyPointByCups,
  createSupplyPoint,
  updateSupplyPoint,
} from "./supply-points";

/* ── Custom Errors ─────────────────────────────────────────── */

export class DuplicateBillError extends Error {
  public existingBillId: number;
  constructor(existingBillId: number, message?: string) {
    super(message ?? `Factura duplicada: ya existe una factura con ID ${existingBillId} para el mismo punto de suministro y periodo.`);
    this.name = "DuplicateBillError";
    this.existingBillId = existingBillId;
  }
}

/* ── Basic CRUD ─────────────────────────────────────────────── */

export async function createEnergyBill(data: NewEnergyBill) {
  const [bill] = await db.insert(energyBills).values(data).returning();
  return bill;
}

export async function getEnergyBill(id: number) {
  const [bill] = await db
    .select()
    .from(energyBills)
    .where(eq(energyBills.id, id))
    .limit(1);
  return bill ?? null;
}

export async function listEnergyBillsBySupplyPoint(supplyPointId: number) {
  return db
    .select()
    .from(energyBills)
    .where(eq(energyBills.supplyPointId, supplyPointId))
    .orderBy(desc(energyBills.billingPeriodEnd));
}

export async function listEnergyBillsByCompany(
  companyId: number,
  userId: string,
) {
  // Verify the company belongs to the user
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)))
    .limit(1);

  if (!company) return [];

  return db
    .select({
      id: energyBills.id,
      supplyPointId: energyBills.supplyPointId,
      documentId: energyBills.documentId,
      billingPeriodStart: energyBills.billingPeriodStart,
      billingPeriodEnd: energyBills.billingPeriodEnd,
      retailer: energyBills.retailer,
      totalAmountEur: energyBills.totalAmountEur,
      energyAmountEur: energyBills.energyAmountEur,
      powerAmountEur: energyBills.powerAmountEur,
      taxAmountEur: energyBills.taxAmountEur,
      electricityTaxEur: energyBills.electricityTaxEur,
      meterRentalEur: energyBills.meterRentalEur,
      reactiveEur: energyBills.reactiveEur,
      consumptionKwh: energyBills.consumptionKwh,
      powerKw: energyBills.powerKw,
      pricesEurKwh: energyBills.pricesEurKwh,
      confidenceScore: energyBills.confidenceScore,
      rawExtraction: energyBills.rawExtraction,
      fileHash: energyBills.fileHash,
      parsedAt: energyBills.parsedAt,
      createdAt: energyBills.createdAt,
      cups: supplyPoints.cups,
    })
    .from(energyBills)
    .innerJoin(supplyPoints, eq(energyBills.supplyPointId, supplyPoints.id))
    .where(eq(supplyPoints.companyId, companyId))
    .orderBy(desc(energyBills.billingPeriodEnd));
}

/* ── Aggregation ────────────────────────────────────────────── */

export async function getEnergyBillsStats(companyId: number) {
  const [stats] = await db
    .select({
      totalBills: sql<number>`count(*)`,
      totalCost: sql<number>`coalesce(sum(${energyBills.totalAmountEur}), 0)`,
      avgMonthlyCost: sql<number>`coalesce(avg(${energyBills.totalAmountEur}), 0)`,
      latestBillDate: sql<Date | null>`max(${energyBills.billingPeriodEnd})`,
    })
    .from(energyBills)
    .innerJoin(supplyPoints, eq(energyBills.supplyPointId, supplyPoints.id))
    .where(eq(supplyPoints.companyId, companyId));

  return stats ?? { totalBills: 0, totalCost: 0, avgMonthlyCost: 0, latestBillDate: null };
}

/* ── Persist Parsed Bill ────────────────────────────────────── */

interface PersistParsedBillParams {
  companyId: number;
  userId: string;
  parsedBill: ParsedBill;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  fileMime: string;
  /** SHA-256 hash of the uploaded file (Phase 3.5 deduplication) */
  fileHash?: string;
}

/**
 * Check for duplicate energy bills by supply point + billing period.
 * Returns the existing bill if found, null otherwise.
 */
export async function findDuplicateBill(
  supplyPointId: number,
  periodStart: Date | null,
  periodEnd: Date | null,
) {
  if (!periodStart || !periodEnd) return null;

  const [existing] = await db
    .select({ id: energyBills.id })
    .from(energyBills)
    .where(
      and(
        eq(energyBills.supplyPointId, supplyPointId),
        eq(energyBills.billingPeriodStart, periodStart),
        eq(energyBills.billingPeriodEnd, periodEnd),
      ),
    )
    .limit(1);

  return existing ?? null;
}

/**
 * Check for duplicate energy bills by file hash (SHA-256).
 * Returns the existing bill if found, null otherwise.
 */
export async function findBillByFileHash(fileHash: string) {
  const [existing] = await db
    .select({ id: energyBills.id })
    .from(energyBills)
    .where(eq(energyBills.fileHash, fileHash))
    .limit(1);

  return existing ?? null;
}

export async function persistParsedBill(params: PersistParsedBillParams) {
  const { companyId, userId, parsedBill, fileUrl, fileName, fileSize, fileMime, fileHash } = params;

  // ── Phase 3.5: File hash deduplication check ──
  if (fileHash) {
    const existingByHash = await findBillByFileHash(fileHash);
    if (existingByHash) {
      throw new DuplicateBillError(
        existingByHash.id,
        `Factura duplicada: el archivo ya fue procesado anteriormente (factura ID ${existingByHash.id}).`,
      );
    }
  }

  // a) Look up or create supply point by CUPS — scoped to companyId (Phase 3.5)
  let supplyPoint = parsedBill.cups
    ? await getSupplyPointByCups(parsedBill.cups, companyId)
    : null;

  if (!supplyPoint && parsedBill.cups) {
    supplyPoint = await createSupplyPoint({
      companyId,
      cups: parsedBill.cups,
      tariff: parsedBill.tarifa,
      currentRetailer: parsedBill.comercializadora,
      powerP1Kw: parsedBill.potencias[0] ?? null,
      powerP2Kw: parsedBill.potencias[1] ?? null,
      powerP3Kw: parsedBill.potencias[2] ?? null,
      powerP4Kw: parsedBill.potencias[3] ?? null,
      powerP5Kw: parsedBill.potencias[4] ?? null,
      powerP6Kw: parsedBill.potencias[5] ?? null,
    });
  }

  if (!supplyPoint) {
    throw new Error("No se pudo resolver el punto de suministro: CUPS no encontrado en la factura.");
  }

  // ── Phase 3.5: Period deduplication check ──
  const parsePeriodDate = (raw: string | null): Date | null => {
    if (!raw) return null;
    const parts = raw.split(/[\/\-\.]/);
    if (parts.length < 3) return null;
    let year = parseInt(parts[2]);
    if (year < 100) year += 2000;
    return new Date(year, parseInt(parts[1]) - 1, parseInt(parts[0]));
  };

  const periodStart = parsePeriodDate(parsedBill.periodoFacturacion.desde);
  const periodEnd = parsePeriodDate(parsedBill.periodoFacturacion.hasta);

  const existingByPeriod = await findDuplicateBill(supplyPoint.id, periodStart, periodEnd);
  if (existingByPeriod) {
    throw new DuplicateBillError(
      existingByPeriod.id,
      `Factura duplicada: ya existe una factura (ID ${existingByPeriod.id}) para el mismo punto de suministro y periodo de facturación.`,
    );
  }

  // b) Create document record
  const [document] = await db
    .insert(documents)
    .values({
      companyId,
      uploadedBy: userId,
      name: fileName,
      type: "factura",
      fileUrl,
      fileName,
      fileSize,
      fileMime,
    })
    .returning();

  // c) Build consumption / power / prices maps
  const consumptionKwh: Record<string, number> = {};
  parsedBill.consumos.forEach((v, i) => {
    consumptionKwh[`P${i + 1}`] = v;
  });

  const powerKw: Record<string, number> = {};
  parsedBill.potencias.forEach((v, i) => {
    powerKw[`P${i + 1}`] = v;
  });

  const pricesEurKwh: Record<string, number> = {};
  parsedBill.preciosEnergia.forEach((v, i) => {
    pricesEurKwh[`P${i + 1}`] = v;
  });

  const taxAmountEur =
    (parsedBill.impuestoElectrico ?? 0) + (parsedBill.iva ?? 0) || null;

  const energyBill = await createEnergyBill({
    supplyPointId: supplyPoint.id,
    documentId: document.id,
    billingPeriodStart: periodStart,
    billingPeriodEnd: periodEnd,
    retailer: parsedBill.comercializadora,
    totalAmountEur: parsedBill.importeTotal,
    energyAmountEur: parsedBill.importeEnergia,
    powerAmountEur: parsedBill.importePotencia,
    taxAmountEur,
    electricityTaxEur: parsedBill.impuestoElectrico,
    meterRentalEur: parsedBill.alquilerContador,
    reactiveEur: parsedBill.importeReactiva,
    consumptionKwh: Object.keys(consumptionKwh).length > 0 ? consumptionKwh : null,
    powerKw: Object.keys(powerKw).length > 0 ? powerKw : null,
    pricesEurKwh: Object.keys(pricesEurKwh).length > 0 ? pricesEurKwh : null,
    confidenceScore: parsedBill.confianza,
    rawExtraction: parsedBill as unknown as Record<string, unknown>,
    fileHash: fileHash ?? null,
    parsedAt: new Date(),
  });

  // d) Update supply point with latest data from parsed bill
  const spUpdate: Record<string, unknown> = {};
  if (parsedBill.tarifa) spUpdate.tariff = parsedBill.tarifa;
  if (parsedBill.comercializadora) spUpdate.currentRetailer = parsedBill.comercializadora;
  if (parsedBill.potencias[0] != null) spUpdate.powerP1Kw = parsedBill.potencias[0];
  if (parsedBill.potencias[1] != null) spUpdate.powerP2Kw = parsedBill.potencias[1];
  if (parsedBill.potencias[2] != null) spUpdate.powerP3Kw = parsedBill.potencias[2];
  if (parsedBill.potencias[3] != null) spUpdate.powerP4Kw = parsedBill.potencias[3];
  if (parsedBill.potencias[4] != null) spUpdate.powerP5Kw = parsedBill.potencias[4];
  if (parsedBill.potencias[5] != null) spUpdate.powerP6Kw = parsedBill.potencias[5];

  if (Object.keys(spUpdate).length > 0) {
    supplyPoint = (await updateSupplyPoint(supplyPoint.id, spUpdate as any)) ?? supplyPoint;
  }

  return { energyBill, supplyPoint, document };
}
