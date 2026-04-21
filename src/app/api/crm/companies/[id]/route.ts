import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCompany, updateCompany, deleteCompany } from "@/lib/crm/companies";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/companies/[id] — Get company detail.
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
    const company = await getCompany(id);
    if (!company) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }
    // Verify ownership
    if (company.userId !== session.user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(company);
  } catch (err) {
    console.error("[CRM] getCompany error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * PATCH /api/crm/companies/[id] — Update company.
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
    const existing = await getCompany(id);
    if (!existing) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    // Don't allow changing userId or id
    delete body.id;
    delete body.userId;

    const updated = await updateCompany(id, body);
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[CRM] updateCompany error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
