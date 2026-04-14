import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/admin/migrate" });

/**
 * POST /api/admin/migrate
 *
 * One-shot idempotent migrator. Guarded by CRON_SECRET so sólo puede
 * ejecutarlo un admin con el bearer de Vercel Cron (o el propio gerente
 * vía curl/Postman).
 *
 * Actualmente añade:
 *   - emails.deleted_at (timestamp nullable) + índice
 *
 * Seguro ejecutar varias veces: usa IF NOT EXISTS.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  return NextResponse.json({
    ok: steps.every((s) => s.ok),
    steps,
  });
}
