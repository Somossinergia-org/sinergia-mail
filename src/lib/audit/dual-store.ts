/**
 * Dual Audit Store — Writes to both MemoryAuditStore (fast sync reads)
 * and DatabaseAuditStore (persistent truth).
 *
 * Query methods use the memory store for speed. The DB store is the
 * source of truth for cross-process / post-deploy queries (via async helpers).
 */

import type { AuditEvent, AuditQueryFilter, TimelineEntry } from "./types";
import type { AuditStore } from "./store";
import { MemoryAuditStore } from "./store";
import { DatabaseAuditStore } from "./db-store";

export class DualAuditStore implements AuditStore {
  public readonly memory: MemoryAuditStore;
  public readonly database: DatabaseAuditStore;

  constructor(opts?: { batchSize?: number; flushIntervalMs?: number }) {
    this.memory = new MemoryAuditStore();
    this.database = new DatabaseAuditStore(opts);
  }

  append(event: AuditEvent): void {
    this.memory.append(event);
    this.database.append(event);
  }

  query(filter: AuditQueryFilter): AuditEvent[] {
    // Sync reads from memory (fast, same-process events)
    return this.memory.query(filter);
  }

  getCaseTimeline(caseId: string): TimelineEntry[] {
    return this.memory.getCaseTimeline(caseId);
  }

  count(): number {
    return this.memory.count();
  }

  clear(): void {
    this.memory.clear();
    this.database.clear();
  }

  /** Flush pending DB writes immediately. */
  flush(): void {
    this.database.flush();
  }

  // ─── Async DB-backed queries (cross-process / persistent) ─────────────

  async queryPersistent(filter: AuditQueryFilter): Promise<AuditEvent[]> {
    return this.database.queryAsync(filter);
  }

  async getCaseTimelinePersistent(caseId: string): Promise<TimelineEntry[]> {
    return this.database.getCaseTimelineAsync(caseId);
  }

  async countPersistent(): Promise<number> {
    return this.database.countAsync();
  }

  async purgeOlderThan(days: number): Promise<number> {
    return this.database.purgeOlderThan(days);
  }
}
