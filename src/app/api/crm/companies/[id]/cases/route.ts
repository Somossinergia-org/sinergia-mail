/**
 * GET /api/crm/companies/[id]/cases — list cases linked to a company.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCompany } from "@/lib/crm/companies";
import { db } from "@/db";
import { cases } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

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

    const rows = await db
      .select()
      .from(cases)
      .where(and(eq(cases.companyId, id), eq(cases.userId, session.user.id)))
      .orderBy(desc(cases.updatedAt))
      .limit(50);

    return NextResponse.json({ cases: rows });
  } catch (err) {
    console.error("[CRM] listCompanyCases error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
