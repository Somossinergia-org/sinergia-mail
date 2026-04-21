import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getService,
  updateService,
  deleteService,
  verifyServiceOwnership,
  updateServiceVerticalData,
  linkServiceToOpportunity,
} from "@/lib/crm/services";
import { isValidServiceStatus } from "@/lib/crm/service-verticals";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/services/[id] — Get service detail.
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
  if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const service = await verifyServiceOwnership(id, session.user.id);
  if (!service) {
    return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ service });
}

/**
 * PATCH /api/crm/services/[id] — Update service.
 * Body can include common fields + data (vertical-specific JSONB).
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
  if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // Verify ownership
  const existing = await verifyServiceOwnership(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 });
  }

  try {
    const body = await req.json();

    // Validate status if provided
    if (body.status && !isValidServiceStatus(body.status)) {
      return NextResponse.json(
        { error: `Estado inválido: ${body.status}` },
        { status: 400 },
      );
    }

    // Separate vertical data from common fields
    const { data: verticalData, ...commonFields } = body;

    // Build update object with only allowed common fields
    const allowedCommon = [
      "status", "currentProvider", "currentSpendEur", "offeredPriceEur",
      "estimatedSavings", "contractDate", "expiryDate", "notes",
      "opportunityId",
    ];
    const update: Record<string, unknown> = {};
    for (const key of allowedCommon) {
      if (key in commonFields) {
        if (key === "contractDate" || key === "expiryDate") {
          update[key] = commonFields[key] ? new Date(commonFields[key]) : null;
        } else {
          update[key] = commonFields[key];
        }
      }
    }

    // Update common fields
    let service = existing;
    if (Object.keys(update).length > 0) {
      const updated = await updateService(id, update as any);
      if (updated) service = updated;
    }

    // Merge vertical data if provided
    if (verticalData && typeof verticalData === "object") {
      const updated = await updateServiceVerticalData(id, verticalData);
      if (updated) service = updated;
    }

    return NextResponse.json({ service });
  } catch (err) {
    console.error("[CRM] updateService error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/services/[id] — Delete service.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const id = parseInt(params.id, 10);
  if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const existing = await verifyServiceOwnership(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 });
  }

  try {
    await deleteService(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[CRM] deleteService error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
