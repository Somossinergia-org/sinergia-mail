import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, sql, gte, lt, or } from "drizzle-orm";

export const maxDuration = 30;

interface TaxRate {
  rate: string;
  base: number;
  iva: number;
  total: number;
}

interface MonthlyBreakdown {
  month: string;
  base: number;
  iva: number;
}

interface IVASoportado {
  total: number;
  byRate: TaxRate[];
  byMonth: MonthlyBreakdown[];
}

/**
 * GET /api/agent/iva-quarterly
 * IVA quarterly summary with query params: ?year=2026&quarter=1
 * Default to current quarter if no params
 *
 * IVA Soportado (tax paid): sum of tax from invoices where we are the recipient
 * Recipient identification: recipientNif matches 'B10730505' or recipientName contains 'Sinergia' or 'BUEN FIN DE MES'
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const url = new URL(request.url);

  let year = parseInt(url.searchParams.get("year") || "");
  let quarter = parseInt(url.searchParams.get("quarter") || "");

  // Default to current quarter if not provided
  if (!year || !quarter) {
    const now = new Date();
    year = now.getFullYear();
    quarter = Math.floor(now.getMonth() / 3) + 1;
  }

  // Validate quarter
  if (quarter < 1 || quarter > 4) {
    return NextResponse.json(
      { error: "Quarter must be between 1 and 4" },
      { status: 400 }
    );
  }

  // Calculate quarter date range
  const startMonth = (quarter - 1) * 3; // 0, 3, 6, 9
  const endMonth = startMonth + 2; // 2, 5, 8, 11
  const periodStart = new Date(year, startMonth, 1);
  const periodEnd = new Date(year, endMonth + 1, 0, 23, 59, 59);

  try {
    // Query invoices where we are the recipient (IVA Soportado)
    // Recipient identification: recipientNif = 'B10730505' OR recipientName contains 'Sinergia' or 'BUEN FIN DE MES'
    const invoices = await db.query.invoices.findMany({
      where: and(
        eq(schema.invoices.userId, userId),
        gte(schema.invoices.invoiceDate, periodStart),
        lt(schema.invoices.invoiceDate, periodEnd),
        or(
          sql`${schema.invoices.recipientNif} = 'B10730505'`,
          sql`${schema.invoices.recipientName} ILIKE '%Sinergia%'`,
          sql`${schema.invoices.recipientName} ILIKE '%BUEN FIN DE MES%'`
        )
      ),
    });

    // Group by tax rate and calculate base amounts
    const taxRateMap = new Map<number, { base: number; iva: number }>();
    const monthlyMap = new Map<string, { base: number; iva: number }>();

    for (const invoice of invoices) {
      const amount = Number(invoice.amount) || 0;
      const tax = Number(invoice.tax) || 0;

      // Determine tax rate (assume standard rates: 21%, 10%, 4%, 0%)
      // If we can determine it from the invoice data, otherwise estimate
      let taxRate = 21; // default
      if (amount > 0 && tax > 0) {
        taxRate = Math.round((tax / amount) * 100);
      }

      // Group by tax rate
      const existing = taxRateMap.get(taxRate) || { base: 0, iva: 0 };
      taxRateMap.set(taxRate, {
        base: existing.base + amount,
        iva: existing.iva + tax,
      });

      // Group by month
      if (invoice.invoiceDate) {
        const monthKey = invoice.invoiceDate.toISOString().substring(0, 7); // YYYY-MM
        const monthExisting = monthlyMap.get(monthKey) || { base: 0, iva: 0 };
        monthlyMap.set(monthKey, {
          base: monthExisting.base + amount,
          iva: monthExisting.iva + tax,
        });
      }
    }

    // Convert to arrays and sort
    const byRate: TaxRate[] = Array.from(taxRateMap.entries())
      .map(([rate, data]) => ({
        rate: `${rate}%`,
        base: parseFloat(data.base.toFixed(2)),
        iva: parseFloat(data.iva.toFixed(2)),
        total: parseFloat((data.base + data.iva).toFixed(2)),
      }))
      .sort((a, b) => parseInt(b.rate) - parseInt(a.rate));

    // Build monthly breakdown for the quarter
    const byMonth: MonthlyBreakdown[] = [];
    for (let m = startMonth; m <= endMonth; m++) {
      const monthKey = `${year}-${String(m + 1).padStart(2, "0")}`;
      const data = monthlyMap.get(monthKey) || { base: 0, iva: 0 };
      byMonth.push({
        month: monthKey,
        base: parseFloat(data.base.toFixed(2)),
        iva: parseFloat(data.iva.toFixed(2)),
      });
    }

    // Calculate totals
    const totalBase = byRate.reduce((sum, r) => sum + r.base, 0);
    const totalIva = byRate.reduce((sum, r) => sum + r.iva, 0);

    const ivaSoportado: IVASoportado = {
      total: parseFloat(totalIva.toFixed(2)),
      byRate,
      byMonth,
    };

    // Format period dates
    const periodStartStr = periodStart.toISOString().split("T")[0];
    const periodEndStr = periodEnd.toISOString().split("T")[0];

    return NextResponse.json({
      year,
      quarter,
      period: {
        from: periodStartStr,
        to: periodEndStr,
      },
      ivaSoportado,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        issuer: inv.issuerName,
        invoiceNumber: inv.invoiceNumber,
        amount: Number(inv.amount) || 0,
        tax: Number(inv.tax) || 0,
        totalAmount: Number(inv.totalAmount) || 0,
        currency: inv.currency || "EUR",
        date: inv.invoiceDate?.toISOString().split("T")[0],
        recipientName: inv.recipientName,
        category: inv.category,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error generando resumen IVA trimestral" },
      { status: 500 }
    );
  }
}
