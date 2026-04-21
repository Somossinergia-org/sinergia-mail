import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/operations/activity — Recent system activity.
 *
 * Query params:
 *   ?limit=50        — max results (default 50)
 *   ?type=blocked    — filter: "all" | "blocked" | "violations" | "delegations" | "external"
 *   ?window=3600     — seconds back to look (default 3600 = 1h)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(params.get("limit") || "50", 10), 200);
  const filterType = params.get("type") || "all";
  const windowSec = parseInt(params.get("window") || "3600", 10);

  try {
    const { db, schema } = await import("@/db");
    const { eq, and, desc, sql, inArray } = await import("drizzle-orm");

    const since = new Date(Date.now() - windowSec * 1000);

    // Event type filters
    const typeFilters: Record<string, string[]> = {
      blocked: ["tool_blocked", "external_message_blocked", "agent_blocked"],
      violations: [
        "governance_rule_triggered",
        "ownership_conflict_detected",
        "visibility_violation_detected",
      ],
      delegations: ["agent_delegated"],
      external: [
        "external_message_attempted",
        "external_message_blocked",
        "external_message_sent",
      ],
    };

    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.auditEvents.userId, session.user.id),
      sql`${schema.auditEvents.createdAt} >= ${since}`,
    ];

    if (filterType !== "all" && typeFilters[filterType]) {
      conditions.push(inArray(schema.auditEvents.eventType, typeFilters[filterType]));
    }

    const rows = await db
      .select()
      .from(schema.auditEvents)
      .where(and(...conditions))
      .orderBy(desc(schema.auditEvents.createdAt))
      .limit(limit);

    const events = rows.map((r: Record<string, unknown>) => ({
      id: r.eventId || r.id,
      timestamp: r.createdAt,
      eventType: r.eventType,
      result: r.result,
      agentId: r.agentId,
      agentLayer: r.agentLayer,
      caseId: r.caseId,
      toolName: r.toolName,
      reason: r.reason,
      visibleOwnerId: r.visibleOwnerId,
      targetAgentId: r.targetAgentId,
    }));

    return NextResponse.json({ events, count: events.length, window: windowSec });
  } catch (err) {
    return NextResponse.json(
      { error: "Error al obtener actividad", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
