import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export const maxDuration = 60;

type ReportType = "invoices" | "emails" | "executive" | "expenses";

interface ReportRequest {
  type: ReportType;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * POST /api/agent/report-excel
 * Generates Excel reports for the Sinergia Mail dashboard.
 *
 * Request body:
 * {
 *   type: "invoices" | "emails" | "executive" | "expenses",
 *   dateFrom?: "2024-01-01",
 *   dateTo?: "2024-12-31"
 * }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as ReportRequest;
    const { type, dateFrom, dateTo } = body;

    if (!type || !["invoices", "emails", "executive", "expenses"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid report type" },
        { status: 400 }
      );
    }

    // Parse dates
    const startDate = dateFrom ? new Date(dateFrom) : undefined;
    const endDate = dateTo ? new Date(dateTo) : undefined;

    // Build data based on report type
    let reportData: Record<string, unknown>;

    if (type === "invoices") {
      reportData = await generateInvoicesData(session.user.id, startDate, endDate);
    } else if (type === "emails") {
      reportData = await generateEmailsData(session.user.id, startDate, endDate);
    } else if (type === "executive") {
      reportData = await generateExecutiveData(session.user.id, startDate, endDate);
    } else if (type === "expenses") {
      reportData = await generateExpensesData(session.user.id, startDate, endDate);
    } else {
      return NextResponse.json(
        { error: "Invalid report type" },
        { status: 400 }
      );
    }

    // Call Python script to generate Excel
    const excelFilePath = await generateExcelFile(reportData);

    // Read file and return
    const fileBuffer = readFileSync(excelFilePath);
    const fileName = `reporte-${type}-${new Date().toISOString().split("T")[0]}.xlsx`;

    // Clean up temp file
    unlinkSync(excelFilePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error generating report:", error);
    return NextResponse.json(
      { error: "Error generating report" },
      { status: 500 }
    );
  }
}

async function generateInvoicesData(
  userId: string,
  startDate?: Date,
  endDate?: Date
) {
  const conditions = [eq(schema.invoices.userId, userId)];

  if (startDate) {
    conditions.push(gte(schema.invoices.invoiceDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(schema.invoices.invoiceDate, endDate));
  }

  const where = and(...conditions);

  // Get all invoices
  const invoices = await db.query.invoices.findMany({
    where,
    orderBy: [desc(schema.invoices.invoiceDate)],
  });

  // Get summary by category
  const summary = await db
    .select({
      category: schema.invoices.category,
      count: sql<number>`count(*)`,
      sumBase: sql<number>`coalesce(sum(${schema.invoices.amount}), 0)`,
      sumTax: sql<number>`coalesce(sum(${schema.invoices.tax}), 0)`,
      sumTotal: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
    })
    .from(schema.invoices)
    .where(where)
    .groupBy(schema.invoices.category);

  // Coerce numeric values
  const safeInvoices = invoices.map((inv) => ({
    ...inv,
    amount: Number(inv.amount) || 0,
    tax: Number(inv.tax) || 0,
    totalAmount: Number(inv.totalAmount) || 0,
  }));

  const safeSummary = summary.map((s) => ({
    category: s.category || "Sin categoría",
    count: Number(s.count) || 0,
    sumBase: Number(s.sumBase) || 0,
    sumTax: Number(s.sumTax) || 0,
    sumTotal: Number(s.sumTotal) || 0,
  }));

  return {
    type: "invoices",
    invoices: safeInvoices,
    summary: safeSummary,
  };
}

async function generateEmailsData(
  userId: string,
  startDate?: Date,
  endDate?: Date
) {
  const conditions = [eq(schema.emails.userId, userId)];

  if (startDate) {
    conditions.push(gte(schema.emails.date, startDate));
  }
  if (endDate) {
    conditions.push(lte(schema.emails.date, endDate));
  }

  const where = and(...conditions);

  // Get all emails
  const emails = await db.query.emails.findMany({
    where,
    orderBy: [desc(schema.emails.date)],
  });

  // Category stats
  const categoryStats = await db
    .select({
      category: schema.emails.category,
      count: sql<number>`count(*)`,
    })
    .from(schema.emails)
    .where(where)
    .groupBy(schema.emails.category);

  // Priority stats
  const priorityStats = await db
    .select({
      priority: schema.emails.priority,
      count: sql<number>`count(*)`,
    })
    .from(schema.emails)
    .where(where)
    .groupBy(schema.emails.priority);

  const safeCategoryStats = categoryStats.map((s) => ({
    category: s.category || "Sin categoría",
    count: Number(s.count) || 0,
  }));

  const safePriorityStats = priorityStats.map((s) => ({
    priority: s.priority || "Normal",
    count: Number(s.count) || 0,
  }));

  return {
    type: "emails",
    emails,
    categoryStats: safeCategoryStats,
    priorityStats: safePriorityStats,
  };
}

async function generateExecutiveData(
  userId: string,
  startDate?: Date,
  endDate?: Date
) {
  const conditions = [eq(schema.invoices.userId, userId)];
  const emailConditions = [eq(schema.emails.userId, userId)];

  if (startDate) {
    conditions.push(gte(schema.invoices.invoiceDate, startDate));
    emailConditions.push(gte(schema.emails.date, startDate));
  }
  if (endDate) {
    conditions.push(lte(schema.invoices.invoiceDate, endDate));
    emailConditions.push(lte(schema.emails.date, endDate));
  }

  const invoiceWhere = and(...conditions);
  const emailWhere = and(...emailConditions);

  // Get invoices and emails
  const invoices = await db.query.invoices.findMany({
    where: invoiceWhere,
    orderBy: [desc(schema.invoices.invoiceDate)],
  });

  const emails = await db.query.emails.findMany({
    where: emailWhere,
    orderBy: [desc(schema.emails.date)],
  });

  // Total emails
  const totalEmails = emails.length;

  // Emails by category
  const emailsByCategory = await db
    .select({
      category: schema.emails.category,
      count: sql<number>`count(*)`,
    })
    .from(schema.emails)
    .where(emailWhere)
    .groupBy(schema.emails.category);

  // Total invoiced and by category
  const [totalInvoicedRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
    })
    .from(schema.invoices)
    .where(invoiceWhere);

  const invoicesByCategory = await db
    .select({
      category: schema.invoices.category,
      total: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
    })
    .from(schema.invoices)
    .where(invoiceWhere)
    .groupBy(schema.invoices.category);

  // Top 5 providers
  const topProviders = await db
    .select({
      issuerName: schema.invoices.issuerName,
      total: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
    })
    .from(schema.invoices)
    .where(invoiceWhere)
    .groupBy(schema.invoices.issuerName)
    .orderBy(sql`coalesce(sum(${schema.invoices.totalAmount}), 0) DESC`)
    .limit(5);

  // Coerce numeric values
  const safeInvoices = invoices.map((inv) => ({
    ...inv,
    amount: Number(inv.amount) || 0,
    tax: Number(inv.tax) || 0,
    totalAmount: Number(inv.totalAmount) || 0,
  }));

  const safeEmailsByCategory = emailsByCategory.map((s) => ({
    category: s.category || "Sin categoría",
    count: Number(s.count) || 0,
  }));

  const safeInvoicesByCategory = invoicesByCategory.map((s) => ({
    category: s.category || "Sin categoría",
    total: Number(s.total) || 0,
  }));

  const safeTopProviders = topProviders.map((p) => ({
    issuerName: p.issuerName || "Desconocido",
    total: Number(p.total) || 0,
  }));

  return {
    type: "executive",
    totalEmails,
    emailsByCategory: safeEmailsByCategory,
    totalInvoiced: Number(totalInvoicedRow?.total) || 0,
    invoicesByCategory: safeInvoicesByCategory,
    topProviders: safeTopProviders,
    invoices: safeInvoices,
    emails,
  };
}

async function generateExpensesData(
  userId: string,
  startDate?: Date,
  endDate?: Date
) {
  const conditions = [eq(schema.invoices.userId, userId)];

  if (startDate) {
    conditions.push(gte(schema.invoices.invoiceDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(schema.invoices.invoiceDate, endDate));
  }

  const where = and(...conditions);

  // Get invoices grouped by issuer
  const invoicesByIssuer = await db
    .select({
      issuerName: schema.invoices.issuerName,
      count: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
      avg: sql<number>`coalesce(avg(${schema.invoices.totalAmount}), 0)`,
      maxDate: sql<Date>`max(${schema.invoices.invoiceDate})`,
    })
    .from(schema.invoices)
    .where(where)
    .groupBy(schema.invoices.issuerName)
    .orderBy(sql`coalesce(sum(${schema.invoices.totalAmount}), 0) DESC`);

  // Expenses by category
  const expensesByCategory = await db
    .select({
      category: schema.invoices.category,
      count: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
      avg: sql<number>`coalesce(avg(${schema.invoices.totalAmount}), 0)`,
    })
    .from(schema.invoices)
    .where(where)
    .groupBy(schema.invoices.category);

  // Monthly expenses
  const monthlyExpenses = await db
    .select({
      month: sql<string>`to_char(${schema.invoices.invoiceDate}, 'YYYY-MM')`,
      count: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
    })
    .from(schema.invoices)
    .where(where)
    .groupBy(sql`to_char(${schema.invoices.invoiceDate}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${schema.invoices.invoiceDate}, 'YYYY-MM')`);

  // Estimate annual (rough estimate based on frequency)
  const recurringExpenses = invoicesByIssuer.map((issuer) => {
    const avg = Number(issuer.avg) || 0;
    // Estimate frequency and annual based on count
    let frequency = "Mensual";
    let estimated = avg * 12;

    if (issuer.count && issuer.count < 3) {
      frequency = "Ocasional";
      estimated = avg * 2;
    } else if (issuer.count && issuer.count < 6) {
      frequency = "Trimestral";
      estimated = avg * 4;
    }

    return {
      issuer: issuer.issuerName || "Desconocido",
      count: Number(issuer.count) || 0,
      total: Number(issuer.total) || 0,
      avgAmount: avg,
      estimatedAnnual: estimated,
      frequency,
      lastInvoiceDate: issuer.maxDate,
    };
  });

  const safeExpensesByCategory = expensesByCategory.map((s) => ({
    category: s.category || "Sin categoría",
    count: Number(s.count) || 0,
    total: Number(s.total) || 0,
    average: Number(s.avg) || 0,
  }));

  const safeMonthlyExpenses = monthlyExpenses.map((m) => ({
    month: m.month || "",
    count: Number(m.count) || 0,
    total: Number(m.total) || 0,
  }));

  return {
    type: "expenses",
    recurringExpenses,
    expensesByCategory: safeExpensesByCategory,
    monthlyExpenses: safeMonthlyExpenses,
  };
}

async function generateExcelFile(data: Record<string, unknown>): Promise<string> {
  // Write data to temp file
  const inputFile = join(tmpdir(), `report-${Date.now()}.json`);
  writeFileSync(inputFile, JSON.stringify(data));

  try {
    // Call Python script
    const pythonScript = join(process.cwd(), "scripts", "generate-report.py");
    const output = execSync(`python3 ${pythonScript}`, {
      input: JSON.stringify(data),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    // Clean up input file
    unlinkSync(inputFile);

    return output;
  } catch (error) {
    // Clean up input file on error
    try {
      unlinkSync(inputFile);
    } catch {
      // ignore
    }
    throw error;
  }
}
