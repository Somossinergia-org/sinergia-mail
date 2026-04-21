"use client";

/**
 * useOfficeStream — React hook for office real-time state.
 *
 * Lifecycle:
 *   1. Fetch initial snapshot from /api/office-state
 *   2. Connect to /api/office-state/stream for SSE incremental updates
 *   3. On SSE disconnect → fall back to polling /api/office-state every 5s
 *   4. On SSE reconnect → stop polling, resume stream
 *
 * Returns:
 *   - snapshot: current OfficeStateSnapshot (or null before first load)
 *   - connectionStatus: "connecting" | "streaming" | "polling" | "error"
 *   - lastEventAt: timestamp of last received event
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { OfficeStateSnapshot } from "@/lib/office/types";
import type { OfficeStreamEvent } from "@/lib/office/stream-events";

export type ConnectionStatus = "connecting" | "streaming" | "polling" | "error";

export interface UseOfficeStreamResult {
  snapshot: OfficeStateSnapshot | null;
  connectionStatus: ConnectionStatus;
  lastEventAt: number;
}

// ─── SSE Event Applier ───────────────────────────────────────────────────

function applyStreamEvent(
  snapshot: OfficeStateSnapshot,
  event: OfficeStreamEvent,
): OfficeStateSnapshot {
  switch (event.type) {
    case "office_snapshot": {
      // Full snapshot replacement
      return event.data as unknown as OfficeStateSnapshot;
    }

    case "agent_status_changed": {
      const { agentId, newStatus, taskSummary, activeCaseId } = event.data as {
        agentId: string;
        newStatus: string;
        taskSummary: string | null;
        activeCaseId: string | null;
      };
      const agent = snapshot.agents[agentId];
      if (!agent) return snapshot;
      return {
        ...snapshot,
        agents: {
          ...snapshot.agents,
          [agentId]: {
            ...agent,
            currentStatus: newStatus as typeof agent.currentStatus,
            currentTaskSummary: taskSummary,
            activeCaseId: activeCaseId ?? agent.activeCaseId,
            lastActivityAt: event.timestamp,
            isReal: true,
          },
        },
      };
    }

    case "agent_blocked": {
      const { agentId, blockedReason, lastEventType } = event.data as {
        agentId: string;
        blockedReason: string | null;
        lastEventType: string | null;
      };
      const agent = snapshot.agents[agentId];
      if (!agent) return snapshot;
      return {
        ...snapshot,
        agents: {
          ...snapshot.agents,
          [agentId]: {
            ...agent,
            currentStatus: "blocked",
            blockedReason: blockedReason ?? "Blocked",
            lastEventType: lastEventType ?? agent.lastEventType,
            lastActivityAt: event.timestamp,
            isReal: true,
          },
        },
      };
    }

    case "owner_changed": {
      const { agentId, newCaseId } = event.data as {
        agentId: string;
        newCaseId: string | null;
      };
      const agent = snapshot.agents[agentId];
      if (!agent) return snapshot;
      return {
        ...snapshot,
        agents: {
          ...snapshot.agents,
          [agentId]: {
            ...agent,
            visibleOwnerCaseId: newCaseId,
            lastActivityAt: event.timestamp,
            isReal: true,
          },
        },
      };
    }

    case "delegation_started": {
      const d = event.data as {
        fromAgentId: string;
        toAgentId: string;
        reason: string;
        caseId: string | null;
      };
      return {
        ...snapshot,
        activeDelegations: [
          ...snapshot.activeDelegations,
          { ...d, timestamp: event.timestamp },
        ],
      };
    }

    case "delegation_finished": {
      const { fromAgentId, toAgentId } = event.data as {
        fromAgentId: string;
        toAgentId: string;
      };
      return {
        ...snapshot,
        activeDelegations: snapshot.activeDelegations.filter(
          (d) => !(d.fromAgentId === fromAgentId && d.toAgentId === toAgentId),
        ),
      };
    }

    case "activity": {
      const a = event.data as {
        id: string;
        agentId: string;
        eventType: string;
        result: string;
        summary: string;
        caseId: string | null;
      };
      // Deduplicate
      if (snapshot.recentActivity.some((e) => e.id === a.id)) return snapshot;
      return {
        ...snapshot,
        recentActivity: [
          { ...a, timestamp: event.timestamp },
          ...snapshot.recentActivity,
        ].slice(0, 50),
      };
    }

    case "heartbeat":
    case "error":
      // No state change
      return snapshot;

    default:
      // Unknown event — ignore gracefully
      return snapshot;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────

const POLL_INTERVAL = 5000;
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function useOfficeStream(): UseOfficeStreamResult {
  const [snapshot, setSnapshot] = useState<OfficeStateSnapshot | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastEventAt, setLastEventAt] = useState(0);

  const snapshotRef = useRef<OfficeStateSnapshot | null>(null);
  const reconnectAttempts = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep ref in sync for use inside callbacks
  const updateSnapshot = useCallback((s: OfficeStateSnapshot) => {
    snapshotRef.current = s;
    setSnapshot(s);
    setLastEventAt(Date.now());
  }, []);

  // ── Polling fallback
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    setStatus("polling");

    const poll = async () => {
      try {
        const res = await fetch("/api/office-state?window=300");
        if (res.ok) {
          const data = await res.json();
          updateSnapshot(data);
        }
      } catch {
        // Silently ignore poll errors
      }
    };

    poll(); // immediate first poll
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL);
  }, [updateSnapshot]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // ── SSE Connection
  const connectSSE = useCallback(() => {
    // Abort any existing connection
    abortRef.current?.abort();
    stopPolling();

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("connecting");

    (async () => {
      try {
        const res = await fetch("/api/office-state/stream?window=300", {
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Stream failed: ${res.status}`);
        }

        setStatus("streaming");
        reconnectAttempts.current = 0;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || ""; // Keep incomplete chunk

          for (const block of lines) {
            const dataLine = block.trim();
            if (!dataLine.startsWith("data: ")) continue;
            const jsonStr = dataLine.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event: OfficeStreamEvent = JSON.parse(jsonStr);
              const current = snapshotRef.current;

              if (event.type === "office_snapshot") {
                // Full snapshot — apply directly
                updateSnapshot(event.data as unknown as OfficeStateSnapshot);
              } else if (current) {
                // Incremental — apply on top of current
                updateSnapshot(applyStreamEvent(current, event));
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }

        // Stream ended normally (server closed after maxDuration)
        // Reconnect
        scheduleReconnect();
      } catch (err) {
        if (controller.signal.aborted) return; // Intentional abort
        // eslint-disable-next-line no-console
        console.warn("[useOfficeStream] SSE error, falling back to polling:", (err as Error)?.message);
        startPolling();
        scheduleReconnect();
      }
    })();

    function scheduleReconnect() {
      if (controller.signal.aborted) return;
      reconnectAttempts.current++;
      if (reconnectAttempts.current > MAX_RECONNECT_ATTEMPTS) {
        setStatus("error");
        startPolling(); // Permanent fallback
        return;
      }
      const delay = RECONNECT_DELAY * Math.min(reconnectAttempts.current, 5);
      setTimeout(() => {
        if (!controller.signal.aborted) {
          connectSSE();
        }
      }, delay);
    }
  }, [updateSnapshot, startPolling, stopPolling]);

  // ── Lifecycle
  useEffect(() => {
    connectSSE();

    return () => {
      abortRef.current?.abort();
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { snapshot, connectionStatus: status, lastEventAt };
}

// ── Export applyStreamEvent for testing
export { applyStreamEvent };
