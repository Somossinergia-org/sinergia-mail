import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/admin/migrate" });

const ADMIN_EMAIL = "orihuela@somossinergia.es";

/**
 * POST /api/admin/migrate
 *
 * One-shot idempotent migrator. Autorizado por:
 *   (a) Bearer CRON_SECRET (para Vercel Cron / curl), o
 *   (b) sesión del usuario admin (orihuela@somossinergia.es) — permite
 *       lanzarlo desde la UI con un click sin tener que conocer el secret.
 *
 * Añade emails.deleted_at + índice. Seguro ejecutar N veces (IF NOT EXISTS).
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const bearerOk = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!bearerOk) {
    const session = await auth();
    if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const steps: Array<{ step: string; ok: boolean; err?: string }> = [];

  const exec = async (step: string, stmt: ReturnType<typeof sql>) => {
    try {
      await db.execute(stmt);
      steps.push({ step, ok: true });
    } catch (e) {
      const err = e instanceof Error ? e.message : "unknown";
      logError(log, e, { step }, "migration step failed");
      steps.push({ step, ok: false, err });
    }
  };

  await exec(
    "emails.deleted_at column",
    sql`ALTER TABLE emails ADD COLUMN IF NOT EXISTS deleted_at timestamp`,
  );
  await exec(
    "emails.deleted_at index",
    sql`CREATE INDEX IF NOT EXISTS emails_deleted_idx ON emails(deleted_at)`,
  );
  await exec(
    "memory_sources.account_id column",
    sql`ALTER TABLE memory_sources ADD COLUMN IF NOT EXISTS account_id integer`,
  );
  await exec(
    "memory_sources.account_id index",
    sql`CREATE INDEX IF NOT EXISTS memory_sources_account_idx ON memory_sources(account_id)`,
  );
  // Backfill: para fuentes kind='email' que ya existen, rellena account_id
  // desde la tabla emails. Safe: sólo toca filas con account_id NULL.
  await exec(
    "memory_sources.account_id backfill (emails)",
    sql`UPDATE memory_sources m
        SET account_id = e.account_id
        FROM emails e
        WHERE m.kind = 'email'
          AND m.source_ref_id = e.id
          AND m.account_id IS NULL
          AND e.account_id IS NOT NULL`,
  );
  await exec(
    "memory_sources.account_id backfill (invoices)",
    sql`UPDATE memory_sources m
        SET account_id = e.account_id
        FROM invoices i
        JOIN emails e ON e.id = i.email_id
        WHERE m.kind = 'invoice'
          AND m.source_ref_id = i.id
          AND m.account_id IS NULL
          AND e.account_id IS NOT NULL`,
  );

  return NextResponse.json({
    ok: steps.every((s) => s.ok),
    steps,
  });
}
