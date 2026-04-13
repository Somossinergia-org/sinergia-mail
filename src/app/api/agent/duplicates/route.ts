import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, isNotNull } from "drizzle-orm";

export const maxDuration = 30;

interface DuplicateInvoice {
  id: number;
  issuer: string | null;
  amount: number;
  date: string | null;
  invoiceNumber: string | null;
}

interface DuplicateGroup {
  confidence: "high" | "medium" | "definitive";
  reason: string;
  invoices: DuplicateInvoice[];
}

/**
 * GET /api/agent/duplicates
 * Detect potential duplicate invoices by comparing:
 * - Same issuerName + same totalAmount → high confidence
 * - Same issuerName + totalAmount within 5% + dates within 5 days → medium confidence
 * - Same invoiceNumber (if not null) → definitive duplicate
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    // Get all invoices for the user
    const allInvoices = await db.query.invoices.findMany({
      where: eq(schema.invoices.userId, userId),
    });

    const duplicates: DuplicateGroup[] = [];
    const processedPairs = new Set<string>();
    let potentialSavings = 0;

    // Convert numeric fields
    const invoices = allInvoices.map((inv) => ({
      ...inv,
      totalAmount: Number(inv.totalAmount) || 0,
      amount: Number(inv.amount) || 0,
      tax: Number(inv.tax) || 0,
    }));

    // Check for definitive duplicates by invoiceNumber first
    const invoiceNumberMap = new Map<string, typeof invoices>();
    for (const invoice of invoices) {
      if (invoice.invoiceNumber) {
        const key = invoice.invoiceNumber;
        if (!invoiceNumberMap.has(key)) {
          invoiceNumberMap.set(key, []);
        }
        invoiceNumberMap.get(key)!.push(invoice);
      }
    }

    // Process invoice number duplicates
    for (const [invoiceNumber, group] of Array.from(invoiceNumberMap.entries())) {
      if (group.length > 1) {
        const pairKey = group.map((i: typeof invoices[number]) => i.id).sort().join("-");
        if (!processedPairs.has(pairKey)) {
          processedPairs.add(pairKey);
          duplicates.push({
            confidence: "definitive",
            reason: `Mismo número de factura: ${invoiceNumber}`,
            invoices: group.map((inv: typeof invoices[number]) => ({
              id: inv.id,
              issuer: inv.issuerName,
              amount: inv.totalAmount,
              date: inv.invoiceDate?.toISOString().split("T")[0] || null,
              invoiceNumber: inv.invoiceNumber,
            })),
          });
          potentialSavings += group[0].totalAmount; // Potential savings = one invoice
        }
      }
    }

    // Check for high and medium confidence duplicates
    for (let i = 0; i < invoices.length; i++) {
      for (let j = i + 1; j < invoices.length; j++) {
        const inv1 = invoices[i];
        const inv2 = invoices[j];
        const pairKey = [inv1.id, inv2.id].sort().join("-");

        // Skip if already processed
        if (processedPairs.has(pairKey)) {
          continue;
        }

        // Skip if both have same invoiceNumber (already handled above)
        if (
          inv1.invoiceNumber &&
          inv2.invoiceNumber &&
          inv1.invoiceNumber === inv2.invoiceNumber
        ) {
          continue;
        }

        const sameIssuer = inv1.issuerName === inv2.issuerName;
        if (!sameIssuer) {
          continue;
        }

        // High confidence: same issuer + exact same amount
        if (Math.abs(inv1.totalAmount - inv2.totalAmount) < 0.01) {
          processedPairs.add(pairKey);
          const group = [inv1, inv2];
          duplicates.push({
            confidence: "high",
            reason: "Mismo emisor e importe exacto",
            invoices: group.map((inv) => ({
              id: inv.id,
              issuer: inv.issuerName,
              amount: inv.totalAmount,
              date: inv.invoiceDate?.toISOString().split("T")[0] || null,
              invoiceNumber: inv.invoiceNumber,
            })),
          });
          potentialSavings += inv1.totalAmount;
          continue;
        }

        // Medium confidence: same issuer + amount within 5% + dates within 5 days
        const amountDiff =
          Math.abs(inv1.totalAmount - inv2.totalAmount) /
          Math.max(inv1.totalAmount, inv2.totalAmount, 1);
        const withinAmountThreshold = amountDiff <= 0.05;

        let withinDateThreshold = false;
        if (inv1.invoiceDate && inv2.invoiceDate) {
          const dateDiff = Math.abs(
            inv1.invoiceDate.getTime() - inv2.invoiceDate.getTime()
          );
          const daysDiff = dateDiff / (1000 * 60 * 60 * 24);
          withinDateThreshold = daysDiff <= 5;
        }

        if (withinAmountThreshold && withinDateThreshold) {
          processedPairs.add(pairKey);
          const group = [inv1, inv2];
          duplicates.push({
            confidence: "medium",
            reason: `Mismo emisor, importe similar (${(amountDiff * 100).toFixed(1)}%) y fechas próximas`,
            invoices: group.map((inv) => ({
              id: inv.id,
              issuer: inv.issuerName,
              amount: inv.totalAmount,
              date: inv.invoiceDate?.toISOString().split("T")[0] || null,
              invoiceNumber: inv.invoiceNumber,
            })),
          });
          potentialSavings += Math.min(inv1.totalAmount, inv2.totalAmount);
        }
      }
    }

    // Sort by confidence level (definitive first, then high, then medium)
    const confidenceOrder = { definitive: 0, high: 1, medium: 2 };
    duplicates.sort(
      (a, b) =>
        confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
    );

    return NextResponse.json({
      duplicates,
      totalPotentialDuplicates: duplicates.length,
      potentialSavings: parseFloat(potentialSavings.toFixed(2)),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error detectando duplicados" },
      { status: 500 }
    );
  }
}
