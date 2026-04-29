/**
 * Servicio Omnicanal — portado de Ten21 outbound.service.ts
 * Cola de mensajes con deduplicación, reintentos exponenciales
 * Canales: EMAIL (Resend), WHATSAPP (Meta Cloud API), PUSH (Web Push)
 */

import { db } from "@/db";
import { outboundMessages } from "@/db/schema";
import { eq, and, lte, gte, sql, desc } from "drizzle-orm";
import { retryWithBackoff } from "@/lib/retry";

export type MessageChannel = "EMAIL" | "WHATSAPP" | "PUSH";

// ═══ Enqueue ═══
export async function enqueueMessage(userId: string, data: {
  channel: MessageChannel;
  destination: string;
  subject?: string;
  body: string;
  eventType: string;
  sourceType?: string;
  sourceId?: string;
}): Promise<{ id: number }> {
  // Deduplicación: si ya existe un mensaje idéntico en los últimos 5 min, skip
  const fiveMinAgo = new Date(Date.now() - 5 * 60000);
  const existing = await db.select({ id: outboundMessages.id }).from(outboundMessages)
    .where(and(
      eq(outboundMessages.userId, userId),
      eq(outboundMessages.eventType, data.eventType),
      eq(outboundMessages.channel, data.channel),
      eq(outboundMessages.destination, data.destination),
      gte(outboundMessages.createdAt, fiveMinAgo)
    ))
    .limit(1);

  if (existing.length > 0) return { id: existing[0].id };

  const [inserted] = await db.insert(outboundMessages).values({
    userId,
    channel: data.channel,
    destination: data.destination,
    subject: data.subject || null,
    body: data.body,
    eventType: data.eventType,
    sourceType: data.sourceType || null,
    sourceId: data.sourceId || null,
  }).returning({ id: outboundMessages.id });

  return { id: inserted.id };
}

// ═══ Process Queue ═══
export async function processQueue(userId?: string): Promise<{ processed: number; sent: number; failed: number }> {
  const conditions = [
    eq(outboundMessages.status, "QUEUED"),
    sql`(${outboundMessages.nextAttemptAt} IS NULL OR ${outboundMessages.nextAttemptAt} <= NOW())`,
  ];
  if (userId) conditions.push(eq(outboundMessages.userId, userId));

  const messages = await db.select().from(outboundMessages)
    .where(and(...conditions))
    .orderBy(outboundMessages.createdAt)
    .limit(10);

  let sent = 0, failed = 0;

  for (const msg of messages) {
    await db.update(outboundMessages).set({ status: "PROCESSING" }).where(eq(outboundMessages.id, msg.id));

    try {
      if (msg.channel === "EMAIL") await sendEmail(msg.destination, msg.subject || "", msg.body);
      else if (msg.channel === "WHATSAPP") await sendWhatsApp(msg.destination, msg.body);
      else if (msg.channel === "PUSH") console.log(`[push] TODO: send push to ${msg.destination}`);

      await db.update(outboundMessages).set({ status: "SENT", sentAt: new Date(), attempts: (msg.attempts || 0) + 1 }).where(eq(outboundMessages.id, msg.id));
      sent++;
    } catch (e) {
      const error = e instanceof Error ? e.message : "Unknown";
      const newAttempts = (msg.attempts || 0) + 1;
      const maxAttempts = msg.maxAttempts || 3;
      const isFinal = newAttempts >= maxAttempts;

      await db.update(outboundMessages).set({
        status: isFinal ? "FAILED" : "QUEUED",
        attempts: newAttempts,
        lastError: error,
        nextAttemptAt: isFinal ? null : new Date(Date.now() + newAttempts * 60000),
      }).where(eq(outboundMessages.id, msg.id));
      failed++;
    }
  }

  return { processed: messages.length, sent, failed };
}

// ═══ List / Retry / Cancel ═══
export async function listMessages(userId: string) {
  return db.select().from(outboundMessages)
    .where(eq(outboundMessages.userId, userId))
    .orderBy(desc(outboundMessages.createdAt))
    .limit(50);
}

export async function retryMessage(id: number, userId: string) {
  await db.update(outboundMessages)
    .set({ status: "QUEUED", nextAttemptAt: new Date() })
    .where(and(eq(outboundMessages.id, id), eq(outboundMessages.userId, userId), eq(outboundMessages.status, "FAILED")));
}

export async function cancelMessage(id: number, userId: string) {
  await db.update(outboundMessages)
    .set({ status: "CANCELLED" })
    .where(and(eq(outboundMessages.id, id), eq(outboundMessages.userId, userId)));
}

// ═══ Channel Providers ═══
async function sendEmail(to: string, subject: string, body: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY no configurada");

  const fromName = process.env.RESEND_FROM_NAME || "Sinergia Mail";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@somossinergia.es";

  // retry con backoff: Resend tiene 502/503/429 ocasional; el queue ya reintenta
  // a alto nivel pero el retry de bajo nivel evita que un blip transitorio
  // marque el mensaje como FAILED prematuramente.
  await retryWithBackoff(async () => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to, subject, html: body }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const errBody = await res.text();
      const err = new Error(`Resend error: ${res.status} ${errBody}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
  }, { retries: 2, initialDelayMs: 500, label: "resend-send-email" });
}

async function sendWhatsApp(phone: string, body: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw new Error("WhatsApp no configurado");

  const apiUrl = process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v18.0";
  await retryWithBackoff(async () => {
    const res = await fetch(`${apiUrl}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { body } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const err = new Error(`WhatsApp error: ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
  }, { retries: 2, initialDelayMs: 500, label: "whatsapp-send" });
}
