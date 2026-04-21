/**
 * Case Service — Persistent case management for the swarm.
 *
 * A "case" represents a continuous interaction thread between the system
 * (owned by a userId) and an external client (identified by clientIdentifier).
 * The swarm resolves or creates a case at the start of each execution,
 * and all tool calls, delegations, and audit events reference it.
 *
 * Usage:
 *   import { resolveOrCreateCase, getCase, updateCaseOwner } from "@/lib/cases";
 */

import { eq, and, desc, sql, inArray } from "drizzle-orm";

// ─── Types (no DB dependency for testing) ──────────────────────────────

export type CaseStatus = "open" | "active" | "waiting" | "closed";

export interface CaseRecord {
  id: number;
  userId: string;
  contactId: number | null;
  clientIdentifier: string;
  visibleOwnerId: string | null;
  status: CaseStatus;
  subject: string | null;
  channel: string | null;
  metadata: Record<string, unknown> | null;
  interactionCount: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  closedAt: Date | null;
}

export interface ResolveOrCreateInput {
  userId: string;
  clientIdentifier: string;
  contactId?: number | null;
  channel?: string | null;
  subject?: string | null;
  agentId?: string; // Initial visible owner
}

export interface ResolveOrCreateResult {
  caseRecord: CaseRecord;
  created: boolean;
}

// ─── Active statuses (cases that can be resumed) ───────────────────────

const ACTIVE_STATUSES: CaseStatus[] = ["open", "active", "waiting"];

// ─── Lazy DB loader (same pattern as swarm → audit) ────────────────────

let _dbMod: { db: any; schema: any } | null = null;

function getDbMod(): { db: any; schema: any } | null {
  if (!_dbMod) {
    try {
      _dbMod = require("@/db");
    } catch {
      return null;
    }
  }
  return _dbMod;
}

// ─── Core Functions ────────────────────────────────────────────────────

/**
 * Find an active case for this user+client, or create a new one.
 *
 * Strategy:
 *   1. Look for the most recent case with status in (open, active, waiting)
 *      for this userId + clientIdentifier.
 *   2. If found, increment interactionCount and return it.
 *   3. If not found, create a new case with status "open".
 */
export async function resolveOrCreateCase(input: ResolveOrCreateInput): Promise<ResolveOrCreateResult> {
  const dbMod = getDbMod();
  if (!dbMod) {
    throw new Error("Database module not available");
  }

  const { db, schema } = dbMod;
  const { userId, clientIdentifier, contactId, channel, subject, agentId } = input;

  // 1. Find existing active case
  const existing = await db
    .select()
    .from(schema.cases)
    .where(
      and(
        eq(schema.cases.userId, userId),
        eq(schema.cases.clientIdentifier, clientIdentifier),
        inArray(schema.cases.status, ACTIVE_STATUSES),
      ),
    )
    .orderBy(desc(schema.cases.updatedAt))
    .limit(1);

  if (existing.length > 0) {
    const found = existing[0] as CaseRecord;

    // Increment interaction count + touch updatedAt
    await db
      .update(schema.cases)
      .set({
        interactionCount: sql`${schema.cases.interactionCount} + 1`,
        updatedAt: new Date(),
        // Update contactId if we now have it and it was null
        ...(contactId && !found.contactId ? { contactId } : {}),
      })
      .where(eq(schema.cases.id, found.id));

    return {
      caseRecord: {
        ...found,
        interactionCount: (found.interactionCount ?? 0) + 1,
        updatedAt: new Date(),
        ...(contactId && !found.contactId ? { contactId } : {}),
      },
      created: false,
    };
  }

  // 2. Create new case
  const [newCase] = await db
    .insert(schema.cases)
    .values({
      userId,
      clientIdentifier,
      contactId: contactId ?? null,
      visibleOwnerId: agentId ?? null,
      status: "open",
      subject: subject?.slice(0, 200) ?? null,
      channel: channel ?? null,
      interactionCount: 1,
      metadata: {},
    })
    .returning();

  return {
    caseRecord: newCase as CaseRecord,
    created: true,
  };
}

/**
 * Get a case by ID.
 */
export async function getCase(caseId: number): Promise<CaseRecord | null> {
  const dbMod = getDbMod();
  if (!dbMod) return null;

  const { db, schema } = dbMod;
  const rows = await db
    .select()
    .from(schema.cases)
    .where(eq(schema.cases.id, caseId))
    .limit(1);

  return (rows[0] as CaseRecord) ?? null;
}

/**
 * Update the visible owner of a case.
 * Enforces single-voice: only one agent can own a case at a time.
 */
export async function updateCaseOwner(
  caseId: number,
  newOwnerId: string,
): Promise<void> {
  const dbMod = getDbMod();
  if (!dbMod) return;

  const { db, schema } = dbMod;
  await db
    .update(schema.cases)
    .set({
      visibleOwnerId: newOwnerId,
      updatedAt: new Date(),
    })
    .where(eq(schema.cases.id, caseId));
}

/**
 * Update the status of a case.
 */
export async function updateCaseStatus(
  caseId: number,
  status: CaseStatus,
): Promise<void> {
  const dbMod = getDbMod();
  if (!dbMod) return;

  const { db, schema } = dbMod;
  await db
    .update(schema.cases)
    .set({
      status,
      updatedAt: new Date(),
      ...(status === "closed" ? { closedAt: new Date() } : {}),
    })
    .where(eq(schema.cases.id, caseId));
}

/**
 * Validate that an agent can act as the visible owner of a case.
 * Returns { valid, currentOwner } so callers can decide what to do.
 */
export function validateOwnership(
  caseRecord: CaseRecord,
  agentId: string,
): { valid: boolean; currentOwner: string | null; reason: string } {
  // No owner yet — anyone can claim
  if (!caseRecord.visibleOwnerId) {
    return { valid: true, currentOwner: null, reason: "Sin owner, se puede reclamar" };
  }

  // Same owner
  if (caseRecord.visibleOwnerId === agentId) {
    return { valid: true, currentOwner: caseRecord.visibleOwnerId, reason: "ok" };
  }

  // CEO always can
  if (agentId === "ceo") {
    return { valid: true, currentOwner: caseRecord.visibleOwnerId, reason: "CEO override" };
  }

  // Different owner — blocked (single-voice)
  return {
    valid: false,
    currentOwner: caseRecord.visibleOwnerId,
    reason: `Agente ${agentId} no es el owner visible (${caseRecord.visibleOwnerId})`,
  };
}
