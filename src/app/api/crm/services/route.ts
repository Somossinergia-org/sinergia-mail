import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createService, listServicesByCompany } from "@/lib/crm/services";
import { getCompany } from "@/lib/crm/companies";
import { isValidServiceType, isValidServiceStatus, isValidClientTypeForVertical } from "@/lib/crm/service-verticals";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/services?companyId=1&type=telecom
 * List services for a company, optionally filtered by type.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const companyId = parseInt(params.get("companyId") || "", 10);
  if (!companyId) {
    return NextResponse.json({ error: "companyId requerido" }, { status: 400 });
  }

  // Verify company ownership
  const company = await getCompany(companyId);
  if (!company || company.userId !== session.user.id) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  try {
    let rows = await listServicesByCompany(companyId);

    // Optional type filter
    const type = params.get("type");
    if (type && isValidServiceType(type)) {
      rows = rows.filter((s) => s.type === type);
    }

    // Optional status filter
    const status = params.get("status");
    if (status && isValidServiceStatus(status)) {
      rows = rows.filter((s) => s.status === status);
    }

    return NextResponse.json({ services: rows, total: rows.length });
  } catch (err) {
    console.error("[CRM] listServices error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * POST /api/crm/services
 * Create a new service for a company.
 * Body: { companyId, type, status?, currentProvider?, currentSpendEur?, ... }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Validate required fields
    if (!body.companyId || !body.type) {
      return NextResponse.json(
        { error: "Campos 'companyId' y 'type' son obligatorios" },
        { status: 400 },
      );
    }

    if (!isValidServiceType(body.type)) {
      return NextResponse.json(
        { error: `Tipo de servicio inválido: ${body.type}` },
        { status: 400 },
      );
    }

    if (body.status && !isValidServiceStatus(body.status)) {
      return NextResponse.json(
        { error: `Estado de servicio inválido: ${body.status}` },
        { status: 400 },
      );
    }

    // Validate client type against vertical rules
    if (body.clientType && !isValidClientTypeForVertical(body.clientType, body.type)) {
      return NextResponse.json(
        { error: `Tipo de cliente '${body.clientType}' no válido para vertical '${body.type}'. Verticales digitales (IA, web, CRM, apps) solo admiten 'autonomo' o 'empresa'.` },
        { status: 400 },
      );
    }

    // Verify company ownership
    const company = await getCompany(body.companyId);
    if (!company || company.userId !== session.user.id) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    const service = await createService({
      companyId: body.companyId,
      opportunityId: body.opportunityId || null,
      supplyPointId: body.supplyPointId || null,
      type: body.type,
      status: body.status || "prospecting",
      currentProvider: body.currentProvider || null,
      currentSpendEur: body.currentSpendEur ?? null,
      offeredPriceEur: body.offeredPriceEur ?? null,
      estimatedSavings: body.estimatedSavings ?? null,
      contractDate: body.contractDate ? new Date(body.contractDate) : null,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
      data: body.data || null,
      notes: body.notes || null,
    });

    return NextResponse.json({ service }, { status: 201 });
  } catch (err) {
    console.error("[CRM] createService error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
