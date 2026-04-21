import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getExecutiveSummary,
  getPipelineMetrics,
  getVerticalMetrics,
  getOperationalMetrics,
  getEnergyMetrics,
} from "@/lib/crm/executive-metrics";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/executive
 * Query: view=full|pipeline|verticals|ops|energy
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
    switch (view) {
      case "pipeline": {
        const pipeline = await getPipelineMetrics(userId);
        return NextResponse.json({ pipeline });
      }
      case "verticals": {
        const verticals = await getVerticalMetrics(userId);
        return NextResponse.json({ verticals });
      }
      case "ops": {
        const operational = await getOperationalMetrics(userId);
        return NextResponse.json({ operational });
      }
      case "energy": {
        const energy = await getEnergyMetrics(userId);
        return NextResponse.json({ energy });
      }
      default: {
        const summary = await getExecutiveSummary(userId);
        return NextResponse.json({ summary });
      }
    }
  } catch (err) {
    console.error("[CRM] executive GET error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
