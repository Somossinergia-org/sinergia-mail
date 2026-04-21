/**
 * PATCH /api/crm/cases/link — link/unlink case to company/opportunity.
 * Body: { caseId, companyId?, opportunityId?, action: "link" | "unlink" }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { cases } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  linkCaseToCompany,
  unlinkCaseFromCompany,
  linkCaseToOpportunity,
  unlinkCaseFromOpportunity,
} from "@/lib/crm/cases-link";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await req.json();
    const { caseId, companyId, opportunityId, action } = body;

    if (!caseId || typeof caseId !== "number")
      return NextResponse.json({ error: "caseId requerido (number)" }, { status: 400 });

    // Ownership check: case must belong to authenticated user
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
    if (!caseRow) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    if (caseRow.userId !== session.user.id)
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    if (action === "link") {
      let result = null;
      if (companyId) result = await linkCaseToCompany(caseId, companyId);
      if (opportunityId) result = await linkCaseToOpportunity(caseId, opportunityId);
      if (!result) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
      return NextResponse.json(result);
    }

    if (action === "unlink") {
      let result = null;
      if (companyId !== undefined) result = await unlinkCaseFromCompany(caseId);
      if (opportunityId !== undefined) result = await unlinkCaseFromOpportunity(caseId);
      if (!result) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "action debe ser 'link' o 'unlink'" }, { status: 400 });
  } catch (err) {
    console.error("[CRM] linkCase error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
