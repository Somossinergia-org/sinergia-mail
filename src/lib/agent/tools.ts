/**
 * Agentic tool registry for Sinergia AI (Gemini function calling).
 *
 * Each tool declares:
 *  - name: function identifier (snake_case)
 *  - description: shown to the model (short, actionable)
 *  - parameters: JSON Schema of args
 *  - handler(userId, args): async executor returning a JSON-serializable result
 *
 * Safety:
 *  - Read tools: no side effects
 *  - Write tools: log every execution to agent_logs
 *  - Destructive tools: use Gmail TRASH (recoverable 30 days) — never permanent delete
 *  - Rate limiting is enforced upstream in /api/agent
 */

import { db, schema } from "@/db";
import { eq, and, ilike, gte, lte, desc, sql, lt, inArray } from "drizzle-orm";
import { trashEmails as gmailTrashEmails, createDraft as gmailCreateDraft } from "@/lib/gmail";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ component: "agent-tools" });

const fmtEur = (n: unknown) =>
  Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface ToolHandlerResult {
  ok: boolean;
  [key: string]: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (userId: string, args: Record<string, unknown>) => Promise<ToolHandlerResult>;
}

// ─── Shared helpers ───────────────────────────────────────────────────────

async function logToolCall(
  userId: string,
  toolName: string,
  input: Record<string, unknown>,
  output: ToolHandlerResult,
  durationMs: number,
) {
  try {
    await db.insert(schema.agentLogs).values({
      userId,
      action: `tool:${toolName}`,
      inputSummary: JSON.stringify(input).slice(0, 200),
      outputSummary: JSON.stringify(output).slice(0, 300),
      durationMs,
      success: output.ok === true,
      error: output.ok ? null : String(output.error || ""),
    });
  } catch (e) {
    logError(log, e, { userId, toolName }, "failed to log tool call");
  }
}

/** Wraps a handler with try/catch + logging + timing. */
function wrap(
  handler: (userId: string, args: Record<string, unknown>) => Promise<ToolHandlerResult>,
): (userId: string, args: Record<string, unknown>) => Promise<ToolHandlerResult> {
  return async (userId, args) => {
    const started = Date.now();
    let result: ToolHandlerResult;
    try {
      result = await handler(userId, args);
    } catch (e) {
      logError(log, e, { userId, args }, "tool handler threw");
      result = { ok: false, error: e instanceof Error ? e.message : "Error interno" };
    }
    const durationMs = Date.now() - started;
    await logToolCall(userId, handler.name || "anonymous", args, result, durationMs);
    return result;
  };
}

// ─── READ TOOLS ───────────────────────────────────────────────────────────

async function getStatsImpl(userId: string): Promise<ToolHandlerResult> {
  const [e, i] = await Promise.all([
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
  return {
    ok: true,
    emails: {
      total: Number(e[0]?.total || 0),
      unread: Number(e[0]?.unread || 0),
      highPriority: Number(e[0]?.highPriority || 0),
    },
    invoices: {
      count: Number(i[0]?.count || 0),
      totalSpentEur: `${fmtEur(i[0]?.total)} €`,
      ivaSupportedEur: `${fmtEur(i[0]?.tax)} €`,
    },
  };
}

async function searchEmailsImpl(userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const query = args.query as string | undefined;
  const category = args.category as string | undefined;
  const isRead = args.is_read as boolean | undefined;
  const limit = Math.min(Number(args.limit) || 20, 50);

  const conditions = [eq(schema.emails.userId, userId)];
  if (category) conditions.push(eq(schema.emails.category, category));
  if (typeof isRead === "boolean") conditions.push(eq(schema.emails.isRead, isRead));
  if (query) {
    conditions.push(
      sql`(${ilike(schema.emails.subject, `%${query}%`)} OR ${ilike(schema.emails.fromName, `%${query}%`)} OR ${ilike(schema.emails.fromEmail, `%${query}%`)})`,
    );
  }

  const rows = await db.query.emails.findMany({
    where: and(...conditions),
    orderBy: [desc(schema.emails.date)],
    limit,
  });
  return {
    ok: true,
    count: rows.length,
    emails: rows.map((e) => ({
      id: e.id,
      from: e.fromName || e.fromEmail,
      subject: e.subject,
      date: e.date,
      category: e.category,
      priority: e.priority,
      isRead: e.isRead,
    })),
  };
}

async function searchInvoicesImpl(userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const issuer = args.issuer as string | undefined;
  const category = args.category as string | undefined;
  const dateFrom = args.date_from as string | undefined;
  const dateTo = args.date_to as string | undefined;
  const limit = Math.min(Number(args.limit) || 20, 50);

  const conditions = [eq(schema.invoices.userId, userId)];
  if (category) conditions.push(eq(schema.invoices.category, category));
  if (issuer) conditions.push(ilike(schema.invoices.issuerName, `%${issuer}%`));
  if (dateFrom) conditions.push(gte(schema.invoices.invoiceDate, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(schema.invoices.invoiceDate, new Date(dateTo)));

  const rows = await db.query.invoices.findMany({
    where: and(...conditions),
    orderBy: [desc(schema.invoices.invoiceDate)],
    limit,
  });
  return {
    ok: true,
    count: rows.length,
    invoices: rows.map((r) => ({
      id: r.id,
      issuer: r.issuerName,
      number: r.invoiceNumber,
      amount: `${fmtEur(r.totalAmount)} €`,
      date: r.invoiceDate,
      category: r.category,
    })),
  };
}

async function getOverdueInvoicesImpl(userId: string): Promise<ToolHandlerResult> {
  const today = new Date();
  const rows = await db.query.invoices.findMany({
    where: and(eq(schema.invoices.userId, userId), lt(schema.invoices.dueDate, today)),
    orderBy: [schema.invoices.dueDate],
  });
  return {
    ok: true,
    count: rows.length,
    overdue: rows.map((r) => {
      const days = r.dueDate
        ? Math.floor((Date.now() - new Date(r.dueDate).getTime()) / (24 * 60 * 60 * 1000))
        : null;
      return {
        id: r.id,
        issuer: r.issuerName,
        amount: `${fmtEur(r.totalAmount)} €`,
        dueDate: r.dueDate,
        daysOverdue: days,
      };
    }),
  };
}

async function getIvaQuarterlyImpl(userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const year = Number(args.year) || new Date().getFullYear();
  const quarter = Number(args.quarter) || Math.ceil((new Date().getMonth() + 1) / 3);
  const monthStart = (quarter - 1) * 3 + 1;
  const monthEnd = monthStart + 2;
  const from = new Date(`${year}-${String(monthStart).padStart(2, "0")}-01`);
  const to = new Date(`${year}-${String(monthEnd).padStart(2, "0")}-31`);

  const rows = await db.query.invoices.findMany({
    where: and(
      eq(schema.invoices.userId, userId),
      gte(schema.invoices.invoiceDate, from),
      lte(schema.invoices.invoiceDate, to),
    ),
  });

  const totalBase = rows.reduce((s, r) => s + (Number(r.totalAmount) - Number(r.tax) || 0), 0);
  const totalIva = rows.reduce((s, r) => s + (Number(r.tax) || 0), 0);
  const totalTotal = rows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
  return {
    ok: true,
    year,
    quarter,
    invoiceCount: rows.length,
    totalBaseEur: `${fmtEur(totalBase)} €`,
    totalIvaEur: `${fmtEur(totalIva)} €`,
    totalTotalEur: `${fmtEur(totalTotal)} €`,
  };
}

async function getDuplicatesImpl(userId: string): Promise<ToolHandlerResult> {
  const rows = await db
    .select({
      issuer: schema.invoices.issuerName,
      amount: schema.invoices.totalAmount,
      count: sql<number>`count(*)`,
    })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.userId, userId), sql`${schema.invoices.totalAmount} > 0`))
    .groupBy(schema.invoices.issuerName, schema.invoices.totalAmount)
    .having(sql`count(*) > 1`);
  return {
    ok: true,
    groupCount: rows.length,
    potentialSavings: rows.reduce((s, g) => s + Number(g.amount || 0) * (Number(g.count) - 1), 0),
    groups: rows.map((g) => ({
      issuer: g.issuer,
      amount: `${fmtEur(g.amount)} €`,
      count: Number(g.count),
    })),
  };
}

// ─── WRITE TOOLS ──────────────────────────────────────────────────────────

async function markEmailsReadImpl(userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const ids = (args.email_ids as unknown[] | undefined)?.map(Number).filter(Number.isFinite) as number[];
  if (!ids || ids.length === 0) return { ok: false, error: "email_ids requerido (array de IDs)" };

  const updated = await db
    .update(schema.emails)
    .set({ isRead: true })
    .where(and(eq(schema.emails.userId, userId), inArray(schema.emails.id, ids)))
    .returning({ id: schema.emails.id });
  return { ok: true, updated: updated.length };
}

async function trashEmailsImpl(userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const ids = (args.email_ids as unknown[] | undefined)?.map(Number).filter(Number.isFinite) as number[];
  if (!ids || ids.length === 0) return { ok: false, error: "email_ids requerido (array de IDs)" };

  // Fetch gmail IDs for the DB rows
  const rows = await db.query.emails.findMany({
    where: and(eq(schema.emails.userId, userId), inArray(schema.emails.id, ids)),
    columns: { id: true, gmailId: true },
  });
  const gmailIds = rows.map((r) => r.gmailId).filter((g): g is string => !!g);
  if (gmailIds.length === 0) return { ok: false, error: "No se encontraron emails con esos IDs" };

  const result = await gmailTrashEmails(userId, gmailIds);

  // Mark as trashed locally (soft)
  await db
    .update(schema.emails)
    .set({ category: "TRASHED" })
    .where(and(eq(schema.emails.userId, userId), inArray(schema.emails.id, ids)));

  return { ok: true, trashed: result.trashed, errors: result.errors };
}

async function createDraftImpl(userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const emailId = Number(args.email_id);
  const body = args.body as string | undefined;
  if (!emailId || !body) return { ok: false, error: "email_id y body requeridos" };

  const email = await db.query.emails.findFirst({
    where: and(eq(schema.emails.id, emailId), eq(schema.emails.userId, userId)),
  });
  if (!email) return { ok: false, error: "Email no encontrado" };

  const subject = `Re: ${email.subject || ""}`;
  const draft = await gmailCreateDraft(userId, email.fromEmail || "", subject, body);
  return { ok: true, draftId: draft.id, to: email.fromEmail, subject };
}

async function createEmailRuleImpl(userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const pattern = (args.pattern as string | undefined)?.trim();
  const action = (args.action as string | undefined)?.toUpperCase();
  const field = ((args.field as string | undefined) || "subject").toLowerCase();
  const description = (args.description as string | undefined) || "Creada por el agente desde chat";

  if (!pattern) return { ok: false, error: "pattern requerido" };
  if (!["TRASH", "MARK_READ", "IGNORE", "IMPORTANT"].includes(action || ""))
    return { ok: false, error: "action inválida. Usa TRASH | MARK_READ | IGNORE | IMPORTANT" };
  if (!["subject", "from_email", "from_name", "body"].includes(field))
    return { ok: false, error: "field inválido. Usa subject | from_email | from_name | body" };

  // 1. Insert rule
  const [created] = await db
    .insert(schema.memoryRules)
    .values({
      userId,
      pattern,
      field,
      action: action!,
      description,
    })
    .returning({ id: schema.memoryRules.id });

  // 2. Apply to existing matching emails immediately
  const patternIlike = `%${pattern}%`;
  const columnByField = {
    subject: schema.emails.subject,
    from_email: schema.emails.fromEmail,
    from_name: schema.emails.fromName,
    body: schema.emails.body,
  } as const;
  const col = columnByField[field as keyof typeof columnByField];

  const matchingEmails = await db.query.emails.findMany({
    where: and(eq(schema.emails.userId, userId), ilike(col, patternIlike)),
    columns: { id: true, gmailId: true },
  });

  let appliedNow = 0;
  if (matchingEmails.length > 0) {
    if (action === "TRASH") {
      const gmailIds = matchingEmails.map((e) => e.gmailId).filter((g): g is string => !!g);
      if (gmailIds.length > 0) {
        const result = await gmailTrashEmails(userId, gmailIds);
        appliedNow = result.trashed;
        await db
          .update(schema.emails)
          .set({ category: "TRASHED" })
          .where(and(eq(schema.emails.userId, userId), inArray(schema.emails.id, matchingEmails.map((e) => e.id))));
      }
    } else if (action === "MARK_READ") {
      const updated = await db
        .update(schema.emails)
        .set({ isRead: true })
        .where(and(eq(schema.emails.userId, userId), inArray(schema.emails.id, matchingEmails.map((e) => e.id))))
        .returning({ id: schema.emails.id });
      appliedNow = updated.length;
    }
  }

  // 3. Update match counter
  await db
    .update(schema.memoryRules)
    .set({ matchCount: appliedNow, updatedAt: new Date() })
    .where(eq(schema.memoryRules.id, created.id));

  return {
    ok: true,
    ruleId: created.id,
    pattern,
    field,
    action,
    appliedToExisting: appliedNow,
    message: `Regla creada. ${appliedNow} email${appliedNow === 1 ? "" : "s"} ${action === "TRASH" ? "movido" + (appliedNow === 1 ? "" : "s") + " a papelera" : "procesado" + (appliedNow === 1 ? "" : "s")}. Los futuros se procesarán automáticamente al sincronizar.`,
  };
}

async function listEmailRulesImpl(userId: string): Promise<ToolHandlerResult> {
  const rules = await db.query.memoryRules.findMany({
    where: eq(schema.memoryRules.userId, userId),
    orderBy: [desc(schema.memoryRules.createdAt)],
  });
  return {
    ok: true,
    count: rules.length,
    rules: rules.map((r) => ({
      id: r.id,
      pattern: r.pattern,
      field: r.field,
      action: r.action,
      enabled: r.enabled,
      matchCount: r.matchCount,
      createdAt: r.createdAt,
    })),
  };
}

async function deleteEmailRuleImpl(userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const ruleId = Number(args.rule_id);
  if (!ruleId) return { ok: false, error: "rule_id requerido" };
  const result = await db
    .delete(schema.memoryRules)
    .where(and(eq(schema.memoryRules.id, ruleId), eq(schema.memoryRules.userId, userId)))
    .returning({ id: schema.memoryRules.id });
  return { ok: true, deleted: result.length };
}

// ─── TOOL REGISTRY ────────────────────────────────────────────────────────

export const TOOLS: ToolDefinition[] = [
  {
    name: "get_stats",
    description:
      "Obtener resumen global del usuario: total de emails, sin leer, prioridad alta, total de facturas, gasto total, IVA soportado.",
    parameters: { type: "object", properties: {} },
    handler: wrap(getStatsImpl),
  },
  {
    name: "search_emails",
    description:
      "Buscar emails por texto (query en asunto/remitente), categoría (FACTURA, CLIENTE, PROVEEDOR, SPAM, MARKETING, NOTIFICACION, OTRO) y estado de lectura.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Texto a buscar en asunto o remitente" },
        category: { type: "string", description: "Filtro por categoría" },
        is_read: { type: "boolean", description: "true=leídos, false=sin leer" },
        limit: { type: "number", description: "Máximo resultados (default 20)" },
      },
    },
    handler: wrap(searchEmailsImpl),
  },
  {
    name: "search_invoices",
    description: "Buscar facturas por emisor, categoría y rango de fechas (YYYY-MM-DD).",
    parameters: {
      type: "object",
      properties: {
        issuer: { type: "string" },
        category: { type: "string" },
        date_from: { type: "string" },
        date_to: { type: "string" },
        limit: { type: "number" },
      },
    },
    handler: wrap(searchInvoicesImpl),
  },
  {
    name: "get_overdue_invoices",
    description: "Listar facturas vencidas (con dueDate anterior a hoy), incluye días de retraso.",
    parameters: { type: "object", properties: {} },
    handler: wrap(getOverdueInvoicesImpl),
  },
  {
    name: "get_iva_quarterly",
    description: "Desglose IVA soportado para el Modelo 303 por trimestre.",
    parameters: {
      type: "object",
      properties: {
        year: { type: "number" },
        quarter: { type: "number", description: "1, 2, 3 o 4" },
      },
    },
    handler: wrap(getIvaQuarterlyImpl),
  },
  {
    name: "get_duplicate_invoices",
    description: "Detectar facturas potencialmente duplicadas agrupadas por emisor e importe.",
    parameters: { type: "object", properties: {} },
    handler: wrap(getDuplicatesImpl),
  },
  {
    name: "mark_emails_read",
    description: "Marcar emails como leídos dados sus IDs internos.",
    parameters: {
      type: "object",
      properties: {
        email_ids: { type: "array", items: { type: "number" } },
      },
      required: ["email_ids"],
    },
    handler: wrap(markEmailsReadImpl),
  },
  {
    name: "trash_emails",
    description:
      "Mover emails a la papelera de Gmail (recuperable 30 días). CONFIRMA con el usuario si son más de 5 emails.",
    parameters: {
      type: "object",
      properties: {
        email_ids: { type: "array", items: { type: "number" } },
      },
      required: ["email_ids"],
    },
    handler: wrap(trashEmailsImpl),
  },
  {
    name: "create_draft",
    description: "Crear un borrador de respuesta en Gmail para un email concreto. El body debe ser el texto completo.",
    parameters: {
      type: "object",
      properties: {
        email_id: { type: "number" },
        body: { type: "string" },
      },
      required: ["email_id", "body"],
    },
    handler: wrap(createDraftImpl),
  },
  {
    name: "create_email_rule",
    description:
      "Crear una regla PERSISTENTE que se aplica automáticamente a emails entrantes (y también a los existentes que ya coinciden). Úsala cuando el usuario diga 'cuando lleguen', 'a partir de ahora', 'siempre que reciba X'. Ejemplos: 'elimina los emails de X cuando lleguen' → create_email_rule(pattern: 'X', action: 'TRASH'). 'Marca como leídos los newsletters de Y' → create_email_rule(pattern: 'Y', field: 'from_email', action: 'MARK_READ').",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Texto a buscar (match parcial, case-insensitive)" },
        action: {
          type: "string",
          description: "TRASH (papelera), MARK_READ (leído), IGNORE (no procesar), IMPORTANT (marcar importante)",
        },
        field: {
          type: "string",
          description: "Dónde buscar: subject (default), from_email, from_name, body",
        },
        description: { type: "string", description: "Descripción breve de la regla" },
      },
      required: ["pattern", "action"],
    },
    handler: wrap(createEmailRuleImpl),
  },
  {
    name: "list_email_rules",
    description: "Listar las reglas automáticas activas del usuario.",
    parameters: { type: "object", properties: {} },
    handler: wrap(listEmailRulesImpl),
  },
  {
    name: "delete_email_rule",
    description: "Eliminar una regla automática por su ID.",
    parameters: {
      type: "object",
      properties: { rule_id: { type: "number" } },
      required: ["rule_id"],
    },
    handler: wrap(deleteEmailRuleImpl),
  },
];

export const TOOLS_BY_NAME: Record<string, ToolDefinition> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);
