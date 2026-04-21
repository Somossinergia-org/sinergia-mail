/**
 * Email Action Executor — Executes CRM actions from email classification
 */
import { createTask } from "@/lib/crm/commercial-tasks";
import { createActivity, type ActivityType } from "@/lib/crm/activities";
import { createNotification } from "@/lib/crm/notifications";
import { listCompanies } from "@/lib/crm/companies";
import { logger, logError } from "@/lib/logger";
import type { CrmAction, AttachmentClassification, ClassificationResult } from "./classifier";

const log = logger.child({ component: "email-actions" });

/* ------------------------------------------------------------------ */
/*  Company Matcher — find CRM company by email domain or name         */
/* ------------------------------------------------------------------ */

interface CompanyMatch {
  id: number;
  name: string;
  confidence: number;
}

export async function findCompanyByEmail(
  userId: string,
  fromEmail: string,
  fromName: string,
): Promise<CompanyMatch | null> {
  try {
    // Extract domain from email
    const domain = fromEmail.split("@")[1]?.toLowerCase();
    if (!domain || ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com"].includes(domain)) {
      // Generic email providers — try to match by name
      if (fromName) {
        const result = await listCompanies({ userId, search: fromName, limit: 3 });
        if (result.length === 1) {
          return { id: result[0].id, name: result[0].name, confidence: 60 };
        }
      }
      return null;
    }

    // Try matching by domain (company name often contains domain parts)
    const domainBase = domain.split(".")[0]; // e.g., "tunergia" from "tunergia.es"
    const result = await listCompanies({ userId, search: domainBase, limit: 5 });

    if (result.length === 1) {
      return { id: result[0].id, name: result[0].name, confidence: 85 };
    }

    // Multiple matches — try exact domain match in email field if available
    if (result.length > 1) {
      // Return first match with lower confidence
      return { id: result[0].id, name: result[0].name, confidence: 50 };
    }

    // No match by domain — try by fromName
    if (fromName) {
      const nameResult = await listCompanies({ userId, search: fromName, limit: 3 });
      if (nameResult.length === 1) {
        return { id: nameResult[0].id, name: nameResult[0].name, confidence: 55 };
      }
    }

    return null;
  } catch (err) {
    logError(log, err, { userId, fromEmail }, "findCompanyByEmail failed");
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Excel Metadata Extractor                                           */
/* ------------------------------------------------------------------ */

export interface ExcelMetadata {
  sheetNames: string[];
  rowCount: number;
  columnCount: number;
  headers: string[];
  sampleData: string[][];   // first 5 rows
  detectedType: "tarifa_precios" | "tabla_datos" | "otro";
  hasPriceColumns: boolean;
  hasDateColumns: boolean;
}

export async function extractExcelMetadata(buffer: Buffer): Promise<ExcelMetadata> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  // ExcelJS expects ArrayBuffer, not Node Buffer
  await workbook.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return {
      sheetNames: workbook.worksheets.map((s) => s.name),
      rowCount: 0, columnCount: 0, headers: [], sampleData: [],
      detectedType: "otro", hasPriceColumns: false, hasDateColumns: false,
    };
  }

  const headers: string[] = [];
  const sampleData: string[][] = [];
  let rowCount = 0;
  let columnCount = 0;

  sheet.eachRow((row, rowNumber) => {
    rowCount++;
    const values = row.values as (string | number | Date | null)[];
    // Remove first empty element (ExcelJS rows are 1-indexed)
    const cells = values.slice(1).map((v) => (v != null ? String(v) : ""));
    columnCount = Math.max(columnCount, cells.length);

    if (rowNumber === 1) {
      headers.push(...cells);
    } else if (rowNumber <= 6) {
      sampleData.push(cells.slice(0, 10)); // max 10 columns for sample
    }
  });

  // Detect price-related columns
  const pricePatterns = /precio|tarifa|coste|importe|€|eur|pvp|margen|rate|price/i;
  const datePatterns = /fecha|date|vigencia|periodo|desde|hasta|inicio|fin/i;
  const hasPriceColumns = headers.some((h) => pricePatterns.test(h));
  const hasDateColumns = headers.some((h) => datePatterns.test(h));

  let detectedType: ExcelMetadata["detectedType"] = "otro";
  if (hasPriceColumns) detectedType = "tarifa_precios";
  else if (rowCount > 5) detectedType = "tabla_datos";

  return {
    sheetNames: workbook.worksheets.map((s) => s.name),
    rowCount, columnCount, headers,
    sampleData: sampleData.slice(0, 5),
    detectedType, hasPriceColumns, hasDateColumns,
  };
}

/* ------------------------------------------------------------------ */
/*  Action Executor                                                    */
/* ------------------------------------------------------------------ */

export interface ActionExecutionResult {
  executed: number;
  failed: number;
  details: Array<{
    action: string;
    success: boolean;
    entityId?: number;
    error?: string;
  }>;
  companyMatch: CompanyMatch | null;
}

export async function executeEmailActions(
  userId: string,
  emailId: number,
  fromEmail: string,
  fromName: string,
  subject: string,
  classification: ClassificationResult,
): Promise<ActionExecutionResult> {
  const result: ActionExecutionResult = {
    executed: 0,
    failed: 0,
    details: [],
    companyMatch: null,
  };

  if (classification.actions.length === 0) return result;

  // Try to find matching company
  const company = await findCompanyByEmail(userId, fromEmail, fromName);
  result.companyMatch = company;

  for (const action of classification.actions) {
    try {
      switch (action.type) {
        case "create_task": {
          const task = await createTask({
            userId,
            companyId: company?.id ?? null,
            title: (action.data.title as string) || `Revisar email: ${subject.slice(0, 80)}`,
            priority: action.priority as "alta" | "media" | "baja",
            source: ((action.data.source as string) || "suggested") as "manual" | "suggested" | "followup" | "renewal" | "case",
          });
          result.details.push({ action: "create_task", success: true, entityId: task.id });
          result.executed++;
          break;
        }

        case "create_notification": {
          const notif = await createNotification({
            userId,
            companyId: company?.id,
            type: (action.data.type as string) || "suggested_task",
            title: `Email: ${subject.slice(0, 100)}`,
            message: (action.data.message as string) || `Email procesado: ${subject}`,
            severity: (action.data.severity as string) || "info",
            dedupKey: `email_${emailId}_${action.type}`,
          });
          result.details.push({ action: "create_notification", success: true, entityId: notif.id });
          result.executed++;
          break;
        }

        case "log_activity": {
          if (company) {
            const activity = await createActivity({
              userId,
              companyId: company.id,
              type: (action.data.type as ActivityType) || "email",
              summary: (action.data.summary as string) || `Email: ${subject}`,
            });
            result.details.push({ action: "log_activity", success: true, entityId: activity.id });
            result.executed++;
          } else {
            result.details.push({ action: "log_activity", success: false, error: "No company match found" });
            result.failed++;
          }
          break;
        }

        case "extract_document": {
          // Document extraction is logged as metadata — actual extraction happens
          // for PDFs in the existing invoice flow, and for Excel in the sync loop
          result.details.push({ action: "extract_document", success: true });
          result.executed++;
          break;
        }

        case "parse_energy_bill": {
          // Energy bill parsing is handled by the existing flow in sync/route.ts
          // We just signal that it should happen
          result.details.push({ action: "parse_energy_bill", success: true });
          result.executed++;
          break;
        }

        case "link_company": {
          if (company) {
            result.details.push({ action: "link_company", success: true, entityId: company.id });
            result.executed++;
          } else {
            result.details.push({ action: "link_company", success: false, error: "No company match" });
            result.failed++;
          }
          break;
        }

        default:
          result.details.push({ action: action.type, success: false, error: "Unknown action type" });
          result.failed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      logError(log, err, { userId, emailId, action: action.type }, "action execution failed");
      result.details.push({ action: action.type, success: false, error: msg });
      result.failed++;
    }
  }

  return result;
}
