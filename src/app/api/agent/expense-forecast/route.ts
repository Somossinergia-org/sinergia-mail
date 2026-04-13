import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, desc, sql } from "drizzle-orm";

type InvoiceRecord = {
  issuerName: string | null;
  category: string | null;
  totalAmount: number;
  invoiceDate: Date | null;
  count: number;
};

/** GET /api/agent/expense-forecast — Predict next month's expenses */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    // Get all invoices for the user
    const invoices = await db.query.invoices.findMany({
      where: eq(schema.invoices.userId, userId),
      orderBy: [desc(schema.invoices.invoiceDate)],
    });

    // Group by issuerName + category
    const groupedData: {
      [key: string]: {
        issuerName: string | null;
        category: string | null;
        amounts: number[];
        dates: (Date | null)[];
      };
    } = {};

    for (const inv of invoices) {
      const key = `${inv.issuerName || "unknown"}|${inv.category || "other"}`;
      if (!groupedData[key]) {
        groupedData[key] = {
          issuerName: inv.issuerName,
          category: inv.category,
          amounts: [],
          dates: [],
        };
      }
      groupedData[key].amounts.push(Number(inv.totalAmount || 0));
      groupedData[key].dates.push(inv.invoiceDate);
    }

    // Analyze patterns
    const recurringIssuers = [];
    const oneTimeExpenses = [];

    for (const [, data] of Object.entries(groupedData)) {
      if (data.amounts.length < 2) {
        // One-time expense
        oneTimeExpenses.push({
          issuer: data.issuerName || "Unknown",
          category: data.category || "other",
          amount: data.amounts[0] || 0,
          date: data.dates[0],
        });
      } else {
        // Recurring expense
        const avgAmount = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;

        // Determine frequency
        const validDates = data.dates
          .filter((d): d is Date => d !== null)
          .sort((a, b) => b.getTime() - a.getTime());

        let frequency = "unknown";
        let confidence = "low";

        if (validDates.length >= 2) {
          const daysDiff = Math.abs(
            (validDates[0]?.getTime() || 0) - (validDates[1]?.getTime() || 0)
          ) / (1000 * 60 * 60 * 24);

          if (daysDiff < 45) {
            frequency = "monthly";
            confidence = "high";
          } else if (daysDiff < 120) {
            frequency = "quarterly";
            confidence = "medium";
          } else {
            frequency = "annual";
            confidence = "low";
          }
        }

        recurringIssuers.push({
          issuer: data.issuerName || "Unknown",
          category: data.category || "other",
          avgAmount,
          frequency,
          confidence,
          occurrences: data.amounts.length,
        });
      }
    }

    // Get current date and calculate next month
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthStr = nextMonth.toISOString().slice(0, 7); // YYYY-MM

    // Predict expenses for next month
    const forecast: {
      category: string;
      predicted: number;
      items: Array<{
        issuer: string;
        predicted: number;
        frequency: string;
        confidence: string;
      }>;
    }[] = [];

    const byCategory: { [key: string]: number } = {};

    for (const recurring of recurringIssuers) {
      // Only predict if frequency suggests next month charge
      if (
        recurring.frequency === "monthly" ||
        (recurring.frequency === "quarterly" && Math.random() < 0.33) ||
        (recurring.frequency === "annual" && Math.random() < 0.083)
      ) {
        const key = recurring.category || "other";
        byCategory[key] = (byCategory[key] || 0) + recurring.avgAmount;

        // Find or create category entry
        let categoryEntry = forecast.find((f) => f.category === key);
        if (!categoryEntry) {
          categoryEntry = { category: key, predicted: 0, items: [] };
          forecast.push(categoryEntry);
        }

        categoryEntry.predicted += recurring.avgAmount;
        categoryEntry.items.push({
          issuer: recurring.issuer,
          predicted: Math.round(recurring.avgAmount * 100) / 100,
          frequency: recurring.frequency,
          confidence: recurring.confidence,
        });
      }
    }

    const predictedTotal = Object.values(byCategory).reduce((a, b) => a + b, 0);

    // Calculate confidence level
    let confidence = "low";
    if (predictedTotal > 0 && recurringIssuers.filter((r) => r.confidence === "high").length > 0) {
      confidence = "high";
    } else if (predictedTotal > 0) {
      confidence = "medium";
    }

    // Get historical data (last 4 months)
    const historicalMonths = [];
    const historicalTotals = [];

    for (let i = 3; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = monthDate.toISOString().slice(0, 7);
      historicalMonths.push(monthLabel);

      // Sum invoices for this month
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);

      const monthTotal = invoices
        .filter((inv) => {
          const invDate = inv.invoiceDate;
          return invDate && invDate >= monthStart && invDate < monthEnd;
        })
        .reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);

      historicalTotals.push(monthTotal);
    }

    return NextResponse.json({
      forecast: {
        month: monthStr,
        predictedTotal: Math.round(predictedTotal * 100) / 100,
        confidence,
        byCategory: forecast,
        recurring: recurringIssuers.map((r) => ({
          issuer: r.issuer,
          category: r.category,
          avgAmount: Math.round(r.avgAmount * 100) / 100,
          frequency: r.frequency,
          confidence: r.confidence,
        })),
        oneTime: oneTimeExpenses.map((o) => ({
          issuer: o.issuer,
          category: o.category,
          amount: Math.round(o.amount * 100) / 100,
          date: o.date?.toISOString().slice(0, 10),
        })),
      },
      history: {
        months: historicalMonths,
        totals: historicalTotals.map((t) => Math.round(t * 100) / 100),
      },
    });
  } catch (e) {
    // Log error
    await db.insert(schema.agentLogs).values({
      userId,
      action: "expense-forecast",
      inputSummary: "Generate expense forecast",
      durationMs: 0,
      success: false,
      error: e instanceof Error ? e.message : "Unknown",
    });

    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error generando pronóstico" },
      { status: 500 }
    );
  }
}
