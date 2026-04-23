/**
 * Import Module — Dedup + Transactional Insert/Update + Audit Trail
 * MVP: empresas, contactos, puntos de suministro
 */

import { db, schema } from "@/db";
import { eq, and, ilike, sql } from "drizzle-orm";
import { parseFile, MAX_FILE_SIZE } from "./parser";
import type {
  ImportEntity,
  ImportResult,
  ImportRowResult,
  ImportOptions,
  ParsedRow,
  RowValidationError,
} from "./types";

// ─── Deduplicación ────────────────────────────────────────────────────────────

/**
 * Busca empresa existente por NIF (primaria) o nombre (fallback).
 */
async function findCompany(
  userId: string,
  nif?: string,
  name?: string
): Promise<{ id: number } | null> {
  if (nif) {
    const [found] = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(and(eq(schema.companies.userId, userId), eq(schema.companies.nif, nif)))
      .limit(1);
    if (found) return found;
  }
  if (name) {
    const [found] = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(and(eq(schema.companies.userId, userId), ilike(schema.companies.name, name)))
      .limit(1);
    if (found) return found;
  }
  return null;
}

/**
 * Busca contacto existente por email.
 */
async function findContact(
  userId: string,
  email: string
): Promise<{ id: number } | null> {
  const [found] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.userId, userId), eq(schema.contacts.email, email)))
    .limit(1);
  return found ?? null;
}

/**
 * Busca punto de suministro existente por CUPS + companyId.
 */
async function findSupplyPoint(
  cups: string,
  companyId: number
): Promise<{ id: number } | null> {
  const [found] = await db
    .select({ id: schema.supplyPoints.id })
    .from(schema.supplyPoints)
    .where(
      and(
        eq(schema.supplyPoints.cups, cups),
        eq(schema.supplyPoints.companyId, companyId)
      )
    )
    .limit(1);
  return found ?? null;
}

/**
 * Resuelve _companyLookup → companyId buscando por NIF o nombre.
 */
async function resolveCompanyId(
  userId: string,
  lookup: string
): Promise<number | null> {
  // Intentar como NIF primero (si parece NIF/CIF)
  const isNifLike = /^[A-Z0-9]{8,10}$/i.test(lookup.replace(/[\s\-]/g, ""));
  if (isNifLike) {
    const found = await findCompany(userId, lookup.replace(/[\s\-]/g, "").toUpperCase());
    if (found) return found.id;
  }
  // Buscar por nombre
  const found = await findCompany(userId, undefined, lookup);
  return found?.id ?? null;
}

// ─── Inserción/Actualización por entidad ──────────────────────────────────────

async function upsertCompany(
  userId: string,
  data: Record<string, unknown>,
  dryRun: boolean
): Promise<ImportRowResult & { rowIndex: number }> {
  const nif = data.nif as string | undefined;
  const name = data.name as string;

  const existing = await findCompany(userId, nif, name);

  if (dryRun) {
    return {
      rowIndex: 0,
      action: existing ? "updated" : "inserted",
      entityId: existing?.id,
    };
  }

  // Preparar datos — excluir campos internos
  const insertData: Record<string, unknown> = { ...data };
  delete insertData._companyLookup;

  if (existing) {
    // Actualizar: merge tags, append notes
    const updateData = { ...insertData };
    delete updateData.source; // No tocar source si ya existe

    // Handle tags merge
    if (updateData.tags && Array.isArray(updateData.tags)) {
      const existingCompany = await db
        .select({ tags: schema.companies.tags, notes: schema.companies.notes })
        .from(schema.companies)
        .where(eq(schema.companies.id, existing.id))
        .limit(1);

      if (existingCompany[0]?.tags) {
        const merged = Array.from(new Set([...existingCompany[0].tags, ...(updateData.tags as string[])]));
        updateData.tags = merged;
      }

      // Append notes
      if (updateData.notes && existingCompany[0]?.notes) {
        updateData.notes = existingCompany[0].notes + "\n---\n" + updateData.notes;
      }
    }

    updateData.updatedAt = new Date();
    await db.update(schema.companies).set(updateData).where(eq(schema.companies.id, existing.id));

    return { rowIndex: 0, action: "updated", entityId: existing.id };
  }

  // Insertar
  insertData.userId = userId;
  insertData.source = (insertData.source as string) || "csv_import";
  insertData.createdBy = userId;

  const [inserted] = await db
    .insert(schema.companies)
    .values(insertData as typeof schema.companies.$inferInsert)
    .returning({ id: schema.companies.id });

  return { rowIndex: 0, action: "inserted", entityId: inserted.id };
}

async function upsertContact(
  userId: string,
  data: Record<string, unknown>,
  dryRun: boolean
): Promise<ImportRowResult & { rowIndex: number }> {
  const email = data.email as string;

  // Resolver company lookup
  let companyId: number | null = null;
  if (data._companyLookup) {
    companyId = await resolveCompanyId(userId, data._companyLookup as string);
  }

  const existing = await findContact(userId, email);

  if (dryRun) {
    return {
      rowIndex: 0,
      action: existing ? "updated" : "inserted",
      entityId: existing?.id,
    };
  }

  const insertData: Record<string, unknown> = { ...data };
  delete insertData._companyLookup;
  if (companyId) insertData.companyId = companyId;

  if (existing) {
    const updateData = { ...insertData };
    delete updateData.source;

    // Merge tags
    if (updateData.tags && Array.isArray(updateData.tags)) {
      const existingContact = await db
        .select({ tags: schema.contacts.tags, notes: schema.contacts.notes })
        .from(schema.contacts)
        .where(eq(schema.contacts.id, existing.id))
        .limit(1);

      if (existingContact[0]?.tags) {
        const merged = Array.from(new Set([...existingContact[0].tags, ...(updateData.tags as string[])]));
        updateData.tags = merged;
      }

      if (updateData.notes && existingContact[0]?.notes) {
        updateData.notes = existingContact[0].notes + "\n---\n" + updateData.notes;
      }
    }

    updateData.updatedAt = new Date();
    await db.update(schema.contacts).set(updateData).where(eq(schema.contacts.id, existing.id));

    return { rowIndex: 0, action: "updated", entityId: existing.id };
  }

  insertData.userId = userId;
  insertData.source = (insertData.source as string) || "csv_import";

  const [inserted] = await db
    .insert(schema.contacts)
    .values(insertData as typeof schema.contacts.$inferInsert)
    .returning({ id: schema.contacts.id });

  return { rowIndex: 0, action: "inserted", entityId: inserted.id };
}

async function upsertSupplyPoint(
  userId: string,
  data: Record<string, unknown>,
  dryRun: boolean
): Promise<ImportRowResult & { rowIndex: number }> {
  const cups = data.cups as string;
  const companyLookup = data._companyLookup as string;

  // Resolver companyId — obligatorio para supplyPoints
  const companyId = await resolveCompanyId(userId, companyLookup);
  if (!companyId) {
    return {
      rowIndex: 0,
      action: "error",
      errors: [{
        rowIndex: 0,
        field: "_companyLookup",
        value: companyLookup,
        message: `Empresa no encontrada: "${companyLookup}". Importa empresas antes que puntos de suministro.`,
      }],
    };
  }

  const existing = await findSupplyPoint(cups, companyId);

  if (dryRun) {
    return {
      rowIndex: 0,
      action: existing ? "updated" : "inserted",
      entityId: existing?.id,
    };
  }

  const insertData: Record<string, unknown> = { ...data };
  delete insertData._companyLookup;
  insertData.companyId = companyId;

  if (existing) {
    const updateData = { ...insertData };

    // Append notes
    if (updateData.notes) {
      const existingSP = await db
        .select({ notes: schema.supplyPoints.notes })
        .from(schema.supplyPoints)
        .where(eq(schema.supplyPoints.id, existing.id))
        .limit(1);

      if (existingSP[0]?.notes) {
        updateData.notes = existingSP[0].notes + "\n---\n" + updateData.notes;
      }
    }

    updateData.updatedAt = new Date();
    await db
      .update(schema.supplyPoints)
      .set(updateData)
      .where(eq(schema.supplyPoints.id, existing.id));

    return { rowIndex: 0, action: "updated", entityId: existing.id };
  }

  const [inserted] = await db
    .insert(schema.supplyPoints)
    .values(insertData as typeof schema.supplyPoints.$inferInsert)
    .returning({ id: schema.supplyPoints.id });

  return { rowIndex: 0, action: "inserted", entityId: inserted.id };
}

// ─── Audit Trail ──────────────────────────────────────────────────────────────

async function logImportAudit(
  userId: string,
  entity: ImportEntity,
  result: ImportResult
): Promise<void> {
  try {
    await db.insert(schema.auditEvents).values({
      eventId: `evt_import_${Date.now()}`,
      userId,
      agentId: "system",
      agentLayer: "modulo-interno",
      eventType: "import_batch",
      result: result.errors > 0 ? "partial" : "success",
      metadata: {
        entity,
        totalRows: result.totalRows,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
        durationMs: result.durationMs,
        headerMapping: result.headerMapping,
        unmappedHeaders: result.unmappedHeaders,
      },
    });
  } catch {
    // No fallar por audit — log silencioso
    console.error("[import] Error logging audit event");
  }
}

// ─── Importador Principal ─────────────────────────────────────────────────────

/**
 * Importa un archivo xlsx/csv para una entidad dada.
 * Procesa fila por fila con dedup y upsert.
 * NO usa transacción global — cada fila es independiente para maximizar filas importadas.
 */
export async function importFile(
  buffer: Buffer,
  entity: ImportEntity,
  options: ImportOptions
): Promise<ImportResult> {
  const startTime = Date.now();

  // Validar tamaño
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`Archivo demasiado grande: ${(buffer.length / 1024 / 1024).toFixed(1)}MB. Máximo: 10MB.`);
  }

  // Parsear
  const { rows, headerMapping, unmappedHeaders, errors: parseErrors } = await parseFile(
    buffer,
    entity,
    { maxRows: options.maxRows, fileName: entity + ".xlsx" }
  );

  // Si hay errores críticos de estructura (campos obligatorios no encontrados), abortar
  const criticalErrors = parseErrors.filter((e) => e.rowIndex === 0);
  if (criticalErrors.length > 0) {
    return {
      entity,
      totalRows: rows.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: criticalErrors.length,
      rows: criticalErrors.map((e) => ({
        rowIndex: 0,
        action: "error" as const,
        errors: [e],
      })),
      headerMapping,
      unmappedHeaders,
      durationMs: Date.now() - startTime,
    };
  }

  // Procesar filas
  const results: ImportRowResult[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errorCount = 0;

  for (const row of rows) {
    // Verificar si esta fila tiene errores de validación
    const rowErrors = parseErrors.filter((e) => e.rowIndex === row.rowIndex);
    if (rowErrors.length > 0) {
      results.push({
        rowIndex: row.rowIndex,
        action: "error",
        errors: rowErrors,
        rawPreview: truncateRaw(row.raw),
      });
      errorCount++;
      continue;
    }

    // Verificar que no esté vacía
    const hasData = Object.values(row.data).some(
      (v) => v !== undefined && v !== null && v !== ""
    );
    if (!hasData) {
      results.push({ rowIndex: row.rowIndex, action: "skipped" });
      skipped++;
      continue;
    }

    try {
      let result: ImportRowResult;

      switch (entity) {
        case "companies":
          result = await upsertCompany(options.userId, row.data, !!options.dryRun);
          break;
        case "contacts":
          result = await upsertContact(options.userId, row.data, !!options.dryRun);
          break;
        case "supplyPoints":
          result = await upsertSupplyPoint(options.userId, row.data, !!options.dryRun);
          break;
        default:
          throw new Error(`Entidad no soportada: ${entity}`);
      }

      result.rowIndex = row.rowIndex;
      result.rawPreview = truncateRaw(row.raw);
      results.push(result);

      switch (result.action) {
        case "inserted": inserted++; break;
        case "updated": updated++; break;
        case "skipped": skipped++; break;
        case "error": errorCount++; break;
      }
    } catch (err) {
      results.push({
        rowIndex: row.rowIndex,
        action: "error",
        errors: [{
          rowIndex: row.rowIndex,
          field: "_system",
          value: null,
          message: err instanceof Error ? err.message : "Error desconocido",
        }],
        rawPreview: truncateRaw(row.raw),
      });
      errorCount++;
    }
  }

  const importResult: ImportResult = {
    entity,
    totalRows: rows.length,
    inserted,
    updated,
    skipped,
    errors: errorCount,
    rows: results,
    headerMapping,
    unmappedHeaders,
    durationMs: Date.now() - startTime,
  };

  // Log audit trail (no-await, fire & forget)
  if (!options.dryRun) {
    logImportAudit(options.userId, entity, importResult).catch(() => {});
  }

  return importResult;
}

/** Trunca datos raw para no almacenar demasiado en el resultado */
function truncateRaw(raw: Record<string, string>): Record<string, string> {
  const truncated: Record<string, string> = {};
  const keys = Object.keys(raw).slice(0, 5); // Max 5 campos
  for (const key of keys) {
    truncated[key] = raw[key]?.slice(0, 100) ?? "";
  }
  return truncated;
}
