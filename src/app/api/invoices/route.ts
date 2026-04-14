import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { invoiceNormalizedFields } from "@/lib/text/normalize";

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

  // Coerce SQL aggregates (postgres returns strings for sum/count)
  const safeGrandTotal = {
    totalAmount: Number(grandTotal?.totalAmount) || 0,
    totalTax: Number(grandTotal?.totalTax) || 0,
    totalBase: Number(grandTotal?.totalBase) || 0,
  };

  const safeCategoryTotals = categoryTotals.map((c) => ({
    category: c.category,
    count: Number(c.count) || 0,
    totalAmount: Number(c.totalAmount) || 0,
    totalTax: Number(c.totalTax) || 0,
  }));

  const safeMonthlyTotals = monthlyTotals.map((m) => ({
    month: m.month,
    totalAmount: Number(m.totalAmount) || 0,
    count: Number(m.count) || 0,
  }));

  // Coerce invoice numeric fields too
  const safeInvoices = invoices.map((inv) => ({
    ...inv,
    amount: Number(inv.amount) || 0,
    tax: Number(inv.tax) || 0,
    totalAmount: Number(inv.totalAmount) || 0,
  }));

  return NextResponse.json({
    invoices: safeInvoices,
    pagination: {
      page,
      limit,
      total: Number(countResult[0]?.count || 0),
      totalPages: Math.ceil(Number(countResult[0]?.count || 0) / limit),
    },
    totals: {
      grandTotal: safeGrandTotal,
      byCategory: safeCategoryTotals,
      byMonth: safeMonthlyTotals,
    },
  });
}

/** POST /api/invoices — manually create a received invoice (e.g. from photo) */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = (await req.json()) as {
      invoiceNumber?: string | null;
      issuerName?: string | null;
      issuerNif?: string | null;
      concept?: string | null;
      amount?: number | null;
      tax?: number | null;
      totalAmount?: number | null;
      currency?: string | null;
      invoiceDate?: string | null;
      dueDate?: string | null;
      category?: string | null;
    };

    if (!body.totalAmount && !body.issuerName) {
      return NextResponse.json({ error: "Se requiere al menos issuerName o totalAmount" }, { status: 400 });
    }

    const norm = invoiceNormalizedFields(body.issuerName, body.issuerNif);
    const [inserted] = await db
      .insert(schema.invoices)
      .values({
        userId: session.user.id,
        invoiceNumber: body.invoiceNumber ?? null,
        issuerName: body.issuerName ?? null,
        issuerNif: body.issuerNif ?? null,
        concept: body.concept ?? null,
        amount: body.amount ?? null,
        tax: body.tax ?? null,
        totalAmount: body.totalAmount ?? null,
        currency: body.currency ?? "EUR",
        invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        category: body.category ?? null,
        processed: true,
        issuerNormalized: norm.issuerNormalized,
        nifNormalized: norm.nifNormalized,
      })
      .returning();

    return NextResponse.json({ ok: true, invoice: inserted });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error creando factura" },
      { status: 500 },
    );
  }
}
