/**
 * Services Service — Multiproduct service CRUD.
 *
 * Phase 1: basic CRUD.
 * Phase 6 (multiservicio): type-filtered queries, opportunity linking,
 *   vertical data updates, portfolio summary, ownership helpers.
 */

import { db } from "@/db";
import { services, companies, type NewService } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  isValidServiceType,
  isValidServiceStatus,
  type ServiceType,
} from "./service-verticals";

// ─── Ownership Helper ────────────────────────────────────────────────

/**
 * Verify that a service belongs to a company owned by the given userId.
 * Returns the service or null.
 */
export async function verifyServiceOwnership(serviceId: number, userId: string) {
  const [row] = await db
    .select({ svc: services, companyUserId: companies.userId })
    .from(services)
    .innerJoin(companies, eq(services.companyId, companies.id))
    .where(eq(services.id, serviceId))
    .limit(1);
  if (!row || row.companyUserId !== userId) return null;
  return row.svc;
}

// ─── Basic CRUD ──────────────────────────────────────────────────────

export async function createService(data: NewService) {
  const [svc] = await db.insert(services).values(data).returning();
  return svc;
}

export async function getService(id: number) {
  const [svc] = await db
    .select()
    .from(services)
    .where(eq(services.id, id))
    .limit(1);
  return svc ?? null;
}

export async function listServicesByCompany(companyId: number) {
  return db
    .select()
    .from(services)
    .where(eq(services.companyId, companyId))
    .orderBy(desc(services.updatedAt));
}

export async function listServicesByCompanyAndType(companyId: number, type: ServiceType) {
  return db
    .select()
    .from(services)
    .where(and(eq(services.companyId, companyId), eq(services.type, type)))
    .orderBy(desc(services.updatedAt));
}

export async function listServicesByOpportunity(opportunityId: number) {
  return db
    .select()
    .from(services)
    .where(eq(services.opportunityId, opportunityId))
    .orderBy(desc(services.updatedAt));
}

export async function updateService(id: number, data: Partial<NewService>) {
  const [updated] = await db
    .update(services)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(services.id, id))
    .returning();
  return updated ?? null;
}

/**
 * Update only the vertical-specific `data` JSONB field.
 * Merges the new keys into the existing data object.
 */
export async function updateServiceVerticalData(
  id: number,
  verticalData: Record<string, unknown>,
) {
  const existing = await getService(id);
  if (!existing) return null;
  const merged = { ...(existing.data ?? {}), ...verticalData };
  return updateService(id, { data: merged });
}

/**
 * Link a service to an opportunity.
 */
export async function linkServiceToOpportunity(serviceId: number, opportunityId: number | null) {
  return updateService(serviceId, { opportunityId });
}

export async function deleteService(id: number) {
  const [deleted] = await db
    .delete(services)
    .where(eq(services.id, id))
    .returning({ id: services.id });
  return deleted ?? null;
}

// ─── Re-exports for convenience ──────────────────────────────────────
export { isValidServiceType, isValidServiceStatus };
