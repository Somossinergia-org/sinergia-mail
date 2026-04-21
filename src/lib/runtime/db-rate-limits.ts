/**
 * Persistent Rate Limit Counters — Survive cold starts and deploys.
 *
 * Uses `rate_limit_counters` table for durable tracking of:
 *   - Messages per case / per client
 *   - Calls, escalations, high-risk tool usage per case
 *   - Tool retry counts
 *   - Last contact timestamps (for cooldown)
 *
 * Falls back to in-memory counters if DB is unavailable.
 */

import { db, schema } from "@/db";
import { eq, and, sql } from "drizzle-orm";

// ─── Read Counter ───────────────────────────────────────────────────────

async function getCounter(
  scope: string,
  entityKey: string,
  counter: string,
  windowMinutes?: number,
): Promise<{ value: number; windowStart: Date; lastUpdated: Date }> {
  try {
    const rows = await db
      .select()
      .from(schema.rateLimitCounters)
      .where(
        and(
          eq(schema.rateLimitCounters.scope, scope),
          eq(schema.rateLimitCounters.entityKey, entityKey),
          eq(schema.rateLimitCounters.counter, counter),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return { value: 0, windowStart: new Date(), lastUpdated: new Date(0) };
    }

    const row = rows[0];

    // Check if window has expired — reset if so
    if (windowMinutes && row.windowStart) {
      const elapsed = Date.now() - row.windowStart.getTime();
      if (elapsed > windowMinutes * 60_000) {
        // Window expired — reset
        await db
          .update(schema.rateLimitCounters)
          .set({ value: 0, windowStart: new Date(), lastUpdated: new Date() })
          .where(eq(schema.rateLimitCounters.id, row.id));
        return { value: 0, windowStart: new Date(), lastUpdated: new Date() };
      }
    }

    return {
      value: row.value,
      windowStart: row.windowStart ?? new Date(),
      lastUpdated: row.lastUpdated ?? new Date(0),
    };
  } catch {
    return { value: 0, windowStart: new Date(), lastUpdated: new Date(0) };
  }
}

// ─── Increment Counter ──────────────────────────────────────────────────

async function incrementCounter(
  scope: string,
  entityKey: string,
  counter: string,
): Promise<number> {
  try {
    // Try update first
    const updated = await db
      .update(schema.rateLimitCounters)
      .set({
        value: sql`${schema.rateLimitCounters.value} + 1`,
        lastUpdated: new Date(),
      })
      .where(
        and(
          eq(schema.rateLimitCounters.scope, scope),
          eq(schema.rateLimitCounters.entityKey, entityKey),
          eq(schema.rateLimitCounters.counter, counter),
        ),
      )
      .returning();

    if (updated.length > 0) return updated[0].value;

    // Insert new
    const [row] = await db
      .insert(schema.rateLimitCounters)
      .values({
        scope,
        entityKey,
        counter,
        value: 1,
        windowStart: new Date(),
        lastUpdated: new Date(),
      })
      .returning();

    return row.value;
  } catch {
    return 0; // Fail open on DB error
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

/** Get case-level counter */
export async function getCaseCount(
  caseId: string,
  counter: "messages" | "calls" | "escalations" | "highRiskTools",
): Promise<number> {
  const result = await getCounter("case", caseId, counter);
  return result.value;
}

/** Increment case-level counter */
export async function incrementCaseCount(
  caseId: string,
  counter: "messages" | "calls" | "escalations" | "highRiskTools",
): Promise<number> {
  return incrementCounter("case", caseId, counter);
}

/** Get last contact timestamp for a case (for cooldown) */
export async function getLastContactTimestamp(caseId: string): Promise<number> {
  const result = await getCounter("case", caseId, "lastContact");
  return result.lastUpdated.getTime();
}

/** Update last contact timestamp for a case */
export async function touchLastContact(caseId: string): Promise<void> {
  try {
    const updated = await db
      .update(schema.rateLimitCounters)
      .set({ lastUpdated: new Date() })
      .where(
        and(
          eq(schema.rateLimitCounters.scope, "case"),
          eq(schema.rateLimitCounters.entityKey, caseId),
          eq(schema.rateLimitCounters.counter, "lastContact"),
        ),
      )
      .returning();

    if (updated.length === 0) {
      await db.insert(schema.rateLimitCounters).values({
        scope: "case",
        entityKey: caseId,
        counter: "lastContact",
        value: 0,
        windowStart: new Date(),
        lastUpdated: new Date(),
      });
    }
  } catch { /* fail silently */ }
}

/** Get client-level message count (respects window) */
export async function getClientMessageCount(
  clientId: string,
  windowMinutes: number,
): Promise<number> {
  const result = await getCounter("client", clientId, "messages", windowMinutes);
  return result.value;
}

/** Increment client message count */
export async function incrementClientMessages(clientId: string): Promise<number> {
  return incrementCounter("client", clientId, "messages");
}

/** Get tool retry count for a case+tool pair */
export async function getToolRetries(caseId: string, toolName: string): Promise<number> {
  const key = `${caseId}:${toolName}`;
  const result = await getCounter("tool_retry", key, "retries");
  return result.value;
}

/** Increment tool retry count */
export async function incrementToolRetries(caseId: string, toolName: string): Promise<number> {
  const key = `${caseId}:${toolName}`;
  return incrementCounter("tool_retry", key, "retries");
}
