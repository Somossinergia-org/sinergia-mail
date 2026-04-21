import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listEnergyBillsByCompany } from "@/lib/crm/energy-bills";
import {
  calculateSavings,
  calculateSavingsFromBills,
} from "@/lib/crm/savings-calculator";

/**
 * POST /api/crm/energy-bills/savings — Calculate savings for a company.
 * Body: { companyId: number } OR manual params
 * { currentRetailer, currentAnnualCost, monthlyConsumptionKWh, contractedPowerKW, tariff }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Route A: company-based calculation from stored bills
    if (body.companyId) {
      const companyId =
        typeof body.companyId === "string"
          ? parseInt(body.companyId, 10)
          : body.companyId;

      if (isNaN(companyId)) {
        return NextResponse.json(
          { error: "'companyId' debe ser un número" },
          { status: 400 },
        );
      }

      // listEnergyBillsByCompany already verifies company ownership
      const bills = await listEnergyBillsByCompany(companyId, session.user.id);
      if (bills.length === 0) {
        return NextResponse.json(
          { error: "No hay facturas para esta empresa" },
          { status: 404 },
        );
      }

      const savings = calculateSavingsFromBills(bills);
      return NextResponse.json(savings);
    }

    // Route B: manual parameters
    const { currentRetailer, currentAnnualCost, monthlyConsumptionKWh, contractedPowerKW, tariff } =
      body;

    if (!currentRetailer || !currentAnnualCost || !monthlyConsumptionKWh || !contractedPowerKW || !tariff) {
      return NextResponse.json(
        {
          error:
            "Se requiere 'companyId' o los campos manuales: currentRetailer, currentAnnualCost, monthlyConsumptionKWh, contractedPowerKW, tariff",
        },
        { status: 400 },
      );
    }

    const savings = calculateSavings({
      currentRetailer,
      currentAnnualCost,
      monthlyConsumptionKWh,
      contractedPowerKW,
      tariff,
    });

    return NextResponse.json(savings);
  } catch (err) {
    console.error("[CRM] energy-bills/savings error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
