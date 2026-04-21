import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listEnergyBillsByCompany } from "@/lib/crm/energy-bills";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/energy-bills?companyId=X — List energy bills for a company.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const companyIdParam = req.nextUrl.searchParams.get("companyId");
  if (!companyIdParam) {
    return NextResponse.json(
      { error: "Parámetro 'companyId' es obligatorio" },
      { status: 400 },
    );
  }

  const companyId = parseInt(companyIdParam, 10);
  if (isNaN(companyId)) {
    return NextResponse.json(
      { error: "Parámetro 'companyId' debe ser un número" },
      { status: 400 },
    );
  }

  try {
    // listEnergyBillsByCompany already verifies company ownership
    const bills = await listEnergyBillsByCompany(companyId, session.user.id);
    return NextResponse.json({ bills });
  } catch (err) {
    console.error("[CRM] listEnergyBills error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
