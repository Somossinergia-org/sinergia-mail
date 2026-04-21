/**
 * Phase 3 Behavioral Tests — Energy Platform
 *
 * Verifies code-level patterns for the energy bills module, savings
 * calculator, bill parser, proposal PDF generation, API route security,
 * and UI integration without requiring a real database.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const srcDir = resolve(__dirname, "../../src");

function readSrc(path: string): string {
  return readFileSync(resolve(srcDir, path), "utf-8");
}

// ═══════════════════════════════════════════════════════════════════
// 1. Energy Bills Service — module exports
// ═══════════════════════════════════════════════════════════════════

describe("Energy Bills Service — module exports", () => {
  it("exports createEnergyBill as a function", async () => {
    const mod = await import("../../src/lib/crm/energy-bills");
    expect(typeof mod.createEnergyBill).toBe("function");
  });

  it("exports getEnergyBill as a function", async () => {
    const mod = await import("../../src/lib/crm/energy-bills");
    expect(typeof mod.getEnergyBill).toBe("function");
  });

  it("exports listEnergyBillsBySupplyPoint as a function", async () => {
    const mod = await import("../../src/lib/crm/energy-bills");
    expect(typeof mod.listEnergyBillsBySupplyPoint).toBe("function");
  });

  it("exports listEnergyBillsByCompany as a function", async () => {
    const mod = await import("../../src/lib/crm/energy-bills");
    expect(typeof mod.listEnergyBillsByCompany).toBe("function");
  });

  it("exports getEnergyBillsStats as a function", async () => {
    const mod = await import("../../src/lib/crm/energy-bills");
    expect(typeof mod.getEnergyBillsStats).toBe("function");
  });

  it("exports persistParsedBill as a function", async () => {
    const mod = await import("../../src/lib/crm/energy-bills");
    expect(typeof mod.persistParsedBill).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Savings Calculator — module exports and logic
// ═══════════════════════════════════════════════════════════════════

describe("Savings Calculator — module exports", () => {
  it("exports calculateSavings as a function", async () => {
    const mod = await import("../../src/lib/crm/savings-calculator");
    expect(typeof mod.calculateSavings).toBe("function");
  });

  it("exports calculateSavingsFromBills as a function", async () => {
    const mod = await import("../../src/lib/crm/savings-calculator");
    expect(typeof mod.calculateSavingsFromBills).toBe("function");
  });

  it("exports buildSavingsSummaryText as a function", async () => {
    const mod = await import("../../src/lib/crm/savings-calculator");
    expect(typeof mod.buildSavingsSummaryText).toBe("function");
  });
});

describe("Savings Calculator — calculateSavings real logic", () => {
  it("returns correct structure for Endesa / 3600€ / 500kWh / 10kW / 2.0TD", async () => {
    const { calculateSavings } = await import("../../src/lib/crm/savings-calculator");

    const result = calculateSavings({
      currentRetailer: "Endesa",
      currentAnnualCost: 3600,
      monthlyConsumptionKWh: 500,
      contractedPowerKW: 10,
      tariff: "2.0TD",
    });

    expect(result.currentProvider).toBe("Endesa");
    expect(result.currentAnnualCost).toBe(3600);

    // Best alternative is a full object
    expect(result.bestAlternative).toBeDefined();
    expect(typeof result.bestAlternative.provider).toBe("string");
    expect(typeof result.bestAlternative.tariffName).toBe("string");
    expect(typeof result.bestAlternative.type).toBe("string");
    expect(typeof result.bestAlternative.estimatedAnnualCost).toBe("number");

    // Savings >= 0
    expect(result.potentialSavingsEur).toBeGreaterThanOrEqual(0);
    expect(result.potentialSavingsPct).toBeGreaterThanOrEqual(0);

    // At least 5 comparisons (7 reference tariffs)
    expect(result.allComparisons.length).toBeGreaterThanOrEqual(5);

    // Recommendations is an array
    expect(Array.isArray(result.recommendations)).toBe(true);
  });
});

describe("Savings Calculator — buildSavingsSummaryText", () => {
  it("produces text with key sections in Spanish", async () => {
    const { calculateSavings, buildSavingsSummaryText } = await import(
      "../../src/lib/crm/savings-calculator"
    );

    const result = calculateSavings({
      currentRetailer: "Endesa",
      currentAnnualCost: 3600,
      monthlyConsumptionKWh: 500,
      contractedPowerKW: 10,
      tariff: "2.0TD",
    });

    const text = buildSavingsSummaryText(result);

    expect(text).toContain("RESUMEN DE AHORRO");
    expect(text).toContain("Situación actual");
    expect(text).toContain("Mejor alternativa");
    expect(text).toContain("Ahorro potencial");
  });
});

describe("Savings Calculator — calculateSavingsFromBills with empty array", () => {
  it("returns Desconocido and empty comparisons for empty bills", async () => {
    const { calculateSavingsFromBills } = await import(
      "../../src/lib/crm/savings-calculator"
    );

    const result = calculateSavingsFromBills([]);

    expect(result.currentProvider).toBe("Desconocido");
    expect(result.allComparisons.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Bill Parser — verify it still works
// ═══════════════════════════════════════════════════════════════════

describe("Bill Parser — parseBillText with known fields", () => {
  it("extracts CUPS, retailer, tariff, potencias, importe, and confianza", async () => {
    const { parseBillText } = await import("../../src/lib/bill-parser");

    const text = [
      "Endesa Energía S.A.",
      "CUPS: ES0021000012345678AB",
      "Tarifa: 2.0TD",
      "Término de potencia",
      "P1: 5,750 kW",
      "Consumo a facturar",
      "Punta real 150 kWh",
      "Llano real 200 kWh",
      "Valle real 300 kWh",
      "Importe total factura: 125,43 EUR",
    ].join("\n");

    const result = parseBillText(text);

    expect(result.comercializadora).toBe("Endesa Energia");
    expect(result.cups).toBe("ES0021000012345678AB");
    expect(result.tarifa).toBe("2.0TD");
    expect(result.potencias.length).toBeGreaterThan(0);
    expect(result.importeTotal).toBe(125.43);
    expect(result.confianza).toBeGreaterThanOrEqual(60);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. API Routes Auth — all energy-bills routes check auth
// ═══════════════════════════════════════════════════════════════════

describe("Auth Enforcement — all energy-bills routes reject anonymous", () => {
  const routes = [
    "app/api/crm/energy-bills/route.ts",
    "app/api/crm/energy-bills/parse/route.ts",
    "app/api/crm/energy-bills/savings/route.ts",
    "app/api/crm/energy-bills/proposal/route.ts",
  ];

  for (const route of routes) {
    it(`${route} — calls auth() and checks session, returns 401`, () => {
      const content = readSrc(route);
      expect(content).toContain("await auth()");
      expect(content).toContain("session?.user?.id");
      expect(content).toContain("401");
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// 5. Parse route — ownership check
// ═══════════════════════════════════════════════════════════════════

describe("Parse route — ownership and full chain", () => {
  const content = readSrc("app/api/crm/energy-bills/parse/route.ts");

  it("imports getCompany for ownership verification", () => {
    expect(content).toContain("getCompany");
  });

  it("checks company.userId !== session.user.id", () => {
    expect(content).toContain("company.userId !== session.user.id");
  });

  it("calls persistParsedBill to save the bill", () => {
    expect(content).toContain("persistParsedBill");
  });

  it("calls parseBillText for regex parsing", () => {
    expect(content).toContain("parseBillText");
  });

  it("calls parseBillWithAI as fallback", () => {
    expect(content).toContain("parseBillWithAI");
  });

  it("uses confianza < 75 threshold for AI fallback", () => {
    expect(content).toContain("confianza < 75");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Savings route — dual mode
// ═══════════════════════════════════════════════════════════════════

describe("Savings route — dual mode (company + manual)", () => {
  const content = readSrc("app/api/crm/energy-bills/savings/route.ts");

  it("imports calculateSavings and calculateSavingsFromBills", () => {
    expect(content).toContain("calculateSavings");
    expect(content).toContain("calculateSavingsFromBills");
  });

  it("imports listEnergyBillsByCompany", () => {
    expect(content).toContain("listEnergyBillsByCompany");
  });

  it("supports company-based path via companyId", () => {
    expect(content).toContain("companyId");
  });

  it("supports manual path via currentRetailer", () => {
    expect(content).toContain("currentRetailer");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Proposal route — full chain
// ═══════════════════════════════════════════════════════════════════

describe("Proposal route — full chain", () => {
  const content = readSrc("app/api/crm/energy-bills/proposal/route.ts");

  it("imports generateProposalPdf", () => {
    expect(content).toContain("generateProposalPdf");
  });

  it("imports getCompany for ownership check", () => {
    expect(content).toContain("getCompany");
  });

  it("verifies company.userId !== session.user.id", () => {
    expect(content).toContain("company.userId !== session.user.id");
  });

  it("returns 401 for unauthorized ownership", () => {
    expect(content).toContain("401");
  });

  it("sets Content-Type to application/pdf", () => {
    expect(content).toContain("Content-Type");
    expect(content).toContain("application/pdf");
  });

  it("sets Content-Disposition for download", () => {
    expect(content).toContain("Content-Disposition");
  });

  it("uses calculateSavingsFromBills for savings computation", () => {
    expect(content).toContain("calculateSavingsFromBills");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. Energy Bills Service — persistParsedBill chain
// ═══════════════════════════════════════════════════════════════════

describe("Energy Bills Service — persistParsedBill chain", () => {
  const content = readSrc("lib/crm/energy-bills.ts");

  it("looks up supply point by CUPS", () => {
    expect(content).toContain("getSupplyPointByCups");
  });

  it("auto-creates supply point if missing", () => {
    expect(content).toContain("createSupplyPoint");
  });

  it("creates a document record", () => {
    expect(content).toContain("documents");
  });

  it("sets document type to factura", () => {
    expect(content).toContain('type: "factura"');
  });

  it("updates supply point with latest parsed data", () => {
    expect(content).toContain("updateSupplyPoint");
  });

  it("stores the full raw extraction", () => {
    expect(content).toContain("rawExtraction");
  });

  it("stores the confidence score", () => {
    expect(content).toContain("confidenceScore");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. Company Detail Panel — Energia tab
// ═══════════════════════════════════════════════════════════════════

describe("Company Detail Panel — Energia tab", () => {
  const content = readSrc("components/crm/CrmCompanyDetailPanel.tsx");

  it("has 'energia' as a tab key", () => {
    expect(content).toContain('"energia"');
  });

  it("renders CrmEnergyBillsPanel component", () => {
    expect(content).toContain("CrmEnergyBillsPanel");
  });

  it("imports Flame icon", () => {
    expect(content).toContain("Flame");
  });

  it("has Energia label", () => {
    expect(content).toContain("Energia");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 10. Energy Bills Panel — full UI chain
// ═══════════════════════════════════════════════════════════════════

describe("Energy Bills Panel — full UI chain", () => {
  const content = readSrc("components/crm/CrmEnergyBillsPanel.tsx");

  it("fetches bills via /api/crm/energy-bills?companyId=", () => {
    expect(content).toContain("/api/crm/energy-bills?companyId=");
  });

  it("uploads via /api/crm/energy-bills/parse", () => {
    expect(content).toContain("/api/crm/energy-bills/parse");
  });

  it("calculates via /api/crm/energy-bills/savings", () => {
    expect(content).toContain("/api/crm/energy-bills/savings");
  });

  it("generates PDF via /api/crm/energy-bills/proposal", () => {
    expect(content).toContain("/api/crm/energy-bills/proposal");
  });

  it("has confidence badge logic", () => {
    expect(content).toMatch(/confidenceScore|confidence/);
  });

  it("has 'Subir factura' button text", () => {
    expect(content).toContain("Subir factura");
  });

  it("has 'Calcular ahorro' button text", () => {
    expect(content).toContain("Calcular ahorro");
  });

  it("has 'Generar propuesta' button text", () => {
    expect(content).toContain("Generar propuesta");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 11. Proposal PDF — structure
// ═══════════════════════════════════════════════════════════════════

describe("Proposal PDF — structure", () => {
  const content = readSrc("lib/crm/proposal-pdf.ts");

  it("imports from @react-pdf/renderer", () => {
    expect(content).toContain("@react-pdf/renderer");
  });

  it("exports generateProposalPdf function", () => {
    expect(content).toContain("generateProposalPdf");
  });

  it("exports ProposalPdfData interface", () => {
    expect(content).toContain("ProposalPdfData");
  });

  it("contains SINERGIA brand text", () => {
    expect(content).toContain("SINERGIA");
  });

  it("contains PROPUESTA text", () => {
    expect(content).toContain("PROPUESTA");
  });

  it("uses renderToBuffer to produce the PDF", () => {
    expect(content).toContain("renderToBuffer");
  });

  it("imports fmtEur for currency formatting", () => {
    expect(content).toContain("fmtEur");
  });

  it("has Somos Sinergia as default issuer", () => {
    expect(content).toContain("Somos Sinergia");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 12. Pipeline integration — types exports (unchanged from Phase 2)
// ═══════════════════════════════════════════════════════════════════

describe("Pipeline integration — PIPELINE_STATUSES unchanged", () => {
  it("PIPELINE_STATUSES has exactly 10 statuses", async () => {
    const types = await import("../../src/lib/crm/types");
    expect(types.PIPELINE_STATUSES).toHaveLength(10);
  });
});
