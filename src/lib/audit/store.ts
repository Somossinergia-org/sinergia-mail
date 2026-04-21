/**
 * Audit Event Store — In-memory implementation with adapter interface.
 *
 * This is the persistence layer for audit events. Currently in-memory
 * for development; swap the adapter for DB/file/external system later.
 *
 * Architecture:
 *   AuditStore (interface) → MemoryAuditStore (default)
 *                           → future: DrizzleAuditStore, FileAuditStore, etc.
 */

import type { AuditEvent, AuditQueryFilter, TimelineEntry } from "./types";

// ─── Store Interface (adapter pattern) ────────────────────────────────────

export interface AuditStore {
  /** Append a new event */
  append(event: AuditEvent): void;
  /** Query events with filters */
  query(filter: AuditQueryFilter): AuditEvent[];
  /** Get all events for a case, ordered by timestamp */
  getCaseTimeline(caseId: string): TimelineEntry[];
  /** Get total event count */
  count(): number;
  /** Clear all events (for testing) */
  clear(): void;
}

// ─── In-Memory Implementation ─────────────────────────────────────────────

export class MemoryAuditStore implements AuditStore {
  private events: AuditEvent[] = [];
  private byCaseId: Map<string, AuditEvent[]> = new Map();
  private byAgentId: Map<string, AuditEvent[]> = new Map();

  append(event: AuditEvent): void {
    this.events.push(event);

    // Index by caseId
    if (event.caseId) {
      const list = this.byCaseId.get(event.caseId) ?? [];
      list.push(event);
      this.byCaseId.set(event.caseId, list);
    }

    // Index by agentId
    const agentList = this.byAgentId.get(event.agentId) ?? [];
    agentList.push(event);
    this.byAgentId.set(event.agentId, agentList);
  }

  query(filter: AuditQueryFilter): AuditEvent[] {
    let results: AuditEvent[];

    // Start from the most selective index
    if (filter.caseId) {
      results = this.byCaseId.get(filter.caseId) ?? [];
    } else if (filter.agentId) {
      results = this.byAgentId.get(filter.agentId) ?? [];
    } else {
      results = [...this.events];
    }

    // Apply remaining filters
    if (filter.userId) {
      results = results.filter((e) => e.userId === filter.userId);
    }
    if (filter.agentId && !filter.caseId) {
      // Already filtered if we started from agentId index, but need to filter if started from caseId
    } else if (filter.agentId) {
      results = results.filter((e) => e.agentId === filter.agentId);
    }
    if (filter.eventType) {
      const types = Array.isArray(filter.eventType) ? filter.eventType : [filter.eventType];
      results = results.filter((e) => types.includes(e.eventType));
    }
    if (filter.result) {
      results = results.filter((e) => e.result === filter.result);
    }
    if (filter.toolName) {
      results = results.filter((e) => e.toolName === filter.toolName);
    }
    if (filter.since) {
      results = results.filter((e) => e.timestamp >= filter.since!);
    }
    if (filter.until) {
      results = results.filter((e) => e.timestamp <= filter.until!);
    }

    // Sort by timestamp
    results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    if (filter.limit && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  getCaseTimeline(caseId: string): TimelineEntry[] {
    const events = this.byCaseId.get(caseId) ?? [];
    if (events.length === 0) return [];

    const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const startTime = new Date(sorted[0].timestamp).getTime();

    return sorted.map((event) => ({
      event,
      offsetMs: new Date(event.timestamp).getTime() - startTime,
    }));
  }

  count(): number {
    return this.events.length;
  }

  clear(): void {
    this.events = [];
    this.byCaseId.clear();
    this.byAgentId.clear();
  }
}
