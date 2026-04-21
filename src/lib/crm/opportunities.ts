/**
 * Opportunities Service — Sales pipeline CRUD.
 * Phase 1: basic CRUD + pipeline stats.
 */

import { db } from "@/db";
import { opportunities, type NewOpportunity } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import type { OpportunityFilters, PipelineStatus, PIPELINE_STATUSES } from "./types";

export async function createOpportunity(data: NewOpportunity) {
  const [opp] = await db.insert(opportunities).values(data).returning();
  return opp;
}

export async function getOpportunity(id: number) {
  const [opp] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, id))
    .limit(1);
  return opp ?? null;
}

export async function listOpportunities(filters: OpportunityFilters) {
  const { userId, companyId, status, temperature, priority, limit = 50, offset = 0 } = filters;

  const conditions = [eq(opportunities.userId, userId)];
  if (companyId) conditions.push(eq(opportunities.companyId, companyId));
  if (status) conditions.push(eq(opportunities.status, status));
  if (temperature) conditions.push(eq(opportunities.temperature, temperature));
  if (priority) conditions.push(eq(opportunities.priority, priority));

  return db
    .select()
    .from(opportunities)
    .where(and(...conditions))
    .orderBy(desc(opportunities.updatedAt))
    .limit(limit)
    .offset(offset);
}

export async function updateOpportunity(id: number, data: Partial<NewOpportunity>) {
  const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };

  // Auto-set closedAt when moving to terminal states
  if (data.status === "cliente_activo" || data.status === "perdido") {
    updateData.closedAt = new Date();
  }

  const [updated] = await db
    .update(opportunities)
    .set(updateData)
    .where(eq(opportunities.id, id))
    .returning();
  return updated ?? null;
}

export async function updateOpportunityStatus(id: number, status: PipelineStatus, reason?: string) {
  const updateData: Record<string, unknown> = { status, updatedAt: new Date() };
  if (status === "cliente_activo" || status === "perdido") {
    updateData.closedAt = new Date();
  }
  if (status === "perdido" && reason) {
    updateData.lostReason = reason;
  }

  const [updated] = await db
    .update(opportunities)
    .set(updateData)
    .where(eq(opportunities.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteOpportunity(id: number) {
  const [deleted] = await db
    .delete(opportunities)
    .where(eq(opportunities.id, id))
    .returning({ id: opportunities.id });
  return deleted ?? null;
}

/** Pipeline stats: count of opportunities per status for a user */
export async function getPipelineStats(userId: string) {
  const rows = await db
    .select({
      status: opportunities.status,
      count: sql<number>`count(*)`,
      totalValue: sql<number>`COALESCE(SUM(estimated_value_eur), 0)`,
    })
    .from(opportunities)
    .where(eq(opportunities.userId, userId))
    .groupBy(opportunities.status);

  return rows;
}
