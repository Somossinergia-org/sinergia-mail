import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { parseAccountId, emailIdsForAccount } from "@/lib/account-filter";

export const maxDuration = 30;

interface InvoiceAlert {
  type: "overdue" | "due_soon" | "no_due_date" | "unpaid_high";
  severity: "high" | "medium" | "low";
  invoiceId: number;
  issuer: string | null;
  amount: number;
  dueDate: string | null;
  daysOverdue?: number;
}

/**
 * GET /api/agent/invoice-alerts
 * Returns invoice alerts:
 * - overdue: invoices where dueDate < today AND totalAmount > 0
 * - due_soon: invoices where dueDate is within next 7 days
 * - no_due_date: invoices with totalAmount > 0 but no dueDate
 * - unpaid_high: invoices with totalAmount > 500
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const accountId = parseAccountId(req);

  try {
    const conds = [
      eq(schema.invoices.userId, userId),
      sql`${schema.invoices.totalAmount} > 0`,
    ];
    if (accountId !== null) {
      const ids = await emailIdsForAccount(userId, accountId);
      if (ids.length === 0) {
        return NextResponse.json({
          alerts: [],
          summary: { countOverdue: 0, countDueSoon: 0, countNoDueDate: 0, totalOverdue: 0, totalDueSoon: 0 },
        });
      }
      conds.push(inArray(schema.invoices.emailId, ids));
    }
    const allInvoices = await db.query.invoices.findMany({
      where: and(...conds),
      orderBy: [sql`${schema.invoices.dueDate} ASC`],
    });

    const alerts: InvoiceAlert[] = [];
    let totalOverdue = 0;
    let totalDueSoon = 0;
    let countOverdue = 0;
    let countDueSoon = 0;
    let countNoDueDate = 0;

    for (const invoice of allInvoices) {
      const totalAmount = Number(invoice.totalAmount) || 0;
      const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;

      // Check for overdue invoices
      if (dueDate && dueDate < now) {
        const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        alerts.push({
          type: "overdue",
          severity: "high",
          invoiceId: invoice.id,
          issuer: invoice.issuerName,
          amount: totalAmount,
          dueDate: dueDate.toISOString().split("T")[0],
          daysOverdue,
        });
        totalOverdue += totalAmount;
        countOverdue++;
      }
      // Check for due soon (next 7 days)
      else if (dueDate && dueDate <= sevenDaysFromNow && dueDate > now) {
        const daysDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        alerts.push({
          type: "due_soon",
          severity: "medium",
          invoiceId: invoice.id,
          issuer: invoice.issuerName,
          amount: totalAmount,
          dueDate: dueDate.toISOString().split("T")[0],
        });
        totalDueSoon += totalAmount;
        countDueSoon++;
      }
      // Check for no due date
      else if (!dueDate) {
        countNoDueDate++;
      }

      // Check for high-value unpaid invoices (over 500)
      if (totalAmount > 500 && (!dueDate || dueDate >= now)) {
        alerts.push({
          type: "unpaid_high",
          severity: "high",
          invoiceId: invoice.id,
          issuer: invoice.issuerName,
          amount: totalAmount,
          dueDate: dueDate ? dueDate.toISOString().split("T")[0] : null,
        });
      }
    }

    // Remove duplicates (keep only one alert per invoice per type)
    const alertMap = new Map<string, InvoiceAlert>();
    for (const alert of alerts) {
      const key = `${alert.invoiceId}-${alert.type}`;
      if (!alertMap.has(key)) {
        alertMap.set(key, alert);
      }
    }

    const uniqueAlerts = Array.from(alertMap.values());

    return NextResponse.json({
      alerts: uniqueAlerts,
      summary: {
        totalOverdue,
        countOverdue,
        totalDueSoon,
        countDueSoon,
        countNoDueDate,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error generando alertas de facturas" },
      { status: 500 }
    );
  }
}
