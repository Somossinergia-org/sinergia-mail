import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Daily cron — purges old audit events beyond retention window.
 *
 * Configurable via AUDIT_RETENTION_DAYS env var (default: 90).
 * Secured via CRON_SECRET matching Vercel's Bearer token.
 *
 * Schedule: daily at 03:00 UTC (vercel.json)
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS || "90", 10);

  try {
    // Lazy import to avoid cold-start issues if DB is not ready
    const { auditLog } = await import("@/lib/audit");
    const purged = await auditLog.purgeOlderThan(retentionDays);

    // eslint-disable-next-line no-console
    console.log(`[cron/audit-cleanup] Purged ${purged} audit events older than ${retentionDays} days`);

    return NextResponse.json({
      ok: true,
      purged,
      retentionDays,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[cron/audit-cleanup]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
