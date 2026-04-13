import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { generateWeeklyReport } from "@/lib/gemini";

/** GET /api/agent/report — Generate weekly AI report */
export async function GET(req: Request) {
  // Support both authenticated users and Vercel Cron
  const isCron =
    req.headers.get("Authorization") === `Bearer ${process.env.CRON_SECRET}`;

  let userId: string;

  if (isCron) {
    // For cron: process first user (single-tenant for now)
    const firstUser = await db.query.users.findFirst();
    if (!firstUser) {
      return NextResponse.json({ error: "No users found" }, { status: 404 });
    }
    userId = firstUser.id;
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    userId = session.user.id;
  }

  const startTime = Date.now();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  try {
    // Gather stats for the last 7 days
    const [
      totalResult,
      categoryStats,
      priorityStats,
      topSenders,
      invoiceStats,
    ] = await Promise.all([
      // Total emails this week
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.emails)
        .where(
          and(
            eq(schema.emails.userId, userId),
            gte(schema.emails.date, oneWeekAgo)
          )
        ),

      // By category
      db
        .select({
          category: schema.emails.category,
          count: sql<number>`count(*)`,
        })
        .from(schema.emails)
        .where(
          and(
            eq(schema.emails.userId, userId),
            gte(schema.emails.date, oneWeekAgo)
          )
        )
        .groupBy(schema.emails.category),

      // By priority
      db
        .select({
          priority: schema.emails.priority,
          count: sql<number>`count(*)`,
        })
        .from(schema.emails)
        .where(
          and(
            eq(schema.emails.userId, userId),
            gte(schema.emails.date, oneWeekAgo)
          )
        )
        .groupBy(schema.emails.priority),

      // Top 5 senders
      db
        .select({
          name: schema.emails.fromName,
          email: schema.emails.fromEmail,
          count: sql<number>`count(*)`,
        })
        .from(schema.emails)
        .where(
          and(
            eq(schema.emails.userId, userId),
            gte(schema.emails.date, oneWeekAgo)
          )
        )
        .groupBy(schema.emails.fromName, schema.emails.fromEmail)
        .orderBy(desc(sql`count(*)`))
        .limit(5),

      // Invoice totals this week
      db
        .select({
          count: sql<number>`count(*)`,
          total: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
        })
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.userId, userId),
            gte(schema.invoices.createdAt, oneWeekAgo)
          )
        ),
    ]);

    const totalEmails = Number(totalResult[0]?.count || 0);
    const pendingInvoices = Number(invoiceStats[0]?.count || 0);
    const totalInvoiced = Number(invoiceStats[0]?.total || 0);

    // Count unanswered (emails without drafts, high priority)
    const unansweredResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.emails)
      .where(
        and(
          eq(schema.emails.userId, userId),
          eq(schema.emails.priority, "ALTA"),
          eq(schema.emails.draftCreated, false),
          gte(schema.emails.date, oneWeekAgo)
        )
      );
    const unanswered = Number(unansweredResult[0]?.count || 0);

    // Generate report with Gemini
    const report = await generateWeeklyReport({
      totalEmails,
      byCategory: categoryStats.map((c) => ({
        category: c.category || "SIN CATEGORÍA",
        count: Number(c.count),
      })),
      byPriority: priorityStats.map((p) => ({
        priority: p.priority || "SIN PRIORIDAD",
        count: Number(p.count),
      })),
      topSenders: topSenders.map((s) => ({
        name: s.name || "Desconocido",
        email: s.email || "",
        count: Number(s.count),
      })),
      pendingInvoices,
      totalInvoiced,
      unanswered,
    });

    // Log
    await db.insert(schema.agentLogs).values({
      userId,
      action: "report",
      inputSummary: `Informe semanal: ${totalEmails} emails, ${pendingInvoices} facturas`,
      outputSummary: `Informe generado (${report.report.length} chars)`,
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({
      report: report.report,
      highlights: report.highlights,
      stats: {
        totalEmails,
        byCategory: categoryStats,
        byPriority: priorityStats,
        topSenders,
        pendingInvoices,
        totalInvoiced,
        unanswered,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    await db.insert(schema.agentLogs).values({
      userId,
      action: "report",
      durationMs: Date.now() - startTime,
      success: false,
      error: e instanceof Error ? e.message : "Unknown",
    });

    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error generando informe" },
      { status: 500 }
    );
  }
}
