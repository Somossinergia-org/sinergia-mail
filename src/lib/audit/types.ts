/**
 * Audit Event Types — Observabilidad y trazabilidad para Arquitectura v2.
 *
 * Familias de eventos:
 *   A. Case events (lifecycle de un caso)
 *   B. Agent events (selección, bloqueo, delegación)
 *   C. Tool events (invocación, bloqueo, resultado)
 *   D. External communication events
 *   E. Governance events (violaciones, resoluciones)
 */

// ─── Event Type Enum ──────────────────────────────────────────────────────

export type AuditEventType =
  // A. Case events
  | "case_created"
  | "case_routed"
  | "case_escalated"
  | "case_owner_changed"
  | "case_closed"
  | "case_status_changed"
  // B. Agent events
  | "agent_selected"
  | "agent_blocked"
  | "agent_delegated"
  | "agent_exception"
  // C. Tool events
  | "tool_available"
  | "tool_called"
  | "tool_blocked"
  | "tool_succeeded"
  | "tool_failed"
  // D. External communication events
  | "external_message_attempted"
  | "external_message_blocked"
  | "external_message_sent"
  // E. Governance events
  | "governance_rule_triggered"
  | "ownership_conflict_detected"
  | "visibility_violation_detected"
  | "legacy_alias_resolved";

// ─── Event Result ─────────────────────────────────────────────────────────

export type AuditEventResult = "success" | "blocked" | "failed" | "info";

// ─── Agent Layer (duplicated here to avoid circular imports) ───────────────

export type AuditAgentLayer = "gobierno" | "visible" | "experta-interna" | "modulo-interno";

// ─── Base Event ───────────────────────────────────────────────────────────

export interface AuditEvent {
  /** Unique event ID */
  id: string;
  /** ISO timestamp */
  timestamp: string;
  /** Event family + type */
  eventType: AuditEventType;
  /** Result of the event */
  result: AuditEventResult;
  /** Case this event belongs to (null for system-level events) */
  caseId: string | null;
  /** User/session ID */
  userId: string;
  /** Agent that triggered/participated in this event */
  agentId: string;
  /** Layer of the agent */
  agentLayer: AuditAgentLayer | null;
  /** Current visible owner of the case (at time of event) */
  visibleOwnerId: string | null;
  /** Target agent (for delegations, escalations) */
  targetAgentId: string | null;
  /** Tool name (for tool events) */
  toolName: string | null;
  /** Human-readable reason or description */
  reason: string;
  /** Structured metadata specific to the event type */
  metadata: Record<string, unknown>;
}

// ─── Event Factory Input (partial — auto-fills defaults) ──────────────────

export interface AuditEventInput {
  eventType: AuditEventType;
  result: AuditEventResult;
  caseId?: string | null;
  userId: string;
  agentId: string;
  agentLayer?: AuditAgentLayer | null;
  visibleOwnerId?: string | null;
  targetAgentId?: string | null;
  toolName?: string | null;
  reason: string;
  metadata?: Record<string, unknown>;
}

// ─── Timeline Entry (enriched for display) ────────────────────────────────

export interface TimelineEntry {
  event: AuditEvent;
  /** Milliseconds since case start */
  offsetMs: number;
}

// ─── Query Filters ────────────────────────────────────────────────────────

export interface AuditQueryFilter {
  caseId?: string;
  userId?: string;
  agentId?: string;
  eventType?: AuditEventType | AuditEventType[];
  result?: AuditEventResult;
  toolName?: string;
  since?: string; // ISO date
  until?: string; // ISO date
  limit?: number;
}
