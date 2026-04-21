/**
 * GET /api/crm/companies/[id]/contacts — list contacts for a company.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCompany } from "@/lib/crm/companies";
import { listContactsByCompany } from "@/lib/crm/contacts";

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

    const contacts = await listContactsByCompany(id);
    return NextResponse.json({ contacts });
  } catch (err) {
    console.error("[CRM] listCompanyContacts error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
