/**
 * Companies Service — CRUD for the central CRM entity.
 * Phase 1: basic operations. No UI wiring yet.
 */

import { db } from "@/db";
import { companies, type NewCompany } from "@/db/schema";
import { eq, and, ilike, sql, desc } from "drizzle-orm";
import type { CompanyFilters } from "./types";

export async function createCompany(data: NewCompany) {
  const [company] = await db.insert(companies).values(data).returning();
  return company;
}

export async function getCompany(id: number) {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);
  return company ?? null;
}

export async function listCompanies(filters: CompanyFilters) {
  const { userId, search, province, source, limit = 50, offset = 0 } = filters;

  const conditions = [eq(companies.userId, userId)];

  if (search) {
    conditions.push(
      sql`(${ilike(companies.name, `%${search}%`)} OR ${ilike(companies.nif, `%${search}%`)} OR ${ilike(companies.email, `%${search}%`)})`
    );
  }
  if (province) conditions.push(eq(companies.province, province));
  if (source) conditions.push(eq(companies.source, source));

  const rows = await db
    .select()
    .from(companies)
    .where(and(...conditions))
    .orderBy(desc(companies.updatedAt))
    .limit(limit)
    .offset(offset);

  return rows;
}

export async function updateCompany(id: number, data: Partial<NewCompany>) {
  const [updated] = await db
    .update(companies)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(companies.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteCompany(id: number) {
  const [deleted] = await db
    .delete(companies)
    .where(eq(companies.id, id))
    .returning({ id: companies.id });
  return deleted ?? null;
}

export async function countCompanies(userId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(eq(companies.userId, userId));
  return result?.count ?? 0;
}
