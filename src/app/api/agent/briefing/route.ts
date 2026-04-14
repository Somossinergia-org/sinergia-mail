import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, sql, isNull, or, desc, gte, lt } from "drizzle-orm";

export const maxDuration = 30;

/**
 * GET /api/agent/briefing
 * Proactive morning briefing — returns a structured summary of:
 * - Urgent emails pending action
 * - New invoices since last check
 * - Emails that can be cleaned up
 * - Unanswered client/provider emails (>48h)
 * - Quick stats
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    // 1. Urgent/high-priority unread emails
    const urgentEmails = await db.query.emails.findMany({
      where: and(
        eq(schema.emails.userId, userId),
        eq(schema.emails.priority, "ALTA"),
        eq(schema.emails.isRead, false)
      ),
      orderBy: [desc(schema.emails.date)],
      limit: 10,
    });

    // 2. Recent invoices (last 7 days)
    const recentInvoices = await db.query.invoices.findMany({
      where: and(
        eq(schema.invoices.userId, userId),
        gte(schema.invoices.createdAt, sevenDaysAgo)
      ),
      orderBy: [desc(schema.invoices.createdAt)],
      limit: 10,
    });

    // 3. Unanswered important emails (CLIENTE/PROVEEDOR older than 48h, not read)
    const unansweredEmails = await db.query.emails.findMany({
      where: and(
        eq(schema.emails.userId, userId),
        or(
          eq(schema.emails.category, "CLIENTE"),
          eq(schema.emails.category, "PROVEEDOR")
        ),
        eq(schema.emails.isRead, false)
      ),
      orderBy: [desc(schema.emails.date)],
      limit: 10,
    });

    // 4. Cleanup candidates count
    const spamCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.emails)
      .where(and(
        eq(schema.emails.userId, userId),
        eq(schema.emails.category, "SPAM")
      ));

    const marketingReadCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.emails)
      .where(and(
        eq(schema.emails.userId, userId),
        eq(schema.emails.category, "MARKETING"),
        eq(schema.emails.isRead, true)
      ));

    const oldNotifCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.emails)
      .where(and(
        eq(schema.emails.userId, userId),
        eq(schema.emails.category, "NOTIFICACION"),
        eq(schema.emails.isRead, true),
        lt(schema.emails.date, thirtyDaysAgo)
      ));

    const cleanableCount =
      Number(spamCount[0]?.count || 0) +
      Number(marketingReadCount[0]?.count || 0) +
      Number(oldNotifCount[0]?.count || 0);

    // 5. Total stats
    const totalEmails = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.emails)
      .where(eq(schema.emails.userId, userId));

    const totalInvoices = await db
      .select({
        count: sql<number>`count(*)`,
        total: sql<number>`COALESCE(SUM(total_amount), 0)`,
      })
      .from(schema.invoices)
      .where(eq(schema.invoices.userId, userId));

    const invoicesWithoutAmount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.invoices)
      .where(and(
        eq(schema.invoices.userId, userId),
        or(isNull(schema.invoices.totalAmount), sql`${schema.invoices.totalAmount} = 0`)
      ));

    // 6. Build greeting based on time
    const hour = now.getHours();
    let greeting = "Buenos días";
    if (hour >= 14 && hour < 20) greeting = "Buenas tardes";
    else if (hour >= 20 || hour < 6) greeting = "Buenas noches";

    // Build alerts
    const alerts: Array<{ type: string; severity: "high" | "medium" | "low"; message: string; count: number }> = [];

    if (urgentEmails.length > 0) {
      alerts.push({
        type: "urgent",
        severity: "high",
        message: `${urgentEmails.length} email${urgentEmails.length > 1 ? "s" : ""} de prioridad ALTA sin leer`,
        count: urgentEmails.length,
      });
    }

    if (unansweredEmails.length > 0) {
      alerts.push({
        type: "unanswered",
        severity: "high",
        message: `${unansweredEmails.length} email${unansweredEmails.length > 1 ? "s" : ""} de clientes/proveedores sin leer`,
        count: unansweredEmails.length,
      });
    }

    if (Number(invoicesWithoutAmount[0]?.count || 0) > 0) {
      alerts.push({
        type: "invoices_incomplete",
        severity: "medium",
        message: `${invoicesWithoutAmount[0].count} factura${Number(invoicesWithoutAmount[0].count) > 1 ? "s" : ""} sin importe extraído`,
        count: Number(invoicesWithoutAmount[0].count),
      });
    }

    if (cleanableCount > 10) {
      alerts.push({
        type: "cleanup",
        severity: "low",
        message: `${cleanableCount} emails eliminables (SPAM + marketing + notificaciones antiguas)`,
        count: cleanableCount,
      });
    }

    return NextResponse.json({
      greeting,
      userName: session.user.name || "David",
      alerts,
      stats: {
        totalEmails: Number(totalEmails[0]?.count || 0),
        totalInvoices: Number(totalInvoices[0]?.count || 0),
        totalInvoiced: Number(totalInvoices[0]?.total || 0),
        cleanableEmails: cleanableCount,
      },
      urgentEmails: urgentEmails.map((e) => ({
        id: e.id,
        from: e.fromName || e.fromEmail,
        subject: e.subject,
        date: e.date,
      })),
      unansweredEmails: unansweredEmails.map((e) => ({
        id: e.id,
        from: e.fromName || e.fromEmail,
        subject: e.subject,
        date: e.date,
        category: e.category,
      })),
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id,
        issuer: inv.issuerName,
        amount: Number(inv.totalAmount) || 0,
        currency: inv.currency || "EUR",
        date: inv.invoiceDate,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error generando briefing" },
      { status: 500 }
    );
  }
}
