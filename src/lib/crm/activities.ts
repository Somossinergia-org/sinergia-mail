/**
 * Commercial Activities — CRUD + helpers for last activity, overdue follow-ups.
 *
 * Phase 8: Real commercial activity tracking on companies, contacts, opportunities.
 * All queries enforce userId ownership.
 */

import { db } from "@/db";
import { commercialActivities, companies } from "@/db/schema";
import { eq, and, desc, asc, lte, gt, isNotNull, sql, inArray } from "drizzle-orm";

// ─── Constants ─────────────────────────────────────────────────────────

export const ACTIVITY_TYPES = [
  "llamada", "email", "whatsapp", "visita", "nota", "seguimiento",
  "cambio_estado", "tarea_completada", "renovacion", "propuesta_enviada",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// ─── Create ────────────────────────────────────────────────────────────

export interface CreateActivityInput {
  userId: string;
  companyId: number;
  contactId?: number | null;
  opportunityId?: number | null;
  caseId?: number | null;
  serviceId?: number | null;
  type: ActivityType;
  summary: string;
  outcome?: string | null;
  nextStep?: string | null;
  dueAt?: Date | null;
}

export async function createActivity(input: CreateActivityInput) {
  const [row] = await db
    .insert(commercialActivities)
    .values({
      userId: input.userId,
      companyId: input.companyId,
      contactId: input.contactId ?? null,
      opportunityId: input.opportunityId ?? null,
      caseId: input.caseId ?? null,
      serviceId: input.serviceId ?? null,
      type: input.type,
      summary: input.summary,
      outcome: input.outcome ?? null,
      nextStep: input.nextStep ?? null,
      dueAt: input.dueAt ?? null,
    })
    .returning();
  return row;
}

// ─── List by company ───────────────────────────────────────────────────

export async function listActivitiesByCompany(
  companyId: number,
  userId: string,
  limit: number = 50,
) {
  return db
    .select()
    .from(commercialActivities)
    .where(
      and(
        eq(commercialActivities.companyId, companyId),
        eq(commercialActivities.userId, userId),
      ),
    )
    .orderBy(desc(commercialActivities.createdAt))
    .limit(limit);
}

// ─── List by opportunity ───────────────────────────────────────────────

export async function listActivitiesByOpportunity(
  opportunityId: number,
  userId: string,
  limit: number = 50,
) {
  return db
    .select()
    .from(commercialActivities)
    .where(
      and(
        eq(commercialActivities.opportunityId, opportunityId),
        eq(commercialActivities.userId, userId),
      ),
    )
    .orderBy(desc(commercialActivities.createdAt))
    .limit(limit);
}

// ─── Last activity for company ─────────────────────────────────────────

export async function getLastActivityForCompany(
  companyId: number,
  userId: string,
) {
  const [row] = await db
    .select()
    .from(commercialActivities)
    .where(
      and(
        eq(commercialActivities.companyId, companyId),
        eq(commercialActivities.userId, userId),
      ),
    )
    .orderBy(desc(commercialActivities.createdAt))
    .limit(1);
  return row ?? null;
}

// ─── Last activity for opportunity ─────────────────────────────────────

export async function getLastActivityForOpportunity(
  opportunityId: number,
  userId: string,
) {
  const [row] = await db
    .select()
    .from(commercialActivities)
    .where(
      and(
        eq(commercialActivities.opportunityId, opportunityId),
        eq(commercialActivities.userId, userId),
      ),
    )
    .orderBy(desc(commercialActivities.createdAt))
    .limit(1);
  return row ?? null;
}

// ─── Overdue follow-ups (nextStep with past dueAt) ─────────────────────

export async function getOverdueFollowUps(userId: string, limit: number = 30) {
  const now = new Date();
  return db
    .select({
      activity: commercialActivities,
      companyName: companies.name,
    })
    .from(commercialActivities)
    .innerJoin(companies, eq(commercialActivities.companyId, companies.id))
    .where(
      and(
        eq(commercialActivities.userId, userId),
        isNotNull(commercialActivities.nextStep),
        isNotNull(commercialActivities.dueAt),
        lte(commercialActivities.dueAt, now),
      ),
    )
    .orderBy(asc(commercialActivities.dueAt))
    .limit(limit);
}

// ─── Upcoming follow-ups (nextStep with future dueAt, within N days) ───

export async function getUpcomingFollowUps(
  userId: string,
  days: number = 7,
  limit: number = 30,
) {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return db
    .select({
      activity: commercialActivities,
      companyName: companies.name,
    })
    .from(commercialActivities)
    .innerJoin(companies, eq(commercialActivities.companyId, companies.id))
    .where(
      and(
        eq(commercialActivities.userId, userId),
        isNotNull(commercialActivities.nextStep),
        isNotNull(commercialActivities.dueAt),
        // Antes: sql`${col} > ${now}` — drizzle interpola Date como Buffer y rompe
        // con "expected string, received Date". Usar gt() helper que serializa bien.
        gt(commercialActivities.dueAt, now),
        lte(commercialActivities.dueAt, futureDate),
      ),
    )
    .orderBy(asc(commercialActivities.dueAt))
    .limit(limit);
}

// ─── Companies without recent activity ─────────────────────────────────

export async function getCompaniesWithoutRecentActivity(
  userId: string,
  days: number = 21,
  limit: number = 20,
) {
  // Sub-query: last activity date per company
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // Get all companies for this user
  const allCompanies = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.userId, userId));

  if (allCompanies.length === 0) return [];

  // Get last activity per company
  const companyIds = allCompanies.map((c) => c.id);
  const activities = await db
    .select({
      companyId: commercialActivities.companyId,
      lastDate: sql<Date>`MAX(${commercialActivities.createdAt})`.as("last_date"),
    })
    .from(commercialActivities)
    .where(
      and(
        eq(commercialActivities.userId, userId),
        inArray(commercialActivities.companyId, companyIds),
      ),
    )
    .groupBy(commercialActivities.companyId);

  const lastActivityMap = new Map(activities.map((a) => [a.companyId, a.lastDate]));

  // Companies with no activity or activity older than cutoff
  const stale = allCompanies
    .map((c) => {
      const last = lastActivityMap.get(c.id);
      const daysSince = last
        ? Math.floor((Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      return { companyId: c.id, companyName: c.name, lastActivityDate: last ?? null, daysSinceActivity: daysSince };
    })
    .filter((c) => c.daysSinceActivity >= days)
    .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);

  return stale.slice(0, limit);
}

// ─── Recent activity for user (global timeline) ─────────────────────────

export async function getRecentActivity(userId: string, limit: number = 30) {
  return db
    .select({
      activity: commercialActivities,
      companyName: companies.name,
    })
    .from(commercialActivities)
    .innerJoin(companies, eq(commercialActivities.companyId, companies.id))
    .where(eq(commercialActivities.userId, userId))
    .orderBy(desc(commercialActivities.createdAt))
    .limit(limit);
}
