/**
 * Supply Points Service — Energy supply point CRUD.
 * Phase 1: basic CRUD. Bill parser integration in Phase 3.
 */

import { db } from "@/db";
import { supplyPoints, type NewSupplyPoint } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function createSupplyPoint(data: NewSupplyPoint) {
  const [sp] = await db.insert(supplyPoints).values(data).returning();
  return sp;
}

export async function getSupplyPoint(id: number) {
  const [sp] = await db
    .select()
    .from(supplyPoints)
    .where(eq(supplyPoints.id, id))
    .limit(1);
  return sp ?? null;
}

/**
 * Look up a supply point by CUPS, scoped to a specific company.
 * Phase 3.5: prevents cross-tenant CUPS reuse. companyId is mandatory.
 */
export async function getSupplyPointByCups(cups: string, companyId: number) {
  const [sp] = await db
    .select()
    .from(supplyPoints)
    .where(and(eq(supplyPoints.cups, cups), eq(supplyPoints.companyId, companyId)))
    .limit(1);
  return sp ?? null;
}

export async function listSupplyPointsByCompany(companyId: number) {
  return db
    .select()
    .from(supplyPoints)
    .where(eq(supplyPoints.companyId, companyId))
    .orderBy(desc(supplyPoints.updatedAt));
}

export async function updateSupplyPoint(id: number, data: Partial<NewSupplyPoint>) {
  const [updated] = await db
    .update(supplyPoints)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(supplyPoints.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteSupplyPoint(id: number) {
  const [deleted] = await db
    .delete(supplyPoints)
    .where(eq(supplyPoints.id, id))
    .returning({ id: supplyPoints.id });
  return deleted ?? null;
}
