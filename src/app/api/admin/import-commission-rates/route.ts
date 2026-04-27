import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/admin/import-commission-rates" });

const ADMIN_EMAIL = "orihuela@somossinergia.es";

/**
 * POST /api/admin/import-commission-rates
 *
 * Recibe CSV con columnas (encabezado tal cual):
 *   category,provider,product_type,action,product,tariff,concept,coverage,
 *   clawback,commission_sin_iva,commission_iva,valid_from,valid_to,priority,active,source_sheet
 *
 * Estrategia:
 *   1. Body multipart con file=<csv>
 *      o body JSON { csv: "<contenido>" }
 *   2. Trunca commission_rates si query ?reset=1
 *   3. Inserta en batches de 200
 *   4. Devuelve { ok, inserted, skipped, errors[] }
 *
 * Auth: Bearer AGENT_API_KEY / CRON_SECRET o sesión admin.
 */
export async function POST(req: NextRequest) {
  // ── Auth ──
  const authHeader = req.headers.get("Authorization");
  const cronOk = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const agentKeyOk = !!process.env.AGENT_API_KEY && authHeader === `Bearer ${process.env.AGENT_API_KEY}`;
  if (!cronOk && !agentKeyOk) {
    const session = await auth();
    if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // ── Body ──
  let csvText: string | null = null;
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (file instanceof File) {
      csvText = await file.text();
    }
  } else {
    const body = await req.json().catch(() => ({}));
    csvText = body.csv || null;
  }
  if (!csvText) {
    return NextResponse.json({ error: "Missing csv body or file" }, { status: 400 });
  }

  // Strip BOM
  csvText = csvText.replace(/^﻿/, "");

  const reset = req.nextUrl.searchParams.get("reset") === "1";

  // ── Parse CSV (separador coma, respeta comillas) ──
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV vacío o sólo encabezado" }, { status: 400 });
  }

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const rows = lines.slice(1);

  const idx = (col: string) => header.indexOf(col);
  const COLS = {
    category: idx("category"),
    provider: idx("provider"),
    productType: idx("product_type"),
    action: idx("action"),
    product: idx("product"),
    tariff: idx("tariff"),
    concept: idx("concept"),
    coverage: idx("coverage"),
    clawback: idx("clawback"),
    commissionSinIva: idx("commission_sin_iva"),
    commissionIva: idx("commission_iva"),
    validFrom: idx("valid_from"),
    validTo: idx("valid_to"),
    priority: idx("priority"),
    active: idx("active"),
    sourceSheet: idx("source_sheet"),
  };

  if (COLS.category < 0 || COLS.provider < 0) {
    return NextResponse.json(
      { error: "CSV no tiene columnas obligatorias 'category' y 'provider'" },
      { status: 400 },
    );
  }

  // ── Reset ──
  if (reset) {
    await db.delete(schema.commissionRates);
    log.info({}, "commission_rates truncated");
  }

  // ── Insert en batches ──
  const errors: Array<{ line: number; err: string }> = [];
  const valid: schema.NewCommissionRate[] = [];

  rows.forEach((rawLine, i) => {
    try {
      const cells = parseCsvLine(rawLine);
      const get = (col: number): string | null => {
        if (col < 0) return null;
        const v = cells[col];
        if (v === undefined || v === "") return null;
        return v.trim();
      };
      const num = (col: number): number | null => {
        const v = get(col);
        if (v === null) return null;
        const n = Number(v.replace(",", "."));
        return Number.isFinite(n) ? n : null;
      };
      const date = (col: number): Date | null => {
        const v = get(col);
        if (!v) return null;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
      };
      const bool = (col: number): boolean => {
        const v = get(col);
        return v === null ? true : /^(true|1|yes|sí|si)$/i.test(v);
      };

      const provider = get(COLS.provider);
      const category = get(COLS.category);
      if (!provider || !category) {
        errors.push({ line: i + 2, err: "provider o category vacío" });
        return;
      }

      valid.push({
        category,
        provider,
        productType: get(COLS.productType) || undefined,
        action: get(COLS.action) || undefined,
        product: get(COLS.product) || undefined,
        tariff: get(COLS.tariff) || undefined,
        concept: get(COLS.concept) || undefined,
        coverage: get(COLS.coverage) || undefined,
        clawback: get(COLS.clawback) || undefined,
        commissionSinIva: num(COLS.commissionSinIva),
        commissionIva: num(COLS.commissionIva),
        validFrom: date(COLS.validFrom),
        validTo: date(COLS.validTo),
        priority: num(COLS.priority) ?? 100,
        active: bool(COLS.active),
        sourceSheet: get(COLS.sourceSheet) || undefined,
      });
    } catch (e) {
      errors.push({ line: i + 2, err: (e as Error).message });
    }
  });

  // Insertar en batches de 200
  let inserted = 0;
  const BATCH = 200;
  for (let i = 0; i < valid.length; i += BATCH) {
    const slice = valid.slice(i, i + BATCH);
    try {
      await db.insert(schema.commissionRates).values(slice);
      inserted += slice.length;
    } catch (e) {
      logError(log, e, { batch: i }, "batch insert failed");
      errors.push({ line: i + 2, err: `batch insert: ${(e as Error).message}` });
    }
  }

  log.info({ inserted, errors: errors.length, reset }, "commission_rates import done");
  return NextResponse.json({
    ok: errors.length === 0,
    inserted,
    skipped: rows.length - inserted,
    errors: errors.slice(0, 50),
  });
}

/** Parse una línea CSV respetando comillas dobles. */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}
