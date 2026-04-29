import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createCompany, listCompanies, countCompanies } from "@/lib/crm/companies";
import type { CompanyFilters } from "@/lib/crm/types";

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
      countCompanies(session.user.id),
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
    const body = await req.json();
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "Campo 'name' es obligatorio" }, { status: 400 });
    }

    const company = await createCompany({
      ...body,
      userId: session.user.id,
      createdBy: session.user.id,
    });
    return NextResponse.json(company, { status: 201 });
  } catch (err) {
    console.error("[CRM] createCompany error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
