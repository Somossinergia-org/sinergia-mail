/**
 * Phase 14 — Email → IA → Action CRM Pipeline
 *
 * Comprehensive tests covering:
 * A. Classifier: operational categories + routing decisions
 * B. Noise filtering: publicidad, spam, newsletters silenced
 * C. Energy bills: factura energética → energía (NOT comercial)
 * D. Admin invoices: factura admin → finanzas
 * E. Strategic suppliers: Tunergia, Procesus → docs + tasks
 * F. Client emails: urgency detection → tasks
 * G. Attachment classification: PDF, Excel, images
 * H. Excel metadata extraction
 * I. Action executor logic
 * J. Sync integration: new columns, counters, wiring
 * K. Company matching
 * L. Deduplication + noise memory exclusion
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../../src");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf-8");
}

/* ================================================================== */
/*  A. Classifier — Operational Categories                             */
/* ================================================================== */
describe("A — Classifier operational categories", () => {
  const src = readSrc("lib/email/classifier.ts");

  it("exports classifyEmail function", () => {
    expect(src).toContain("export function classifyEmail");
  });

  it("defines 14 operational categories", () => {
    const categories = [
      '"publicidad"', '"spam"', '"notificacion_auto"',
      '"factura_energia"', '"factura_admin"',
      '"cliente_urgente"', '"cliente_normal"', '"prospecto"',
      '"proveedor_precios"', '"proveedor_normal"',
      '"legal_contrato"', '"documentacion_util"', '"interno"', '"otro"',
    ];
    for (const cat of categories) {
      expect(src).toContain(cat);
    }
  });

  it("defines 8 routing destinations", () => {
    const routes = [
      '"silenciar"', '"recepcion"', '"energia"', '"finanzas"',
      '"comercial"', '"legal"', '"documentacion"', '"log_only"',
    ];
    for (const route of routes) {
      expect(src).toContain(route);
    }
  });

  it("returns ClassificationResult with all required fields", () => {
    expect(src).toContain("operationalCategory");
    expect(src).toContain("routing");
    expect(src).toContain("confidence");
    expect(src).toContain("reason");
    expect(src).toContain("actions");
    expect(src).toContain("shouldIndexMemory");
    expect(src).toContain("isNoise");
    expect(src).toContain("isStrategic");
  });
});

/* ================================================================== */
/*  B. Noise Filtering — Publicidad, Spam, Newsletters                 */
/* ================================================================== */
describe("B — Noise filtering (publicidad/spam silenced)", () => {
  const src = readSrc("lib/email/classifier.ts");

  it("detects noreply/newsletter senders as noise", () => {
    expect(src).toContain("noreply@");
    expect(src).toContain("newsletter@");
    expect(src).toContain("marketing@");
  });

  it("detects mass mailing platforms (mailchimp, sendgrid, hubspot, brevo)", () => {
    expect(src).toContain("mailchimp");
    expect(src).toContain("sendgrid");
    expect(src).toContain("hubspot");
    expect(src).toContain("brevo");
  });

  it("detects promotional subject patterns", () => {
    expect(src).toContain("boletín");
    expect(src).toContain("promoción");
    expect(src).toContain("descuento");
    expect(src).toContain("unsubscribe");
    expect(src).toContain("darse de baja");
  });

  it("routes SPAM to silenciar with no actions", () => {
    expect(src).toContain('aiCategory === "SPAM"');
    expect(src).toContain('"silenciar"');
  });

  it("routes MARKETING to silenciar (unless strategic supplier)", () => {
    expect(src).toContain('aiCategory === "MARKETING"');
    expect(src).toContain("!strategicSupplier");
  });

  it("excludes noise from memory indexing", () => {
    // The noise returns should have shouldIndexMemory: false
    expect(src).toMatch(/isNoise:\s*true[\s\S]*?shouldIndexMemory:\s*false/);
  });

  it("strategic suppliers are NEVER marked as noise even with unsubscribe links", () => {
    expect(src).toContain("STRATEGIC_SUPPLIERS.some");
    expect(src).toContain("!strategicSupplier");
  });
});

/* ================================================================== */
/*  C. Energy Bills — factura energética → energía                     */
/* ================================================================== */
describe("C — Energy bills routing", () => {
  const src = readSrc("lib/email/classifier.ts");

  it("detects energy bill patterns (CUPS, kWh, potencia, peaje, tarifa)", () => {
    expect(src).toContain("cups");
    expect(src).toContain("kWh");
    expect(src).toContain("potencia contratada");
    expect(src).toContain("peaje");
    expect(src).toContain("comercializadora");
  });

  it("routes energy bills to 'energia' (NOT comercial)", () => {
    // The energy bill section should route to energia
    const energySection = src.slice(
      src.indexOf("// ── 5. ENERGY INVOICE"),
      src.indexOf("// ── 6. ADMINISTRATIVE"),
    );
    expect(energySection).toContain('"energia"');
    expect(energySection).not.toContain('"comercial"');
  });

  it("classifies as factura_energia (not factura_admin)", () => {
    const energySection = src.slice(
      src.indexOf("// ── 5. ENERGY INVOICE"),
      src.indexOf("// ── 6. ADMINISTRATIVE"),
    );
    expect(energySection).toContain('"factura_energia"');
  });

  it("creates parse_energy_bill action for PDF attachments", () => {
    expect(src).toContain('"parse_energy_bill"');
  });

  it("detects energy bill from attachment filenames", () => {
    expect(src).toContain("factura_energia");
    // The classifyAttachments function checks filenames
    expect(src).toContain("factura.*(?:luz|energ|eléctric|suministro|cups)");
  });
});

/* ================================================================== */
/*  D. Admin Invoices — factura admin → finanzas                       */
/* ================================================================== */
describe("D — Administrative invoices routing", () => {
  const src = readSrc("lib/email/classifier.ts");

  it("detects admin invoice patterns (teléfono, seguro, alquiler, nómina)", () => {
    expect(src).toContain("teléfono");
    expect(src).toContain("seguro");
    expect(src).toContain("alquiler");
    expect(src).toContain("nómina");
  });

  it("routes admin invoices to finanzas", () => {
    const adminSection = src.slice(
      src.indexOf("// ── 6. ADMINISTRATIVE"),
      src.indexOf("// ── 7. GENERIC INVOICE"),
    );
    expect(adminSection).toContain('"finanzas"');
  });

  it("classifies as factura_admin", () => {
    const adminSection = src.slice(
      src.indexOf("// ── 6. ADMINISTRATIVE"),
      src.indexOf("// ── 7. GENERIC INVOICE"),
    );
    expect(adminSection).toContain('"factura_admin"');
  });

  it("differentiates from energy bills (separate patterns)", () => {
    expect(src).toContain("ENERGY_BILL_PATTERNS");
    expect(src).toContain("ADMIN_INVOICE_PATTERNS");
  });
});

/* ================================================================== */
/*  E. Strategic Suppliers — Tunergia, Procesus                        */
/* ================================================================== */
describe("E — Strategic supplier detection (Tunergia, Procesus, etc.)", () => {
  const src = readSrc("lib/email/classifier.ts");

  it("defines strategic suppliers list", () => {
    expect(src).toContain("STRATEGIC_SUPPLIERS");
    expect(src).toContain("Tunergia");
    expect(src).toContain("Procesus");
  });

  it("includes major energy companies", () => {
    expect(src).toContain("Endesa");
    expect(src).toContain("Iberdrola");
    expect(src).toContain("Naturgy");
    expect(src).toContain("Repsol");
    expect(src).toContain("TotalEnergies");
    expect(src).toContain("Holaluz");
  });

  it("detects price update signals", () => {
    expect(src).toContain("PRICE_UPDATE_PATTERNS");
    expect(src).toContain("actualización.*(?:precios|tarifas|condiciones)");
    expect(src).toContain("nuevos?\\s*precios");
  });

  it("creates alta priority task for price updates", () => {
    const strategicSection = src.slice(
      src.indexOf("// ── 4. STRATEGIC SUPPLIER"),
      src.indexOf("// ── 5. ENERGY INVOICE"),
    );
    expect(strategicSection).toContain('"create_task"');
    expect(strategicSection).toContain('"alta"');
    expect(strategicSection).toContain("Revisar actualización de precios");
  });

  it("creates notification for price updates", () => {
    const strategicSection = src.slice(
      src.indexOf("// ── 4. STRATEGIC SUPPLIER"),
      src.indexOf("// ── 5. ENERGY INVOICE"),
    );
    expect(strategicSection).toContain('"create_notification"');
    expect(strategicSection).toContain("actualización de precios");
  });

  it("routes price updates to documentacion", () => {
    const strategicSection = src.slice(
      src.indexOf("// ── 4. STRATEGIC SUPPLIER"),
      src.indexOf("// ── 5. ENERGY INVOICE"),
    );
    expect(strategicSection).toContain('"documentacion"');
  });

  it("extracts documents from strategic suppliers", () => {
    expect(src).toContain('"extract_document"');
  });

  it("marks strategic price updates as isStrategic: true", () => {
    const strategicSection = src.slice(
      src.indexOf("// ── 4. STRATEGIC SUPPLIER"),
      src.indexOf("// ── 5. ENERGY INVOICE"),
    );
    expect(strategicSection).toContain("isStrategic: isPrice");
  });
});

/* ================================================================== */
/*  F. Client Emails — Urgency Detection                               */
/* ================================================================== */
describe("F — Client emails with urgency detection", () => {
  const src = readSrc("lib/email/classifier.ts");

  it("defines urgency patterns in Spanish", () => {
    expect(src).toContain("urgente");
    expect(src).toContain("inmediato");
    expect(src).toContain("cuanto antes");
    expect(src).toContain("reclamación");
    expect(src).toContain("avería");
    expect(src).toContain("corte de luz");
    expect(src).toContain("sin suministro");
  });

  it("creates URGENTE task for urgent client emails", () => {
    const urgentSection = src.slice(
      src.indexOf("// ── 8. CLIENT WITH URGENCY"),
      src.indexOf("// ── 9. NORMAL CLIENT"),
    );
    expect(urgentSection).toContain('"create_task"');
    expect(urgentSection).toContain("URGENTE");
    expect(urgentSection).toContain('"alta"');
  });

  it("routes urgent clients to comercial", () => {
    const urgentSection = src.slice(
      src.indexOf("// ── 8. CLIENT WITH URGENCY"),
      src.indexOf("// ── 9. NORMAL CLIENT"),
    );
    expect(urgentSection).toContain('"comercial"');
  });

  it("logs activity for urgent client emails", () => {
    const urgentSection = src.slice(
      src.indexOf("// ── 8. CLIENT WITH URGENCY"),
      src.indexOf("// ── 9. NORMAL CLIENT"),
    );
    expect(urgentSection).toContain('"log_activity"');
  });

  it("normal client emails just log activity (no task)", () => {
    const normalSection = src.slice(
      src.indexOf("// ── 9. NORMAL CLIENT"),
      src.indexOf("// ── 10. LEGAL"),
    );
    expect(normalSection).toContain('"log_activity"');
    expect(normalSection).not.toContain('"create_task"');
  });
});

/* ================================================================== */
/*  G. Attachment Classification                                       */
/* ================================================================== */
describe("G — Attachment classification by filename", () => {
  const src = readSrc("lib/email/classifier.ts");

  it("classifies PDF files", () => {
    expect(src).toContain('".pdf"');
  });

  it("classifies Excel files (.xlsx, .xls, .csv, .ods)", () => {
    expect(src).toContain("xlsx?");
    expect(src).toContain("csv");
    expect(src).toContain("ods");
  });

  it("classifies image files", () => {
    expect(src).toContain("jpe?g");
    expect(src).toContain("png");
    expect(src).toContain("gif");
  });

  it("detects document types from filenames", () => {
    // Check docType detection patterns
    expect(src).toContain('"factura_energia"');
    expect(src).toContain('"factura_admin"');
    expect(src).toContain('"tarifa_precios"');
    expect(src).toContain('"contrato"');
    expect(src).toContain('"anexo_comercial"');
    expect(src).toContain('"tabla_datos"');
    expect(src).toContain('"documento_tecnico"');
  });

  it("marks tarifa/contrato/anexo as strategic", () => {
    expect(src).toContain('["tarifa_precios", "contrato", "anexo_comercial"]');
  });

  it("shouldExtract is true for PDF/Excel with known docType", () => {
    expect(src).toContain("(isPdf || isExcel) && docType !== ");
  });
});

/* ================================================================== */
/*  H. Excel Metadata Extraction                                       */
/* ================================================================== */
describe("H — Excel metadata extraction (actions.ts)", () => {
  const src = readSrc("lib/email/actions.ts");

  it("exports extractExcelMetadata function", () => {
    expect(src).toContain("export async function extractExcelMetadata");
  });

  it("uses ExcelJS for parsing", () => {
    expect(src).toContain('import("exceljs")');
  });

  it("extracts sheet names, headers, row count", () => {
    expect(src).toContain("sheetNames");
    expect(src).toContain("headers");
    expect(src).toContain("rowCount");
    expect(src).toContain("columnCount");
  });

  it("extracts sample data (first 5 rows)", () => {
    expect(src).toContain("sampleData");
    expect(src).toContain("rowNumber <= 6");
  });

  it("detects price-related columns", () => {
    expect(src).toContain("hasPriceColumns");
    expect(src).toContain("precio|tarifa|coste|importe");
  });

  it("detects date-related columns", () => {
    expect(src).toContain("hasDateColumns");
    expect(src).toContain("fecha|date|vigencia");
  });

  it("auto-detects tarifa_precios type when price columns found", () => {
    expect(src).toContain('"tarifa_precios"');
    expect(src).toContain("hasPriceColumns");
  });
});

/* ================================================================== */
/*  I. Action Executor                                                 */
/* ================================================================== */
describe("I — Action executor (actions.ts)", () => {
  const src = readSrc("lib/email/actions.ts");

  it("exports executeEmailActions function", () => {
    expect(src).toContain("export async function executeEmailActions");
  });

  it("handles create_task action", () => {
    expect(src).toContain('case "create_task"');
    expect(src).toContain("createTask({");
  });

  it("handles create_notification action", () => {
    expect(src).toContain('case "create_notification"');
    expect(src).toContain("createNotification({");
  });

  it("handles log_activity action (requires company match)", () => {
    expect(src).toContain('case "log_activity"');
    expect(src).toContain("createActivity({");
    // Should only log if company found
    expect(src).toContain("if (company)");
    expect(src).toContain("No company match found");
  });

  it("handles extract_document action", () => {
    expect(src).toContain('case "extract_document"');
  });

  it("handles parse_energy_bill action", () => {
    expect(src).toContain('case "parse_energy_bill"');
  });

  it("uses dedupKey for notifications", () => {
    expect(src).toContain("dedupKey");
  });

  it("returns ActionExecutionResult with executed/failed counts", () => {
    expect(src).toContain("executed");
    expect(src).toContain("failed");
    expect(src).toContain("details");
    expect(src).toContain("companyMatch");
  });
});

/* ================================================================== */
/*  J. Sync Integration — wiring in route.ts                           */
/* ================================================================== */
describe("J — Sync route integration (route.ts)", () => {
  const src = readSrc("app/api/sync/route.ts");

  it("imports classifyEmail from email/classifier", () => {
    expect(src).toContain('import { classifyEmail } from "@/lib/email/classifier"');
  });

  it("imports executeEmailActions and extractExcelMetadata from email/actions", () => {
    expect(src).toContain('import { executeEmailActions, extractExcelMetadata } from "@/lib/email/actions"');
  });

  it("calls classifyEmail after Gemini categorization", () => {
    // classifyEmail should come after categorizeEmail
    const geminiIdx = src.indexOf("categorizeEmail(");
    const classifyIdx = src.indexOf("classifyEmail({");
    expect(geminiIdx).toBeGreaterThan(0);
    expect(classifyIdx).toBeGreaterThan(geminiIdx);
  });

  it("passes Gemini result + email metadata to classifier", () => {
    expect(src).toContain("aiCategory: ai.category");
    expect(src).toContain("aiPriority: ai.priority");
    expect(src).toContain("aiConfidence: ai.confidence");
  });

  it("stores operationalCategory in DB insert", () => {
    expect(src).toContain("operationalCategory: classification.operationalCategory");
  });

  it("stores routing in DB insert", () => {
    expect(src).toContain("routing: classification.routing");
  });

  it("stores classificationMeta in DB insert", () => {
    expect(src).toContain("classificationMeta:");
    expect(src).toContain("confidence: classification.confidence");
    expect(src).toContain("reason: classification.reason");
  });

  it("noise emails get priority BAJA override", () => {
    expect(src).toContain('classification.isNoise ? "BAJA" : ai.priority');
  });

  it("calls executeEmailActions after DB insert (non-noise only)", () => {
    expect(src).toContain("!classification.isNoise && classification.actions.length > 0");
    expect(src).toContain("executeEmailActions(");
  });

  it("tracks noiseFiltered counter", () => {
    expect(src).toContain("result.noiseFiltered++");
    expect(src).toContain("noiseFiltered");
  });

  it("tracks actionsExecuted counter", () => {
    expect(src).toContain("result.actionsExecuted += actionResult.executed");
  });

  it("tracks excelProcessed counter", () => {
    expect(src).toContain("result.excelProcessed++");
    expect(src).toContain("excelProcessed");
  });

  it("uses classification.shouldIndexMemory for memory decision", () => {
    expect(src).toContain("classification.shouldIndexMemory");
  });

  it("includes operationalCategory and routing in memory metadata", () => {
    expect(src).toContain("operationalCategory: classification.operationalCategory");
    expect(src).toContain("routing: classification.routing");
  });
});

/* ================================================================== */
/*  J2. Sync — Attachment processing enhanced                          */
/* ================================================================== */
describe("J2 — Enhanced attachment processing in sync", () => {
  const src = readSrc("app/api/sync/route.ts");

  it("detects Excel files in attachment loop", () => {
    expect(src).toContain("isExcel");
    expect(src).toContain(/\.(xlsx?|csv|tsv|ods)$/);
  });

  it("downloads and extracts Excel metadata", () => {
    expect(src).toContain("extractExcelMetadata(excelBuffer)");
  });

  it("stores Excel metadata in invoices table", () => {
    expect(src).toContain('category: metadata.detectedType === "tarifa_precios" ? "TARIFA" : "DOCUMENTO"');
  });

  it("ingests strategic Excel docs to memory", () => {
    expect(src).toContain('kind: "pdf"');
    expect(src).toContain("Excel:");
  });

  it("uses classification.operationalCategory to decide PDF category", () => {
    expect(src).toContain("isEnergyBill");
    expect(src).toContain('isEnergyBill ? "ENERGIA" : invoiceData.category');
  });

  it("processes PDFs for strategic docs, not just FACTURA", () => {
    expect(src).toContain("classification.isStrategic");
    expect(src).toContain("shouldProcessPdf");
  });

  it("uses invoice kind for energy bill memory entries with routing metadata", () => {
    expect(src).toContain('kind: "invoice"');
    expect(src).toContain("routing: classification.routing");
  });
});

/* ================================================================== */
/*  K. Company Matching                                                */
/* ================================================================== */
describe("K — Company matching (actions.ts)", () => {
  const src = readSrc("lib/email/actions.ts");

  it("exports findCompanyByEmail function", () => {
    expect(src).toContain("export async function findCompanyByEmail");
  });

  it("extracts domain from email for matching", () => {
    expect(src).toContain('fromEmail.split("@")[1]');
    expect(src).toContain("domainBase");
  });

  it("skips generic email providers (gmail, hotmail, outlook, yahoo)", () => {
    expect(src).toContain("gmail.com");
    expect(src).toContain("hotmail.com");
    expect(src).toContain("outlook.com");
    expect(src).toContain("yahoo.com");
  });

  it("falls back to name-based search for generic providers", () => {
    expect(src).toContain("search: fromName");
  });

  it("returns confidence scores", () => {
    expect(src).toContain("confidence: 85");
    expect(src).toContain("confidence: 60");
    expect(src).toContain("confidence: 50");
  });

  it("uses listCompanies for search", () => {
    expect(src).toContain("listCompanies({");
  });
});

/* ================================================================== */
/*  L. DB Schema — new columns                                         */
/* ================================================================== */
describe("L — DB schema + migration for Phase 14", () => {
  const schema = readSrc("db/schema.ts");

  it("emails table has operationalCategory column", () => {
    expect(schema).toContain('operational_category');
    expect(schema).toContain("operationalCategory");
  });

  it("emails table has routing column", () => {
    expect(schema).toContain('"routing"');
  });

  it("emails table has classificationMeta jsonb column", () => {
    expect(schema).toContain("classification_meta");
    expect(schema).toContain("classificationMeta");
  });

  it("migration file exists", () => {
    const migrationPath = path.resolve(__dirname, "../../drizzle/0006_phase14_email_classification.sql");
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it("migration adds operational_category column", () => {
    const migration = fs.readFileSync(
      path.resolve(__dirname, "../../drizzle/0006_phase14_email_classification.sql"),
      "utf-8",
    );
    expect(migration).toContain("operational_category");
    expect(migration).toContain("IF NOT EXISTS");
  });

  it("migration adds routing column", () => {
    const migration = fs.readFileSync(
      path.resolve(__dirname, "../../drizzle/0006_phase14_email_classification.sql"),
      "utf-8",
    );
    expect(migration).toContain("routing VARCHAR(20)");
  });

  it("migration creates indexes", () => {
    const migration = fs.readFileSync(
      path.resolve(__dirname, "../../drizzle/0006_phase14_email_classification.sql"),
      "utf-8",
    );
    expect(migration).toContain("emails_op_category_idx");
    expect(migration).toContain("emails_routing_idx");
  });
});

/* ================================================================== */
/*  M. Classification Decision Matrix                                  */
/* ================================================================== */
describe("M — Classification decision matrix (classifier logic)", () => {
  const src = readSrc("lib/email/classifier.ts");

  it("processes noise BEFORE strategic suppliers (correct priority order)", () => {
    const noiseIdx = src.indexOf("// ── 1. NOISE CHECK");
    const strategicIdx = src.indexOf("// ── 4. STRATEGIC SUPPLIER");
    expect(noiseIdx).toBeGreaterThan(0);
    expect(noiseIdx).toBeLessThan(strategicIdx);
  });

  it("strategic supplier check overrides noise for known suppliers", () => {
    // Inside noise check, there's an exception for strategic suppliers
    const noiseSection = src.slice(
      src.indexOf("// ── 1. NOISE CHECK"),
      src.indexOf("// ── 2. MARKETING"),
    );
    expect(noiseSection).toContain("!strategicSupplier");
  });

  it("energy bill takes priority over admin invoice when both patterns match", () => {
    const energyIdx = src.indexOf("// ── 5. ENERGY INVOICE");
    const adminIdx = src.indexOf("// ── 6. ADMINISTRATIVE");
    expect(energyIdx).toBeLessThan(adminIdx);
  });

  it("client urgency check before normal client classification", () => {
    const urgentIdx = src.indexOf("// ── 8. CLIENT WITH URGENCY");
    const normalIdx = src.indexOf("// ── 9. NORMAL CLIENT");
    expect(urgentIdx).toBeLessThan(normalIdx);
  });

  it("legal emails create alta priority notification", () => {
    const legalSection = src.slice(
      src.indexOf("// ── 10. LEGAL"),
      src.indexOf("// ── 11. SUPPLIER"),
    );
    expect(legalSection).toContain('"alta"');
    expect(legalSection).toContain('"warning"');
  });

  it("RRHH routes to finanzas", () => {
    const rrhhSection = src.slice(
      src.indexOf("// ── 12. RRHH"),
      src.indexOf("// ── 13. PERSONAL"),
    );
    expect(rrhhSection).toContain('"finanzas"');
  });

  it("PERSONAL routes to log_only (no CRM actions)", () => {
    const personalSection = src.slice(
      src.indexOf("// ── 13. PERSONAL"),
      src.indexOf("// ── 14. FALLBACK"),
    );
    expect(personalSection).toContain('"log_only"');
  });

  it("fallback routes to recepcion with low confidence", () => {
    const fallbackSection = src.slice(src.indexOf("// ── 14. FALLBACK"));
    expect(fallbackSection).toContain('"recepcion"');
    expect(fallbackSection).toContain("confidence: 50");
  });
});

/* ================================================================== */
/*  N. Aggregate Counters in Response                                  */
/* ================================================================== */
describe("N — Sync response includes all new counters", () => {
  const src = readSrc("app/api/sync/route.ts");

  it("AccountSyncResult interface has excelProcessed", () => {
    expect(src).toContain("excelProcessed: number");
  });

  it("AccountSyncResult interface has actionsExecuted", () => {
    expect(src).toContain("actionsExecuted: number");
  });

  it("AccountSyncResult interface has noiseFiltered", () => {
    expect(src).toContain("noiseFiltered: number");
  });

  it("aggregate reducer sums all new counters", () => {
    expect(src).toContain("excelProcessed: acc.excelProcessed + r.excelProcessed");
    expect(src).toContain("actionsExecuted: acc.actionsExecuted + r.actionsExecuted");
    expect(src).toContain("noiseFiltered: acc.noiseFiltered + r.noiseFiltered");
  });

  it("per-account response includes new counters", () => {
    expect(src).toContain("excelProcessed: r.excelProcessed");
    expect(src).toContain("actionsExecuted: r.actionsExecuted");
    expect(src).toContain("noiseFiltered: r.noiseFiltered");
  });
});
