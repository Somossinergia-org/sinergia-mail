import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";

/** GET /api/invoices — List invoices with filters and totals */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = req.nextUrl;
  const category = url.searchParams.get("category");
  const from = url.searchParams.get("from"); // ISO date
  const to = url.searchParams.get("to");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "100");
  const offset = (page - 1) * limit;

  const conditions = [eq(schema.invoices.userId, session.user.id)];

  if (category) {
    conditions.push(eq(schema.invoices.category, category));
  }
  if (from) {
    conditions.push(gte(schema.invoices.invoiceDate, new Date(from)));
  }
  if (to) {
    conditions.push(lte(schema.invoices.invoiceDate, new Date(to)));
  }

  const where = and(...conditions);

  const [invoices, countResult] = await Promise.all([
    db.query.invoices.findMany({
      where,
      orderBy: [desc(schema.invoices.invoiceDate)],
      limit,
      offset,
    }),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.invoices)
      .where(where),
  ]);

  // Totals by category
  const categoryTotals = await db
    .select({
      category: schema.invoices.category,
      count: sql<number>`count(*)`,
      totalAmount: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
      totalTax: sql<number>`coalesce(sum(${schema.invoices.tax}), 0)`,
    })
    .from(schema.invoices)
    .where(eq(schema.invoices.userId, session.user.id))
    .groupBy(schema.invoices.category);

  // Monthly totals
  const monthlyTotals = await db
    .select({
      month: sql<string>`to_char(${schema.invoices.invoiceDate}, 'YYYY-MM')`,
      totalAmount: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(schema.invoices)
    .where(eq(schema.invoices.userId, session.user.id))
    .groupBy(sql`to_char(${schema.invoices.invoiceDate}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${schema.invoices.invoiceDate}, 'YYYY-MM')`);

  // Grand total
  const [grandTotal] = await db
    .select({
      totalAmount: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
      totalTax: sql<number>`coalesce(sum(${schema.invoices.tax}), 0)`,
      totalBase: sql<number>`coalesce(sum(${schema.invoices.amount}), 0)`,
    })
    .from(schema.invoices)
    .where(eq(schema.invoices.userId, session.user.id));

  return NextResponse.json({
    invoices,
    pagination: {
      page,
      limit,
      total: Number(countResult[0]?.count || 0),
      totalPages: Math.ceil(Number(countResult[0]?.count || 0) / limit),
    },
    totals: {
      grandTotal: grandTotal || { totalAmount: 0, totalTax: 0, totalBase: 0 },
      byCategory: categoryTotals,
      byMonth: monthlyTotals,
    },
  });
}
