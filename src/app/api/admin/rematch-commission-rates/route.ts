import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "/api/admin/rematch-commission-rates" });

const ADMIN_EMAIL = "orihuela@somossinergia.es";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/rematch-commission-rates
 *
 * Pasada de mantenimiento sobre services:
 *   1. Normaliza provider names — "ENDESA 0 10" → "ENDESA", "GANA " → "GANA"
 *   2. Re-busca commission_rate vigente con matching tolerante:
 *        - case-insensitive
 *        - trim de espacios
 *        - alias mapping (configurable abajo)
 *   3. Reporta providers en services SIN match (catálogo incompleto)
 *
 * Auth: Bearer admin / sesión.
 *
 * No-op si commissionRateId ya está set, salvo que ?force=1.
 */

// Aliases conocidos: nombre en services → nombre en commission_rates
const PROVIDER_ALIASES: Record<string, string> = {
  // Energía — providers que existen en contratos pero pueden tener naming distinto
  "GANA ENERGIA": "GANA",
  "GANA ENERGÍA": "GANA",
  "IGNIS ENERGIA": "IGNIS",
  "IGNIS ENERGÍA": "IGNIS",
  "NATURGY EXTRA": "NATURGYEXTRA",
  "NATURGY-EXTRA": "NATURGYEXTRA",
  // Telco
  "MASMOVIL": "MASMÓVIL",
  "MAS MOVIL": "MASMÓVIL",
  "ADAMO EMPRESA": "ADAMO EMPRESAS",
  "YOIGO NEGOCIO": "YOIGO NEGOCIOS",
};

/**
 * Normaliza un provider de service:
 *  - upper-case
 *  - trim
 *  - strip suffixes numéricos como "ENDESA 0 10", "ENDESA 10 15"
 *    (no son providers reales — son ranges metidos en la columna TIPO)
 *  - aplica alias conocido
 */
function normalizeProvider(raw: string | null): string | null {
  if (!raw) return null;
  let p = raw.trim().toUpperCase();
  // Quitar trailing ranges como " 0 10" / " 10 15" / " 15 20"
  p = p.replace(/\s+\d+\s+\d+\s*$/, "").trim();
  // Aplicar alias
  if (PROVIDER_ALIASES[p]) p = PROVIDER_ALIASES[p];
  return p || null;
}

export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get("Authorization");
  const cronOk = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const agentKeyOk = !!process.env.AGENT_API_KEY && authHeader === `Bearer ${process.env.AGENT_API_KEY}`;
  let userId: string | null = null;
  if (cronOk || agentKeyOk) {
    const u = await db.query.users.findFirst({
      where: (t, { eq: e }) => e(t.email, ADMIN_EMAIL),
      columns: { id: true },
    });
    if (!u) return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
    userId = u.id;
  } else {
    const session = await auth();
    if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL || !session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    userId = session.user.id;
  }

  const force = req.nextUrl.searchParams.get("force") === "1";

  // 1. Cargar todos los rates activas en memoria
  const allRates = await db.select({
    id: schema.commissionRates.id,
    provider: schema.commissionRates.provider,
    tariff: schema.commissionRates.tariff,
    concept: schema.commissionRates.concept,
    commissionSinIva: schema.commissionRates.commissionSinIva,
    commissionIva: schema.commissionRates.commissionIva,
  }).from(schema.commissionRates).where(eq(schema.commissionRates.active, true));

  const ratesByProvider = new Map<string, typeof allRates>();
  for (const r of allRates) {
    const key = r.provider.toUpperCase().trim();
    const arr = ratesByProvider.get(key) ?? [];
    arr.push(r);
    ratesByProvider.set(key, arr);
  }
  const catalogProviders = Array.from(ratesByProvider.keys()).sort();

  // 2. Cargar services del usuario
  const services = await db
    .select({
      id: schema.services.id,
      provider: schema.services.provider,
      tariff: schema.services.tariff,
      commissionRateId: schema.services.commissionRateId,
    })
    .from(schema.services)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.services.companyId))
    .where(
      and(
        eq(schema.companies.userId, userId!),
        isNotNull(schema.services.provider),
      ),
    );

  // 3. Iterar y rematch
  const stats = {
    total: services.length,
    skipped_already_matched: 0,
    normalized: 0,
    matched_now: 0,
    still_unmatched: 0,
    providers_missing_in_catalog: new Set<string>(),
    providers_with_no_tariff_match: new Set<string>(),
  };

  for (const svc of services) {
    if (svc.commissionRateId && !force) {
      stats.skipped_already_matched++;
      continue;
    }

    const normalized = normalizeProvider(svc.provider);
    if (!normalized) continue;

    const updates: Record<string, unknown> = {};
    if (normalized !== svc.provider) {
      updates.provider = normalized.slice(0, 60);
      stats.normalized++;
    }

    const candidates = ratesByProvider.get(normalized) ?? [];
    if (candidates.length === 0) {
      stats.providers_missing_in_catalog.add(normalized);
    } else {
      // Match por tariff base (ej. service.tariff=2.0TD vs rate.tariff=2.0TD o concept que contiene 2.0TD)
      const tariffNorm = (svc.tariff || "").toUpperCase();
      const tariffBase = tariffNorm.match(/^([A-Z0-9.]{2,8})/)?.[1] || "";
      const match = tariffBase
        ? candidates.find(
            (r) =>
              (r.tariff || "").toUpperCase().includes(tariffBase) ||
              (r.concept || "").toUpperCase().includes(tariffBase),
          ) ?? candidates[0]
        : candidates[0];

      if (match) {
        updates.commissionRateId = match.id;
        updates.commissionEstimatedEur = match.commissionIva ?? match.commissionSinIva;
        stats.matched_now++;
      } else {
        stats.providers_with_no_tariff_match.add(normalized);
        stats.still_unmatched++;
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db.update(schema.services).set(updates).where(eq(schema.services.id, svc.id));
    } else {
      stats.still_unmatched++;
    }
  }

  log.info({ stats: { ...stats, providers_missing_in_catalog: Array.from(stats.providers_missing_in_catalog) } }, "rematch done");

  return NextResponse.json({
    ok: true,
    total_services: stats.total,
    skipped_already_matched: stats.skipped_already_matched,
    provider_names_normalized: stats.normalized,
    matched_now: stats.matched_now,
    still_unmatched: stats.still_unmatched,
    providers_missing_in_catalog: Array.from(stats.providers_missing_in_catalog).sort(),
    providers_with_no_tariff_match: Array.from(stats.providers_with_no_tariff_match).sort(),
    catalog_providers: catalogProviders,
  });
}
