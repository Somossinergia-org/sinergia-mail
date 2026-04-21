import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  buildOperationalAgenda,
  buildWeeklySummary,
  getCompanyAgenda,
} from "@/lib/crm/operational-agenda";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/agenda
 * Query: view=full|weekly|company  companyId?
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const userId = session.user.id;
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") || "full";

  try {
    if (view === "weekly") {
      const summary = await buildWeeklySummary(userId);
      return NextResponse.json({ weekly: summary });
    }

    if (view === "company") {
      const companyId = parseInt(sp.get("companyId") || "0", 10);
      if (!companyId) return NextResponse.json({ error: "companyId requerido" }, { status: 400 });
      const agenda = await getCompanyAgenda(userId, companyId);
      return NextResponse.json({ companyAgenda: agenda });
    }

    // Default: full agenda
    const agenda = await buildOperationalAgenda(userId);
    return NextResponse.json({ agenda });
  } catch (err) {
    console.error("[CRM] agenda GET error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
