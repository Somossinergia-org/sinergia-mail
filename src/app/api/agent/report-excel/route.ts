import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, gte, lte, desc, sql, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { logger, logError } from "@/lib/logger";
import { emailIdsForAccount } from "@/lib/account-filter";

const log = logger.child({ route: "/api/agent/report-excel" });

export const maxDuration = 60;

type ReportType = "invoices" | "emails" | "executive" | "expenses";

interface ReportRequest {
  type: ReportType;
  dateFrom?: string;
  dateTo?: string;
  accountId?: number | "all";
}

// Brand colors
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1a2744" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
};
const ALT_ROW_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF0F4F8" },
};
const ACCENT_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF6C63FF" },
};
const CURRENCY_FORMAT = '#,##0.00 €';

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(1);
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF6C63FF" } },
    };
  });
  row.height = 28;
}

function autoWidth(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((col) => {
    let maxLen = 12;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 4, 45);
  });
}

function alternateRows(sheet: ExcelJS.Worksheet) {
  sheet.eachRow((row, idx) => {
    if (idx > 1 && idx % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = ALT_ROW_FILL;
      });
    }
  });
}

/**
 * POST /api/agent/report-excel
 * Generates Excel reports using exceljs (pure Node.js).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as ReportRequest;
    const { type, dateFrom, dateTo, accountId: rawAccount } = body;

    if (!type || !["invoices", "emails", "executive", "expenses"].includes(type)) {
      return NextResponse.json({ error: "Tipo de informe inválido" }, { status: 400 });
    }

    const startDate = dateFrom ? new Date(dateFrom) : undefined;
    const endDate = dateTo ? new Date(dateTo) : undefined;
    const userId = session.user.id;
    const accountId =
      rawAccount && rawAccount !== "all" && Number.isFinite(Number(rawAccount))
        ? Number(rawAccount)
        : null;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Sinergia Mail AI";
    workbook.created = new Date();

    if (type === "invoices") {
      await buildInvoicesWorkbook(workbook, userId, startDate, endDate, accountId);
    } else if (type === "emails") {
      await buildEmailsWorkbook(workbook, userId, startDate, endDate, accountId);
    } else if (type === "executive") {
      await buildExecutiveWorkbook(workbook, userId, startDate, endDate, accountId);
    } else {
      await buildExpensesWorkbook(workbook, userId, startDate, endDate, accountId);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `reporte-${type}-${new Date().toISOString().split("T")[0]}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    logError(log, error, {}, "excel report generation failed");
    return NextResponse.json({ error: "Error generando informe" }, { status: 500 });
  }
}

// ─── INVOICES REPORT ─────────────────────────────────────────────
async function buildInvoicesWorkbook(
  wb: ExcelJS.Workbook,
  userId: string,
  startDate?: Date,
  endDate?: Date,
  accountId?: number | null,
) {
  const conditions = [eq(schema.invoices.userId, userId)];
  if (startDate) conditions.push(gte(schema.invoices.invoiceDate, startDate));
  if (endDate) conditions.push(lte(schema.invoices.invoiceDate, endDate));
  if (accountId) {
    const ids = await emailIdsForAccount(userId, accountId);
    if (ids.length === 0) conditions.push(sql`false`);
    else conditions.push(inArray(schema.invoices.emailId, ids));
  }
  const where = and(...conditions);

  const invoices = await db.query.invoices.findMany({ where, orderBy: [desc(schema.invoices.invoiceDate)] });
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

  // Sheet 1: Facturas
  const sheet = wb.addWorksheet("Facturas");
  sheet.columns = [
    { header: "Nº Factura", key: "invoiceNumber", width: 18 },
    { header: "Emisor", key: "issuerName", width: 30 },
    { header: "NIF", key: "issuerNif", width: 16 },
    { header: "Fecha", key: "invoiceDate", width: 14 },
    { header: "Base", key: "amount", width: 14 },
    { header: "IVA", key: "tax", width: 14 },
    { header: "Total", key: "totalAmount", width: 14 },
    { header: "Categoría", key: "category", width: 16 },
  ];
  styleHeaderRow(sheet);

  for (const inv of invoices) {
    sheet.addRow({
      invoiceNumber: inv.invoiceNumber || "-",
      issuerName: inv.issuerName || "-",
      issuerNif: inv.issuerNif || "-",
      invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString("es-ES") : "-",
      amount: Number(inv.amount) || 0,
      tax: Number(inv.tax) || 0,
      totalAmount: Number(inv.totalAmount) || 0,
      category: inv.category || "-",
    });
  }

  // Format currency columns
  ["E", "F", "G"].forEach((col) => {
    sheet.getColumn(col).numFmt = CURRENCY_FORMAT;
  });

  // Total row
  const lastRow = invoices.length + 1;
  const totalRow = sheet.addRow({
    invoiceNumber: "",
    issuerName: "TOTAL",
    issuerNif: "",
    invoiceDate: "",
    amount: { formula: `SUM(E2:E${lastRow})` },
    tax: { formula: `SUM(F2:F${lastRow})` },
    totalAmount: { formula: `SUM(G2:G${lastRow})` },
    category: "",
  });
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EDF3" } };
  });

  alternateRows(sheet);
  sheet.autoFilter = { from: "A1", to: `H${lastRow}` };

  // Sheet 2: Resumen
  const summarySheet = wb.addWorksheet("Resumen por Categoría");
  summarySheet.columns = [
    { header: "Categoría", key: "category", width: 22 },
    { header: "Nº Facturas", key: "count", width: 14 },
    { header: "Base Imponible", key: "sumBase", width: 16 },
    { header: "IVA Total", key: "sumTax", width: 16 },
    { header: "Total", key: "sumTotal", width: 16 },
  ];
  styleHeaderRow(summarySheet);

  for (const s of summary) {
    summarySheet.addRow({
      category: s.category || "Sin categoría",
      count: Number(s.count),
      sumBase: Number(s.sumBase),
      sumTax: Number(s.sumTax),
      sumTotal: Number(s.sumTotal),
    });
  }

  ["C", "D", "E"].forEach((col) => {
    summarySheet.getColumn(col).numFmt = CURRENCY_FORMAT;
  });

  alternateRows(summarySheet);
}

// ─── EMAILS REPORT ───────────────────────────────────────────────
async function buildEmailsWorkbook(
  wb: ExcelJS.Workbook,
  userId: string,
  startDate?: Date,
  endDate?: Date,
  accountId?: number | null,
) {
  const conditions = [eq(schema.emails.userId, userId)];
  if (startDate) conditions.push(gte(schema.emails.date, startDate));
  if (endDate) conditions.push(lte(schema.emails.date, endDate));
  if (accountId) conditions.push(eq(schema.emails.accountId, accountId));
  const where = and(...conditions);

  const emails = await db.query.emails.findMany({ where, orderBy: [desc(schema.emails.date)] });

  const categoryStats = await db
    .select({ category: schema.emails.category, count: sql<number>`count(*)` })
    .from(schema.emails).where(where).groupBy(schema.emails.category);

  const priorityStats = await db
    .select({ priority: schema.emails.priority, count: sql<number>`count(*)` })
    .from(schema.emails).where(where).groupBy(schema.emails.priority);

  // Sheet 1: Emails
  const sheet = wb.addWorksheet("Emails");
  sheet.columns = [
    { header: "De", key: "from", width: 28 },
    { header: "Asunto", key: "subject", width: 45 },
    { header: "Fecha", key: "date", width: 18 },
    { header: "Categoría", key: "category", width: 16 },
    { header: "Prioridad", key: "priority", width: 12 },
    { header: "Leído", key: "isRead", width: 8 },
  ];
  styleHeaderRow(sheet);

  for (const e of emails) {
    sheet.addRow({
      from: e.fromName || e.fromEmail || "-",
      subject: e.subject || "-",
      date: e.date ? new Date(e.date).toLocaleString("es-ES") : "-",
      category: e.category || "-",
      priority: e.priority || "-",
      isRead: e.isRead ? "Sí" : "No",
    });
  }

  alternateRows(sheet);
  sheet.autoFilter = { from: "A1", to: `F${emails.length + 1}` };

  // Sheet 2: Stats
  const statsSheet = wb.addWorksheet("Estadísticas");
  statsSheet.columns = [
    { header: "Categoría", key: "category", width: 22 },
    { header: "Cantidad", key: "count", width: 12 },
  ];
  styleHeaderRow(statsSheet);

  for (const s of categoryStats) {
    statsSheet.addRow({ category: s.category || "Sin categoría", count: Number(s.count) });
  }

  statsSheet.addRow({});
  statsSheet.addRow({ category: "PRIORIDAD", count: "" });
  const prioHeaderRow = statsSheet.getRow(statsSheet.rowCount);
  prioHeaderRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });

  for (const s of priorityStats) {
    statsSheet.addRow({ category: s.priority || "Normal", count: Number(s.count) });
  }

  alternateRows(statsSheet);
}

// ─── EXECUTIVE REPORT ────────────────────────────────────────────
async function buildExecutiveWorkbook(
  wb: ExcelJS.Workbook,
  userId: string,
  startDate?: Date,
  endDate?: Date,
  accountId?: number | null,
) {
  const invConditions = [eq(schema.invoices.userId, userId)];
  const emailConditions = [eq(schema.emails.userId, userId)];
  if (accountId) {
    emailConditions.push(eq(schema.emails.accountId, accountId));
    const ids = await emailIdsForAccount(userId, accountId);
    if (ids.length === 0) invConditions.push(sql`false`);
    else invConditions.push(inArray(schema.invoices.emailId, ids));
  }
  if (startDate) {
    invConditions.push(gte(schema.invoices.invoiceDate, startDate));
    emailConditions.push(gte(schema.emails.date, startDate));
  }
  if (endDate) {
    invConditions.push(lte(schema.invoices.invoiceDate, endDate));
    emailConditions.push(lte(schema.emails.date, endDate));
  }
  const invWhere = and(...invConditions);
  const emailWhere = and(...emailConditions);

  const emails = await db.query.emails.findMany({ where: emailWhere });
  const invoices = await db.query.invoices.findMany({ where: invWhere, orderBy: [desc(schema.invoices.invoiceDate)] });

  const emailsByCategory = await db
    .select({ category: schema.emails.category, count: sql<number>`count(*)` })
    .from(schema.emails).where(emailWhere).groupBy(schema.emails.category);

  const [totalRow] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)` })
    .from(schema.invoices).where(invWhere);

  const topProviders = await db
    .select({
      issuerName: schema.invoices.issuerName,
      total: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
    })
    .from(schema.invoices).where(invWhere)
    .groupBy(schema.invoices.issuerName)
    .orderBy(sql`coalesce(sum(${schema.invoices.totalAmount}), 0) DESC`)
    .limit(10);

  // Sheet 1: Resumen Ejecutivo
  const sheet = wb.addWorksheet("Resumen Ejecutivo");
  sheet.columns = [{ header: "Concepto", key: "label", width: 30 }, { header: "Valor", key: "value", width: 25 }];
  styleHeaderRow(sheet);

  const totalInvoiced = Number(totalRow?.total) || 0;

  sheet.addRow({ label: "Total Emails", value: emails.length });
  sheet.addRow({ label: "Total Facturas", value: invoices.length });
  sheet.addRow({ label: "Total Facturado", value: totalInvoiced });
  sheet.getCell("B4").numFmt = CURRENCY_FORMAT;
  sheet.addRow({});
  sheet.addRow({ label: "EMAILS POR CATEGORÍA", value: "" });
  const catHeaderRow = sheet.getRow(sheet.rowCount);
  catHeaderRow.eachCell((cell) => { cell.fill = ACCENT_FILL; cell.font = HEADER_FONT; });

  for (const c of emailsByCategory) {
    sheet.addRow({ label: c.category || "Sin categoría", value: Number(c.count) });
  }

  sheet.addRow({});
  sheet.addRow({ label: "TOP PROVEEDORES", value: "" });
  const provHeaderRow = sheet.getRow(sheet.rowCount);
  provHeaderRow.eachCell((cell) => { cell.fill = ACCENT_FILL; cell.font = HEADER_FONT; });

  for (const p of topProviders) {
    sheet.addRow({ label: p.issuerName || "Desconocido", value: Number(p.total) });
  }

  // Format provider amounts
  for (let i = sheet.rowCount - topProviders.length + 1; i <= sheet.rowCount; i++) {
    sheet.getCell(`B${i}`).numFmt = CURRENCY_FORMAT;
  }

  alternateRows(sheet);

  // Sheet 2: Facturas detalle
  const detailSheet = wb.addWorksheet("Facturas Detalle");
  detailSheet.columns = [
    { header: "Emisor", key: "issuer", width: 28 },
    { header: "Nº Factura", key: "num", width: 16 },
    { header: "Fecha", key: "date", width: 14 },
    { header: "Total", key: "total", width: 14 },
    { header: "Categoría", key: "cat", width: 16 },
  ];
  styleHeaderRow(detailSheet);

  for (const inv of invoices) {
    detailSheet.addRow({
      issuer: inv.issuerName || "-",
      num: inv.invoiceNumber || "-",
      date: inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString("es-ES") : "-",
      total: Number(inv.totalAmount) || 0,
      cat: inv.category || "-",
    });
  }
  detailSheet.getColumn("D").numFmt = CURRENCY_FORMAT;
  alternateRows(detailSheet);
  detailSheet.autoFilter = { from: "A1", to: `E${invoices.length + 1}` };
}

// ─── EXPENSES REPORT ─────────────────────────────────────────────
async function buildExpensesWorkbook(
  wb: ExcelJS.Workbook,
  userId: string,
  startDate?: Date,
  endDate?: Date,
  accountId?: number | null,
) {
  const conditions = [eq(schema.invoices.userId, userId)];
  if (startDate) conditions.push(gte(schema.invoices.invoiceDate, startDate));
  if (endDate) conditions.push(lte(schema.invoices.invoiceDate, endDate));
  if (accountId) {
    const ids = await emailIdsForAccount(userId, accountId);
    if (ids.length === 0) conditions.push(sql`false`);
    else conditions.push(inArray(schema.invoices.emailId, ids));
  }
  const where = and(...conditions);

  const invoicesByIssuer = await db
    .select({
      issuerName: schema.invoices.issuerName,
      count: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
      avg: sql<number>`coalesce(avg(${schema.invoices.totalAmount}), 0)`,
      maxDate: sql<string>`max(${schema.invoices.invoiceDate})`,
    })
    .from(schema.invoices).where(where)
    .groupBy(schema.invoices.issuerName)
    .orderBy(sql`coalesce(sum(${schema.invoices.totalAmount}), 0) DESC`);

  const expensesByCategory = await db
    .select({
      category: schema.invoices.category,
      count: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
      avg: sql<number>`coalesce(avg(${schema.invoices.totalAmount}), 0)`,
    })
    .from(schema.invoices).where(where).groupBy(schema.invoices.category);

  const monthlyExpenses = await db
    .select({
      month: sql<string>`to_char(${schema.invoices.invoiceDate}, 'YYYY-MM')`,
      count: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
    })
    .from(schema.invoices).where(where)
    .groupBy(sql`to_char(${schema.invoices.invoiceDate}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${schema.invoices.invoiceDate}, 'YYYY-MM')`);

  // Sheet 1: Gastos por Proveedor
  const sheet = wb.addWorksheet("Gastos por Proveedor");
  sheet.columns = [
    { header: "Proveedor", key: "issuer", width: 30 },
    { header: "Nº Facturas", key: "count", width: 14 },
    { header: "Total", key: "total", width: 16 },
    { header: "Promedio", key: "avg", width: 16 },
    { header: "Frecuencia", key: "freq", width: 14 },
    { header: "Est. Anual", key: "annual", width: 16 },
  ];
  styleHeaderRow(sheet);

  for (const i of invoicesByIssuer) {
    const cnt = Number(i.count) || 0;
    const avg = Number(i.avg) || 0;
    let freq = "Mensual";
    let annual = avg * 12;
    if (cnt < 3) { freq = "Ocasional"; annual = avg * 2; }
    else if (cnt < 6) { freq = "Trimestral"; annual = avg * 4; }

    sheet.addRow({
      issuer: i.issuerName || "Desconocido",
      count: cnt,
      total: Number(i.total) || 0,
      avg,
      freq,
      annual,
    });
  }

  ["C", "D", "F"].forEach((col) => { sheet.getColumn(col).numFmt = CURRENCY_FORMAT; });
  alternateRows(sheet);
  sheet.autoFilter = { from: "A1", to: `F${invoicesByIssuer.length + 1}` };

  // Sheet 2: Por Categoría
  const catSheet = wb.addWorksheet("Por Categoría");
  catSheet.columns = [
    { header: "Categoría", key: "category", width: 22 },
    { header: "Nº Facturas", key: "count", width: 14 },
    { header: "Total", key: "total", width: 16 },
    { header: "Promedio", key: "avg", width: 16 },
  ];
  styleHeaderRow(catSheet);

  for (const s of expensesByCategory) {
    catSheet.addRow({
      category: s.category || "Sin categoría",
      count: Number(s.count),
      total: Number(s.total),
      avg: Number(s.avg),
    });
  }

  ["C", "D"].forEach((col) => { catSheet.getColumn(col).numFmt = CURRENCY_FORMAT; });
  alternateRows(catSheet);

  // Sheet 3: Mensual
  const monthSheet = wb.addWorksheet("Evolución Mensual");
  monthSheet.columns = [
    { header: "Mes", key: "month", width: 14 },
    { header: "Nº Facturas", key: "count", width: 14 },
    { header: "Total", key: "total", width: 16 },
  ];
  styleHeaderRow(monthSheet);

  for (const m of monthlyExpenses) {
    monthSheet.addRow({ month: m.month || "-", count: Number(m.count), total: Number(m.total) });
  }

  monthSheet.getColumn("C").numFmt = CURRENCY_FORMAT;
  alternateRows(monthSheet);
}
