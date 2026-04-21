/**
 * Phase 3.5 Behavioral Tests — Energy Hardening
 *
 * Verifies code-level patterns for:
 *  1. Bill deduplication (period + file hash)
 *  2. CUPS tenant isolation (compound unique, scoped lookup)
 *  3. Real document storage (Vercel Blob + local fallback)
 *  4. Energy flow hardening (auth, ownership, error handling)
 *
 * Same file-content validation pattern as Phase 3 tests — no database required.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const srcDir = resolve(__dirname, "../../src");
const rootDir = resolve(__dirname, "../..");

function readSrc(path: string): string {
  return readFileSync(resolve(srcDir, path), "utf-8");
}

// ═══════════════════════════════════════════════════════════════════
// 1. CUPS Tenant Isolation — Schema
// ═══════════════════════════════════════════════════════════════════

describe("CUPS Tenant Isolation — Schema", () => {
  const schema = readSrc("db/schema.ts");

  it("supply_points.cups does NOT have global .unique()", () => {
    // The old pattern was: cups: varchar("cups", { length: 25 }).unique()
    // Should NOT match a standalone .unique() on cups line anymore
    const cupsLine = schema.split("\n").find(l => l.includes('cups: varchar("cups"'));
    expect(cupsLine).toBeDefined();
    // The line should NOT end with .unique() without being part of compound index
    expect(cupsLine).not.toMatch(/\.unique\(\)\s*,?\s*$/);
  });

  it("has compound unique index on (cups, companyId)", () => {
    expect(schema).toContain("supply_points_cups_company_uniq");
    expect(schema).toContain("uniqueIndex");
  });

  it("imports uniqueIndex from drizzle-orm", () => {
    expect(schema).toContain("uniqueIndex");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. CUPS Tenant Isolation — Supply Points Service
// ═══════════════════════════════════════════════════════════════════

describe("CUPS Tenant Isolation — Supply Points Service", () => {
  const spService = readSrc("lib/crm/supply-points.ts");

  it("getSupplyPointByCups requires companyId parameter", () => {
    expect(spService).toContain("getSupplyPointByCups(cups: string, companyId: number)");
  });

  it("getSupplyPointByCups filters by both cups AND companyId", () => {
    expect(spService).toContain("eq(supplyPoints.cups, cups)");
    expect(spService).toContain("eq(supplyPoints.companyId, companyId)");
  });

  it("uses 'and' combiner for multi-condition query", () => {
    expect(spService).toContain("import { eq, and, desc }");
  });

  it("exports getSupplyPointByCups", async () => {
    const mod = await import("../../src/lib/crm/supply-points");
    expect(typeof mod.getSupplyPointByCups).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Bill Deduplication — Energy Bills Service
// ═══════════════════════════════════════════════════════════════════

describe("Bill Deduplication — Energy Bills Service", () => {
  const ebService = readSrc("lib/crm/energy-bills.ts");

  it("exports DuplicateBillError class", async () => {
    const mod = await import("../../src/lib/crm/energy-bills");
    expect(mod.DuplicateBillError).toBeDefined();
    expect(typeof mod.DuplicateBillError).toBe("function");
  });

  it("DuplicateBillError has existingBillId property", () => {
    expect(ebService).toContain("existingBillId: number");
    expect(ebService).toContain('this.name = "DuplicateBillError"');
  });

  it("exports findDuplicateBill function", async () => {
    const mod = await import("../../src/lib/crm/energy-bills");
    expect(typeof mod.findDuplicateBill).toBe("function");
  });

  it("exports findBillByFileHash function", async () => {
    const mod = await import("../../src/lib/crm/energy-bills");
    expect(typeof mod.findBillByFileHash).toBe("function");
  });

  it("findDuplicateBill checks supplyPointId + billingPeriodStart + billingPeriodEnd", () => {
    expect(ebService).toContain("eq(energyBills.supplyPointId, supplyPointId)");
    expect(ebService).toContain("eq(energyBills.billingPeriodStart, periodStart)");
    expect(ebService).toContain("eq(energyBills.billingPeriodEnd, periodEnd)");
  });

  it("findBillByFileHash checks by fileHash", () => {
    expect(ebService).toContain("eq(energyBills.fileHash, fileHash)");
  });

  it("persistParsedBill checks file hash before persisting", () => {
    // Must check fileHash early in persistParsedBill
    expect(ebService).toContain("findBillByFileHash(fileHash)");
    expect(ebService).toContain("throw new DuplicateBillError");
  });

  it("persistParsedBill checks period deduplication after supply point resolution", () => {
    expect(ebService).toContain("findDuplicateBill(supplyPoint.id, periodStart, periodEnd)");
  });

  it("persistParsedBill accepts fileHash parameter", () => {
    expect(ebService).toContain("fileHash?: string");
  });

  it("persistParsedBill passes fileHash to createEnergyBill", () => {
    expect(ebService).toContain("fileHash: fileHash ?? null");
  });

  it("persistParsedBill calls getSupplyPointByCups with companyId", () => {
    expect(ebService).toContain("getSupplyPointByCups(parsedBill.cups, companyId)");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Schema — energyBills dedup index + fileHash column
// ═══════════════════════════════════════════════════════════════════

describe("Schema — energyBills hardening", () => {
  const schema = readSrc("db/schema.ts");

  it("energyBills has fileHash column", () => {
    expect(schema).toContain('fileHash: varchar("file_hash", { length: 64 })');
  });

  it("energyBills has dedup unique index", () => {
    expect(schema).toContain("energy_bills_dedup_idx");
    expect(schema).toContain("uniqueIndex");
  });

  it("energyBills has file hash index", () => {
    expect(schema).toContain("energy_bills_file_hash_idx");
  });

  it("dedup index covers supplyPointId + billingPeriodStart + billingPeriodEnd", () => {
    // The uniqueIndex definition should reference these 3 columns
    expect(schema).toContain(
      'uniqueIndex("energy_bills_dedup_idx").on(table.supplyPointId, table.billingPeriodStart, table.billingPeriodEnd)'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Storage Helper
// ═══════════════════════════════════════════════════════════════════

describe("Storage Helper — src/lib/storage.ts", () => {
  it("storage.ts file exists", () => {
    expect(existsSync(resolve(srcDir, "lib/storage.ts"))).toBe(true);
  });

  const storage = readSrc("lib/storage.ts");

  it("exports uploadFile function", async () => {
    const mod = await import("../../src/lib/storage");
    expect(typeof mod.uploadFile).toBe("function");
  });

  it("exports deleteFile function", async () => {
    const mod = await import("../../src/lib/storage");
    expect(typeof mod.deleteFile).toBe("function");
  });

  it("exports computeFileHash function", async () => {
    const mod = await import("../../src/lib/storage");
    expect(typeof mod.computeFileHash).toBe("function");
  });

  it("computeFileHash produces SHA-256 hex", async () => {
    const { computeFileHash } = await import("../../src/lib/storage");
    const hash = computeFileHash(Buffer.from("test content"));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("same content produces same hash", async () => {
    const { computeFileHash } = await import("../../src/lib/storage");
    const h1 = computeFileHash(Buffer.from("identical"));
    const h2 = computeFileHash(Buffer.from("identical"));
    expect(h1).toBe(h2);
  });

  it("different content produces different hash", async () => {
    const { computeFileHash } = await import("../../src/lib/storage");
    const h1 = computeFileHash(Buffer.from("file A"));
    const h2 = computeFileHash(Buffer.from("file B"));
    expect(h1).not.toBe(h2);
  });

  it("uses Vercel Blob when BLOB_READ_WRITE_TOKEN is present", () => {
    expect(storage).toContain("BLOB_READ_WRITE_TOKEN");
    expect(storage).toContain('@vercel/blob');
  });

  it("has local fallback for dev/test", () => {
    expect(storage).toContain("/tmp");
    expect(storage).toContain("local-storage");
  });

  it("uploadFile without BLOB_READ_WRITE_TOKEN uses local storage", async () => {
    // Ensure env var is NOT set for this test
    const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const { uploadFile } = await import("../../src/lib/storage");
    const result = await uploadFile(Buffer.from("test pdf"), "test.pdf", {
      folder: "test-uploads",
    });
    expect(result.url).toContain("/local-storage/");
    expect(result.pathname).toContain("test-uploads/");
    expect(result.pathname).toContain("test.pdf");

    // Restore
    if (originalToken) process.env.BLOB_READ_WRITE_TOKEN = originalToken;
  });

  it("sanitizes file names in upload path", () => {
    expect(storage).toContain("sanitizeFileName");
    expect(storage).toContain(/[^a-zA-Z0-9._-]/g.source);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Parse Route — Storage + Dedup Integration
// ═══════════════════════════════════════════════════════════════════

describe("Parse Route — Storage + Dedup Integration", () => {
  const parseRoute = readSrc("app/api/crm/energy-bills/parse/route.ts");

  it("imports uploadFile and computeFileHash from storage", () => {
    expect(parseRoute).toContain('import { uploadFile, computeFileHash } from "@/lib/storage"');
  });

  it("imports DuplicateBillError from energy-bills", () => {
    expect(parseRoute).toContain("DuplicateBillError");
  });

  it("computes file hash before uploading", () => {
    expect(parseRoute).toContain("computeFileHash(buffer)");
  });

  it("calls uploadFile with real storage", () => {
    expect(parseRoute).toContain("uploadFile(buffer, file.name");
  });

  it("passes fileHash to persistParsedBill", () => {
    expect(parseRoute).toContain("fileHash,");
    // Should NOT have the old placeholder pattern
    expect(parseRoute).not.toContain('fileUrl: `/uploads/');
  });

  it("uses uploaded.url as fileUrl (not placeholder)", () => {
    expect(parseRoute).toContain("fileUrl: uploaded.url");
  });

  it("returns 409 for duplicate bills", () => {
    expect(parseRoute).toContain("instanceof DuplicateBillError");
    expect(parseRoute).toContain("status: 409");
    expect(parseRoute).toContain("duplicate: true");
    expect(parseRoute).toContain("existingBillId");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Migration SQL
// ═══════════════════════════════════════════════════════════════════

describe("Phase 3.5 Migration SQL", () => {
  it("migration file exists", () => {
    expect(existsSync(resolve(rootDir, "drizzle/0003_phase3_5_hardening.sql"))).toBe(true);
  });

  const migration = readFileSync(
    resolve(rootDir, "drizzle/0003_phase3_5_hardening.sql"),
    "utf-8",
  );

  it("drops old global unique on cups", () => {
    expect(migration).toContain("DROP INDEX IF EXISTS");
    expect(migration).toContain("supply_points_cups_key");
  });

  it("creates compound unique on (cups, company_id)", () => {
    expect(migration).toContain("supply_points_cups_company_uniq");
    expect(migration).toContain('"cups", "company_id"');
  });

  it("adds file_hash column to energy_bills", () => {
    expect(migration).toContain("file_hash");
    expect(migration).toContain("VARCHAR(64)");
  });

  it("creates dedup unique index on energy_bills", () => {
    expect(migration).toContain("energy_bills_dedup_idx");
    expect(migration).toContain("supply_point_id");
    expect(migration).toContain("billing_period_start");
    expect(migration).toContain("billing_period_end");
  });

  it("creates file hash index", () => {
    expect(migration).toContain("energy_bills_file_hash_idx");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. Cross-Tenant CUPS Isolation — Behavioral
// ═══════════════════════════════════════════════════════════════════

describe("Cross-Tenant CUPS Isolation — Behavioral", () => {
  const ebService = readSrc("lib/crm/energy-bills.ts");
  const spService = readSrc("lib/crm/supply-points.ts");

  it("persistParsedBill never calls getSupplyPointByCups without companyId", () => {
    // The old pattern was: getSupplyPointByCups(parsedBill.cups)
    // The new pattern is: getSupplyPointByCups(parsedBill.cups, companyId)
    const callPattern = /getSupplyPointByCups\(parsedBill\.cups\s*\)/;
    expect(callPattern.test(ebService)).toBe(false);
  });

  it("getSupplyPointByCups signature requires exactly 2 params", () => {
    // Check the function definition has exactly (cups, companyId)
    expect(spService).toContain("async function getSupplyPointByCups(cups: string, companyId: number)");
  });

  it("supply points service uses 'and' for compound queries", () => {
    expect(spService).toContain("and(");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. DuplicateBillError — Behavior
// ═══════════════════════════════════════════════════════════════════

describe("DuplicateBillError — Behavior", () => {
  it("can be instantiated with existingBillId", async () => {
    const { DuplicateBillError } = await import("../../src/lib/crm/energy-bills");
    const err = new DuplicateBillError(42, "Test duplicate");
    expect(err.existingBillId).toBe(42);
    expect(err.message).toBe("Test duplicate");
    expect(err.name).toBe("DuplicateBillError");
    expect(err instanceof Error).toBe(true);
  });

  it("has default message when none provided", async () => {
    const { DuplicateBillError } = await import("../../src/lib/crm/energy-bills");
    const err = new DuplicateBillError(99);
    expect(err.message).toContain("99");
    expect(err.message).toContain("duplicada");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 10. Package Dependencies
// ═══════════════════════════════════════════════════════════════════

describe("Phase 3.5 Dependencies", () => {
  const pkg = JSON.parse(
    readFileSync(resolve(rootDir, "package.json"), "utf-8"),
  );

  it("@vercel/blob is installed", () => {
    expect(pkg.dependencies["@vercel/blob"]).toBeDefined();
  });
});
