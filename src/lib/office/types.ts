/**
 * Office State Types — Shared contract between backend (audit/cases/swarm)
 * and the office virtual UI (AgentOfficeMap.tsx).
 *
 * These types define the "prepared state" that the UI consumes.
 * The UI never queries audit/cases directly — it reads OfficeStateSnapshot.
 */

// ─── Agent Layer (mirrors swarm definition) ──────────────────────────────

export type OfficeAgentLayer = "gobierno" | "visible" | "experta-interna" | "modulo-interno";

// ─── Agent Status for Office Display ─────────────────────────────────────

export type OfficeAgentStatus =
  | "idle"
  | "active"
  | "delegating"
  | "internal_work"
  | "blocked"
  | "offline";

// ─── Per-Agent State ─────────────────────────────────────────────────────

export interface OfficeAgentState {
  agentId: string;
  layer: OfficeAgentLayer;
  /** Whether this agent can be client-facing */
  isVisible: boolean;
  /** Derived status from recent audit events */
  currentStatus: OfficeAgentStatus;
  /** Case this agent is currently working on (null if idle) */
  activeCaseId: string | null;
  /** If this agent is the visible owner of a case */
  visibleOwnerCaseId: string | null;
  /** Last event type from audit trail */
  lastEventType: string | null;
  /** ISO timestamp of last activity */
  lastActivityAt: string | null;
  /** Brief summary of current task if derivable */
  currentTaskSummary: string | null;
  /** Reason if status is "blocked" */
  blockedReason: string | null;
  /** Whether this state comes from real data (true) or fallback (false) */
  isReal: boolean;
}

// ─── Active Delegation ───────────────────────────────────────────────────

export interface OfficeDelegation {
  fromAgentId: string;
  toAgentId: string;
  reason: string;
  caseId: string | null;
  timestamp: string;
}

// ─── Recent Activity Entry (for activity log) ───────────────────────────

export interface OfficeActivityEntry {
  id: string;
  agentId: string;
  eventType: string;
  result: string;
  summary: string;
  caseId: string | null;
  timestamp: string;
}

// ─── Active Case with Ownership ──────────────────────────────────────────

export interface OfficeActiveCase {
  caseId: string;
  visibleOwnerId: string | null;
  status: string;
  subject: string | null;
  channel: string | null;
  lastActivityAt: string | null;
}

// ─── Full Snapshot (returned by endpoint) ────────────────────────────────

export interface OfficeStateSnapshot {
  /** Per-agent state map */
  agents: Record<string, OfficeAgentState>;
  /** Currently active delegations */
  activeDelegations: OfficeDelegation[];
  /** Recent activity entries (newest first, limited) */
  recentActivity: OfficeActivityEntry[];
  /** Active cases with ownership info */
  activeCases: OfficeActiveCase[];
  /** ISO timestamp when this snapshot was generated */
  generatedAt: string;
  /** Whether real data was available (false = full fallback) */
  hasRealData: boolean;
}
