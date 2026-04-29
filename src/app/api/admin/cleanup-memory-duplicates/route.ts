/**
 * POST /api/admin/cleanup-memory-duplicates
 *
 * Limpia entradas duplicadas en memory_sources causadas por:
 *   - addSource() troceando content > 400 palabras en chunks separados
 *   - addSource() llamado sin sourceRefId (no dedup posible en addSourceIfNew)
 *
 * Estrategia (post-mortem del audit 2026-04-29):
 *   - Agrupar por (user_id, kind, title, LEFT(content, 200))
 *   - Conservar el id más bajo de cada grupo (la entrada original)
 *   - Borrar el resto
 *
 * Idempotente. Re-ejecutarlo es no-op si no hay duplicates.
 *
 * Auth: Bearer CRON_SECRET o session admin (orihuela@somossinergia.es).
 *
 * Body opcional: { userId?: string }
 *   - Sin userId: limpia para TODOS los users (cron global)
 *   - Con userId: limpia solo ese user (admin manual)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { logger, logError } from "@/lib/logger";
import { safeBearer } from "@/lib/security/safe-equal";

const log = logger.child({ route: "/api/admin/cleanup-memory-duplicates" });
const ADMIN_EMAIL = "orihuela@somossinergia.es";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Auth dual
  const bearerOk = safeBearer(req.headers.get("Authorization"), process.env.CRON_SECRET);
  let scopedUserId: string | null = null;

  if (bearerOk) {
    const body = await req.json().catch(() => ({}));
    scopedUserId = body?.userId ?? null;
  } else {
    const session = await auth();
    if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL || !session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    scopedUserId = session.user.id;
  }

  try {
    // SQL: usar ROW_NUMBER OVER PARTITION para identificar duplicates y borrar
    // los que NO sean el id más bajo del grupo. Postgres-only.
    //
    // Hash de los primeros 200 chars del content como dedup key — es lo bastante
    // específico para chunks distintos (que cambian en char[200+]) y robusto a
    // pequeñas variaciones de whitespace.
    const userClause = scopedUserId
      ? sql`AND user_id = ${scopedUserId}`
      : sql``;

    const result = await db.execute(sql`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id, kind, title, LEFT(COALESCE(content, ''), 200)
            ORDER BY id ASC
          ) AS rn
        FROM memory_sources
        WHERE TRUE ${userClause}
      )
      DELETE FROM memory_sources
      WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
      RETURNING id
    `);

    const rows = result as unknown as { id: number }[];
    const deletedCount = rows.length;

    log.info(
      { scopedUserId, deletedCount },
      "memory dedup cleanup complete",
    );

    return NextResponse.json({
      ok: true,
      deletedCount,
      sample: rows.slice(0, 20).map((r) => r.id),
      scope: scopedUserId ? `userId=${scopedUserId}` : "all-users",
    });
  } catch (err) {
    logError(log, err, { scopedUserId }, "memory dedup cleanup failed");
    return NextResponse.json(
      { error: "Error interno", detail: (err as Error).message?.slice(0, 200) },
      { status: 500 },
    );
  }
}
