import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getExpiringServices,
  getOverdueServices,
  getStaleOpportunities,
  getHotOpportunities,
  getCrossSellCandidates,
  getDailyCommercialBrief,
  getCompanyOpsContext,
  OPS_THRESHOLDS,
} from "@/lib/crm/commercial-ops";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/commercial-ops?view=brief|expiring|overdue|stale|hot|crosssell|company
 *
 * Optional params:
 *  - days: override default threshold
 *  - companyId: required for view=company
 *  - limit: max results for crosssell
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const view = params.get("view") || "brief";
  const daysParam = params.get("days");
  const days = daysParam ? parseInt(daysParam, 10) : undefined;

  try {
    switch (view) {
      case "brief": {
        const brief = await getDailyCommercialBrief(session.user.id);
        return NextResponse.json({ brief });
      }

      case "expiring": {
        const expiring = await getExpiringServices(
          session.user.id,
          days ?? OPS_THRESHOLDS.expiringDays,
        );
        return NextResponse.json({ services: expiring, total: expiring.length });
      }

      case "overdue": {
        const overdue = await getOverdueServices(session.user.id);
        return NextResponse.json({ services: overdue, total: overdue.length });
      }

      case "stale": {
        const stale = await getStaleOpportunities(
          session.user.id,
          days ?? OPS_THRESHOLDS.staleOpportunityDays,
        );
        return NextResponse.json({ opportunities: stale, total: stale.length });
      }

      case "hot": {
        const hot = await getHotOpportunities(
          session.user.id,
          days ?? OPS_THRESHOLDS.hotOpportunityDays,
        );
        return NextResponse.json({ opportunities: hot, total: hot.length });
      }

      case "crosssell": {
        const limitParam = params.get("limit");
        const limit = limitParam ? parseInt(limitParam, 10) : OPS_THRESHOLDS.briefMaxItems;
        const candidates = await getCrossSellCandidates(session.user.id, limit);
        return NextResponse.json({ candidates, total: candidates.length });
      }

      case "company": {
        const companyId = parseInt(params.get("companyId") || "", 10);
        if (!companyId) {
          return NextResponse.json({ error: "companyId requerido" }, { status: 400 });
        }
        const ctx = await getCompanyOpsContext(companyId, session.user.id);
        if (!ctx) {
          return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
        }
        return NextResponse.json({ context: ctx });
      }

      default:
        return NextResponse.json(
          { error: `Vista no válida: ${view}. Usa: brief|expiring|overdue|stale|hot|crosssell|company` },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error("[CRM] commercial-ops error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
