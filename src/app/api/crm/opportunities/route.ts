import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createOpportunity, listOpportunities, getPipelineStats } from "@/lib/crm/opportunities";
import { getCompany } from "@/lib/crm/companies";
import { PIPELINE_STATUSES, type OpportunityFilters, type PipelineStatus, type Temperature, type Priority } from "@/lib/crm/types";
import { OpportunityCreateSchema, zodErrorResponse } from "@/lib/validators/crm";
import { z } from "zod";

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
    const raw = await req.json();
    const parsed = OpportunityCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(zodErrorResponse(parsed.error), { status: 400 });
    }

    // SECURITY: verificar ownership de companyId antes de crear oportunidad.
    const company = await getCompany(parsed.data.companyId);
    if (!company || company.userId !== session.user.id) {
      return NextResponse.json({ error: "Empresa no encontrada o no autorizada" }, { status: 403 });
    }

    const opp = await createOpportunity({
      ...parsed.data,
      userId: session.user.id, // sobreescribe cualquier userId del body
    });
    return NextResponse.json(opp, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(zodErrorResponse(err), { status: 400 });
    }
    console.error("[CRM] createOpportunity error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
