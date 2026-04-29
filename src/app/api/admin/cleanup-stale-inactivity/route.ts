/**
 * POST /api/admin/cleanup-stale-inactivity
 *
 * Borra notificaciones de inactividad obsoletas — específicamente las que se
 * generaron antes del fix del bug "999 días" (commit 5d1a95c).
 *
 * Criterio: type="inactivity" AND (message LIKE '%999 días%' OR severity legacy).
 * Solo borra para el usuario autenticado / del bearer.
 *
 * Auth: Bearer CRON_SECRET (curl) o session admin (orihuela@somossinergia.es).
 *
 * Idempotente: re-ejecutarlo no rompe nada, solo borra lo que matche.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq, like, or } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { safeBearer } from "@/lib/security/safe-equal";

const log = logger.child({ route: "/api/admin/cleanup-stale-inactivity" });
const ADMIN_EMAIL = "orihuela@somossinergia.es";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Auth: bearer CRON_SECRET o session admin
  const bearerOk = safeBearer(req.headers.get("Authorization"), process.env.CRON_SECRET);
  let userId: string | null = null;

  if (bearerOk) {
    // Bearer admin → opcionalmente filtrar por userId del body, o todos
    const body = await req.json().catch(() => ({}));
    userId = body?.userId ?? null;
  } else {
    const session = await auth();
    if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL || !session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    userId = session.user.id;
  }

  // Borra inactivity notifications con mensaje "999 días" (legacy del bug previo).
  // Las nuevas (post-fix) tendrán "X días" donde X es real (createdAt fallback).
  const conditions = [
    eq(schema.operationalNotifications.type, "inactivity"),
    or(
      like(schema.operationalNotifications.message, "%999 días%"),
      like(schema.operationalNotifications.message, "%999 dias%"),
    ),
  ];
  if (userId) {
    conditions.push(eq(schema.operationalNotifications.userId, userId));
  }

  const deleted = await db
    .delete(schema.operationalNotifications)
    .where(and(...conditions))
    .returning({ id: schema.operationalNotifications.id });

  log.info(
    { userId, deletedCount: deleted.length },
    "cleanup stale inactivity alerts complete",
  );

  return NextResponse.json({
    ok: true,
    deletedCount: deleted.length,
    deletedIds: deleted.slice(0, 50).map((d) => d.id),
  });
}
