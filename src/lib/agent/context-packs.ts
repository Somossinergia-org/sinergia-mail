/**
 * Context Packs — adaptado de Ten21 buildContextPack()
 * Pre-carga datos relevantes del dominio ANTES de que el agente responda.
 * Elimina la necesidad de que el usuario haga múltiples tool calls.
 */

import { db } from "@/db";
import { emails, invoices, contacts, issuedInvoices, memorySources, memoryRules } from "@/db/schema";
import { eq, sql, desc, and, gte, isNull } from "drizzle-orm";

export interface ContextPack {
  agentCode: string;
  generatedAt: string;
  data: Record<string, unknown>;
}

// Cache en memoria — 5 minutos de TTL
const cache = new Map<string, { pack: ContextPack; expiresAt: number }>();

export async function buildContextPack(userId: string, agentCode: string): Promise<ContextPack> {
  const key = `${userId}:${agentCode}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.pack;

  const now = new Date();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  let data: Record<string, unknown> = {};

  try {
    if (agentCode === "email-manager" || agentCode === "orchestrator") {
      const [totalEmails, unread, todayEmails, rulesCount] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(emails).where(and(eq(emails.userId, userId), isNull(emails.deletedAt))),
        db.select({ count: sql<number>`count(*)` }).from(emails).where(and(eq(emails.userId, userId), eq(emails.isRead, false), isNull(emails.deletedAt))),
        db.select({ count: sql<number>`count(*)` }).from(emails).where(and(eq(emails.userId, userId), gte(emails.date, today), isNull(emails.deletedAt))),
        db.select({ count: sql<number>`count(*)` }).from(memoryRules).where(and(eq(memoryRules.userId, userId), eq(memoryRules.enabled, true))),
      ]);
      data = { totalEmails: totalEmails[0]?.count || 0, sinLeer: unread[0]?.count || 0, emailsHoy: todayEmails[0]?.count || 0, reglasActivas: rulesCount[0]?.count || 0 };
    }

    if (agentCode === "fiscal-agent" || agentCode === "orchestrator") {
      const [totalInv, pendientes, vencidas, ivaData, emitidas] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(invoices).where(eq(invoices.userId, userId)),
        db.select({ count: sql<number>`count(*)` }).from(invoices).where(and(eq(invoices.userId, userId), eq(invoices.processed, false))),
        db.select({ count: sql<number>`count(*)` }).from(invoices).where(and(eq(invoices.userId, userId), sql`due_date < NOW()`, sql`due_date IS NOT NULL`)),
        db.select({ total: sql<number>`COALESCE(SUM(tax), 0)` }).from(invoices).where(and(eq(invoices.userId, userId), gte(invoices.invoiceDate, new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)))),
        db.select({ count: sql<number>`count(*)`, total: sql<number>`COALESCE(SUM(total), 0)` }).from(issuedInvoices).where(eq(issuedInvoices.userId, userId)),
      ]);
      data = {
        ...data,
        facturasRecibidas: totalInv[0]?.count || 0,
        facturasPendientes: pendientes[0]?.count || 0,
        facturasVencidas: vencidas[0]?.count || 0,
        ivaSoportadoTrimestre: ivaData[0]?.total || 0,
        facturasEmitidas: emitidas[0]?.count || 0,
        totalFacturado: emitidas[0]?.total || 0,
      };
    }

    if (agentCode === "crm-agent" || agentCode === "orchestrator") {
      const [totalContacts, recentContacts] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(contacts).where(eq(contacts.userId, userId)),
        db.select({ count: sql<number>`count(*)` }).from(contacts).where(and(eq(contacts.userId, userId), gte(contacts.lastEmailDate, weekAgo))),
      ]);
      data = { ...data, totalContactos: totalContacts[0]?.count || 0, contactosActivos7d: recentContacts[0]?.count || 0 };
    }

    if (agentCode === "energy-analyst") {
      // Count facturas con categoría energía
      const energyInv = await db.select({ count: sql<number>`count(*)` }).from(invoices).where(and(eq(invoices.userId, userId), sql`LOWER(category) LIKE '%energ%' OR LOWER(issuer_name) LIKE '%endesa%' OR LOWER(issuer_name) LIKE '%iberdrola%' OR LOWER(issuer_name) LIKE '%naturgy%'`));
      data = { ...data, facturasEnergeticas: energyInv[0]?.count || 0 };
    }

    if (agentCode === "automation-agent") {
      const rules = await db.select({ count: sql<number>`count(*)` }).from(memoryRules).where(eq(memoryRules.userId, userId));
      const memories = await db.select({ count: sql<number>`count(*)` }).from(memorySources).where(eq(memorySources.userId, userId));
      data = { ...data, totalReglas: rules[0]?.count || 0, totalMemorias: memories[0]?.count || 0 };
    }
  } catch (err) {
    console.error("[context-pack] Error building context:", err);
    data = { error: "Error cargando contexto", agentCode };
  }

  const pack: ContextPack = { agentCode, generatedAt: now.toISOString(), data };
  cache.set(key, { pack, expiresAt: Date.now() + 5 * 60000 });
  return pack;
}

export function invalidateContextCache(userId: string) {
  const keys = Array.from(cache.keys());
  for (const key of keys) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}
