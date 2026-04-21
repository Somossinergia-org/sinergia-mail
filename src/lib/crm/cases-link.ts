/**
 * CRM Cases Link Service — link/unlink cases to companies and opportunities.
 * Phase 2: minimal bridge between swarm cases and CRM entities.
 */

import { db } from "@/db";
import { cases } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

/** Link a case to a company */
export async function linkCaseToCompany(caseId: number, companyId: number) {
  const [updated] = await db
    .update(cases)
    .set({ companyId, updatedAt: new Date() })
    .where(eq(cases.id, caseId))
    .returning();
  return updated ?? null;
}

/** Unlink a case from its company */
export async function unlinkCaseFromCompany(caseId: number) {
  const [updated] = await db
    .update(cases)
    .set({ companyId: null, updatedAt: new Date() })
    .where(eq(cases.id, caseId))
    .returning();
  return updated ?? null;
}

/** Link a case to an opportunity */
export async function linkCaseToOpportunity(caseId: number, opportunityId: number) {
  const [updated] = await db
    .update(cases)
    .set({ opportunityId, updatedAt: new Date() })
    .where(eq(cases.id, caseId))
    .returning();
  return updated ?? null;
}

/** Unlink a case from its opportunity */
export async function unlinkCaseFromOpportunity(caseId: number) {
  const [updated] = await db
    .update(cases)
    .set({ opportunityId: null, updatedAt: new Date() })
    .where(eq(cases.id, caseId))
    .returning();
  return updated ?? null;
}

/** List cases linked to a company */
export async function listCasesByCompany(companyId: number, userId: string) {
  return db
    .select()
    .from(cases)
    .where(and(eq(cases.companyId, companyId), eq(cases.userId, userId)))
    .orderBy(desc(cases.updatedAt))
    .limit(50);
}

/** List cases linked to an opportunity */
export async function listCasesByOpportunity(opportunityId: number, userId: string) {
  return db
    .select()
    .from(cases)
    .where(and(eq(cases.opportunityId, opportunityId), eq(cases.userId, userId)))
    .orderBy(desc(cases.updatedAt))
    .limit(50);
}
