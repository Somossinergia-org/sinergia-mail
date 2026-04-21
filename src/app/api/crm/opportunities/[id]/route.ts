import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOpportunity, updateOpportunity, updateOpportunityStatus } from "@/lib/crm/opportunities";
import { PIPELINE_STATUSES } from "@/lib/crm/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/opportunities/[id] — Get opportunity detail.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    const opp = await getOpportunity(id);
    if (!opp) {
      return NextResponse.json({ error: "Oportunidad no encontrada" }, { status: 404 });
    }
    if (opp.userId !== session.user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(opp);
  } catch (err) {
    console.error("[CRM] getOpportunity error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * PATCH /api/crm/opportunities/[id] — Update opportunity.
 * Special: if body contains only { status, lostReason? }, uses updateOpportunityStatus.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    // Verify ownership
    const existing = await getOpportunity(id);
    if (!existing) {
      return NextResponse.json({ error: "Oportunidad no encontrada" }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();

    // Validate status if provided
    if (body.status && !PIPELINE_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `Estado inválido. Válidos: ${PIPELINE_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    // Don't allow changing userId or id
    delete body.id;
    delete body.userId;

    // Use status-specific update if that's the primary change
    const keys = Object.keys(body);
    if (keys.length <= 2 && body.status) {
      const updated = await updateOpportunityStatus(id, body.status, body.lostReason);
      return NextResponse.json(updated);
    }

    const updated = await updateOpportunity(id, body);
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[CRM] updateOpportunity error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
