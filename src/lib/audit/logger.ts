/**
 * Audit Logger — Central entry point for all audit events.
 *
 * Usage:
 *   import { auditLog } from "@/lib/audit/logger";
 *   auditLog.emit({ eventType: "case_routed", ... });
 *   auditLog.getCaseTimeline("case-123");
 *
 * Architecture:
 *   auditLog.emit() → creates AuditEvent → store.append() → console output (dev)
 *   auditLog.query() → store.query() → filtered results
 */

import type { AuditEvent, AuditEventInput, AuditQueryFilter, TimelineEntry } from "./types";
import { MemoryAuditStore, type AuditStore } from "./store";
import { DualAuditStore } from "./dual-store";

// ─── Unique ID Generator ──────────────────────────────────────────────────

let counter = 0;
function generateEventId(): string {
  counter++;
  return `evt_${Date.now()}_${counter.toString(36)}`;
}

// ─── Logger Configuration ─────────────────────────────────────────────────

export interface AuditLoggerConfig {
  /** Enable console output in development */
  consoleOutput: boolean;
  /** Minimum severity to output to console: "all" | "blocked" | "violations" */
  consoleLevel: "all" | "blocked" | "violations";
  /** Custom store (default: MemoryAuditStore) */
  store?: AuditStore;
}

const DEFAULT_CONFIG: AuditLoggerConfig = {
  consoleOutput: process.env.NODE_ENV !== "production",
  consoleLevel: "all",
};

// ─── Audit Logger Class ───────────────────────────────────────────────────

export class AuditLogger {
  private store: AuditStore;
  private config: AuditLoggerConfig;

  constructor(config?: Partial<AuditLoggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = this.config.store ?? this.createDefaultStore();
  }

  /**
   * Default store: DualAuditStore in runtime (memory + DB persistence),
   * MemoryAuditStore in test (NODE_ENV=test or VITEST=true).
   */
  private createDefaultStore(): AuditStore {
    const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
    if (isTest) {
      return new MemoryAuditStore();
    }
    return new DualAuditStore();
  }

  // ── Core: Emit Event ────────────────────────────────────────────────────

  emit(input: AuditEventInput): AuditEvent {
    const event: AuditEvent = {
      id: generateEventId(),
      timestamp: new Date().toISOString(),
      eventType: input.eventType,
      result: input.result,
      caseId: input.caseId ?? null,
      userId: input.userId,
      agentId: input.agentId,
      agentLayer: input.agentLayer ?? null,
      visibleOwnerId: input.visibleOwnerId ?? null,
      targetAgentId: input.targetAgentId ?? null,
      toolName: input.toolName ?? null,
      reason: input.reason,
      metadata: input.metadata ?? {},
    };

    this.store.append(event);

    if (this.config.consoleOutput) {
      this.consoleLog(event);
    }

    return event;
  }

  // ── Query Helpers ───────────────────────────────────────────────────────

  query(filter: AuditQueryFilter): AuditEvent[] {
    return this.store.query(filter);
  }

  getCaseTimeline(caseId: string): TimelineEntry[] {
    return this.store.getCaseTimeline(caseId);
  }

  getBlockedToolAttempts(caseId?: string): AuditEvent[] {
    return this.store.query({
      caseId,
      eventType: "tool_blocked",
    });
  }

  getVisibleOwnerTransitions(caseId: string): AuditEvent[] {
    return this.store.query({
      caseId,
      eventType: "case_owner_changed",
    });
  }

  getExternalCommunicationEvents(caseId?: string): AuditEvent[] {
    return this.store.query({
      caseId,
      eventType: ["external_message_attempted", "external_message_blocked", "external_message_sent"],
    });
  }

  getGovernanceViolations(caseId?: string): AuditEvent[] {
    return this.store.query({
      caseId,
      eventType: [
        "governance_rule_triggered",
        "ownership_conflict_detected",
        "visibility_violation_detected",
        "tool_blocked",
        "external_message_blocked",
      ],
    });
  }

  getAgentActivity(agentId: string, limit?: number): AuditEvent[] {
    return this.store.query({ agentId, limit });
  }

  getLegacyAliasResolutions(): AuditEvent[] {
    return this.store.query({ eventType: "legacy_alias_resolved" });
  }

  // ── Persistent Query Helpers (DB-backed, cross-process) ─────────────
  // These go through the DualAuditStore's DB adapter when available.
  // If store is MemoryAuditStore (tests), they fall back to sync methods.

  async getCaseTimelinePersistent(caseId: string): Promise<TimelineEntry[]> {
    if (this.store instanceof DualAuditStore) {
      return this.store.getCaseTimelinePersistent(caseId);
    }
    return this.store.getCaseTimeline(caseId);
  }

  async getBlockedToolAttemptsPersistent(caseId?: string): Promise<AuditEvent[]> {
    if (this.store instanceof DualAuditStore) {
      return this.store.queryPersistent({ caseId, eventType: "tool_blocked" });
    }
    return this.getBlockedToolAttempts(caseId);
  }

  async getVisibleOwnerTransitionsPersistent(caseId: string): Promise<AuditEvent[]> {
    if (this.store instanceof DualAuditStore) {
      return this.store.queryPersistent({ caseId, eventType: "case_owner_changed" });
    }
    return this.getVisibleOwnerTransitions(caseId);
  }

  async getExternalCommunicationEventsPersistent(caseId?: string): Promise<AuditEvent[]> {
    if (this.store instanceof DualAuditStore) {
      return this.store.queryPersistent({
        caseId,
        eventType: ["external_message_attempted", "external_message_blocked", "external_message_sent"],
      });
    }
    return this.getExternalCommunicationEvents(caseId);
  }

  async getGovernanceViolationsPersistent(caseId?: string): Promise<AuditEvent[]> {
    if (this.store instanceof DualAuditStore) {
      return this.store.queryPersistent({
        caseId,
        eventType: [
          "governance_rule_triggered",
          "ownership_conflict_detected",
          "visibility_violation_detected",
          "tool_blocked",
          "external_message_blocked",
        ],
      });
    }
    return this.getGovernanceViolations(caseId);
  }

  /** Flush pending DB writes immediately. */
  flushPersistent(): void {
    if (this.store instanceof DualAuditStore) {
      this.store.flush();
    }
  }

  /** Purge audit events older than N days. */
  async purgeOlderThan(days: number): Promise<number> {
    if (this.store instanceof DualAuditStore) {
      return this.store.purgeOlderThan(days);
    }
    return 0;
  }

  // ── Stats ───────────────────────────────────────────────────────────────

  getStats(): {
    totalEvents: number;
    blocked: number;
    violations: number;
    legacyResolutions: number;
  } {
    return {
      totalEvents: this.store.count(),
      blocked: this.store.query({ result: "blocked" }).length,
      violations: this.store.query({
        eventType: [
          "governance_rule_triggered",
          "ownership_conflict_detected",
          "visibility_violation_detected",
        ],
      }).length,
      legacyResolutions: this.store.query({ eventType: "legacy_alias_resolved" }).length,
    };
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /** Get the underlying store (for testing or advanced queries) */
  getStore(): AuditStore {
    return this.store;
  }

  /** Reset all events (for testing) */
  clear(): void {
    this.store.clear();
  }

  private consoleLog(event: AuditEvent): void {
    const isViolation = [
      "governance_rule_triggered",
      "ownership_conflict_detected",
      "visibility_violation_detected",
    ].includes(event.eventType);

    const isBlocked = event.result === "blocked";

    if (this.config.consoleLevel === "violations" && !isViolation) return;
    if (this.config.consoleLevel === "blocked" && !isBlocked && !isViolation) return;

    const icon = isViolation ? "🚨" : isBlocked ? "🛑" : event.result === "failed" ? "❌" : event.result === "success" ? "✅" : "ℹ️";
    const caseTag = event.caseId ? `[${event.caseId}]` : "[system]";
    const toolTag = event.toolName ? ` tool=${event.toolName}` : "";
    const targetTag = event.targetAgentId ? ` → ${event.targetAgentId}` : "";

    // eslint-disable-next-line no-console
    console.log(
      `${icon} AUDIT ${caseTag} ${event.eventType} agent=${event.agentId}${targetTag}${toolTag} result=${event.result} | ${event.reason}`,
    );
  }
}

// ─── Singleton Instance ───────────────────────────────────────────────────

export const auditLog = new AuditLogger();
