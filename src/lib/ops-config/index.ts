/**
 * Ops Config — CRUD for the 6 editable operational entities.
 * Service catalog, documents, checklists, email rules, partners, agent config.
 */
import { db, schema } from "@/db";
import { eq, and, desc, asc } from "drizzle-orm";
import type {
  NewServiceCatalogItem, NewServiceDocument, NewServiceChecklist,
  NewEmailRule, NewPartner, NewAgentConfigItem,
} from "@/db/schema";

// ─── Service Catalog ──────────────────────────────────────────────
export async function listServices(userId: string) {
  return db.select().from(schema.serviceCatalog)
    .where(eq(schema.serviceCatalog.userId, userId))
    .orderBy(asc(schema.serviceCatalog.sortOrder), asc(schema.serviceCatalog.id));
}

export async function getService(id: number) {
  const [row] = await db.select().from(schema.serviceCatalog).where(eq(schema.serviceCatalog.id, id));
  return row ?? null;
}

export async function createService(data: NewServiceCatalogItem) {
  const [row] = await db.insert(schema.serviceCatalog).values(data).returning();
  return row;
}

export async function updateService(id: number, data: Partial<NewServiceCatalogItem>) {
  const [row] = await db.update(schema.serviceCatalog)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.serviceCatalog.id, id)).returning();
  return row ?? null;
}

export async function deleteService(id: number) {
  const [row] = await db.delete(schema.serviceCatalog).where(eq(schema.serviceCatalog.id, id)).returning({ id: schema.serviceCatalog.id });
  return row ?? null;
}

// ─── Service Documents ────────────────────────────────────────────
export async function listDocuments(serviceId: number) {
  return db.select().from(schema.serviceDocuments)
    .where(eq(schema.serviceDocuments.serviceId, serviceId))
    .orderBy(asc(schema.serviceDocuments.sortOrder));
}

export async function createDocument(data: NewServiceDocument) {
  const [row] = await db.insert(schema.serviceDocuments).values(data).returning();
  return row;
}

export async function updateDocument(id: number, data: Partial<NewServiceDocument>) {
  const [row] = await db.update(schema.serviceDocuments).set(data).where(eq(schema.serviceDocuments.id, id)).returning();
  return row ?? null;
}

export async function deleteDocument(id: number) {
  const [row] = await db.delete(schema.serviceDocuments).where(eq(schema.serviceDocuments.id, id)).returning({ id: schema.serviceDocuments.id });
  return row ?? null;
}

// ─── Service Checklists ───────────────────────────────────────────
export async function listChecklists(serviceId: number) {
  return db.select().from(schema.serviceChecklists)
    .where(eq(schema.serviceChecklists.serviceId, serviceId))
    .orderBy(asc(schema.serviceChecklists.sortOrder));
}

export async function createChecklist(data: NewServiceChecklist) {
  const [row] = await db.insert(schema.serviceChecklists).values(data).returning();
  return row;
}

export async function updateChecklist(id: number, data: Partial<NewServiceChecklist>) {
  const [row] = await db.update(schema.serviceChecklists).set(data).where(eq(schema.serviceChecklists.id, id)).returning();
  return row ?? null;
}

export async function deleteChecklist(id: number) {
  const [row] = await db.delete(schema.serviceChecklists).where(eq(schema.serviceChecklists.id, id)).returning({ id: schema.serviceChecklists.id });
  return row ?? null;
}

// ─── Email Rules ──────────────────────────────────────────────────
export async function listEmailRules(userId: string) {
  return db.select().from(schema.emailRules)
    .where(eq(schema.emailRules.userId, userId))
    .orderBy(desc(schema.emailRules.priority), asc(schema.emailRules.id));
}

export async function createEmailRule(data: NewEmailRule) {
  const [row] = await db.insert(schema.emailRules).values(data).returning();
  return row;
}

export async function updateEmailRule(id: number, data: Partial<NewEmailRule>) {
  const [row] = await db.update(schema.emailRules)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.emailRules.id, id)).returning();
  return row ?? null;
}

export async function deleteEmailRule(id: number) {
  const [row] = await db.delete(schema.emailRules).where(eq(schema.emailRules.id, id)).returning({ id: schema.emailRules.id });
  return row ?? null;
}

// ─── Partners ─────────────────────────────────────────────────────
export async function listPartners(userId: string) {
  return db.select().from(schema.partners)
    .where(eq(schema.partners.userId, userId))
    .orderBy(asc(schema.partners.vertical), asc(schema.partners.name));
}

export async function createPartner(data: NewPartner) {
  const [row] = await db.insert(schema.partners).values(data).returning();
  return row;
}

export async function updatePartner(id: number, data: Partial<NewPartner>) {
  const [row] = await db.update(schema.partners)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.partners.id, id)).returning();
  return row ?? null;
}

export async function deletePartner(id: number) {
  const [row] = await db.delete(schema.partners).where(eq(schema.partners.id, id)).returning({ id: schema.partners.id });
  return row ?? null;
}

// ─── Agent Config ─────────────────────────────────────────────────
export async function listAgentConfigs(userId: string) {
  return db.select().from(schema.opsAgentRoles)
    .where(eq(schema.opsAgentRoles.userId, userId))
    .orderBy(asc(schema.opsAgentRoles.agentSlug));
}

export async function getAgentConfig(userId: string, slug: string) {
  const [row] = await db.select().from(schema.opsAgentRoles)
    .where(and(eq(schema.opsAgentRoles.userId, userId), eq(schema.opsAgentRoles.agentSlug, slug)));
  return row ?? null;
}

export async function createAgentConfig(data: NewAgentConfigItem) {
  const [row] = await db.insert(schema.opsAgentRoles).values(data).returning();
  return row;
}

export async function updateAgentConfig(id: number, data: Partial<NewAgentConfigItem>) {
  const [row] = await db.update(schema.opsAgentRoles)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.opsAgentRoles.id, id)).returning();
  return row ?? null;
}

export async function deleteAgentConfig(id: number) {
  const [row] = await db.delete(schema.opsAgentRoles).where(eq(schema.opsAgentRoles.id, id)).returning({ id: schema.opsAgentRoles.id });
  return row ?? null;
}
