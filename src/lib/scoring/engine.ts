import { db, schema } from "@/db";
import { eq, and, gte, desc, sql, count } from "drizzle-orm";

// ═══════ TYPES ═══════

export interface ScoreBreakdown {
  contactId: number;
  contactName: string | null;
  contactEmail: string;
  score: number;
  recency: number;
  frequency: number;
  monetary: number;
  engagement: number;
  velocity: number;
  bonuses: number;
  penalties: number;
  temperature: "hot" | "warm" | "cold";
  signals: string[];
}

export interface ContactPrediction {
  contactId: number;
  contactName: string | null;
  likelihoodToRespond: number; // 0-100
  churnRisk: number; // 0-100
  readyToClose: number; // 0-100
  nextBestAction: string;
  reasoning: string;
}

export interface TrendData {
  date: string;
  score: number;
}

// ═══════ HELPERS ═══════

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}

function linearScale(value: number, minVal: number, maxVal: number, minOut: number, maxOut: number): number {
  if (maxVal === minVal) return maxOut;
  const ratio = clamp((value - minVal) / (maxVal - minVal), 0, 1);
  return minOut + ratio * (maxOut - minOut);
}

// ═══════ SCORING ENGINE ═══════

export async function calculateContactScore(userId: string, contactId: number): Promise<ScoreBreakdown> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Fetch contact
  const [contact] = await db
    .select()
    .from(schema.contacts)
    .where(and(eq(schema.contacts.userId, userId), eq(schema.contacts.id, contactId)))
    .limit(1);

  if (!contact) {
    throw new Error(`Contact ${contactId} not found`);
  }

  // Fetch interactions (last 90 days)
  const recentInteractions = await db
    .select()
    .from(schema.contactInteractions)
    .where(
      and(
        eq(schema.contactInteractions.userId, userId),
        eq(schema.contactInteractions.contactId, contactId),
        gte(schema.contactInteractions.createdAt, ninetyDaysAgo)
      )
    )
    .orderBy(desc(schema.contactInteractions.createdAt));

  // Fetch all interactions (for velocity calculation)
  const allInteractions = await db
    .select()
    .from(schema.contactInteractions)
    .where(
      and(
        eq(schema.contactInteractions.userId, userId),
        eq(schema.contactInteractions.contactId, contactId)
      )
    )
    .orderBy(desc(schema.contactInteractions.createdAt));

  // Check for active sequence enrollments
  const activeEnrollments = await db
    .select()
    .from(schema.sequenceEnrollments)
    .where(
      and(
        eq(schema.sequenceEnrollments.contactEmail, contact.email),
        eq(schema.sequenceEnrollments.status, "active")
      )
    )
    .limit(1);

  // Check for overdue invoices (received invoices from this contact)
  const overdueInvoices = await db
    .select()
    .from(schema.issuedInvoices)
    .where(
      and(
        eq(schema.issuedInvoices.userId, userId),
        eq(schema.issuedInvoices.clientEmail, contact.email),
        sql`${schema.issuedInvoices.dueDate} < NOW()`,
        sql`${schema.issuedInvoices.status} NOT IN ('paid', 'cancelled')`
      )
    )
    .limit(1);

  const signals: string[] = [];

  // ── RECENCY (0-25) ──
  let recency = 0;
  const lastInteraction = allInteractions[0]?.createdAt;
  if (lastInteraction) {
    const daysSince = daysBetween(now, lastInteraction);
    recency = linearScale(daysSince, 0, 30, 25, 0);
    if (daysSince <= 1) signals.push("Contacto muy reciente (hoy/ayer)");
    if (daysSince > 30) signals.push("Sin contacto en 30+ dias");
  }

  // ── FREQUENCY (0-25) ──
  const totalRecent = recentInteractions.length;
  const frequency = linearScale(totalRecent, 0, 10, 0, 25);
  if (totalRecent >= 10) signals.push("Alta frecuencia de interacciones");

  // ── MONETARY (0-25) ──
  const totalInvoiced = contact.totalInvoiced ?? 0;
  const monetary = linearScale(totalInvoiced, 0, 10000, 0, 25);
  if (totalInvoiced > 10000) signals.push("Alto volumen facturado (>10.000EUR)");

  // ── ENGAGEMENT (0-15) ──
  const emailsSent = contact.emailsSent ?? 0;
  const emailsOpened = contact.emailsOpened ?? 0;
  const emailsReceived = contact.emailsReceived ?? 0;
  const openRate = emailsSent > 0 ? emailsOpened / emailsSent : 0;
  const responseRate = emailsSent > 0 ? emailsReceived / emailsSent : 0;
  const engagement = clamp(openRate * 7.5 + responseRate * 7.5, 0, 15);
  if (openRate > 0.5) signals.push("Alta tasa de apertura de emails");
  if (responseRate > 0.3) signals.push("Buena tasa de respuesta");

  // ── VELOCITY (0-10) ──
  // Compare interactions in last 45 days vs previous 45 days
  const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  const recentHalf = recentInteractions.filter(
    (i) => i.createdAt && i.createdAt >= fortyFiveDaysAgo
  ).length;
  const olderHalf = recentInteractions.filter(
    (i) => i.createdAt && i.createdAt < fortyFiveDaysAgo
  ).length;
  let velocity = 5; // neutral
  if (olderHalf > 0) {
    const ratio = recentHalf / olderHalf;
    if (ratio > 1.5) {
      velocity = 10;
      signals.push("Frecuencia de interaccion en aumento");
    } else if (ratio > 1) {
      velocity = 7;
    } else if (ratio < 0.5) {
      velocity = 0;
      signals.push("Frecuencia de interaccion en descenso");
    } else {
      velocity = 3;
    }
  } else if (recentHalf > 0) {
    velocity = 8;
    signals.push("Nuevo contacto con actividad reciente");
  } else {
    velocity = 0;
  }

  // ── BONUSES ──
  let bonuses = 0;

  // Active sequence enrollment
  if (activeEnrollments.length > 0) {
    bonuses += 5;
    signals.push("Inscrito en secuencia de emails activa");
  }

  // Responded within 24h to last email
  const lastSent = allInteractions.find((i) => i.type === "email_sent");
  const lastReceived = allInteractions.find((i) => i.type === "email_received");
  if (lastSent?.createdAt && lastReceived?.createdAt) {
    if (
      lastReceived.createdAt > lastSent.createdAt &&
      daysBetween(lastReceived.createdAt, lastSent.createdAt) < 1
    ) {
      bonuses += 5;
      signals.push("Respondio en menos de 24h al ultimo email");
    }
  }

  // Multiple channels
  const channelTypes = new Set(allInteractions.map((i) => i.type));
  const channelDiversity = ["email_sent", "email_received", "whatsapp", "meeting", "call"].filter(
    (t) => channelTypes.has(t)
  ).length;
  if (channelDiversity >= 3) {
    bonuses += 10;
    signals.push("Multiples canales de comunicacion");
  }

  // ── PENALTIES ──
  let penalties = 0;

  // Overdue invoice
  if (overdueInvoices.length > 0) {
    penalties += 10;
    signals.push("Tiene factura(s) vencida(s) sin pagar");
  }

  // No contact in 30+ days
  if (lastInteraction && daysBetween(now, lastInteraction) > 30) {
    penalties += 15;
  }

  // ── FINAL SCORE ──
  const rawScore = recency + frequency + monetary + engagement + velocity + bonuses - penalties;
  const score = clamp(Math.round(rawScore), 0, 100);

  const temperature: "hot" | "warm" | "cold" =
    score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";

  // Update contact in DB
  await db
    .update(schema.contacts)
    .set({
      score,
      scoreEmail: Math.round(engagement),
      scoreInvoice: Math.round(monetary),
      scoreActivity: Math.round(frequency),
      temperature,
      updatedAt: now,
    })
    .where(and(eq(schema.contacts.userId, userId), eq(schema.contacts.id, contactId)));

  return {
    contactId,
    contactName: contact.name,
    contactEmail: contact.email,
    score,
    recency: Math.round(recency),
    frequency: Math.round(frequency),
    monetary: Math.round(monetary),
    engagement: Math.round(engagement),
    velocity: Math.round(velocity),
    bonuses,
    penalties,
    temperature,
    signals,
  };
}

export async function batchScoreAllContacts(
  userId: string
): Promise<{ updated: number; avgScore: number }> {
  const contacts = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(eq(schema.contacts.userId, userId));

  let totalScore = 0;
  let updated = 0;

  for (const c of contacts) {
    try {
      const result = await calculateContactScore(userId, c.id);
      totalScore += result.score;
      updated++;
    } catch {
      // Skip contacts that fail
    }
  }

  return {
    updated,
    avgScore: updated > 0 ? Math.round(totalScore / updated) : 0,
  };
}

export async function predictContactBehavior(
  userId: string,
  contactId: number
): Promise<ContactPrediction> {
  const breakdown = await calculateContactScore(userId, contactId);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Fetch recent interactions for pattern analysis
  const recentInteractions = await db
    .select()
    .from(schema.contactInteractions)
    .where(
      and(
        eq(schema.contactInteractions.userId, userId),
        eq(schema.contactInteractions.contactId, contactId),
        gte(schema.contactInteractions.createdAt, thirtyDaysAgo)
      )
    )
    .orderBy(desc(schema.contactInteractions.createdAt));

  // Fetch all contacts to build a baseline
  const allContacts = await db
    .select({
      score: schema.contacts.score,
      emailsSent: schema.contacts.emailsSent,
      emailsReceived: schema.contacts.emailsReceived,
      emailsOpened: schema.contacts.emailsOpened,
      totalInvoiced: schema.contacts.totalInvoiced,
    })
    .from(schema.contacts)
    .where(eq(schema.contacts.userId, userId));

  // Find contacts with similar scores (within 15 points) to predict behavior
  const similarContacts = allContacts.filter(
    (c) => c.score !== null && Math.abs((c.score ?? 0) - breakdown.score) <= 15
  );

  // Likelihood to respond: based on engagement + recency + response patterns
  const responseRate =
    (breakdown.engagement / 15) * 0.4 +
    (breakdown.recency / 25) * 0.3 +
    (breakdown.velocity / 10) * 0.3;
  const likelihoodToRespond = clamp(Math.round(responseRate * 100), 0, 100);

  // Churn risk: inverse of score + penalty for declining velocity
  const velocityPenalty = breakdown.velocity < 3 ? 20 : 0;
  const recencyPenalty = breakdown.recency < 5 ? 25 : 0;
  const churnRisk = clamp(
    Math.round(100 - breakdown.score + velocityPenalty + recencyPenalty) / 2,
    0,
    100
  );

  // Ready to close: high monetary + high engagement + recent contact
  const closeReadiness =
    (breakdown.monetary / 25) * 0.4 +
    (breakdown.engagement / 15) * 0.3 +
    (breakdown.frequency / 25) * 0.3;
  const readyToClose = clamp(Math.round(closeReadiness * 100), 0, 100);

  // Determine next best action
  let nextBestAction: string;
  let reasoning: string;

  if (breakdown.recency < 5 && breakdown.engagement > 8) {
    nextBestAction = "Enviar propuesta comercial";
    reasoning =
      "El contacto no ha sido contactado recientemente pero tiene alta tasa de engagement historica. Una propuesta directa podria reactivarlo.";
  } else if (breakdown.velocity < 3 && breakdown.score > 40) {
    nextBestAction = "Programar llamada de seguimiento";
    reasoning =
      "La frecuencia de interaccion esta descendiendo. Una llamada personal puede frenar la perdida de interes.";
  } else if (breakdown.penalties > 0 && breakdown.signals.includes("Tiene factura(s) vencida(s) sin pagar")) {
    nextBestAction = "Gestionar cobro pendiente";
    reasoning =
      "Hay facturas vencidas. Resolver la situacion financiera antes de cualquier accion comercial.";
  } else if (breakdown.score >= 70) {
    nextBestAction = "Enviar oferta personalizada";
    reasoning =
      "Contacto caliente con alto score. Es el momento ideal para una oferta o upgrade.";
  } else if (breakdown.score >= 40) {
    nextBestAction = "Enviar contenido de valor";
    reasoning =
      "Contacto templado. Nutrirlo con contenido relevante antes de hacer una propuesta directa.";
  } else {
    nextBestAction = "Incluir en secuencia de reactivacion";
    reasoning =
      "Contacto frio. Una secuencia automatizada de emails puede intentar recalentar la relacion sin inversion de tiempo manual.";
  }

  return {
    contactId,
    contactName: breakdown.contactName,
    likelihoodToRespond,
    churnRisk,
    readyToClose,
    nextBestAction,
    reasoning,
  };
}

export async function getScoreTrend(
  userId: string,
  contactId: number,
  days: number
): Promise<TrendData[]> {
  // Simulate historical score trend based on interactions
  // We calculate what the score "would have been" at each day looking back
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const allInteractions = await db
    .select()
    .from(schema.contactInteractions)
    .where(
      and(
        eq(schema.contactInteractions.userId, userId),
        eq(schema.contactInteractions.contactId, contactId)
      )
    )
    .orderBy(desc(schema.contactInteractions.createdAt));

  const [contact] = await db
    .select()
    .from(schema.contacts)
    .where(and(eq(schema.contacts.userId, userId), eq(schema.contacts.id, contactId)))
    .limit(1);

  if (!contact) return [];

  const trend: TrendData[] = [];
  const intervalDays = Math.max(1, Math.floor(days / 30));

  for (let d = 0; d <= days; d += intervalDays) {
    const pointDate = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);
    const ninetyBefore = new Date(pointDate.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Count interactions in the 90 days before this point
    const relevantInteractions = allInteractions.filter(
      (i) => i.createdAt && i.createdAt >= ninetyBefore && i.createdAt <= pointDate
    );

    // Simple approximation of score at that date
    const freqScore = linearScale(relevantInteractions.length, 0, 10, 0, 25);

    // Most recent interaction before this point
    const lastBefore = allInteractions.find(
      (i) => i.createdAt && i.createdAt <= pointDate
    );
    let recencyScore = 0;
    if (lastBefore?.createdAt) {
      const daysSince = daysBetween(pointDate, lastBefore.createdAt);
      recencyScore = linearScale(daysSince, 0, 30, 25, 0);
    }

    // Monetary stays roughly constant
    const monetaryScore = linearScale(contact.totalInvoiced ?? 0, 0, 10000, 0, 25);

    const approxScore = clamp(
      Math.round(recencyScore + freqScore + monetaryScore + 5), // +5 baseline for engagement/velocity
      0,
      100
    );

    trend.push({
      date: pointDate.toISOString().split("T")[0],
      score: approxScore,
    });
  }

  return trend;
}
