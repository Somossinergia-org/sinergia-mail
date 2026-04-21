import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createActivity,
  listActivitiesByCompany,
  listActivitiesByOpportunity,
  getRecentActivity,
  getOverdueFollowUps,
  getUpcomingFollowUps,
  getCompaniesWithoutRecentActivity,
  ACTIVITY_TYPES,
  type ActivityType,
} from "@/lib/crm/activities";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/activities?view=company|opportunity|recent|overdue|upcoming|stale
 *   - companyId: required for view=company
 *   - opportunityId: required for view=opportunity
 *   - days: optional for view=upcoming|stale
 *   - limit: optional
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const view = params.get("view") || "recent";
  const limitParam = params.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 30;

  try {
    switch (view) {
      case "company": {
        const companyId = parseInt(params.get("companyId") || "", 10);
        if (!companyId) return NextResponse.json({ error: "companyId requerido" }, { status: 400 });
        const activities = await listActivitiesByCompany(companyId, session.user.id, limit);
        return NextResponse.json({ activities, total: activities.length });
      }

      case "opportunity": {
        const oppId = parseInt(params.get("opportunityId") || "", 10);
        if (!oppId) return NextResponse.json({ error: "opportunityId requerido" }, { status: 400 });
        const activities = await listActivitiesByOpportunity(oppId, session.user.id, limit);
        return NextResponse.json({ activities, total: activities.length });
      }

      case "recent": {
        const activities = await getRecentActivity(session.user.id, limit);
        return NextResponse.json({ activities, total: activities.length });
      }

      case "overdue": {
        const followUps = await getOverdueFollowUps(session.user.id, limit);
        return NextResponse.json({ followUps, total: followUps.length });
      }

      case "upcoming": {
        const days = parseInt(params.get("days") || "7", 10);
        const followUps = await getUpcomingFollowUps(session.user.id, days, limit);
        return NextResponse.json({ followUps, total: followUps.length });
      }

      case "stale": {
        const days = parseInt(params.get("days") || "21", 10);
        const stale = await getCompaniesWithoutRecentActivity(session.user.id, days, limit);
        return NextResponse.json({ companies: stale, total: stale.length });
      }

      default:
        return NextResponse.json(
          { error: `Vista no válida: ${view}. Usa: company|opportunity|recent|overdue|upcoming|stale` },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error("[CRM] activities GET error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * POST /api/crm/activities
 * Body: { companyId, contactId?, opportunityId?, caseId?, serviceId?, type, summary, outcome?, nextStep?, dueAt? }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { companyId, contactId, opportunityId, caseId, serviceId, type, summary, outcome, nextStep, dueAt } = body;

    if (!companyId || !type || !summary) {
      return NextResponse.json({ error: "companyId, type y summary son requeridos" }, { status: 400 });
    }

    if (!ACTIVITY_TYPES.includes(type as ActivityType)) {
      return NextResponse.json({ error: `Tipo no válido. Usa: ${ACTIVITY_TYPES.join(", ")}` }, { status: 400 });
    }

    const activity = await createActivity({
      userId: session.user.id,
      companyId,
      contactId: contactId ?? null,
      opportunityId: opportunityId ?? null,
      caseId: caseId ?? null,
      serviceId: serviceId ?? null,
      type: type as ActivityType,
      summary,
      outcome: outcome ?? null,
      nextStep: nextStep ?? null,
      dueAt: dueAt ? new Date(dueAt) : null,
    });

    return NextResponse.json({ activity }, { status: 201 });
  } catch (err) {
    console.error("[CRM] activities POST error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
