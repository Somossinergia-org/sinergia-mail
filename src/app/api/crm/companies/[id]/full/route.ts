/**
 * GET /api/crm/companies/[id]/full — full company detail with related entities.
 * Returns company + contacts + opportunities + services + cases + documents.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCompany } from "@/lib/crm/companies";
import { listContactsByCompany } from "@/lib/crm/contacts";
import { listOpportunities } from "@/lib/crm/opportunities";
import { listServicesByCompany } from "@/lib/crm/services";
import { listCasesByCompany } from "@/lib/crm/cases-link";
import { db } from "@/db";
import { documents, supplyPoints } from "@/db/schema";
import { eq } from "drizzle-orm";

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

    // Fetch all related entities in parallel
    const [contacts, opportunities, services, cases, docs, points] = await Promise.all([
      listContactsByCompany(id),
      listOpportunities({ userId: session.user.id, companyId: id }),
      listServicesByCompany(id),
      listCasesByCompany(id, session.user.id),
      db.select().from(documents).where(eq(documents.companyId, id)),
      db.select().from(supplyPoints).where(eq(supplyPoints.companyId, id)),
    ]);

    return NextResponse.json({
      company,
      contacts,
      opportunities,
      services,
      cases,
      documents: docs,
      supplyPoints: points,
    });
  } catch (err) {
    console.error("[CRM] getCompanyFull error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
