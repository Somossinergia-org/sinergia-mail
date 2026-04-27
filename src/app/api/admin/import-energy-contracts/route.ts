import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/admin/import-energy-contracts" });

const ADMIN_EMAIL = "orihuela@somossinergia.es";

/**
 * POST /api/admin/import-energy-contracts
 *
 * Importa los 470 contratos del CSV "todas_*.csv" exportado del CRM externo.
 * Para cada fila:
 *   1. Upsert de companies por NIF/CIF (CIF/NIF column)
 *   2. Upsert de supply_points por CUPS (si existe)
 *   3. Upsert de services con type=energia, status mapeado desde ESTADO,
 *      provider de columna TIPO (GANA/IGNIS/ELEIA/...), tariff de TARIFA
 *   4. Cruzar provider+tariff con commission_rates para popular
 *      commissionRateId + commissionEstimatedEur
 *
 * Auth: Bearer admin o sesión.
 *
 * El CSV usa separador `;` y headers con tildes/mayúsculas.
 * Body: multipart con file=<csv> O JSON { csv: "<contenido>" }.
 */
export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get("Authorization");
  const cronOk = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const agentKeyOk = !!process.env.AGENT_API_KEY && authHeader === `Bearer ${process.env.AGENT_API_KEY}`;
  let userId: string | null = null;
  if (cronOk || agentKeyOk) {
    const url = new URL(req.url);
    userId = url.searchParams.get("userId");
    if (!userId) {
      // Fallback: resolver por ADMIN_EMAIL para no tener que conocer el UUID
      const u = await db.query.users.findFirst({
        where: (t, { eq }) => eq(t.email, ADMIN_EMAIL),
        columns: { id: true },
      });
      if (!u) return NextResponse.json({ error: "Admin user not found in DB" }, { status: 404 });
      userId = u.id;
    }
  } else {
    const session = await auth();
    if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL || !session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    userId = session.user.id;
  }

  // Body
  let csvText: string | null = null;
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (file instanceof File) csvText = await file.text();
  } else {
    const body = await req.json().catch(() => ({}));
    csvText = body.csv || null;
  }
  if (!csvText) return NextResponse.json({ error: "Missing csv" }, { status: 400 });
  csvText = csvText.replace(/^﻿/, "");

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return NextResponse.json({ error: "CSV vacío" }, { status: 400 });

  const header = parseCsvLine(lines[0], ";").map((h) => h.toLowerCase().trim().replace(/"/g, ""));
  const idx = (col: string) => header.indexOf(col);

  const COLS = {
    id: idx("id"),
    estado: idx("estado"),
    tipo: idx("tipo"),                       // provider (GANA/IGNIS/ELEIA)
    cliente: idx("cliente"),
    cif: idx("cif/nif"),
    tipoCliente: idx("tipo cliente"),
    telefono: idx("teléfono") >= 0 ? idx("teléfono") : idx("telefono"),
    movil: idx("movil"),
    direccion: idx("dirección") >= 0 ? idx("dirección") : idx("direccion"),
    cp: idx("cp"),
    poblacion: idx("población") >= 0 ? idx("población") : idx("poblacion"),
    provincia: idx("provincia"),
    persContacto: idx("persona contacto"),
    email: idx("correo electrónico") >= 0 ? idx("correo electrónico") : idx("correo electronico"),
    fechaCreacion: idx("fecha creación") >= 0 ? idx("fecha creación") : idx("fecha creacion"),
    fechaFirma: idx("fecha firma"),
    iban: idx("numero de cuenta"),
    comercial: idx("comercial"),
    tramitador: idx("tramitador"),
    tarifa: idx("tarifa"),
    fechaActiv: idx("fecha activación") >= 0 ? idx("fecha activación") : idx("fecha activacion"),
    fechaCancel: idx("fecha cancelación") >= 0 ? idx("fecha cancelación") : idx("fecha cancelacion"),
    cups: idx("cups"),
    consumo: idx("consumo"),
    pot1: idx("potencia contratada 1"),
    cnae: idx("cnae"),
  };

  if (COLS.cliente < 0 || COLS.tipo < 0) {
    return NextResponse.json(
      { error: "CSV no tiene columnas obligatorias 'CLIENTE' o 'TIPO'", header },
      { status: 400 },
    );
  }

  const stats = {
    rows: 0,
    companiesCreated: 0,
    companiesUpdated: 0,
    supplyPointsUpserted: 0,
    servicesCreated: 0,
    servicesUpdated: 0,
    ratesMatched: 0,
    errors: [] as Array<{ line: number; err: string }>,
  };

  const SEP = ";";
  for (let i = 1; i < lines.length; i++) {
    stats.rows++;
    try {
      const cells = parseCsvLine(lines[i], SEP);
      const get = (col: number): string | null => {
        if (col < 0) return null;
        const v = cells[col];
        if (v === undefined || v === "") return null;
        return v.trim().replace(/^"|"$/g, "");
      };
      const num = (col: number): number | null => {
        const v = get(col);
        if (!v) return null;
        const n = Number(v.replace(/\./g, "").replace(",", "."));
        return Number.isFinite(n) ? n : null;
      };
      const dateESToISO = (col: number): Date | null => {
        const v = get(col);
        if (!v) return null;
        // 21/04/2026 o 21/04/2026 16:01:08
        const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (!m) return null;
        const iso = `${m[3]}-${m[2]}-${m[1]}T00:00:00Z`;
        const d = new Date(iso);
        return isNaN(d.getTime()) ? null : d;
      };

      const cliente = get(COLS.cliente);
      const cifNif = get(COLS.cif);
      const provider = get(COLS.tipo);
      const externalId = get(COLS.id);
      if (!cliente || !provider) continue;

      // ── 1. Upsert company ──
      let companyId: number | null = null;
      if (cifNif) {
        const existing = await db.query.companies.findFirst({
          where: and(eq(schema.companies.userId, userId!), eq(schema.companies.nif, cifNif)),
        });
        if (existing) {
          companyId = existing.id;
          await db.update(schema.companies).set({
            name: cliente,
            phone: get(COLS.movil) || get(COLS.telefono) || existing.phone,
            email: get(COLS.email) || existing.email,
            address: get(COLS.direccion) || existing.address,
            city: get(COLS.poblacion) || existing.city,
            province: get(COLS.provincia) || existing.province,
            postalCode: get(COLS.cp) || existing.postalCode,
            iban: get(COLS.iban) || existing.iban,
            updatedAt: new Date(),
          }).where(eq(schema.companies.id, existing.id));
          stats.companiesUpdated++;
        } else {
          const tipoCliente = get(COLS.tipoCliente)?.toLowerCase();
          const clientType =
            tipoCliente === "empresa" ? "empresa" :
            tipoCliente === "particular" ? "particular" : "autonomo";
          const inserted = await db.insert(schema.companies).values({
            userId: userId!,
            createdBy: userId!,
            name: cliente,
            nif: cifNif,
            clientType,
            phone: get(COLS.movil) || get(COLS.telefono) || undefined,
            email: get(COLS.email) || undefined,
            address: get(COLS.direccion) || undefined,
            city: get(COLS.poblacion) || undefined,
            province: get(COLS.provincia) || undefined,
            postalCode: get(COLS.cp) || undefined,
            iban: get(COLS.iban) || undefined,
            cnae: get(COLS.cnae) || undefined,
            source: "csv_import_energy",
          }).returning({ id: schema.companies.id });
          companyId = inserted[0]?.id ?? null;
          stats.companiesCreated++;
        }
      }
      if (!companyId) continue;

      // ── 2. Upsert supply_point ──
      const cups = get(COLS.cups);
      let supplyPointId: number | null = null;
      if (cups && /^ES\d{16}[A-Z]{2}$/.test(cups)) {
        const existingSp = await db.query.supplyPoints.findFirst({
          where: eq(schema.supplyPoints.cups, cups),
        });
        if (existingSp) {
          supplyPointId = existingSp.id;
        } else {
          const inserted = await db.insert(schema.supplyPoints).values({
            companyId,
            cups,
            tariff: get(COLS.tarifa) || undefined,
            powerP1Kw: num(COLS.pot1) ?? undefined,
            currentRetailer: provider,
            annualConsumptionKwh: num(COLS.consumo) ?? undefined,
            address: get(COLS.direccion) || undefined,
          }).returning({ id: schema.supplyPoints.id });
          supplyPointId = inserted[0]?.id ?? null;
        }
        stats.supplyPointsUpserted++;
      }

      // ── 3. Map ESTADO → status del service ──
      const estadoRaw = (get(COLS.estado) || "").toUpperCase();
      const status =
        estadoRaw.includes("ACTIVADO") ? "contracted" :
        estadoRaw.includes("CANCELADO") ? "cancelled" :
        estadoRaw.includes("TRAMITADO") ? "offered" :
        "prospecting";

      // ── 4. Buscar commission rate vigente ──
      const tariff = get(COLS.tarifa);
      let commissionRateId: number | null = null;
      let commissionEstimated: number | null = null;
      if (provider && tariff) {
        const candidates = await db.query.commissionRates.findMany({
          where: and(
            eq(schema.commissionRates.provider, provider),
            eq(schema.commissionRates.active, true),
          ),
          limit: 50,
        });
        // Match por tariff substring
        const tariffNorm = tariff.toLowerCase();
        const match = candidates.find((r) => {
          const rt = (r.tariff || "").toLowerCase();
          return rt && (rt === tariffNorm || tariffNorm.includes(rt) || rt.includes(tariffNorm));
        }) || candidates[0];
        if (match) {
          commissionRateId = match.id;
          commissionEstimated = match.commissionIva ?? match.commissionSinIva;
          stats.ratesMatched++;
        }
      }

      // ── 5. Upsert service ──
      let existingService = null;
      if (externalId) {
        existingService = await db.query.services.findFirst({
          where: eq(schema.services.externalId, externalId),
        });
      }
      const fechaActiv = dateESToISO(COLS.fechaActiv);
      const fechaFirma = dateESToISO(COLS.fechaFirma);
      const baseFields = {
        companyId,
        supplyPointId,
        type: "energia",
        status,
        currentProvider: provider,
        provider,
        tariff: tariff || undefined,
        contractDate: fechaFirma || fechaActiv,
        externalId: externalId || undefined,
        commissionRateId,
        commissionEstimatedEur: commissionEstimated,
        notes: `Importado de CSV. Comercial: ${get(COLS.comercial) || "-"}`,
      };
      if (existingService) {
        await db.update(schema.services).set({
          ...baseFields,
          updatedAt: new Date(),
        }).where(eq(schema.services.id, existingService.id));
        stats.servicesUpdated++;
      } else {
        await db.insert(schema.services).values(baseFields);
        stats.servicesCreated++;
      }
    } catch (e) {
      stats.errors.push({ line: i + 1, err: (e as Error).message });
      if (stats.errors.length > 100) {
        stats.errors.push({ line: -1, err: "...stopped logging at 100 errors" });
        break;
      }
    }
  }

  log.info({ stats }, "energy contracts import done");
  return NextResponse.json({
    ok: stats.errors.length === 0,
    ...stats,
    errors: stats.errors.slice(0, 50),
  });
}

function parseCsvLine(line: string, sep: string): string[] {
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
      } else if (ch === sep) {
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
