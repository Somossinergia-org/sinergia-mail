/**
 * CRM Contacts Service — evolved from existing contacts table.
 * Phase 1: adds company linking capability.
 * Does NOT replace existing contact queries elsewhere — purely additive.
 */

import { db } from "@/db";
import { contacts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/** Link an existing contact to a company */
export async function linkContactToCompany(contactId: number, companyId: number) {
  const [updated] = await db
    .update(contacts)
    .set({ companyId, updatedAt: new Date() })
    .where(eq(contacts.id, contactId))
    .returning();
  return updated ?? null;
}

/** Unlink a contact from its company */
export async function unlinkContactFromCompany(contactId: number) {
  const [updated] = await db
    .update(contacts)
    .set({ companyId: null, updatedAt: new Date() })
    .where(eq(contacts.id, contactId))
    .returning();
  return updated ?? null;
}

/** List contacts for a specific company */
export async function listContactsByCompany(companyId: number) {
  return db
    .select()
    .from(contacts)
    .where(eq(contacts.companyId, companyId));
}

/** List contacts for a user that are NOT linked to any company */
export async function listUnlinkedContacts(userId: string) {
  return db
    .select()
    .from(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.companyId, null as unknown as number)));
}
