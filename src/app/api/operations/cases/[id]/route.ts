import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ─── Valid manual actions ──────────────────────────────────────────────
type ManualAction = "close" | "reopen" | "reassign" | "pause" | "mark_review";
const VALID_ACTIONS: ManualAction[] = ["close", "reopen", "reassign", "pause", "mark_review"];

/**
 * GET /api/operations/cases/[id] — Case detail with full timeline.
 *
 * Returns: case record + timeline + blocked events + delegations + violations + ownership transitions
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const caseId = params.id;

  try {
    const { db, schema } = await import("@/db");
    const { eq, and, desc } = await import("drizzle-orm");

    // Fetch the case
    const [caseRow] = await db
      .select()
      .from(schema.cases)
      .where(
        and(
          eq(schema.cases.id, parseInt(caseId, 10)),
          eq(schema.cases.userId, session.user.id),
        ),
      )
      .limit(1);

    if (!caseRow) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }

    // Fetch audit events for this case (last 200 events)
    let timeline: Array<Record<string, unknown>> = [];
    let blockedEvents: Array<Record<string, unknown>> = [];
    let violations: Array<Record<string, unknown>> = [];
    let delegations: Array<Record<string, unknown>> = [];
    let ownerTransitions: Array<Record<string, unknown>> = [];
    let externalComms: Array<Record<string, unknown>> = [];

    try {
      const caseIdStr = String(caseId);

      // Full timeline
      const auditRows = await db
        .select()
        .from(schema.auditEvents)
        .where(eq(schema.auditEvents.caseId, caseIdStr))
        .orderBy(desc(schema.auditEvents.createdAt))
        .limit(200);

      timeline = auditRows.map((r: Record<string, unknown>) => ({
        id: r.eventId || r.id,
        timestamp: r.createdAt,
        eventType: r.eventType,
        result: r.result,
        agentId: r.agentId,
        agentLayer: r.agentLayer,
        toolName: r.toolName,
        reason: r.reason,
        visibleOwnerId: r.visibleOwnerId,
        targetAgentId: r.targetAgentId,
        metadata: r.metadata,
      }));

      // Categorize
      blockedEvents = timeline.filter(
        (e) => e.eventType === "tool_blocked" || e.eventType === "external_message_blocked",
      );

      violations = timeline.filter((e) =>
        ["governance_rule_triggered", "ownership_conflict_detected", "visibility_violation_detected"].includes(
          e.eventType as string,
        ),
      );

      delegations = timeline.filter((e) => e.eventType === "agent_delegated");

      ownerTransitions = timeline.filter((e) => e.eventType === "case_owner_changed");

      externalComms = timeline.filter((e) =>
        ["external_message_attempted", "external_message_blocked", "external_message_sent"].includes(
          e.eventType as string,
        ),
      );
    } catch { /* audit unavailable */ }

    // Identify unique agents involved
    const agentsInvolved = Array.from(
      new Set(timeline.map((e) => e.agentId as string).filter(Boolean)),
    );

    return NextResponse.json({
      case: caseRow,
      timeline,
      blockedEvents,
      violations,
      delegations,
      ownerTransitions,
      externalComms,
      agentsInvolved,
      stats: {
        totalEvents: timeline.length,
        totalBlocks: blockedEvents.length,
        totalViolations: violations.length,
        totalDelegations: delegations.length,
        totalExternalComms: externalComms.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Error al obtener detalle del caso", detail: (err as Error).message },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/operations/cases/[id] — Manual case actions.
 *
 * Body: { action: "close" | "reopen" | "reassign" | "pause" | "mark_review", newOwnerId?: string, reason?: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const caseId = params.id;
  const body = (await req.json()) as {
    action?: string;
    newOwnerId?: string;
    reason?: string;
  };

  if (!body.action || !VALID_ACTIONS.includes(body.action as ManualAction)) {
    return NextResponse.json(
      { error: `Acción inválida. Válidas: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const { db, schema } = await import("@/db");
    const { eq, and } = await import("drizzle-orm");

    // Verify ownership
    const [caseRow] = await db
      .select()
      .from(schema.cases)
      .where(
        and(
          eq(schema.cases.id, parseInt(caseId, 10)),
          eq(schema.cases.userId, session.user.id),
        ),
      )
      .limit(1);

    if (!caseRow) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }

    const action = body.action as ManualAction;
    const now = new Date();
    const updates: Record<string, unknown> = { updatedAt: now };

    switch (action) {
      case "close":
        updates.status = "closed";
        updates.closedAt = now;
        break;
      case "reopen":
        updates.status = "open";
        updates.closedAt = null;
        break;
      case "reassign":
        if (!body.newOwnerId) {
          return NextResponse.json({ error: "newOwnerId requerido para reassign" }, { status: 400 });
        }
        updates.visibleOwnerId = body.newOwnerId;
        break;
      case "pause":
        updates.status = "waiting";
        break;
      case "mark_review":
        updates.metadata = {
          ...(caseRow.metadata as Record<string, unknown> || {}),
          markedForReview: true,
          reviewRequestedAt: now.toISOString(),
          reviewReason: body.reason || "Marcado manualmente para revisión",
        };
        break;
    }

    await db
      .update(schema.cases)
      .set(updates)
      .where(eq(schema.cases.id, parseInt(caseId, 10)));

    // Record audit event
    try {
      await db.insert(schema.auditEvents).values({
        eventId: `evt_manual_${Date.now()}`,
        userId: session.user.id,
        caseId: String(caseId),
        eventType: `manual_${action}`,
        agentId: "human",
        agentLayer: "gobierno",
        result: "success",
        reason: body.reason || `Acción manual: ${action}`,
        visibleOwnerId: action === "reassign" ? body.newOwnerId : caseRow.visibleOwnerId,
        targetAgentId: action === "reassign" ? body.newOwnerId : null,
        metadata: { performedBy: session.user.id, action, previousStatus: caseRow.status },
        createdAt: now,
      });
    } catch { /* audit insert failure is non-fatal */ }

    return NextResponse.json({
      ok: true,
      action,
      caseId: parseInt(caseId, 10),
      updates,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Error al ejecutar acción", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
