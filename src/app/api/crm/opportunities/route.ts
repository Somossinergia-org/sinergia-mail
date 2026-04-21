import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createOpportunity, listOpportunities, getPipelineStats } from "@/lib/crm/opportunities";
import { PIPELINE_STATUSES, type OpportunityFilters, type PipelineStatus, type Temperature, type Priority } from "@/lib/crm/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/opportunities — List opportunities with filters.
 * Query: ?companyId=1&status=pendiente&temperature=caliente&limit=50&offset=0
 * Add ?stats=true to get pipeline stats instead.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;

  // Pipeline stats mode
  if (params.get("stats") === "true") {
    try {
      const stats = await getPipelineStats(session.user.id);
      return NextResponse.json({ stats });
    } catch (err) {
      console.error("[CRM] pipelineStats error:", err);
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
  }

  const filters: OpportunityFilters = {
    userId: session.user.id,
    companyId: params.get("companyId") ? parseInt(params.get("companyId")!, 10) : undefined,
    status: params.get("status") as PipelineStatus | undefined,
    temperature: params.get("temperature") as Temperature | undefined,
    priority: params.get("priority") as Priority | undefined,
    limit: Math.min(parseInt(params.get("limit") || "50", 10), 200),
    offset: parseInt(params.get("offset") || "0", 10),
  };

  try {
    const rows = await listOpportunities(filters);
    return NextResponse.json({ opportunities: rows });
  } catch (err) {
    console.error("[CRM] listOpportunities error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * POST /api/crm/opportunities — Create a new opportunity.
 * Body: { companyId, title, status?, temperature?, estimatedValueEur?, ... }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!body.companyId || !body.title) {
      return NextResponse.json({ error: "Campos 'companyId' y 'title' son obligatorios" }, { status: 400 });
    }

    // Validate status if provided
    if (body.status && !PIPELINE_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `Estado inválido. Válidos: ${PIPELINE_STATUSES.join(", ")}` }, { status: 400 });
    }

    const opp = await createOpportunity({
      ...body,
      userId: session.user.id,
    });
    return NextResponse.json(opp, { status: 201 });
  } catch (err) {
    console.error("[CRM] createOpportunity error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
