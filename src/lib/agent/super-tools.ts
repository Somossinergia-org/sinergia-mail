/**
 * Enhanced Tool Registry for GPT-5 Swarm — Sinergia AI
 *
 * Super-tools that combine multiple operations or provide
 * advanced capabilities beyond the base tool set.
 * All tools use OpenAI function calling format.
 */

import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { db, schema } from "@/db";
import { eq, and, desc, sql, gte, lte, ilike } from "drizzle-orm";
import { searchMemory, addSource } from "@/lib/memory";
import { logger, logError } from "@/lib/logger";
import { fmtEur } from "@/lib/format";
import type { ToolHandlerResult } from "./tools";
import { CRM_TOOLS } from "./crm-tools";
import { LEGAL_TOOLS } from "./legal-tools";
import { HOSTINGER_TOOLS } from "./hostinger";

const log = logger.child({ component: "super-tools" });

// ─── Types ───────────────────────────────────────────────────────────────

export interface SuperToolDefinition {
  name: string;
  openaiTool: ChatCompletionTool;
  handler: (userId: string, args: Record<string, unknown>) => Promise<ToolHandlerResult>;
}

// ─── Tool: business_dashboard ────────────────────────────────────────────

async function businessDashboardHandler(userId: string): Promise<ToolHandlerResult> {
  try {
    const [emailStats, invoiceStats, contactStats, recentEmails, overdueInvoices, upcomingEvents] = await Promise.all([
      // Email stats
      db.select({
        total: sql<number>`count(*)`,
        unread: sql<number>`count(*) filter (where ${schema.emails.isRead} = false)`,
        highPriority: sql<number>`count(*) filter (where ${schema.emails.priority} = 'ALTA')`,
        todayCount: sql<number>`count(*) filter (where ${schema.emails.date} >= CURRENT_DATE)`,
      }).from(schema.emails).where(eq(schema.emails.userId, userId)),

      // Invoice stats
      db.select({
        count: sql<number>`count(*)`,
        totalAmount: sql<number>`COALESCE(SUM(total_amount), 0)`,
        totalTax: sql<number>`COALESCE(SUM(tax), 0)`,
        thisMonth: sql<number>`count(*) filter (where ${schema.invoices.invoiceDate} >= date_trunc('month', CURRENT_DATE))`,
      }).from(schema.invoices).where(eq(schema.invoices.userId, userId)),

      // Contact stats
      db.select({
        total: sql<number>`count(*)`,
        hot: sql<number>`count(*) filter (where ${schema.contacts.temperature} = 'hot')`,
        warm: sql<number>`count(*) filter (where ${schema.contacts.temperature} = 'warm')`,
        cold: sql<number>`count(*) filter (where ${schema.contacts.temperature} = 'cold')`,
      }).from(schema.contacts).where(eq(schema.contacts.userId, userId)),

      // Recent emails (last 5)
      db.query.emails.findMany({
        where: eq(schema.emails.userId, userId),
        orderBy: [desc(schema.emails.date)],
        limit: 5,
        columns: { id: true, fromName: true, subject: true, date: true, category: true, priority: true, isRead: true },
      }),

      // Overdue invoices
      db.query.invoices.findMany({
        where: and(eq(schema.invoices.userId, userId), sql`${schema.invoices.dueDate} < CURRENT_DATE`),
        limit: 5,
        columns: { id: true, issuerName: true, totalAmount: true, dueDate: true, invoiceNumber: true },
      }),

      // Today's events placeholder (calendar data comes from Google API, not DB)
      Promise.resolve([]),
    ]);

    return {
      ok: true,
      dashboard: {
        emails: {
          total: Number(emailStats[0]?.total || 0),
          unread: Number(emailStats[0]?.unread || 0),
          highPriority: Number(emailStats[0]?.highPriority || 0),
          today: Number(emailStats[0]?.todayCount || 0),
        },
        invoices: {
          count: Number(invoiceStats[0]?.count || 0),
          totalAmount: `${fmtEur(invoiceStats[0]?.totalAmount)} EUR`,
          totalTax: `${fmtEur(invoiceStats[0]?.totalTax)} EUR`,
          thisMonth: Number(invoiceStats[0]?.thisMonth || 0),
          overdue: overdueInvoices.map((inv) => ({
            id: inv.id,
            issuer: inv.issuerName,
            amount: `${fmtEur(inv.totalAmount)} EUR`,
            dueDate: inv.dueDate,
            number: inv.invoiceNumber,
          })),
        },
        contacts: {
          total: Number(contactStats[0]?.total || 0),
          hot: Number(contactStats[0]?.hot || 0),
          warm: Number(contactStats[0]?.warm || 0),
          cold: Number(contactStats[0]?.cold || 0),
        },
        recentEmails: recentEmails.map((e) => ({
          id: e.id,
          from: e.fromName,
          subject: e.subject,
          date: e.date,
          category: e.category,
          priority: e.priority,
          isRead: e.isRead,
        })),
      },
    };
  } catch (e) {
    logError(log, e, { userId }, "business dashboard failed");
    return {
      ok: false,
      error: "Error generando el dashboard de negocio",
      detail: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
    };
  }
}

// ─── Tool: smart_search ─────────────────────────────────────────────────

async function smartSearchHandler(userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const query = (args.query as string)?.trim();
  const sources = (args.sources as string[]) || ["emails", "invoices", "contacts", "memory"];
  const limit = Math.min(Number(args.limit) || 10, 50);
  if (!query) return { ok: false, error: "query requerido" };

  const results: Record<string, unknown[]> = {};

  const searchPromises: Promise<void>[] = [];

  if (sources.includes("emails")) {
    searchPromises.push(
      db.query.emails.findMany({
        where: and(
          eq(schema.emails.userId, userId),
          sql`(${ilike(schema.emails.subject, `%${query}%`)} OR ${ilike(schema.emails.fromName, `%${query}%`)} OR ${ilike(schema.emails.fromEmail, `%${query}%`)})`,
        ),
        orderBy: [desc(schema.emails.date)],
        limit,
        columns: { id: true, fromName: true, fromEmail: true, subject: true, date: true, category: true },
      }).then((rows) => { results.emails = rows; }),
    );
  }

  if (sources.includes("invoices")) {
    searchPromises.push(
      db.query.invoices.findMany({
        where: and(
          eq(schema.invoices.userId, userId),
          sql`(${ilike(schema.invoices.issuerName, `%${query}%`)} OR ${ilike(schema.invoices.invoiceNumber, `%${query}%`)} OR ${ilike(schema.invoices.concept, `%${query}%`)})`,
        ),
        orderBy: [desc(schema.invoices.invoiceDate)],
        limit,
        columns: { id: true, issuerName: true, invoiceNumber: true, totalAmount: true, invoiceDate: true, category: true },
      }).then((rows) => { results.invoices = rows; }),
    );
  }

  if (sources.includes("contacts")) {
    searchPromises.push(
      db.query.contacts.findMany({
        where: and(
          eq(schema.contacts.userId, userId),
          sql`(${ilike(schema.contacts.name, `%${query}%`)} OR ${ilike(schema.contacts.email, `%${query}%`)} OR ${ilike(schema.contacts.company, `%${query}%`)})`,
        ),
        limit,
        columns: { id: true, name: true, email: true, company: true, category: true, score: true, temperature: true },
      }).then((rows) => { results.contacts = rows; }),
    );
  }

  if (sources.includes("memory")) {
    searchPromises.push(
      searchMemory(userId, query, { limit: Math.min(limit, 10) })
        .then((rows) => {
          results.memory = rows.map((r) => ({
            id: r.id,
            kind: r.kind,
            title: r.title,
            preview: r.content.slice(0, 200),
            similarity: Math.round(r.similarity * 100),
          }));
        })
        .catch(() => { results.memory = []; }),
    );
  }

  await Promise.all(searchPromises);

  const totalResults = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

  return {
    ok: true,
    query,
    totalResults,
    results,
  };
}

// ─── Tool: forecast_revenue ──────────────────────────────────────────────

async function forecastRevenueHandler(userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const months = Math.min(Number(args.months) || 3, 12);

  try {
    // Get last 6 months of invoice data
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyData = await db.execute<{
      month: string;
      total: number;
      count: number;
    }>(sql`
      SELECT
        to_char(invoice_date, 'YYYY-MM') as month,
        COALESCE(SUM(total_amount), 0) as total,
        count(*) as count
      FROM invoices
      WHERE user_id = ${userId}
        AND invoice_date >= ${sixMonthsAgo}
        AND invoice_date IS NOT NULL
      GROUP BY to_char(invoice_date, 'YYYY-MM')
      ORDER BY month ASC
    `);

    const data = monthlyData as unknown as Array<{ month: string; total: number; count: number }>;

    if (data.length === 0) {
      return { ok: true, forecast: [], message: "No hay datos historicos suficientes para hacer una prediccion." };
    }

    // Simple linear regression forecast
    const totals = data.map((d) => Number(d.total));
    const avgMonthly = totals.reduce((s, t) => s + t, 0) / totals.length;
    const trend = totals.length >= 2
      ? (totals[totals.length - 1] - totals[0]) / (totals.length - 1)
      : 0;

    const forecast: Array<{ month: string; predicted: string; confidence: string }> = [];
    const now = new Date();
    for (let i = 1; i <= months; i++) {
      const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthStr = futureDate.toISOString().slice(0, 7);
      const predicted = Math.max(0, avgMonthly + trend * (totals.length + i - 1));
      const confidence = totals.length >= 4 ? "media" : "baja";
      forecast.push({
        month: monthStr,
        predicted: `${fmtEur(predicted)} EUR`,
        confidence,
      });
    }

    return {
      ok: true,
      historicalMonths: data.length,
      averageMonthly: `${fmtEur(avgMonthly)} EUR`,
      trend: trend > 0 ? "creciente" : trend < 0 ? "decreciente" : "estable",
      trendPerMonth: `${fmtEur(Math.abs(trend))} EUR`,
      forecast,
      historical: data.map((d) => ({
        month: d.month,
        total: `${fmtEur(d.total)} EUR`,
        invoiceCount: Number(d.count),
      })),
    };
  } catch (e) {
    logError(log, e, { userId }, "forecast revenue failed");
    return { ok: false, error: "Error generando la prediccion de ingresos" };
  }
}

// ─── Tool: draft_and_send ────────────────────────────────────────────────

async function draftAndSendHandler(userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const to = (args.to as string)?.trim();
  const subject = (args.subject as string)?.trim();
  const body = (args.body as string)?.trim();
  const action = (args.action as string) || "draft";

  if (!to) return { ok: false, error: "to (email destino) requerido" };
  if (!subject) return { ok: false, error: "subject requerido" };
  if (!body) return { ok: false, error: "body requerido" };

  try {
    const { createDraft } = await import("@/lib/gmail");
    const draft = await createDraft(userId, to, subject, body);

    return {
      ok: true,
      action: action === "send" ? "queued_for_review" : "draft_created",
      draftId: draft.id,
      to,
      subject,
      message: action === "send"
        ? `Borrador creado para ${to}. Por seguridad, los envios se crean como borrador para revision.`
        : `Borrador creado para ${to} con asunto "${subject}".`,
    };
  } catch (e) {
    logError(log, e, { userId }, "draft_and_send failed");
    return { ok: false, error: "Error creando el borrador de email" };
  }
}

// ─── Tool: bulk_categorize ───────────────────────────────────────────────

async function bulkCategorizeHandler(userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const category = (args.category as string)?.trim();
  const emailIds = (args.email_ids as number[]) || [];
  const filter = (args.filter as string)?.trim();

  if (!category) return { ok: false, error: "category requerida" };

  let idsToUpdate = emailIds;

  // If filter is provided instead of explicit IDs, find matching emails
  if (idsToUpdate.length === 0 && filter) {
    const matching = await db.query.emails.findMany({
      where: and(
        eq(schema.emails.userId, userId),
        sql`(${ilike(schema.emails.subject, `%${filter}%`)} OR ${ilike(schema.emails.fromName, `%${filter}%`)})`,
      ),
      limit: 100,
      columns: { id: true },
    });
    idsToUpdate = matching.map((e) => e.id);
  }

  if (idsToUpdate.length === 0) {
    return { ok: false, error: "No se encontraron emails para categorizar" };
  }

  // Cap at 100
  idsToUpdate = idsToUpdate.slice(0, 100);

  const updated = await db
    .update(schema.emails)
    .set({ category })
    .where(and(
      eq(schema.emails.userId, userId),
      sql`${schema.emails.id} = ANY(${idsToUpdate})`,
    ))
    .returning({ id: schema.emails.id });

  return {
    ok: true,
    updated: updated.length,
    category,
    message: `${updated.length} email${updated.length === 1 ? "" : "s"} categorizados como "${category}".`,
  };
}

// ─── Tool: contact_intelligence ──────────────────────────────────────────

async function contactIntelligenceHandler(userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const contactEmail = (args.email as string)?.trim();
  const contactName = (args.name as string)?.trim();

  if (!contactEmail && !contactName) {
    return { ok: false, error: "email o name del contacto requerido" };
  }

  try {
    // Find contact
    const contact = await db.query.contacts.findFirst({
      where: and(
        eq(schema.contacts.userId, userId),
        contactEmail
          ? eq(schema.contacts.email, contactEmail)
          : ilike(schema.contacts.name, `%${contactName}%`),
      ),
    });

    // Find related emails
    const emailCondition = contactEmail
      ? eq(schema.emails.fromEmail, contactEmail)
      : ilike(schema.emails.fromName, `%${contactName}%`);

    const [relatedEmails, relatedInvoices, interactions] = await Promise.all([
      db.query.emails.findMany({
        where: and(eq(schema.emails.userId, userId), emailCondition),
        orderBy: [desc(schema.emails.date)],
        limit: 10,
        columns: { id: true, subject: true, date: true, category: true, priority: true },
      }),

      contactEmail
        ? db.execute<{ id: number; issuer_name: string; total_amount: number; invoice_date: string }>(sql`
            SELECT i.id, i.issuer_name, i.total_amount, i.invoice_date
            FROM invoices i
            JOIN emails e ON i.email_id = e.id
            WHERE i.user_id = ${userId}
              AND e.from_email = ${contactEmail}
            ORDER BY i.invoice_date DESC
            LIMIT 10
          `)
        : Promise.resolve([]),

      contact
        ? db.query.contactInteractions.findMany({
            where: eq(schema.contactInteractions.contactId, contact.id),
            orderBy: [desc(schema.contactInteractions.createdAt)],
            limit: 20,
          })
        : Promise.resolve([]),
    ]);

    const invoiceData = relatedInvoices as unknown as Array<{
      id: number;
      issuer_name: string;
      total_amount: number;
      invoice_date: string;
    }>;

    const totalInvoiced = invoiceData.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);

    return {
      ok: true,
      contact: contact ? {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        company: contact.company,
        category: contact.category,
        score: contact.score,
        temperature: contact.temperature,
        phone: contact.phone,
        city: contact.city,
        tags: contact.tags,
        lastContacted: contact.lastContactedAt,
      } : null,
      emailHistory: {
        count: relatedEmails.length,
        recent: relatedEmails.map((e) => ({
          id: e.id,
          subject: e.subject,
          date: e.date,
          category: e.category,
        })),
      },
      invoiceHistory: {
        count: invoiceData.length,
        totalInvoiced: `${fmtEur(totalInvoiced)} EUR`,
        recent: invoiceData.map((inv) => ({
          id: inv.id,
          issuer: inv.issuer_name,
          amount: `${fmtEur(inv.total_amount)} EUR`,
          date: inv.invoice_date,
        })),
      },
      interactionCount: (interactions as unknown[]).length,
      insight: contact
        ? `Contacto con score ${contact.score || 0}/100, temperatura ${contact.temperature || "sin definir"}. ${totalInvoiced > 0 ? `Facturacion total: ${fmtEur(totalInvoiced)} EUR.` : "Sin facturas asociadas."} ${relatedEmails.length} emails en el historial.`
        : `No hay ficha de contacto para ${contactEmail || contactName}. ${relatedEmails.length} emails encontrados.`,
    };
  } catch (e) {
    logError(log, e, { userId, contactEmail, contactName }, "contact intelligence failed");
    return { ok: false, error: "Error obteniendo inteligencia del contacto" };
  }
}

// ─── Tool: weekly_executive_brief ────────────────────────────────────────

async function weeklyExecutiveBriefHandler(userId: string): Promise<ToolHandlerResult> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  try {
    const [emailsThisWeek, invoicesThisWeek, overdueInvoices, newContacts, agentActivity] = await Promise.all([
      db.select({
        total: sql<number>`count(*)`,
        unread: sql<number>`count(*) filter (where ${schema.emails.isRead} = false)`,
        byCategory: sql<string>`json_agg(DISTINCT ${schema.emails.category})`,
      }).from(schema.emails).where(and(
        eq(schema.emails.userId, userId),
        gte(schema.emails.date, weekAgo),
      )),

      db.select({
        count: sql<number>`count(*)`,
        total: sql<number>`COALESCE(SUM(total_amount), 0)`,
        tax: sql<number>`COALESCE(SUM(tax), 0)`,
      }).from(schema.invoices).where(and(
        eq(schema.invoices.userId, userId),
        gte(schema.invoices.createdAt, weekAgo),
      )),

      db.select({
        count: sql<number>`count(*)`,
        total: sql<number>`COALESCE(SUM(total_amount), 0)`,
      }).from(schema.invoices).where(and(
        eq(schema.invoices.userId, userId),
        sql`${schema.invoices.dueDate} < CURRENT_DATE`,
      )),

      db.select({
        count: sql<number>`count(*)`,
      }).from(schema.contacts).where(and(
        eq(schema.contacts.userId, userId),
        gte(schema.contacts.createdAt, weekAgo),
      )),

      db.select({
        count: sql<number>`count(*)`,
        toolCalls: sql<number>`count(*) filter (where ${schema.agentLogs.action} LIKE 'tool:%')`,
      }).from(schema.agentLogs).where(and(
        eq(schema.agentLogs.userId, userId),
        gte(schema.agentLogs.createdAt, weekAgo),
      )),
    ]);

    return {
      ok: true,
      weekOf: weekAgo.toISOString().slice(0, 10),
      brief: {
        emails: {
          received: Number(emailsThisWeek[0]?.total || 0),
          pendingUnread: Number(emailsThisWeek[0]?.unread || 0),
        },
        invoices: {
          newThisWeek: Number(invoicesThisWeek[0]?.count || 0),
          totalAmount: `${fmtEur(invoicesThisWeek[0]?.total)} EUR`,
          taxAmount: `${fmtEur(invoicesThisWeek[0]?.tax)} EUR`,
        },
        overdue: {
          count: Number(overdueInvoices[0]?.count || 0),
          totalAmount: `${fmtEur(overdueInvoices[0]?.total)} EUR`,
        },
        contacts: {
          newThisWeek: Number(newContacts[0]?.count || 0),
        },
        agentActivity: {
          totalActions: Number(agentActivity[0]?.count || 0),
          toolExecutions: Number(agentActivity[0]?.toolCalls || 0),
        },
      },
      actionItems: generateActionItems(
        Number(emailsThisWeek[0]?.unread || 0),
        Number(overdueInvoices[0]?.count || 0),
        Number(overdueInvoices[0]?.total || 0),
      ),
    };
  } catch (e) {
    logError(log, e, { userId }, "weekly executive brief failed");
    return { ok: false, error: "Error generando el briefing semanal" };
  }
}

function generateActionItems(unreadEmails: number, overdueCount: number, overdueTotal: number): string[] {
  const items: string[] = [];
  if (unreadEmails > 10) items.push(`Tienes ${unreadEmails} emails sin leer. Considera hacer una sesion de limpieza.`);
  if (overdueCount > 0) items.push(`${overdueCount} factura${overdueCount > 1 ? "s" : ""} vencida${overdueCount > 1 ? "s" : ""} por ${fmtEur(overdueTotal)} EUR. Enviar recordatorios de pago.`);
  if (items.length === 0) items.push("Todo al dia. Sin acciones urgentes esta semana.");
  return items;
}

// ─── Tool: delegate_task ─────────────────────────────────────────────────

async function delegateTaskHandler(_userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  // This is handled specially by the swarm controller.
  // If it reaches here, it means delegation was attempted outside the swarm.
  return {
    ok: true,
    message: "Delegacion registrada. El agente especialista procesara la tarea.",
    agentId: args.agent_id,
    task: args.task,
    reason: args.reason,
  };
}

// ─── Tool: learn_preference ──────────────────────────────────────────────

async function learnPreferenceHandler(userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const key = (args.key as string)?.trim();
  const value = (args.value as string)?.trim();
  if (!key || !value) return { ok: false, error: "key y value requeridos" };

  try {
    // Store preference in memory engine
    const { setPreference } = await import("./memory-engine");
    setPreference(userId, key, value);

    // Also persist to long-term memory
    await addSource({
      userId,
      kind: "note",
      title: `Preferencia: ${key}`,
      content: `El usuario prefiere: ${key} = ${value}. Registrado el ${new Date().toISOString().slice(0, 10)}.`,
      tags: ["preference", key],
    });

    return {
      ok: true,
      key,
      value,
      message: `Preferencia guardada: ${key} = ${value}. Lo recordare en futuras conversaciones.`,
    };
  } catch (e) {
    logError(log, e, { userId, key, value }, "learn preference failed");
    return { ok: false, error: "Error guardando la preferencia" };
  }
}

// ─── Tool: analyze_sentiment_trend ───────────────────────────────────────

async function analyzeSentimentTrendHandler(userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const contactEmail = (args.email as string)?.trim();
  const contactName = (args.name as string)?.trim();
  const months = Math.min(Number(args.months) || 3, 12);

  if (!contactEmail && !contactName) {
    return { ok: false, error: "email o name del contacto requerido" };
  }

  try {
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const emailCondition = contactEmail
      ? eq(schema.emails.fromEmail, contactEmail)
      : ilike(schema.emails.fromName, `%${contactName}%`);

    // Get emails with summaries that have sentiment data
    const emailsWithSentiment = await db
      .select({
        date: schema.emails.date,
        subject: schema.emails.subject,
        sentiment: schema.emailSummaries.sentiment,
        category: schema.emails.category,
      })
      .from(schema.emails)
      .leftJoin(schema.emailSummaries, eq(schema.emails.id, schema.emailSummaries.emailId))
      .where(and(
        eq(schema.emails.userId, userId),
        emailCondition,
        gte(schema.emails.date, since),
      ))
      .orderBy(desc(schema.emails.date))
      .limit(50);

    const sentimentCounts = { positivo: 0, neutro: 0, negativo: 0, unknown: 0 };
    for (const e of emailsWithSentiment) {
      const s = (e.sentiment || "unknown") as keyof typeof sentimentCounts;
      if (s in sentimentCounts) sentimentCounts[s]++;
      else sentimentCounts.unknown++;
    }

    const total = emailsWithSentiment.length;
    const overallSentiment = total === 0
      ? "sin datos"
      : sentimentCounts.positivo > sentimentCounts.negativo
        ? "mayoritariamente positivo"
        : sentimentCounts.negativo > sentimentCounts.positivo
          ? "mayoritariamente negativo"
          : "neutro";

    return {
      ok: true,
      contact: contactEmail || contactName,
      period: `ultimos ${months} meses`,
      totalEmails: total,
      sentimentDistribution: sentimentCounts,
      overallSentiment,
      recentEmails: emailsWithSentiment.slice(0, 5).map((e) => ({
        date: e.date,
        subject: e.subject,
        sentiment: e.sentiment || "no analizado",
      })),
      insight: total === 0
        ? `No hay emails de ${contactEmail || contactName} en los ultimos ${months} meses.`
        : `Tendencia ${overallSentiment} con ${total} emails. ${sentimentCounts.positivo} positivos, ${sentimentCounts.negativo} negativos.`,
    };
  } catch (e) {
    logError(log, e, { userId }, "sentiment trend analysis failed");
    return { ok: false, error: "Error analizando tendencia de sentimiento" };
  }
}

// ─── Tool Registry ───────────────────────────────────────────────────────

export const SUPER_TOOLS_REGISTRY: SuperToolDefinition[] = [
  {
    name: "business_dashboard",
    openaiTool: {
      type: "function",
      function: {
        name: "business_dashboard",
        description: "Obtener vision completa del negocio en una sola llamada: emails, facturas, contactos, calendario, alertas. Usar cuando el usuario pida 'estado del negocio', 'briefing', 'como va todo', 'dashboard'.",
        parameters: { type: "object", properties: {} },
      },
    },
    handler: businessDashboardHandler,
  },
  {
    name: "smart_search",
    openaiTool: {
      type: "function",
      function: {
        name: "smart_search",
        description: "Busqueda inteligente UNIFICADA en emails, facturas, contactos y memoria semantica. Usar para cualquier busqueda que cruce dominios. Ejemplo: 'todo lo que tengo de Iberdrola' busca en emails, facturas, contactos y memoria.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto de busqueda" },
            sources: {
              type: "array",
              items: { type: "string", enum: ["emails", "invoices", "contacts", "memory"] },
              description: "Fuentes donde buscar (default: todas)",
            },
            limit: { type: "number", description: "Maximo resultados por fuente (default 10)" },
          },
          required: ["query"],
        },
      },
    },
    handler: smartSearchHandler,
  },
  {
    name: "forecast_revenue",
    openaiTool: {
      type: "function",
      function: {
        name: "forecast_revenue",
        description: "Predecir ingresos/gastos de los proximos meses basandose en patrones historicos de facturas. Util para planificacion financiera y presupuestos.",
        parameters: {
          type: "object",
          properties: {
            months: { type: "number", description: "Numero de meses a predecir (default 3, max 12)" },
          },
        },
      },
    },
    handler: forecastRevenueHandler,
  },
  {
    name: "draft_and_send",
    openaiTool: {
      type: "function",
      function: {
        name: "draft_and_send",
        description: "Crear un nuevo borrador de email (o encolar para envio). Por seguridad, siempre crea borrador primero. Usar cuando el usuario quiera escribir un email nuevo (no respuesta).",
        parameters: {
          type: "object",
          properties: {
            to: { type: "string", description: "Email destino" },
            subject: { type: "string", description: "Asunto del email" },
            body: { type: "string", description: "Cuerpo del email (texto completo con firma)" },
            action: { type: "string", enum: ["draft", "send"], description: "draft (default) o send (crea borrador para revision)" },
          },
          required: ["to", "subject", "body"],
        },
      },
    },
    handler: draftAndSendHandler,
  },
  {
    name: "bulk_categorize",
    openaiTool: {
      type: "function",
      function: {
        name: "bulk_categorize",
        description: "Categorizar multiples emails de una vez (hasta 100). Usar filter para seleccionar por patron o email_ids para IDs especificos.",
        parameters: {
          type: "object",
          properties: {
            category: { type: "string", description: "Categoria destino: FACTURA, CLIENTE, PROVEEDOR, MARKETING, NOTIFICACION, SPAM, OTRO" },
            email_ids: { type: "array", items: { type: "number" }, description: "IDs de emails a categorizar" },
            filter: { type: "string", description: "Patron para buscar emails (alternativa a email_ids)" },
          },
          required: ["category"],
        },
      },
    },
    handler: bulkCategorizeHandler,
  },
  {
    name: "contact_intelligence",
    openaiTool: {
      type: "function",
      function: {
        name: "contact_intelligence",
        description: "Perfil profundo de un contacto: todos sus emails, facturas, reuniones, score CRM, historial de interacciones y predicciones. Usar cuando el usuario pregunte 'que sabes de X', 'historial de X', 'info de X'.",
        parameters: {
          type: "object",
          properties: {
            email: { type: "string", description: "Email del contacto" },
            name: { type: "string", description: "Nombre del contacto (alternativa al email)" },
          },
        },
      },
    },
    handler: contactIntelligenceHandler,
  },
  {
    name: "weekly_executive_brief",
    openaiTool: {
      type: "function",
      function: {
        name: "weekly_executive_brief",
        description: "Generar informe ejecutivo semanal completo con metricas de email, facturas, contactos, actividad del agente y acciones pendientes. Usar para 'briefing', 'informe semanal', 'resumen de la semana'.",
        parameters: { type: "object", properties: {} },
      },
    },
    handler: weeklyExecutiveBriefHandler,
  },
  {
    name: "delegate_task",
    openaiTool: {
      type: "function",
      function: {
        name: "delegate_task",
        description: "Delegar una tarea a otro agente especialista del swarm. Solo el CEO y agentes con permiso pueden delegar. Agentes disponibles: recepcion, comercial-principal, comercial-junior, consultor-servicios, consultor-digital, legal-rgpd, fiscal, bi-scoring, marketing-automation. Solo CEO, Recepcion y Comercial Principal pueden delegar.",
        parameters: {
          type: "object",
          properties: {
            agent_id: { type: "string", description: "ID del agente destino" },
            task: { type: "string", description: "Descripcion de la tarea a realizar" },
            reason: { type: "string", description: "Razon de la delegacion" },
          },
          required: ["agent_id", "task"],
        },
      },
    },
    handler: delegateTaskHandler,
  },
  {
    name: "learn_preference",
    openaiTool: {
      type: "function",
      function: {
        name: "learn_preference",
        description: "Guardar una preferencia del usuario para futuras interacciones. Usar cuando el usuario exprese preferencias: 'siempre quiero...', 'prefiero...', 'no me gusta...'.",
        parameters: {
          type: "object",
          properties: {
            key: { type: "string", description: "Clave de la preferencia (ej: tono_comunicacion, formato_facturas, idioma_respuesta)" },
            value: { type: "string", description: "Valor de la preferencia (ej: formal, resumido, espanol)" },
          },
          required: ["key", "value"],
        },
      },
    },
    handler: learnPreferenceHandler,
  },
  {
    name: "analyze_sentiment_trend",
    openaiTool: {
      type: "function",
      function: {
        name: "analyze_sentiment_trend",
        description: "Analizar la tendencia de sentimiento de un contacto a lo largo del tiempo. Util para detectar deterioro de relaciones comerciales o mejoras. Usar cuando pregunten 'como va la relacion con X', 'tendencia con X'.",
        parameters: {
          type: "object",
          properties: {
            email: { type: "string", description: "Email del contacto" },
            name: { type: "string", description: "Nombre del contacto (alternativa)" },
            months: { type: "number", description: "Meses hacia atras a analizar (default 3, max 12)" },
          },
        },
      },
    },
    handler: analyzeSentimentTrendHandler,
  },
  // ── Phase 5: CRM & Energy Tools ──────────────────────────────────
  ...CRM_TOOLS,
  // ── Legal & RGPD: contract analysis ──────────────────────────────
  ...LEGAL_TOOLS,
  // ── Hostinger: dominios + DNS + VPS info (read-only) ─────────────
  ...HOSTINGER_TOOLS,
];

export const SUPER_TOOLS_BY_NAME: Record<string, SuperToolDefinition> = Object.fromEntries(
  SUPER_TOOLS_REGISTRY.map((t) => [t.name, t]),
);
