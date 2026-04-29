import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/operations/cases — List cases with optional filters.
 *
 * Query params:
 *   ?status=open,active    — filter by status (comma-separated)
 *   ?owner=recepcion       — filter by visibleOwnerId
 *   ?limit=50              — max results (default 50)
 *   ?offset=0              — pagination offset
 *   ?search=term           — search in subject/clientIdentifier
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const statusFilter = params.get("status")?.split(",").filter(Boolean) || [];
  const ownerFilter = params.get("owner") || null;
  const search = params.get("search") || null;
  const limit = Math.min(parseInt(params.get("limit") || "50", 10), 200);
  const offset = parseInt(params.get("offset") || "0", 10);

  try {
    const { db, schema } = await import("@/db");
    const { eq, and, inArray, desc, like, or, sql, count, gte } = await import("drizzle-orm");

    // Build conditions
    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.cases.userId, session.user.id),
    ];

    if (statusFilter.length > 0) {
      conditions.push(inArray(schema.cases.status, statusFilter));
    }

    if (ownerFilter) {
      conditions.push(eq(schema.cases.visibleOwnerId, ownerFilter));
    }

    if (search) {
      const term = `%${search}%`;
      conditions.push(
        or(
          like(schema.cases.subject, term),
          like(schema.cases.clientIdentifier, term),
        )!,
      );
    }

    const where = conditions.length === 1 ? conditions[0] : and(...conditions);

    // Total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(schema.cases)
      .where(where);

    // Rows
    const rows = await db
      .select()
      .from(schema.cases)
      .where(where)
      .orderBy(desc(schema.cases.updatedAt))
      .limit(limit)
      .offset(offset);

    // Enrich with recent alert info from audit_events (last 24h)
    const caseIds = rows.map((r: { id: number }) => String(r.id));
    let alertsByCaseId: Record<string, { blocks: number; violations: number; delegations: number }> = {};

    if (caseIds.length > 0) {
      try {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const alertRows = await db
          .select({
            caseId: schema.auditEvents.caseId,
            eventType: schema.auditEvents.eventType,
            cnt: count(),
          })
          .from(schema.auditEvents)
          .where(
            and(
              inArray(schema.auditEvents.caseId, caseIds),
              inArray(schema.auditEvents.eventType, [
                "tool_blocked",
                "external_message_blocked",
                "governance_rule_triggered",
                "ownership_conflict_detected",
                "visibility_violation_detected",
                "agent_delegated",
              ]),
              gte(schema.auditEvents.createdAt, since24h),
            ),
          )
          .groupBy(schema.auditEvents.caseId, schema.auditEvents.eventType);

        for (const row of alertRows) {
          const cid = row.caseId || "";
          if (!alertsByCaseId[cid]) alertsByCaseId[cid] = { blocks: 0, violations: 0, delegations: 0 };
          const c = Number(row.cnt);
          if (row.eventType === "tool_blocked" || row.eventType === "external_message_blocked") {
            alertsByCaseId[cid].blocks += c;
          } else if (row.eventType === "agent_delegated") {
            alertsByCaseId[cid].delegations += c;
          } else {
            alertsByCaseId[cid].violations += c;
          }
        }
      } catch { /* audit unavailable — proceed without alerts */ }
    }

    const cases = rows.map((r: Record<string, unknown>) => ({
      ...r,
      alerts: alertsByCaseId[String(r.id)] || { blocks: 0, violations: 0, delegations: 0 },
    }));

    return NextResponse.json({
      cases,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Error al obtener casos", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
