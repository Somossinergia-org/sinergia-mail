import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * GET /api/healthz — Endpoint público para health checks externos.
 *
 * Sin auth (exento en middleware). Hace un SELECT 1 a la DB para
 * verificar conectividad. Útil para UptimeRobot, Better Stack,
 * cron-job.org o checks internos.
 *
 * Devuelve:
 *   200 { ok: true, db: "up", ts: ISO }
 *   503 { ok: false, db: "down", error: "..." }
 *
 * NO expone info sensible (versión, env vars, paths, etc).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json(
      {
        ok: true,
        db: "up",
        ts: new Date().toISOString(),
        latencyMs: Date.now() - started,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        db: "down",
        ts: new Date().toISOString(),
        error: err instanceof Error ? err.message.slice(0, 100) : "unknown",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}
