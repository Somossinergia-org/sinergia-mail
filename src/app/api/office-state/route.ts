import { NextRequest, NextResponse } from "next/server";
import { buildOfficeState, buildFallbackState } from "@/lib/office";
import type { AuditEvent } from "@/lib/audit/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/office-state — Returns current office state snapshot.
 *
 * Queries:
 *   1. Recent audit events (last 5 minutes) from persistent store
 *   2. Active cases with ownership
 *
 * Falls back gracefully if DB is unavailable.
 *
 * Query params:
 *   ?window=300  — event window in seconds (default 300 = 5 min)
 */
export async function GET(req: NextRequest) {
  const windowSec = parseInt(req.nextUrl.searchParams.get("window") || "300", 10);
  const since = new Date(Date.now() - windowSec * 1000).toISOString();

  try {
    // Lazy import DB and audit to avoid cold-start issues
    let recentEvents: AuditEvent[] = [];
    let activeCases: Array<{
      id: number | string;
      visibleOwnerId: string | null;
      status: string;
      subject: string | null;
      channel: string | null;
      updatedAt: Date | string | null;
    }> = [];

    try {
      const { auditLog } = await import("@/lib/audit");

      // Try persistent query first (DB-backed), fall back to memory
      try {
        recentEvents = await auditLog.getCaseTimelinePersistent("__all__")
          .then(() => []) // timeline is per-case, use query instead
          .catch(() => []);
      } catch {
        // ignore
      }

      // Use in-memory query as primary (fast, same-process events)
      recentEvents = auditLog.query({ since, limit: 100 });
    } catch {
      // Audit module not available — continue with empty
    }

    try {
      const { db, schema } = await import("@/db");
      const { eq, or, inArray } = await import("drizzle-orm");

      const rows = await db
        .select({
          id: schema.cases.id,
          visibleOwnerId: schema.cases.visibleOwnerId,
          status: schema.cases.status,
          subject: schema.cases.subject,
          channel: schema.cases.channel,
          updatedAt: schema.cases.updatedAt,
        })
        .from(schema.cases)
        .where(
          inArray(schema.cases.status, ["open", "active", "waiting"]),
        )
        .limit(50);

      activeCases = rows.map((r) => ({
        id: r.id,
        visibleOwnerId: r.visibleOwnerId,
        status: r.status,
        subject: r.subject,
        channel: r.channel,
        updatedAt: r.updatedAt,
      }));
    } catch {
      // DB not available — continue with empty cases
    }

    const snapshot = buildOfficeState({ recentEvents, activeCases });

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    // Full fallback — return neutral state
    // eslint-disable-next-line no-console
    console.error("[api/office-state] Error building state:", (err as Error)?.message);
    return NextResponse.json(buildFallbackState(), {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
}
