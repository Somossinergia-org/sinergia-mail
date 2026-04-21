/**
 * Database Audit Store — Persistent audit event storage via Drizzle/PostgreSQL.
 *
 * Implements the AuditStore interface for production use. Events are written
 * to the `audit_events` table and can be queried with full SQL indexing.
 *
 * Architecture:
 *   - Writes are fire-and-forget (async, non-blocking)
 *   - Reads hit the DB directly (no cache — the DB indexes are fast enough)
 *   - MemoryAuditStore can still be used for tests or as local cache
 */

import type { AuditEvent, AuditQueryFilter, TimelineEntry } from "./types";
import type { AuditStore } from "./store";
import { eq, and, desc, inArray, gte, lte, sql } from "drizzle-orm";

// ─── Lazy DB loader (avoids import-time crash if DB is not configured) ──

let _dbMod: { db: any; schema: any } | null = null;
function getDbMod(): { db: any; schema: any } | null {
  if (!_dbMod) {
    try { _dbMod = require("@/db"); } catch { return null; }
  }
  return _dbMod;
}

// ─── Database Audit Store ────────────────────────────────────────────────

export class DatabaseAuditStore implements AuditStore {
  private writeQueue: AuditEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private batchSize: number;
  private flushIntervalMs: number;

  constructor(opts?: { batchSize?: number; flushIntervalMs?: number }) {
    this.batchSize = opts?.batchSize ?? 20;
    this.flushIntervalMs = opts?.flushIntervalMs ?? 2000;
  }

  /**
   * Append an event. Queues it for batch write to DB.
   * Returns synchronously (non-blocking).
   */
  append(event: AuditEvent): void {
    this.writeQueue.push(event);

    if (this.writeQueue.length >= this.batchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushIntervalMs);
    }
  }

  /**
   * Flush pending writes to DB immediately.
   */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.writeQueue.length === 0) return;

    const batch = this.writeQueue.splice(0);
    this.writeBatch(batch).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[DatabaseAuditStore] flush failed:", err?.message || err);
      // Events are lost if DB write fails — acceptable tradeoff for non-blocking writes.
      // In production, consider a dead-letter queue or retry.
    });
  }

  private async writeBatch(events: AuditEvent[]): Promise<void> {
    const dbMod = getDbMod();
    if (!dbMod) return;

    const { db, schema } = dbMod;
    const rows = events.map((e) => ({
      eventId: e.id,
      caseId: e.caseId,
      userId: e.userId,
      agentId: e.agentId,
      agentLayer: e.agentLayer,
      eventType: e.eventType,
      result: e.result,
      toolName: e.toolName,
      visibleOwnerId: e.visibleOwnerId,
      targetAgentId: e.targetAgentId,
      reason: e.reason,
      metadata: e.metadata,
      createdAt: new Date(e.timestamp),
    }));

    await db.insert(schema.auditEvents).values(rows);
  }

  /**
   * Query events from DB with filters.
   */
  query(filter: AuditQueryFilter): AuditEvent[] {
    // Synchronous interface — return empty and log warning.
    // Use queryAsync for real DB queries.
    // eslint-disable-next-line no-console
    console.warn("[DatabaseAuditStore] Synchronous query() called — use queryAsync() for DB queries");
    return [];
  }

  /**
   * Async query: the real DB-backed query.
   */
  async queryAsync(filter: AuditQueryFilter): Promise<AuditEvent[]> {
    const dbMod = getDbMod();
    if (!dbMod) return [];

    const { db, schema } = dbMod;
    const t = schema.auditEvents;

    const conditions: any[] = [];
    if (filter.caseId) conditions.push(eq(t.caseId, filter.caseId));
    if (filter.userId) conditions.push(eq(t.userId, filter.userId));
    if (filter.agentId) conditions.push(eq(t.agentId, filter.agentId));
    if (filter.result) conditions.push(eq(t.result, filter.result));
    if (filter.toolName) conditions.push(eq(t.toolName, filter.toolName));
    if (filter.eventType) {
      const types = Array.isArray(filter.eventType) ? filter.eventType : [filter.eventType];
      conditions.push(inArray(t.eventType, types));
    }
    if (filter.since) conditions.push(gte(t.createdAt, new Date(filter.since)));
    if (filter.until) conditions.push(lte(t.createdAt, new Date(filter.until)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    let q = db.select().from(t);
    if (where) q = q.where(where);
    q = q.orderBy(desc(t.createdAt));
    if (filter.limit) q = q.limit(filter.limit);

    const rows = await q;
    return rows.map(rowToAuditEvent);
  }

  /**
   * Get timeline for a case (async).
   */
  getCaseTimeline(caseId: string): TimelineEntry[] {
    // Synchronous stub — use getCaseTimelineAsync for real data
    return [];
  }

  async getCaseTimelineAsync(caseId: string): Promise<TimelineEntry[]> {
    const events = await this.queryAsync({ caseId });
    if (events.length === 0) return [];

    // queryAsync returns newest-first; reverse for chronological
    const sorted = [...events].reverse();
    const startTime = new Date(sorted[0].timestamp).getTime();

    return sorted.map((event) => ({
      event,
      offsetMs: new Date(event.timestamp).getTime() - startTime,
    }));
  }

  count(): number {
    return 0; // Synchronous — use countAsync
  }

  async countAsync(): Promise<number> {
    const dbMod = getDbMod();
    if (!dbMod) return 0;
    const { db, schema } = dbMod;
    const result = await db.select({ count: sql<number>`count(*)` }).from(schema.auditEvents);
    return Number(result[0]?.count ?? 0);
  }

  clear(): void {
    this.writeQueue = [];
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Purge events older than N days (for scheduled cleanup). */
  async purgeOlderThan(days: number): Promise<number> {
    const dbMod = getDbMod();
    if (!dbMod) return 0;
    const { db, schema } = dbMod;
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const result = await db.delete(schema.auditEvents)
      .where(lte(schema.auditEvents.createdAt, cutoff));
    return result?.rowCount ?? 0;
  }
}

// ─── Row → AuditEvent Mapper ─────────────────────────────────────────────

function rowToAuditEvent(row: any): AuditEvent {
  return {
    id: row.eventId,
    timestamp: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    eventType: row.eventType,
    result: row.result,
    caseId: row.caseId ?? null,
    userId: row.userId,
    agentId: row.agentId,
    agentLayer: row.agentLayer ?? null,
    visibleOwnerId: row.visibleOwnerId ?? null,
    targetAgentId: row.targetAgentId ?? null,
    toolName: row.toolName ?? null,
    reason: row.reason ?? "",
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}
