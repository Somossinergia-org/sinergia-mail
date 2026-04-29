import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/operations/health — Operational health summary.
 *
 * Returns aggregated metrics for the operations dashboard:
 *   - Case counts by status
 *   - Cases with recent blocks/violations
 *   - Stale cases (no activity in 24h)
 *   - Agent activity summary (last 1h)
 *   - Recent blocks/violations/delegations counts
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { db, schema } = await import("@/db");
    const { eq, and, sql, count, inArray, lt, gte } = await import("drizzle-orm");

    const userId = session.user.id;

    // ── Case counts by status
    const caseCounts = await db
      .select({
        status: schema.cases.status,
        cnt: count(),
      })
      .from(schema.cases)
      .where(eq(schema.cases.userId, userId))
      .groupBy(schema.cases.status);

    const casesByStatus: Record<string, number> = {};
    for (const r of caseCounts) {
      casesByStatus[r.status] = Number(r.cnt);
    }

    // ── Stale cases: active/open but not updated in 24h
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ staleCases }] = await db
      .select({ staleCases: count() })
      .from(schema.cases)
      .where(
        and(
          eq(schema.cases.userId, userId),
          inArray(schema.cases.status, ["open", "active"]),
          // Antes: sql`${col} < ${date}` — drizzle 0.33 no serializa Date en
          // template literal y revienta con "expected string, received Date".
          lt(schema.cases.updatedAt, staleThreshold),
        ),
      );

    // ── Audit aggregates (last 1h)
    const since1h = new Date(Date.now() - 60 * 60 * 1000);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    let recentBlocks = 0;
    let recentViolations = 0;
    let recentDelegations = 0;
    let recentExternalMsgs = 0;
    let activeAgents: string[] = [];
    let blockedAgents: string[] = [];
    let casesWithBlocks: string[] = [];
    let casesWithViolations: string[] = [];

    try {
      // Counts by event type (last 1h)
      const auditCounts = await db
        .select({
          eventType: schema.auditEvents.eventType,
          cnt: count(),
        })
        .from(schema.auditEvents)
        .where(
          and(
            eq(schema.auditEvents.userId, userId),
            gte(schema.auditEvents.createdAt, since1h),
          ),
        )
        .groupBy(schema.auditEvents.eventType);

      for (const r of auditCounts) {
        const c = Number(r.cnt);
        if (r.eventType === "tool_blocked" || r.eventType === "external_message_blocked") {
          recentBlocks += c;
        } else if (
          ["governance_rule_triggered", "ownership_conflict_detected", "visibility_violation_detected"].includes(
            r.eventType,
          )
        ) {
          recentViolations += c;
        } else if (r.eventType === "agent_delegated") {
          recentDelegations += c;
        } else if (
          r.eventType === "external_message_sent" ||
          r.eventType === "external_message_attempted"
        ) {
          recentExternalMsgs += c;
        }
      }

      // Active agents (last 1h) — distinct agentIds with any event
      const agentRows = await db
        .selectDistinct({ agentId: schema.auditEvents.agentId })
        .from(schema.auditEvents)
        .where(
          and(
            eq(schema.auditEvents.userId, userId),
            gte(schema.auditEvents.createdAt, since1h),
          ),
        );
      activeAgents = agentRows.map((r: { agentId: string | null }) => r.agentId).filter(Boolean) as string[];

      // Blocked agents (last 24h)
      const blockedRows = await db
        .selectDistinct({ agentId: schema.auditEvents.agentId })
        .from(schema.auditEvents)
        .where(
          and(
            eq(schema.auditEvents.userId, userId),
            inArray(schema.auditEvents.eventType, ["tool_blocked", "agent_blocked"]),
            gte(schema.auditEvents.createdAt, since24h),
          ),
        );
      blockedAgents = blockedRows.map((r: { agentId: string | null }) => r.agentId).filter(Boolean) as string[];

      // Cases with blocks (last 24h)
      const blockCaseRows = await db
        .selectDistinct({ caseId: schema.auditEvents.caseId })
        .from(schema.auditEvents)
        .where(
          and(
            eq(schema.auditEvents.userId, userId),
            inArray(schema.auditEvents.eventType, ["tool_blocked", "external_message_blocked"]),
            gte(schema.auditEvents.createdAt, since24h),
          ),
        );
      casesWithBlocks = blockCaseRows.map((r: { caseId: string | null }) => r.caseId).filter(Boolean) as string[];

      // Cases with violations (last 24h)
      const violCaseRows = await db
        .selectDistinct({ caseId: schema.auditEvents.caseId })
        .from(schema.auditEvents)
        .where(
          and(
            eq(schema.auditEvents.userId, userId),
            inArray(schema.auditEvents.eventType, [
              "governance_rule_triggered",
              "ownership_conflict_detected",
              "visibility_violation_detected",
            ]),
            gte(schema.auditEvents.createdAt, since24h),
          ),
        );
      casesWithViolations = violCaseRows
        .map((r: { caseId: string | null }) => r.caseId)
        .filter(Boolean) as string[];
    } catch { /* audit unavailable */ }

    return NextResponse.json({
      cases: {
        byStatus: casesByStatus,
        total: Object.values(casesByStatus).reduce((a, b) => a + b, 0),
        stale: Number(staleCases),
        withBlocks: casesWithBlocks.length,
        withViolations: casesWithViolations.length,
      },
      agents: {
        activeLastHour: activeAgents,
        blockedLast24h: blockedAgents,
      },
      lastHour: {
        blocks: recentBlocks,
        violations: recentViolations,
        delegations: recentDelegations,
        externalMessages: recentExternalMsgs,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Error al obtener salud operativa", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
