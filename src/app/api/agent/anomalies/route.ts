import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/agent/anomalies" });

/**
 * Detect invoice amount anomalies:
 *   For each issuer with ≥3 invoices, compute the mean of the *previous*
 *   invoices (excluding the most recent) and flag the most recent one if it
 *   deviates by more than 30%.
 *
 * Returns an array of anomalies sorted by severity (deviation magnitude).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const userId = session.user.id;
  const THRESHOLD = 0.3; // 30%

  try {
    // All invoices with positive amounts, grouped per issuer, ordered by date desc
    const rows = await db
      .select({
        id: schema.invoices.id,
        issuer: schema.invoices.issuerName,
        amount: schema.invoices.totalAmount,
        date: schema.invoices.invoiceDate,
        category: schema.invoices.category,
      })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.userId, userId), sql`${schema.invoices.totalAmount} > 0`))
      .orderBy(desc(schema.invoices.invoiceDate));

    // Group by issuer
    const byIssuer = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.issuer) continue;
      const key = r.issuer;
      const arr = byIssuer.get(key) || [];
      arr.push(r);
      byIssuer.set(key, arr);
    }

    const anomalies: Array<{
      invoiceId: number;
      issuer: string;
      latestAmount: number;
      previousMean: number;
      deviationPct: number;
      direction: "up" | "down";
      category: string | null;
      date: string | null;
      severity: "high" | "medium";
      samplesCount: number;
    }> = [];

    for (const entry of Array.from(byIssuer.entries())) {
      const [issuer, invs] = entry;
      if (invs.length < 3) continue; // need baseline of at least 2 prior
      const [latest, ...priors] = invs;
      const priorsSlice = priors.slice(0, 6); // use last 6 priors as baseline (rolling)
      const mean =
        priorsSlice.reduce(
          (s: number, r: { amount: string | number | null }) => s + Number(r.amount || 0),
          0,
        ) / priorsSlice.length;
      if (mean <= 0) continue;
      const latestAmount = Number(latest.amount || 0);
      const dev = (latestAmount - mean) / mean;
      if (Math.abs(dev) < THRESHOLD) continue;

      anomalies.push({
        invoiceId: latest.id,
        issuer,
        latestAmount,
        previousMean: mean,
        deviationPct: Math.round(dev * 100),
        direction: dev > 0 ? "up" : "down",
        category: latest.category,
        date: latest.date ? new Date(latest.date).toISOString().slice(0, 10) : null,
        severity: Math.abs(dev) >= 0.6 ? "high" : "medium",
        samplesCount: priorsSlice.length,
      });
    }

    anomalies.sort((a, b) => Math.abs(b.deviationPct) - Math.abs(a.deviationPct));

    return NextResponse.json({
      count: anomalies.length,
      threshold: THRESHOLD,
      anomalies,
    });
  } catch (e) {
    logError(log, e, { userId }, "anomalies detection failed");
    return NextResponse.json({ error: "Error detectando anomalías" }, { status: 500 });
  }
}
