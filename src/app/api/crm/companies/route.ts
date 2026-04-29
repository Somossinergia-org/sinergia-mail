import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createCompany, listCompanies, countCompanies } from "@/lib/crm/companies";
import type { CompanyFilters } from "@/lib/crm/types";
import { CompanyCreateSchema, zodErrorResponse } from "@/lib/validators/crm";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/companies — List companies with optional filters.
 * Query: ?search=term&province=Alicante&source=manual&limit=50&offset=0
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const ct = params.get("clientType");
  const filters: CompanyFilters = {
    userId: session.user.id,
    search: params.get("search") || undefined,
    province: params.get("province") || undefined,
    source: params.get("source") || undefined,
    clientType: ct === "particular" || ct === "autonomo" || ct === "empresa" ? ct : undefined,
    limit: Math.min(parseInt(params.get("limit") || "50", 10), 200),
    offset: parseInt(params.get("offset") || "0", 10),
  };

  try {
    const [rows, total] = await Promise.all([
      listCompanies(filters),
      // FIX (auditoría 2026-04-29): el count debe respetar los mismos
      // filtros que el listado, sino el paginado del frontend miente.
      countCompanies(session.user.id, {
        search: filters.search,
        province: filters.province,
        source: filters.source,
        clientType: filters.clientType,
      }),
    ]);
    return NextResponse.json({ companies: rows, total });
  } catch (err) {
    console.error("[CRM] listCompanies error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * POST /api/crm/companies — Create a new company.
 * Body: { name, nif?, sector?, address?, city?, province?, ... }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const raw = await req.json();
    const parsed = CompanyCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(zodErrorResponse(parsed.error), { status: 400 });
    }

    const company = await createCompany({
      ...parsed.data,
      // Sobrescribir userId/createdBy SIEMPRE desde la sesión (nunca confiar en el body)
      userId: session.user.id,
      createdBy: session.user.id,
    });
    return NextResponse.json(company, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(zodErrorResponse(err), { status: 400 });
    }
    console.error("[CRM] createCompany error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
