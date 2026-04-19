import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getForecast,
  getCashFlow,
  detectRecurringExpenses,
  getSeasonalPattern,
  getRunway,
} from "@/lib/forecasting/treasury";

/** GET /api/forecasting — Treasury forecasting endpoints */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const type = req.nextUrl.searchParams.get("type");

  try {
    // Cash flow for date range
    if (type === "cashflow") {
      const start = req.nextUrl.searchParams.get("start");
      const end = req.nextUrl.searchParams.get("end");

      if (!start || !end) {
        return NextResponse.json(
          { error: "Parametros 'start' y 'end' requeridos (formato ISO)" },
          { status: 400 }
        );
      }

      const cashFlow = await getCashFlow(userId, new Date(start), new Date(end));
      return NextResponse.json({ cashFlow });
    }

    // Recurring expenses
    if (type === "recurring") {
      const recurring = await detectRecurringExpenses(userId);
      return NextResponse.json({ recurring });
    }

    // Seasonal pattern
    if (type === "seasonal") {
      const seasonal = await getSeasonalPattern(userId);
      return NextResponse.json({ seasonal });
    }

    // Runway calculation
    if (type === "runway") {
      const balanceParam = req.nextUrl.searchParams.get("balance");
      if (!balanceParam) {
        return NextResponse.json(
          { error: "Parametro 'balance' requerido (saldo actual en EUR)" },
          { status: 400 }
        );
      }
      const balance = parseFloat(balanceParam);
      if (isNaN(balance)) {
        return NextResponse.json({ error: "Balance debe ser un numero" }, { status: 400 });
      }
      const runway = await getRunway(userId, balance);
      return NextResponse.json({ runway });
    }

    // Default: full forecast for next 6 months
    const months = parseInt(req.nextUrl.searchParams.get("months") ?? "6");
    const forecast = await getForecast(userId, months);
    return NextResponse.json({ forecast });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
