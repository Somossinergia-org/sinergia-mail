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
import { createEvent as createCalendarEvent, listUpcomingEvents } from "@/lib/calendar";
import { normalizeNif, normalizeName, parseSpanishPeriod } from "@/lib/text/normalize";
import { addSource as memoryAddSource, searchMemory as memorySearch } from "@/lib/memory";
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

async function draftPaymentReminderImpl(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const invoiceId = Number(args.invoice_id);
  const tone = (args.tone as string) || "cordial";
  if (!invoiceId) return { ok: false, error: "invoice_id requerido" };

  const invoice = await db.query.invoices.findFirst({
    where: and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.userId, userId)),
  });
  if (!invoice) return { ok: false, error: "Factura no encontrada" };

  // Find original email to get sender
  let to = "";
  if (invoice.emailId) {
    const email = await db.query.emails.findFirst({
      where: eq(schema.emails.id, invoice.emailId),
    });
    to = email?.fromEmail || "";
  }
  if (!to) return { ok: false, error: "No se encontró email del proveedor para esta factura" };

  const days = invoice.dueDate
    ? Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const amount = fmtEur(invoice.totalAmount);
  const number = invoice.invoiceNumber || "(sin número)";

  const toneIntro: Record<string, string> = {
    cordial: "Estimados,\n\nEspero que se encuentren bien.",
    formal: "Muy Sres. míos,",
    firme: "Estimados,",
  };
  const intro = toneIntro[tone] || toneIntro.cordial;

  const body =
    `${intro}\n\n` +
    `Les escribo en relación a la factura ${number} por importe de ${amount} € ` +
    (days !== null ? `con fecha de vencimiento ${invoice.dueDate?.toISOString?.().slice(0, 10) ?? ""}, que figura como vencida hace ${days} día${days === 1 ? "" : "s"}. ` : "que figura en nuestro sistema como pendiente. ") +
    `\n\nAgradecería confirmaran si el pago ha sido procesado, o en caso contrario, indicaran fecha prevista de pago o rectificación.\n\n` +
    `Quedo a su disposición para cualquier aclaración.\n\n` +
    `Un cordial saludo,\nSomos Sinergia`;

  const subject = `Recordatorio factura ${number}`;
  const draft = await gmailCreateDraft(userId, to, subject, body);
  return { ok: true, draftId: draft.id, to, subject, invoiceNumber: number, amount: `${amount} €`, daysOverdue: days };
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

// ─── CALENDAR TOOLS ───────────────────────────────────────────────────────

async function createCalendarEventImpl(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const summary = (args.summary as string)?.trim();
  const startISO = (args.start_iso as string)?.trim();
  const description = (args.description as string) || undefined;
  const durationMin = Number(args.duration_min) || undefined;
  const reminderMinutes = Number(args.reminder_minutes) || undefined;

  if (!summary) return { ok: false, error: "summary requerido" };
  if (!startISO) return { ok: false, error: "start_iso requerido (YYYY-MM-DDTHH:mm:ss)" };

  try {
    const ev = await createCalendarEvent(userId, {
      summary,
      description,
      startISO,
      durationMin,
      reminderMinutes,
    });
    return {
      ok: true,
      eventId: ev.id,
      summary: ev.summary,
      startISO: ev.startISO,
      htmlLink: ev.htmlLink,
      message: `Evento "${ev.summary}" creado en tu Google Calendar.`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error creando evento";
    // Detect missing calendar OAuth scope
    if (/insufficient/i.test(msg) || /permission/i.test(msg) || /403/.test(msg)) {
      return {
        ok: false,
        error:
          "Tu sesión no tiene el scope de Google Calendar. Cierra sesión y vuelve a entrar para que te pida permiso a tu calendario (necesario solo la primera vez).",
        needsReauth: true,
      };
    }
    return { ok: false, error: msg };
  }
}

async function listUpcomingEventsImpl(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const days = Math.min(Math.max(Number(args.days) || 7, 1), 60);
  try {
    const events = await listUpcomingEvents(userId, days);
    return {
      ok: true,
      days,
      count: events.length,
      events: events.map((e) => ({
        summary: e.summary,
        start: e.startISO,
        end: e.endISO,
        location: e.location,
      })),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error listando eventos";
    if (/insufficient/i.test(msg) || /permission/i.test(msg) || /403/.test(msg)) {
      return {
        ok: false,
        error:
          "Tu sesión no tiene el scope de Google Calendar. Cierra sesión y vuelve a entrar para dar permiso a tu calendario.",
        needsReauth: true,
      };
    }
    return { ok: false, error: msg };
  }
}

async function addInvoiceDueReminderImpl(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const invoiceId = Number(args.invoice_id);
  const daysBefore = Number(args.days_before) || 3;
  if (!invoiceId) return { ok: false, error: "invoice_id requerido" };

  const invoice = await db.query.invoices.findFirst({
    where: and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.userId, userId)),
  });
  if (!invoice) return { ok: false, error: "Factura no encontrada" };
  if (!invoice.dueDate) return { ok: false, error: "La factura no tiene fecha de vencimiento" };

  const reminderDate = new Date(invoice.dueDate);
  reminderDate.setDate(reminderDate.getDate() - daysBefore);
  reminderDate.setHours(9, 0, 0, 0);

  // Skip if already in the past
  if (reminderDate.getTime() < Date.now()) {
    return { ok: false, error: `El recordatorio caería en el pasado (${reminderDate.toISOString()})` };
  }

  const startISO = reminderDate.toISOString().slice(0, 19);
  const summary = `⚠ Vence factura ${invoice.invoiceNumber || ""} de ${invoice.issuerName || ""} (${fmtEur(invoice.totalAmount)} €)`;
  const ev = await createCalendarEvent(userId, {
    summary,
    description:
      `Factura ${invoice.invoiceNumber || ""} del proveedor ${invoice.issuerName || ""} ` +
      `por importe ${fmtEur(invoice.totalAmount)} €. ` +
      `Vencimiento: ${invoice.dueDate.toISOString().slice(0, 10)}.`,
    startISO,
    durationMin: 30,
    reminderMinutes: 60 * 24, // 1 day before the event itself
  });
  return {
    ok: true,
    eventId: ev.id,
    htmlLink: ev.htmlLink,
    reminderAt: startISO,
    message: `Recordatorio creado para el ${startISO.slice(0, 10)} a las 09:00.`,
  };
}

// ─── SMART INVOICE SEARCH ─────────────────────────────────────────────────

async function findInvoicesSmartImpl(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const text = (args.text as string)?.trim();
  const nifRaw = (args.nif as string)?.trim();
  const dateFromRaw = (args.date_from as string)?.trim();
  const dateToRaw = (args.date_to as string)?.trim();
  const period = (args.period as string)?.trim();
  const amountMin = Number(args.amount_min);
  const amountMax = Number(args.amount_max);
  const category = (args.category as string)?.trim();
  const status = (args.status as string)?.trim() || "all";
  const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);

  const conds: ReturnType<typeof eq>[] = [eq(schema.invoices.userId, userId)];

  // NIF: exact match on normalized
  if (nifRaw) {
    const nifNorm = normalizeNif(nifRaw);
    if (nifNorm) {
      conds.push(eq(schema.invoices.nifNormalized, nifNorm));
    }
  }

  // Period: prefer explicit date_from/date_to, fall back to period parser
  let dateFrom: Date | null = null;
  let dateTo: Date | null = null;
  if (dateFromRaw) dateFrom = new Date(dateFromRaw);
  if (dateToRaw) dateTo = new Date(dateToRaw);
  if (!dateFrom && !dateTo && period) {
    const parsed = parseSpanishPeriod(period);
    if (parsed) {
      dateFrom = parsed.from;
      dateTo = parsed.to;
    }
  }
  if (dateFrom) conds.push(gte(schema.invoices.invoiceDate, dateFrom));
  if (dateTo) conds.push(lte(schema.invoices.invoiceDate, dateTo));

  // Amount range
  if (Number.isFinite(amountMin)) conds.push(sql`${schema.invoices.totalAmount} >= ${amountMin}`);
  if (Number.isFinite(amountMax)) conds.push(sql`${schema.invoices.totalAmount} <= ${amountMax}`);

  // Category
  if (category) conds.push(eq(schema.invoices.category, category));

  // Status
  if (status === "overdue") {
    conds.push(lt(schema.invoices.dueDate, new Date()));
  } else if (status === "pending") {
    conds.push(sql`${schema.invoices.dueDate} >= ${new Date()}`);
  }

  // Free text: trigram similarity on normalized issuer + ilike on
  // invoice_number/concept. Falls back to LIKE if pg_trgm absent.
  let textCondAdded = false;
  if (text) {
    const textNorm = normalizeName(text);
    if (textNorm) {
      // similarity uses pg_trgm; threshold 0.25 catches partial matches like
      // "buen fin" → "buen fin de mes"
      conds.push(
        sql`(
          similarity(${schema.invoices.issuerNormalized}, ${textNorm}) > 0.25
          OR ${schema.invoices.issuerNormalized} ILIKE ${"%" + textNorm + "%"}
          OR ${schema.invoices.invoiceNumber} ILIKE ${"%" + text + "%"}
          OR ${schema.invoices.concept} ILIKE ${"%" + text + "%"}
          OR ${schema.invoices.nifNormalized} = ${normalizeNif(text)}
        )`,
      );
      textCondAdded = true;
    }
  }

  // Order: by similarity DESC if text search, else date DESC
  const orderClause = textCondAdded && text
    ? sql`similarity(${schema.invoices.issuerNormalized}, ${normalizeName(text)}) DESC, ${schema.invoices.invoiceDate} DESC NULLS LAST`
    : sql`${schema.invoices.invoiceDate} DESC NULLS LAST`;

  const rows = await db
    .select({
      id: schema.invoices.id,
      issuer: schema.invoices.issuerName,
      issuerNormalized: schema.invoices.issuerNormalized,
      nif: schema.invoices.issuerNif,
      number: schema.invoices.invoiceNumber,
      total: schema.invoices.totalAmount,
      tax: schema.invoices.tax,
      date: schema.invoices.invoiceDate,
      dueDate: schema.invoices.dueDate,
      category: schema.invoices.category,
      concept: schema.invoices.concept,
    })
    .from(schema.invoices)
    .where(and(...conds))
    .orderBy(orderClause)
    .limit(limit);

  const sumTotal = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);

  return {
    ok: true,
    count: rows.length,
    sumTotal,
    sumTotalFormatted: `${fmtEur(sumTotal)} €`,
    period: dateFrom || dateTo
      ? {
          from: dateFrom?.toISOString().slice(0, 10) || null,
          to: dateTo?.toISOString().slice(0, 10) || null,
        }
      : null,
    invoices: rows.map((r) => ({
      id: r.id,
      issuer: r.issuer,
      nif: r.nif,
      number: r.number,
      date: r.date ? new Date(r.date).toISOString().slice(0, 10) : null,
      dueDate: r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : null,
      total: `${fmtEur(r.total)} €`,
      category: r.category,
      concept: r.concept,
    })),
  };
}

// ─── INVOICE UPDATE ───────────────────────────────────────────────────────

async function updateInvoiceImpl(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const invoiceId = Number(args.invoice_id);
  if (!invoiceId) return { ok: false, error: "invoice_id requerido" };

  const invoice = await db.query.invoices.findFirst({
    where: and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.userId, userId)),
  });
  if (!invoice) return { ok: false, error: "Factura no encontrada" };

  // Build update set with only provided fields
  const update: Record<string, unknown> = {};
  const updatedFields: string[] = [];

  const setIfProvided = <K extends string>(key: K, dbField: K, transform?: (v: unknown) => unknown) => {
    if (args[key] !== undefined && args[key] !== null && args[key] !== "") {
      update[dbField] = transform ? transform(args[key]) : args[key];
      updatedFields.push(key);
    }
  };

  setIfProvided("issuer_name", "issuerName");
  setIfProvided("issuer_nif", "issuerNif");
  setIfProvided("invoice_number", "invoiceNumber");
  setIfProvided("concept", "concept");
  setIfProvided("category", "category");
  setIfProvided("amount", "amount", (v) => Number(v));
  setIfProvided("tax", "tax", (v) => Number(v));
  setIfProvided("total_amount", "totalAmount", (v) => Number(v));
  setIfProvided("currency", "currency");
  setIfProvided("invoice_date", "invoiceDate", (v) => new Date(v as string));
  setIfProvided("due_date", "dueDate", (v) => new Date(v as string));

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "No se proporcionó ningún campo para actualizar" };
  }

  // Recompute normalized fields if issuer info changed
  if (update.issuerName !== undefined || update.issuerNif !== undefined) {
    const finalName = (update.issuerName as string) ?? invoice.issuerName;
    const finalNif = (update.issuerNif as string) ?? invoice.issuerNif;
    const norm = {
      issuerNormalized: finalName ? (await import("@/lib/text/normalize")).normalizeName(finalName) || null : null,
      nifNormalized: finalNif ? (await import("@/lib/text/normalize")).normalizeNif(finalNif) || null : null,
    };
    update.issuerNormalized = norm.issuerNormalized;
    update.nifNormalized = norm.nifNormalized;
  }

  await db.update(schema.invoices).set(update).where(eq(schema.invoices.id, invoiceId));

  return {
    ok: true,
    invoiceId,
    updatedFields,
    message: `Factura ${invoice.invoiceNumber || invoiceId} actualizada (${updatedFields.length} campo${updatedFields.length === 1 ? "" : "s"}).`,
  };
}

// ─── SINERGIA MEMORY ──────────────────────────────────────────────────────

async function memoryAddImpl(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const title = (args.title as string)?.trim();
  const content = (args.content as string)?.trim();
  const kind = (args.kind as string) || "note";
  const tags = args.tags as string[] | undefined;
  if (!title || !content) return { ok: false, error: "title y content requeridos" };
  if (!["note", "url", "pdf", "email", "invoice", "contact"].includes(kind)) {
    return { ok: false, error: "kind inválido" };
  }
  const { ids, chunked } = await memoryAddSource({
    userId,
    kind: kind as "note" | "url" | "pdf" | "email" | "invoice" | "contact",
    title,
    content,
    tags,
  });
  return {
    ok: true,
    ids,
    chunks: ids.length,
    chunked,
    message: chunked
      ? `Guardado en memoria (${ids.length} fragmentos).`
      : `Guardado en memoria con ID ${ids[0]}.`,
  };
}

async function memorySearchImpl(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const query = (args.query as string)?.trim();
  const kind = (args.kind as string) || undefined;
  const limit = Math.min(Number(args.limit) || 5, 20);
  if (!query) return { ok: false, error: "query requerido" };

  const results = await memorySearch(userId, query, { limit, kind });
  return {
    ok: true,
    count: results.length,
    results: results.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      preview: r.content.slice(0, 300),
      similarity: Math.round(r.similarity * 100) / 100,
      starred: r.starred,
      metadata: r.metadata,
    })),
  };
}

async function memoryListImpl(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const kind = (args.kind as string) || undefined;
  const starredOnly = args.starred === true;
  const limit = Math.min(Number(args.limit) || 20, 100);

  const conds = [eq(schema.memorySources.userId, userId)];
  if (kind) conds.push(eq(schema.memorySources.kind, kind));
  if (starredOnly) conds.push(eq(schema.memorySources.starred, true));

  const rows = await db.query.memorySources.findMany({
    where: and(...conds),
    orderBy: [desc(schema.memorySources.createdAt)],
    limit,
    columns: { id: true, kind: true, title: true, starred: true, createdAt: true, tags: true },
  });
  return {
    ok: true,
    count: rows.length,
    sources: rows,
  };
}

async function memoryStarImpl(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const id = Number(args.source_id);
  const starred = args.starred !== false;
  if (!id) return { ok: false, error: "source_id requerido" };
  await db
    .update(schema.memorySources)
    .set({ starred, updatedAt: new Date() })
    .where(and(eq(schema.memorySources.id, id), eq(schema.memorySources.userId, userId)));
  return { ok: true, id, starred };
}

async function memoryDeleteImpl(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const id = Number(args.source_id);
  if (!id) return { ok: false, error: "source_id requerido" };
  const deleted = await db
    .delete(schema.memorySources)
    .where(and(eq(schema.memorySources.id, id), eq(schema.memorySources.userId, userId)))
    .returning({ id: schema.memorySources.id });
  return { ok: true, deleted: deleted.length };
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
    name: "update_invoice",
    description:
      "Actualizar campos de una factura existente. Útil cuando el usuario quiere corregir o añadir información (ej. añadir el CIF que faltaba, corregir el emisor, ajustar el importe). Recalcula automáticamente las columnas normalizadas para que las búsquedas posteriores funcionen.\n\nEjemplo: 'añade el CIF B10730505 a la factura 31 de Buen Fin de Mes' → update_invoice(invoice_id: 31, issuer_nif: 'B10730505').",
    parameters: {
      type: "object",
      properties: {
        invoice_id: { type: "number" },
        issuer_name: { type: "string" },
        issuer_nif: { type: "string" },
        invoice_number: { type: "string" },
        concept: { type: "string" },
        category: { type: "string" },
        amount: { type: "number", description: "Base imponible" },
        tax: { type: "number", description: "Importe IVA" },
        total_amount: { type: "number" },
        currency: { type: "string" },
        invoice_date: { type: "string", description: "YYYY-MM-DD" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["invoice_id"],
    },
    handler: wrap(updateInvoiceImpl),
  },
  {
    name: "find_invoices_smart",
    description:
      "Búsqueda INTELIGENTE de facturas con normalización (no distingue mayúsculas/minúsculas, ignora guiones en CIF, prefijos ES, sufijos SL/SA/SLU, acentos). Acepta períodos en español como 'marzo', 'Q2 2026', 'último mes'. Esta es la TOOL PREFERIDA para búsquedas de facturas — usar siempre que el usuario pregunte por facturas.\n\nEjemplos: 'facturas de buen fin de mes' → text:'buen fin de mes'. 'CIF B-10730505' → nif:'B-10730505'. 'facturas de Iberdrola del Q2' → text:'Iberdrola', period:'Q2'. 'últimos 30 días' → period:'últimos 30 días'.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Texto libre que busca en nombre, número y concepto. Se normaliza para coincidir con cualquier formato.",
        },
        nif: {
          type: "string",
          description: "CIF/NIF español. Acepta cualquier formato: 'B10730505', 'B-10730505', 'ESB10730505'.",
        },
        period: {
          type: "string",
          description:
            "Periodo en español: 'marzo', 'marzo 2026', 'Q1', 'Q2 2025', '2026', 'último mes', 'últimos 30 días', 'esta semana', 'hoy'.",
        },
        date_from: { type: "string", description: "YYYY-MM-DD (alternativa a period)" },
        date_to: { type: "string", description: "YYYY-MM-DD (alternativa a period)" },
        amount_min: { type: "number" },
        amount_max: { type: "number" },
        category: {
          type: "string",
          description: "ELECTRICIDAD, GAS, AGUA, TELECOMUNICACIONES, COMBUSTIBLE, SUSCRIPCION_TECH, OFICINA, ALIMENTACION, RESTAURACION, ALOJAMIENTO, TRANSPORTE, PROFESIONAL, MATERIAL, OTROS",
        },
        status: {
          type: "string",
          description: "all (default) | overdue (vencidas) | pending (no vencidas)",
        },
        limit: { type: "number", description: "Máximo resultados (default 25)" },
      },
    },
    handler: wrap(findInvoicesSmartImpl),
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
    name: "draft_payment_reminder",
    description:
      "Crear un borrador de email cordial en Gmail recordando al proveedor que una factura está pendiente/vencida. Úsalo cuando el usuario pida generar un recordatorio de pago o perseguir una factura vencida.",
    parameters: {
      type: "object",
      properties: {
        invoice_id: { type: "number" },
        tone: { type: "string", description: "cordial (default), formal, firme" },
      },
      required: ["invoice_id"],
    },
    handler: wrap(draftPaymentReminderImpl),
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
  {
    name: "create_calendar_event",
    description:
      "Crear un evento en el Google Calendar del usuario. Útil para reuniones, recordatorios fiscales, citas con clientes. La fecha debe ser ISO YYYY-MM-DDTHH:mm:ss en hora local española.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Título del evento" },
        start_iso: { type: "string", description: "Inicio en formato YYYY-MM-DDTHH:mm:ss" },
        description: { type: "string", description: "Descripción larga (opcional)" },
        duration_min: { type: "number", description: "Duración en minutos (default 60)" },
        reminder_minutes: { type: "number", description: "Minutos de antelación del aviso (default 60)" },
      },
      required: ["summary", "start_iso"],
    },
    handler: wrap(createCalendarEventImpl),
  },
  {
    name: "list_upcoming_events",
    description:
      "Listar próximos eventos del Google Calendar del usuario en los siguientes N días (default 7).",
    parameters: {
      type: "object",
      properties: {
        days: { type: "number", description: "Número de días a mirar hacia adelante" },
      },
    },
    handler: wrap(listUpcomingEventsImpl),
  },
  {
    name: "memory_search",
    description:
      "BUSCAR EN MEMORIA: búsqueda semántica sobre las fuentes guardadas por el usuario (emails importantes, facturas con texto, PDFs subidos, notas manuales, URLs). Usa siempre que el usuario pregunte '¿qué sé sobre X?', '¿recuerdas lo de Y?', '¿cuándo me dijo Z?'. La búsqueda entiende sinónimos y contexto, no necesita palabras exactas.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Pregunta o concepto a buscar" },
        kind: {
          type: "string",
          description: "Filtro opcional: email | invoice | pdf | note | url | contact",
        },
        limit: { type: "number", description: "Máximo resultados (default 5, max 20)" },
      },
      required: ["query"],
    },
    handler: wrap(memorySearchImpl),
  },
  {
    name: "memory_add",
    description:
      "GUARDAR EN MEMORIA: añadir una nota / URL / texto a la memoria persistente de Sinergia para que el agente lo recuerde en futuras conversaciones. Usa cuando el usuario diga 'apunta que', 'recuerda que', 'guárdame esto', 'anota'.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título corto identificativo" },
        content: { type: "string", description: "Contenido completo a recordar" },
        kind: { type: "string", description: "note (default) | url | pdf | email | invoice | contact" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Etiquetas libres",
        },
      },
      required: ["title", "content"],
    },
    handler: wrap(memoryAddImpl),
  },
  {
    name: "memory_list",
    description: "Listar fuentes de memoria del usuario (sin búsqueda semántica). Útil para ver qué tiene guardado.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string" },
        starred: { type: "boolean", description: "Solo marcadas con estrella" },
        limit: { type: "number" },
      },
    },
    handler: wrap(memoryListImpl),
  },
  {
    name: "memory_star",
    description: "Marcar/desmarcar fuente de memoria como favorita (las favoritas puntúan más alto en las búsquedas).",
    parameters: {
      type: "object",
      properties: {
        source_id: { type: "number" },
        starred: { type: "boolean", description: "true (default) para marcar, false para desmarcar" },
      },
      required: ["source_id"],
    },
    handler: wrap(memoryStarImpl),
  },
  {
    name: "memory_delete",
    description: "Eliminar fuente de memoria por ID.",
    parameters: {
      type: "object",
      properties: { source_id: { type: "number" } },
      required: ["source_id"],
    },
    handler: wrap(memoryDeleteImpl),
  },
  {
    name: "add_invoice_due_reminder",
    description:
      "Crear automáticamente un evento en Google Calendar X días antes del vencimiento de una factura concreta. Usa esto cuando el usuario diga 'recuérdame antes de que venza' o similar.",
    parameters: {
      type: "object",
      properties: {
        invoice_id: { type: "number" },
        days_before: { type: "number", description: "Días antes del vencimiento (default 3)" },
      },
      required: ["invoice_id"],
    },
    handler: wrap(addInvoiceDueReminderImpl),
  },
];

export const TOOLS_BY_NAME: Record<string, ToolDefinition> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);
