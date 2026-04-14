import { db, schema } from "@/db";
import { eq, and, ilike, gte, lte, desc, sql, lt } from "drizzle-orm";

/**
 * MCP Tools — read-only capabilities exposed to MCP clients (Claude Desktop).
 *
 * Each tool has:
 *  - name: unique identifier
 *  - description: shown in tool-picker UI
 *  - inputSchema: JSON Schema for arguments
 *  - handler(userId, args): returns any JSON-serializable value
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (userId: string, args: Record<string, unknown>) => Promise<unknown>;
}

const fmtEur = (n: unknown) =>
  Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const TOOLS: Record<string, ToolDefinition> = {
  get_stats: {
    name: "get_stats",
    description:
      "Resumen global de Sinergia Mail: total de emails, no leídos, prioridad alta, total de facturas, gasto total, IVA soportado.",
    inputSchema: { type: "object", properties: {} },
    handler: async (userId) => {
      const [emailStats, invoiceStats] = await Promise.all([
        db
          .select({
            total: sql<number>`count(*)`,
            unread: sql<number>`count(*) filter (where ${schema.emails.isRead} = false)`,
            highPriority: sql<number>`count(*) filter (where ${schema.emails.priority} = 'ALTA')`,
          })
          .from(schema.emails)
          .where(eq(schema.emails.userId, userId)),
        db
          .select({
            count: sql<number>`count(*)`,
            total: sql<number>`COALESCE(SUM(total_amount), 0)`,
            tax: sql<number>`COALESCE(SUM(tax), 0)`,
          })
          .from(schema.invoices)
          .where(eq(schema.invoices.userId, userId)),
      ]);
      const e = emailStats[0];
      const i = invoiceStats[0];
      return {
        emails: {
          total: Number(e?.total || 0),
          unread: Number(e?.unread || 0),
          highPriority: Number(e?.highPriority || 0),
        },
        invoices: {
          count: Number(i?.count || 0),
          totalSpent: Number(i?.total || 0),
          totalSpentFormatted: `${fmtEur(i?.total)} €`,
          ivaSupported: Number(i?.tax || 0),
          ivaSupportedFormatted: `${fmtEur(i?.tax)} €`,
        },
      };
    },
  },

  query_emails: {
    name: "query_emails",
    description:
      "Lista emails del usuario. Permite filtrar por categoría (FACTURA, CLIENTE, PROVEEDOR, SPAM, MARKETING, NOTIFICACION, OTRO), texto de búsqueda en asunto/remitente, y paginación.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filtro por categoría exacta (ej. FACTURA)" },
        search: { type: "string", description: "Texto a buscar en asunto o remitente" },
        limit: { type: "number", default: 20 },
      },
    },
    handler: async (userId, args) => {
      const category = args.category as string | undefined;
      const search = args.search as string | undefined;
      const limit = Math.min(Number(args.limit) || 20, 100);

      const conditions = [eq(schema.emails.userId, userId)];
      if (category) conditions.push(eq(schema.emails.category, category));
      if (search) {
        conditions.push(
          sql`(${ilike(schema.emails.subject, `%${search}%`)} OR ${ilike(schema.emails.fromName, `%${search}%`)} OR ${ilike(schema.emails.fromEmail, `%${search}%`)})`
        );
      }

      const rows = await db.query.emails.findMany({
        where: and(...conditions),
        orderBy: [desc(schema.emails.date)],
        limit,
      });

      return rows.map((e) => ({
        id: e.id,
        from: e.fromName || e.fromEmail,
        fromEmail: e.fromEmail,
        subject: e.subject,
        date: e.date,
        category: e.category,
        priority: e.priority,
        isRead: e.isRead,
        snippet: e.snippet?.slice(0, 200),
      }));
    },
  },

  query_invoices: {
    name: "query_invoices",
    description:
      "Lista facturas. Permite filtrar por categoría, emisor, rango de fechas y límite.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        issuerSearch: { type: "string", description: "Buscar por nombre de emisor" },
        dateFrom: { type: "string", description: "YYYY-MM-DD" },
        dateTo: { type: "string", description: "YYYY-MM-DD" },
        limit: { type: "number", default: 20 },
      },
    },
    handler: async (userId, args) => {
      const category = args.category as string | undefined;
      const issuerSearch = args.issuerSearch as string | undefined;
      const dateFrom = args.dateFrom as string | undefined;
      const dateTo = args.dateTo as string | undefined;
      const limit = Math.min(Number(args.limit) || 20, 100);

      const conditions = [eq(schema.invoices.userId, userId)];
      if (category) conditions.push(eq(schema.invoices.category, category));
      if (issuerSearch) conditions.push(ilike(schema.invoices.issuerName, `%${issuerSearch}%`));
      if (dateFrom) conditions.push(gte(schema.invoices.invoiceDate, new Date(dateFrom)));
      if (dateTo) conditions.push(lte(schema.invoices.invoiceDate, new Date(dateTo)));

      const rows = await db.query.invoices.findMany({
        where: and(...conditions),
        orderBy: [desc(schema.invoices.invoiceDate)],
        limit,
      });

      return rows.map((inv) => ({
        id: inv.id,
        issuer: inv.issuerName,
        invoiceNumber: inv.invoiceNumber,
        totalAmount: Number(inv.totalAmount) || 0,
        totalAmountFormatted: `${fmtEur(inv.totalAmount)} €`,
        tax: Number(inv.tax) || 0,
        date: inv.invoiceDate,
        dueDate: inv.dueDate,
        category: inv.category,
      }));
    },
  },

  get_overdue_invoices: {
    name: "get_overdue_invoices",
    description:
      "Facturas vencidas (con dueDate anterior a hoy y sin marcar como pagadas). Incluye días de retraso.",
    inputSchema: { type: "object", properties: {} },
    handler: async (userId) => {
      const today = new Date();
      const rows = await db.query.invoices.findMany({
        where: and(
          eq(schema.invoices.userId, userId),
          lt(schema.invoices.dueDate, today)
        ),
        orderBy: [schema.invoices.dueDate],
      });
      return rows.map((inv) => {
        const daysOverdue = inv.dueDate
          ? Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / (24 * 60 * 60 * 1000))
          : null;
        return {
          id: inv.id,
          issuer: inv.issuerName,
          invoiceNumber: inv.invoiceNumber,
          amount: Number(inv.totalAmount) || 0,
          amountFormatted: `${fmtEur(inv.totalAmount)} €`,
          dueDate: inv.dueDate,
          daysOverdue,
        };
      });
    },
  },

  get_iva_quarterly: {
    name: "get_iva_quarterly",
    description:
      "Desglose de IVA soportado para el Modelo 303. Parámetros: year (número), quarter (1-4).",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "number" },
        quarter: { type: "number", minimum: 1, maximum: 4 },
      },
      required: ["year", "quarter"],
    },
    handler: async (userId, args) => {
      const year = Number(args.year);
      const quarter = Number(args.quarter);
      const monthStart = (quarter - 1) * 3 + 1;
      const monthEnd = monthStart + 2;
      const from = `${year}-${String(monthStart).padStart(2, "0")}-01`;
      const to = `${year}-${String(monthEnd).padStart(2, "0")}-31`;

      const rows = await db.query.invoices.findMany({
        where: and(
          eq(schema.invoices.userId, userId),
          gte(schema.invoices.invoiceDate, new Date(from)),
          lte(schema.invoices.invoiceDate, new Date(to))
        ),
      });

      const totalBase = rows.reduce((s, r) => s + (Number(r.totalAmount) - Number(r.tax) || 0), 0);
      const totalIva = rows.reduce((s, r) => s + (Number(r.tax) || 0), 0);
      const totalTotal = rows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);

      return {
        year,
        quarter,
        period: { from, to },
        invoiceCount: rows.length,
        totalBase,
        totalBaseFormatted: `${fmtEur(totalBase)} €`,
        totalIva,
        totalIvaFormatted: `${fmtEur(totalIva)} €`,
        totalTotal,
        totalTotalFormatted: `${fmtEur(totalTotal)} €`,
      };
    },
  },

  get_duplicate_invoices: {
    name: "get_duplicate_invoices",
    description:
      "Detecta facturas potencialmente duplicadas agrupándolas por emisor + importe. Útil para prevenir pagos dobles.",
    inputSchema: { type: "object", properties: {} },
    handler: async (userId) => {
      const rows = await db
        .select({
          issuer: schema.invoices.issuerName,
          amount: schema.invoices.totalAmount,
          count: sql<number>`count(*)`,
          ids: sql<number[]>`array_agg(${schema.invoices.id})`,
        })
        .from(schema.invoices)
        .where(and(eq(schema.invoices.userId, userId), sql`${schema.invoices.totalAmount} > 0`))
        .groupBy(schema.invoices.issuerName, schema.invoices.totalAmount)
        .having(sql`count(*) > 1`);

      return {
        groupCount: rows.length,
        potentialSavings: rows.reduce((s, g) => s + Number(g.amount || 0) * (Number(g.count) - 1), 0),
        groups: rows.map((g) => ({
          issuer: g.issuer,
          amount: Number(g.amount || 0),
          amountFormatted: `${fmtEur(g.amount)} €`,
          count: Number(g.count),
          invoiceIds: g.ids,
        })),
      };
    },
  },
};

export const TOOL_LIST = Object.values(TOOLS).map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: t.inputSchema,
}));
