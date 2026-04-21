/**
 * Savings Calculator Service — CRM Energy Platform
 *
 * Calculates potential savings for clients by comparing their current
 * energy costs against available tariff alternatives. Integrates with
 * the market intelligence module for tariff data and supports both
 * manual input and automatic extraction from parsed energy bills.
 *
 * Functions:
 *  - calculateSavings: compute savings from explicit consumption params
 *  - calculateSavingsFromBills: derive params from EnergyBill[] records
 *  - buildSavingsSummaryText: render results as Spanish plain-text for PDFs
 */

import { compareTariffs, type TariffComparison } from "@/lib/energy/market-intelligence";
import type { EnergyBill } from "@/db/schema";

// ─── Types ──────────────────────────────────────────────────────────────

export interface CalculateSavingsParams {
  currentRetailer: string;
  currentAnnualCost: number; // EUR
  monthlyConsumptionKWh: number;
  contractedPowerKW: number;
  tariff: string; // "2.0TD" | "3.0TD" etc.
  consumptionDistribution?: { punta: number; llano: number; valle: number };
}

export interface SavingsResult {
  currentProvider: string;
  currentAnnualCost: number;
  bestAlternative: {
    provider: string;
    tariffName: string;
    type: string;
    estimatedAnnualCost: number;
  };
  potentialSavingsEur: number;
  potentialSavingsPct: number;
  allComparisons: TariffComparison[];
  recommendations: string[];
}

// ─── Core ───────────────────────────────────────────────────────────────

/**
 * Calculate potential savings against current energy costs.
 *
 * Calls `compareTariffs` with the client's consumption profile, fills in
 * `savingsVsCurrent` for every alternative, picks the cheapest option,
 * and generates actionable recommendations in Spanish.
 */
export function calculateSavings(params: CalculateSavingsParams): SavingsResult {
  const {
    currentRetailer,
    currentAnnualCost,
    monthlyConsumptionKWh,
    contractedPowerKW,
    consumptionDistribution,
  } = params;

  // Fetch sorted comparisons (cheapest first)
  const comparisons = compareTariffs(
    monthlyConsumptionKWh,
    contractedPowerKW,
    consumptionDistribution,
  );

  // Fill savingsVsCurrent relative to the client's actual cost
  for (const c of comparisons) {
    c.savingsVsCurrent = Math.round((currentAnnualCost - c.estimatedAnnualCost) * 100) / 100;
  }

  // Best alternative (first in the sorted list)
  const best = comparisons[0];

  const potentialSavingsEur = best
    ? Math.max(0, Math.round((currentAnnualCost - best.estimatedAnnualCost) * 100) / 100)
    : 0;

  const potentialSavingsPct = currentAnnualCost > 0
    ? Math.round((potentialSavingsEur / currentAnnualCost) * 10000) / 100
    : 0;

  // Build recommendations
  const recommendations: string[] = [];

  if (best && best.estimatedAnnualCost < currentAnnualCost) {
    recommendations.push(
      `Cambiar a ${best.provider} (${best.tariffName}) ahorra ${Math.round(potentialSavingsEur)}€/año (${potentialSavingsPct}%).`,
    );
  }

  // Power optimisation hint when contracted power seems high relative to consumption
  // Rule of thumb: if kW > monthlyKWh / 100, power component is likely oversized
  if (contractedPowerKW > monthlyConsumptionKWh / 100) {
    recommendations.push(
      `Potencia contratada elevada (${contractedPowerKW} kW para ${monthlyConsumptionKWh} kWh/mes). Revisar si se puede reducir para ahorrar en término de potencia.`,
    );
  }

  // Valley-shift recommendation
  const dist = consumptionDistribution || { punta: 0.35, llano: 0.35, valle: 0.30 };
  if (dist.valle < 0.35) {
    recommendations.push(
      "Desplazar consumo a horas valle (0-8h y fines de semana) puede reducir el coste energético entre un 5-15%.",
    );
  }

  // Indexed tariff suggestion when client is on fixed
  const bestIndexada = comparisons.find((c) => c.type === "indexada");
  if (bestIndexada && bestIndexada.estimatedAnnualCost < currentAnnualCost * 0.95) {
    recommendations.push(
      `Una tarifa indexada como ${bestIndexada.provider} (${bestIndexada.tariffName}) podría ahorrar ${Math.round(currentAnnualCost - bestIndexada.estimatedAnnualCost)}€/año, aunque con mayor variabilidad.`,
    );
  }

  return {
    currentProvider: currentRetailer,
    currentAnnualCost,
    bestAlternative: best
      ? {
          provider: best.provider,
          tariffName: best.tariffName,
          type: best.type,
          estimatedAnnualCost: best.estimatedAnnualCost,
        }
      : { provider: currentRetailer, tariffName: "-", type: "-", estimatedAnnualCost: currentAnnualCost },
    potentialSavingsEur,
    potentialSavingsPct,
    allComparisons: comparisons,
    recommendations,
  };
}

// ─── From Bills ─────────────────────────────────────────────────────────

/**
 * Derive savings parameters from an array of parsed energy bill records
 * and delegate to `calculateSavings`.
 *
 * Extracts:
 *  - Average monthly consumption (sum of all consumptionKwh values / number of bills)
 *  - Total annual cost (extrapolated from bill totals)
 *  - Maximum contracted power from powerKw
 *  - Latest retailer
 */
export function calculateSavingsFromBills(bills: EnergyBill[]): SavingsResult {
  if (bills.length === 0) {
    return {
      currentProvider: "Desconocido",
      currentAnnualCost: 0,
      bestAlternative: { provider: "-", tariffName: "-", type: "-", estimatedAnnualCost: 0 },
      potentialSavingsEur: 0,
      potentialSavingsPct: 0,
      allComparisons: [],
      recommendations: ["No se han proporcionado facturas para analizar."],
    };
  }

  // Sort bills by period end date (newest first) to pick latest retailer
  const sorted = [...bills].sort((a, b) => {
    const da = a.billingPeriodEnd ? new Date(a.billingPeriodEnd).getTime() : 0;
    const db = b.billingPeriodEnd ? new Date(b.billingPeriodEnd).getTime() : 0;
    return db - da;
  });

  const latestRetailer = sorted.find((b) => b.retailer)?.retailer ?? "Desconocido";

  // Average monthly consumption: sum all period values in consumptionKwh per bill, then average
  let totalConsumptionKwh = 0;
  for (const bill of bills) {
    if (bill.consumptionKwh) {
      const periods = bill.consumptionKwh as Record<string, number>;
      for (const val of Object.values(periods)) {
        totalConsumptionKwh += val ?? 0;
      }
    }
  }
  const avgMonthlyConsumption = totalConsumptionKwh / bills.length;

  // Total annual cost: average bill amount * 12
  let totalCost = 0;
  let costBillCount = 0;
  for (const bill of bills) {
    if (bill.totalAmountEur != null) {
      totalCost += bill.totalAmountEur;
      costBillCount++;
    }
  }
  const avgMonthlyCost = costBillCount > 0 ? totalCost / costBillCount : 0;
  const currentAnnualCost = Math.round(avgMonthlyCost * 12 * 100) / 100;

  // Maximum contracted power from powerKw across all bills
  let maxPowerKW = 0;
  for (const bill of bills) {
    if (bill.powerKw) {
      const powers = bill.powerKw as Record<string, number>;
      for (const val of Object.values(powers)) {
        if (val > maxPowerKW) maxPowerKW = val;
      }
    }
  }

  return calculateSavings({
    currentRetailer: latestRetailer,
    currentAnnualCost,
    monthlyConsumptionKWh: Math.round(avgMonthlyConsumption),
    contractedPowerKW: maxPowerKW,
    tariff: "2.0TD", // default; bills don't always carry tariff type
  });
}

// ─── Text Builder ───────────────────────────────────────────────────────

/**
 * Build a plain-text savings summary in Spanish, suitable for
 * inclusion in a proposal PDF or email body.
 */
export function buildSavingsSummaryText(result: SavingsResult): string {
  const lines: string[] = [];

  lines.push("RESUMEN DE AHORRO ENERGÉTICO");
  lines.push("═".repeat(40));
  lines.push("");

  // Current situation
  lines.push(
    `Situación actual: ${result.currentProvider} — ${formatEur(result.currentAnnualCost)}€/año`,
  );

  // Best alternative
  const alt = result.bestAlternative;
  lines.push(
    `Mejor alternativa: ${alt.provider} (${alt.tariffName}) — ${formatEur(alt.estimatedAnnualCost)}€/año`,
  );

  // Savings
  lines.push("");
  lines.push(
    `Ahorro potencial: ${formatEur(result.potentialSavingsEur)}€/año (${result.potentialSavingsPct}%)`,
  );

  // Recommendations
  if (result.recommendations.length > 0) {
    lines.push("");
    lines.push("Recomendaciones:");
    for (const rec of result.recommendations) {
      lines.push(`  • ${rec}`);
    }
  }

  // Comparison table (top 5)
  if (result.allComparisons.length > 0) {
    lines.push("");
    lines.push("Comparativa de tarifas (top 5):");
    lines.push("-".repeat(40));
    const top = result.allComparisons.slice(0, 5);
    for (const c of top) {
      const savings = c.savingsVsCurrent > 0
        ? ` (ahorro ${formatEur(c.savingsVsCurrent)}€/año)`
        : "";
      lines.push(
        `  ${c.provider} — ${c.tariffName} (${c.type}): ${formatEur(c.estimatedAnnualCost)}€/año${savings}`,
      );
    }
  }

  return lines.join("\n");
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatEur(value: number): string {
  return value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
