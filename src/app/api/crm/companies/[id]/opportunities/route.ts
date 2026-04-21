/**
 * GET /api/crm/companies/[id]/opportunities — list opportunities for a company.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCompany } from "@/lib/crm/companies";
import { listOpportunities } from "@/lib/crm/opportunities";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  try {
    const company = await getCompany(id);
    if (!company) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    if (company.userId !== session.user.id)
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const rows = await listOpportunities({ userId: session.user.id, companyId: id });
    return NextResponse.json({ opportunities: rows });
  } catch (err) {
    console.error("[CRM] listCompanyOpportunities error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
