import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCompany } from "@/lib/crm/companies";
import { listEnergyBillsByCompany } from "@/lib/crm/energy-bills";
import { listSupplyPointsByCompany } from "@/lib/crm/supply-points";
import { calculateSavingsFromBills } from "@/lib/crm/savings-calculator";
import { listContactsByCompany } from "@/lib/crm/contacts";
import {
  generateProposalPdf,
  type ProposalPdfData,
} from "@/lib/crm/proposal-pdf";

/**
 * POST /api/crm/energy-bills/proposal — Generate a proposal PDF for a company.
 * Body: { companyId: number }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const companyId =
      typeof body.companyId === "string"
        ? parseInt(body.companyId, 10)
        : body.companyId;

    if (!companyId || isNaN(companyId)) {
      return NextResponse.json(
        { error: "Campo 'companyId' es obligatorio" },
        { status: 400 },
      );
    }

    // Verify company ownership
    const company = await getCompany(companyId);
    if (!company || company.userId !== session.user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Fetch bills (ownership already verified above)
    const bills = await listEnergyBillsByCompany(companyId, session.user.id);
    if (bills.length === 0) {
      return NextResponse.json(
        { error: "No hay facturas para generar la propuesta" },
        { status: 404 },
      );
    }

    // Calculate savings
    const savings = calculateSavingsFromBills(bills);

    // Fetch contacts (first contact as contact person)
    const contacts = await listContactsByCompany(companyId);
    const contact = contacts[0] ?? null;

    // Get supply point data (first one) for CUPS / tariff / power
    const supplyPoints = await listSupplyPointsByCompany(companyId);
    const sp = supplyPoints[0] ?? null;

    // Derive consumption and power from bills for the proposal
    let totalConsumption = 0;
    for (const bill of bills) {
      if (bill.consumptionKwh) {
        const periods = bill.consumptionKwh as Record<string, number>;
        for (const val of Object.values(periods)) {
          totalConsumption += val ?? 0;
        }
      }
    }
    const avgMonthlyConsumption = Math.round(totalConsumption / bills.length);

    let maxPower = 0;
    for (const bill of bills) {
      if (bill.powerKw) {
        const powers = bill.powerKw as Record<string, number>;
        for (const val of Object.values(powers)) {
          if (val > maxPower) maxPower = val;
        }
      }
    }

    const proposalData: ProposalPdfData = {
      companyName: company.name,
      companyNif: company.nif ?? null,
      companyAddress: company.address ?? null,
      contactName: contact?.name ?? null,
      contactEmail: contact?.email ?? null,

      currentRetailer: savings.currentProvider,
      currentAnnualCost: savings.currentAnnualCost,
      tariff: sp?.tariff ?? "2.0TD",
      cups: sp?.cups ?? null,
      contractedPowerKW: maxPower,
      monthlyConsumptionKWh: avgMonthlyConsumption,

      bestProvider: savings.bestAlternative.provider,
      bestTariffName: savings.bestAlternative.tariffName,
      bestTariffType: savings.bestAlternative.type,
      estimatedAnnualCost: savings.bestAlternative.estimatedAnnualCost,
      potentialSavingsEur: savings.potentialSavingsEur,
      potentialSavingsPct: savings.potentialSavingsPct,
      recommendations: savings.recommendations,

      comparisons: savings.allComparisons.slice(0, 5).map((c) => ({
        provider: c.provider,
        tariffName: c.tariffName,
        type: c.type,
        estimatedAnnualCost: c.estimatedAnnualCost,
        savingsVsCurrent: c.savingsVsCurrent,
      })),

      date: new Date().toLocaleDateString("es-ES", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    };

    const pdfBuffer = await generateProposalPdf(proposalData);

    const safeCompanyName = company.name
      .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, "")
      .replace(/\s+/g, "-");

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="propuesta-ahorro-${safeCompanyName}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[CRM] energy-bills/proposal error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
