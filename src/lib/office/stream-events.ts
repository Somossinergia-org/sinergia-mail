/**
 * Office Stream Events — Diff logic + SSE event types.
 *
 * Compares two OfficeStateSnapshots and produces incremental events
 * that the SSE endpoint streams to the office UI.
 */

import type {
  OfficeAgentState,
  OfficeStateSnapshot,
  OfficeDelegation,
  OfficeActivityEntry,
  OfficeActiveCase,
} from "./types";

// ─── SSE Event Types ─────────────────────────────────────────────────────

export type OfficeStreamEventType =
  | "office_snapshot"
  | "agent_status_changed"
  | "delegation_started"
  | "delegation_finished"
  | "agent_blocked"
  | "owner_changed"
  | "activity"
  | "heartbeat"
  | "error";

export interface OfficeStreamEvent {
  type: OfficeStreamEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

// ─── Diff Engine ─────────────────────────────────────────────────────────

/**
 * Compare two snapshots and produce incremental events.
 * Returns empty array if nothing changed.
 */
export function diffOfficeState(
  prev: OfficeStateSnapshot,
  next: OfficeStateSnapshot,
): OfficeStreamEvent[] {
  const events: OfficeStreamEvent[] = [];
  const now = next.generatedAt;

  // ── Agent status changes
  for (const [agentId, nextAgent] of Object.entries(next.agents)) {
    const prevAgent = prev.agents[agentId];
    if (!prevAgent) continue;

    // Status changed
    if (nextAgent.currentStatus !== prevAgent.currentStatus) {
      if (nextAgent.currentStatus === "blocked") {
        events.push({
          type: "agent_blocked",
          data: {
            agentId,
            previousStatus: prevAgent.currentStatus,
            blockedReason: nextAgent.blockedReason,
            lastEventType: nextAgent.lastEventType,
          },
          timestamp: now,
        });
      } else {
        events.push({
          type: "agent_status_changed",
          data: {
            agentId,
            previousStatus: prevAgent.currentStatus,
            newStatus: nextAgent.currentStatus,
            taskSummary: nextAgent.currentTaskSummary,
            activeCaseId: nextAgent.activeCaseId,
          },
          timestamp: now,
        });
      }
    }

    // Owner changed
    if (nextAgent.visibleOwnerCaseId !== prevAgent.visibleOwnerCaseId) {
      events.push({
        type: "owner_changed",
        data: {
          agentId,
          previousCaseId: prevAgent.visibleOwnerCaseId,
          newCaseId: nextAgent.visibleOwnerCaseId,
        },
        timestamp: now,
      });
    }
  }

  // ── New delegations
  const prevDelegationKeys = new Set(
    prev.activeDelegations.map((d) => `${d.fromAgentId}-${d.toAgentId}`),
  );
  for (const d of next.activeDelegations) {
    const key = `${d.fromAgentId}-${d.toAgentId}`;
    if (!prevDelegationKeys.has(key)) {
      events.push({
        type: "delegation_started",
        data: {
          fromAgentId: d.fromAgentId,
          toAgentId: d.toAgentId,
          reason: d.reason,
          caseId: d.caseId,
        },
        timestamp: now,
      });
    }
  }

  // ── Finished delegations
  const nextDelegationKeys = new Set(
    next.activeDelegations.map((d) => `${d.fromAgentId}-${d.toAgentId}`),
  );
  for (const d of prev.activeDelegations) {
    const key = `${d.fromAgentId}-${d.toAgentId}`;
    if (!nextDelegationKeys.has(key)) {
      events.push({
        type: "delegation_finished",
        data: {
          fromAgentId: d.fromAgentId,
          toAgentId: d.toAgentId,
          reason: d.reason,
        },
        timestamp: now,
      });
    }
  }

  // ── New activity entries
  const prevActivityIds = new Set(prev.recentActivity.map((a) => a.id));
  for (const a of next.recentActivity) {
    if (!prevActivityIds.has(a.id)) {
      events.push({
        type: "activity",
        data: {
          id: a.id,
          agentId: a.agentId,
          eventType: a.eventType,
          result: a.result,
          summary: a.summary,
          caseId: a.caseId,
        },
        timestamp: a.timestamp,
      });
    }
  }

  return events;
}

// ─── Serialize event for SSE wire format ─────────────────────────────────

export function serializeSSE(event: OfficeStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function serializeHeartbeat(): string {
  return serializeSSE({
    type: "heartbeat",
    data: {},
    timestamp: new Date().toISOString(),
  });
}

export function serializeSnapshot(snapshot: OfficeStateSnapshot): string {
  return serializeSSE({
    type: "office_snapshot",
    data: snapshot as unknown as Record<string, unknown>,
    timestamp: snapshot.generatedAt,
  });
}

export function serializeError(message: string): string {
  return serializeSSE({
    type: "error",
    data: { message },
    timestamp: new Date().toISOString(),
  });
}
