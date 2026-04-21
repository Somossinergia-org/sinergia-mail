/**
 * PREPRODUCTION TESTS — Office SSE Stream: Incremental state updates
 *
 * Validates:
 *   SS1: diffOfficeState — produces correct events for agent status changes
 *   SS2: diffOfficeState — produces blocked events distinctly
 *   SS3: diffOfficeState — detects new/finished delegations
 *   SS4: diffOfficeState — detects new activity entries
 *   SS5: diffOfficeState — returns empty array when nothing changed
 *   SS6: diffOfficeState — detects owner_changed events
 *   SS7: SSE serialization — correct wire format
 *   SS8: applyStreamEvent — applies all event types correctly
 *   SS9: applyStreamEvent — unknown events don't break state
 *   SS10: useOfficeStream hook file structure
 *   SS11: SSE stream route file structure
 *   SS12: AgentOfficeMap — blocked visual state integration
 *   SS13: AgentOfficeMap — uses useOfficeStream instead of polling
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

import {
  diffOfficeState,
  serializeSSE,
  serializeHeartbeat,
  serializeSnapshot,
  serializeError,
} from "@/lib/office/stream-events";

import type { OfficeStreamEvent } from "@/lib/office/stream-events";
import type { OfficeStateSnapshot } from "@/lib/office/types";

import { buildFallbackState } from "@/lib/office";
import { applyStreamEvent } from "@/hooks/useOfficeStream";

// ─── Helpers ────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<OfficeStateSnapshot> = {}): OfficeStateSnapshot {
  const base = buildFallbackState();
  return { ...base, ...overrides };
}

function makeSnapshotWithAgent(
  agentId: string,
  agentOverrides: Record<string, unknown>,
): OfficeStateSnapshot {
  const base = buildFallbackState();
  const agent = base.agents[agentId];
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);
  return {
    ...base,
    agents: {
      ...base.agents,
      [agentId]: { ...agent, ...agentOverrides },
    },
  };
}

// ─── SS1: Agent status change diff ─────────────────────────────────────

describe("SS1: diffOfficeState — agent status changes", () => {
  it("detects status change from idle to active", () => {
    const prev = makeSnapshot();
    const next = makeSnapshotWithAgent("recepcion", {
      currentStatus: "active",
      currentTaskSummary: "Procesando email",
      isReal: true,
    });

    const events = diffOfficeState(prev, next);
    const statusEvt = events.find(
      (e) => e.type === "agent_status_changed" && (e.data as Record<string, unknown>).agentId === "recepcion",
    );

    expect(statusEvt).toBeDefined();
    expect(statusEvt!.data).toMatchObject({
      agentId: "recepcion",
      previousStatus: "idle",
      newStatus: "active",
    });
  });

  it("detects multiple agent status changes in one diff", () => {
    const prev = makeSnapshot();
    const next = makeSnapshot();
    // Mutate two agents
    next.agents["recepcion"] = { ...next.agents["recepcion"], currentStatus: "active", isReal: true };
    next.agents["fiscal"] = { ...next.agents["fiscal"], currentStatus: "delegating", isReal: true };

    const events = diffOfficeState(prev, next);
    const statusEvents = events.filter((e) => e.type === "agent_status_changed");

    expect(statusEvents.length).toBe(2);
  });
});

// ─── SS2: Blocked events ────────────────────────────────────────────────

describe("SS2: diffOfficeState — blocked events", () => {
  it("emits agent_blocked (not agent_status_changed) when agent becomes blocked", () => {
    const prev = makeSnapshotWithAgent("fiscal", { currentStatus: "active" });
    const next = makeSnapshotWithAgent("fiscal", {
      currentStatus: "blocked",
      blockedReason: "Permiso denegado",
      lastEventType: "tool_blocked",
    });

    const events = diffOfficeState(prev, next);
    const blockedEvt = events.find((e) => e.type === "agent_blocked");
    const statusEvt = events.find((e) => e.type === "agent_status_changed");

    expect(blockedEvt).toBeDefined();
    expect(statusEvt).toBeUndefined();
    expect(blockedEvt!.data).toMatchObject({
      agentId: "fiscal",
      blockedReason: "Permiso denegado",
    });
  });
});

// ─── SS3: Delegation diff ───────────────────────────────────────────────

describe("SS3: diffOfficeState — delegations", () => {
  it("detects new delegation", () => {
    const prev = makeSnapshot();
    const next = makeSnapshot();
    next.activeDelegations = [
      {
        fromAgentId: "ceo",
        toAgentId: "recepcion",
        reason: "Clasificar urgente",
        caseId: null,
        timestamp: new Date().toISOString(),
      },
    ];

    const events = diffOfficeState(prev, next);
    const started = events.find((e) => e.type === "delegation_started");

    expect(started).toBeDefined();
    expect(started!.data).toMatchObject({
      fromAgentId: "ceo",
      toAgentId: "recepcion",
    });
  });

  it("detects finished delegation", () => {
    const del = {
      fromAgentId: "ceo",
      toAgentId: "fiscal",
      reason: "IVA",
      caseId: null,
      timestamp: new Date().toISOString(),
    };
    const prev = makeSnapshot();
    prev.activeDelegations = [del];
    const next = makeSnapshot();
    next.activeDelegations = [];

    const events = diffOfficeState(prev, next);
    const finished = events.find((e) => e.type === "delegation_finished");

    expect(finished).toBeDefined();
    expect(finished!.data).toMatchObject({
      fromAgentId: "ceo",
      toAgentId: "fiscal",
    });
  });
});

// ─── SS4: Activity diff ────────────────────────────────────────────────

describe("SS4: diffOfficeState — new activity", () => {
  it("detects new activity entries", () => {
    const prev = makeSnapshot();
    const next = makeSnapshot();
    next.recentActivity = [
      {
        id: "act-001",
        agentId: "recepcion",
        eventType: "tool_called",
        result: "ok",
        summary: "Buscó contacto",
        caseId: null,
        timestamp: new Date().toISOString(),
      },
    ];

    const events = diffOfficeState(prev, next);
    const actEvt = events.find((e) => e.type === "activity");

    expect(actEvt).toBeDefined();
    expect(actEvt!.data).toMatchObject({ id: "act-001", agentId: "recepcion" });
  });

  it("ignores already-known activity entries", () => {
    const entry = {
      id: "act-002",
      agentId: "fiscal",
      eventType: "tool_called",
      result: "ok",
      summary: "Calculó IVA",
      caseId: null,
      timestamp: new Date().toISOString(),
    };
    const prev = makeSnapshot();
    prev.recentActivity = [entry];
    const next = makeSnapshot();
    next.recentActivity = [entry];

    const events = diffOfficeState(prev, next);
    const actEvents = events.filter((e) => e.type === "activity");

    expect(actEvents.length).toBe(0);
  });
});

// ─── SS5: No changes ───────────────────────────────────────────────────

describe("SS5: diffOfficeState — no changes", () => {
  it("returns empty array for identical snapshots", () => {
    const snap = makeSnapshot();
    const events = diffOfficeState(snap, snap);
    expect(events).toEqual([]);
  });
});

// ─── SS6: Owner changed ────────────────────────────────────────────────

describe("SS6: diffOfficeState — owner changes", () => {
  it("detects visibleOwnerCaseId change", () => {
    const prev = makeSnapshotWithAgent("recepcion", { visibleOwnerCaseId: null });
    const next = makeSnapshotWithAgent("recepcion", { visibleOwnerCaseId: "case-123" });

    const events = diffOfficeState(prev, next);
    const ownerEvt = events.find((e) => e.type === "owner_changed");

    expect(ownerEvt).toBeDefined();
    expect(ownerEvt!.data).toMatchObject({
      agentId: "recepcion",
      newCaseId: "case-123",
    });
  });
});

// ─── SS7: SSE serialization ────────────────────────────────────────────

describe("SS7: SSE serialization", () => {
  it("serializeSSE produces correct format", () => {
    const event: OfficeStreamEvent = {
      type: "heartbeat",
      data: {},
      timestamp: "2025-01-01T00:00:00.000Z",
    };
    const result = serializeSSE(event);
    expect(result).toMatch(/^data: /);
    expect(result).toMatch(/\n\n$/);

    const parsed = JSON.parse(result.replace("data: ", "").trim());
    expect(parsed.type).toBe("heartbeat");
  });

  it("serializeHeartbeat has correct type", () => {
    const result = serializeHeartbeat();
    const parsed = JSON.parse(result.replace("data: ", "").trim());
    expect(parsed.type).toBe("heartbeat");
    expect(parsed.timestamp).toBeDefined();
  });

  it("serializeSnapshot wraps full snapshot", () => {
    const snap = makeSnapshot();
    const result = serializeSnapshot(snap);
    const parsed = JSON.parse(result.replace("data: ", "").trim());
    expect(parsed.type).toBe("office_snapshot");
    expect(parsed.data).toBeDefined();
  });

  it("serializeError includes message", () => {
    const result = serializeError("test error");
    const parsed = JSON.parse(result.replace("data: ", "").trim());
    expect(parsed.type).toBe("error");
    expect(parsed.data.message).toBe("test error");
  });
});

// ─── SS8: applyStreamEvent ─────────────────────────────────────────────

describe("SS8: applyStreamEvent — applies events correctly", () => {
  const baseSnapshot = makeSnapshot();

  it("applies office_snapshot — full replacement", () => {
    const newSnap = makeSnapshotWithAgent("ceo", { currentStatus: "active" });
    const event: OfficeStreamEvent = {
      type: "office_snapshot",
      data: newSnap as unknown as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    };
    const result = applyStreamEvent(baseSnapshot, event);
    expect(result.agents["ceo"].currentStatus).toBe("active");
  });

  it("applies agent_status_changed", () => {
    const event: OfficeStreamEvent = {
      type: "agent_status_changed",
      data: {
        agentId: "recepcion",
        newStatus: "active",
        taskSummary: "Procesando",
        activeCaseId: "case-1",
      },
      timestamp: new Date().toISOString(),
    };
    const result = applyStreamEvent(baseSnapshot, event);
    expect(result.agents["recepcion"].currentStatus).toBe("active");
    expect(result.agents["recepcion"].currentTaskSummary).toBe("Procesando");
    expect(result.agents["recepcion"].isReal).toBe(true);
  });

  it("applies agent_blocked", () => {
    const event: OfficeStreamEvent = {
      type: "agent_blocked",
      data: {
        agentId: "fiscal",
        blockedReason: "Sin permiso",
        lastEventType: "tool_blocked",
      },
      timestamp: new Date().toISOString(),
    };
    const result = applyStreamEvent(baseSnapshot, event);
    expect(result.agents["fiscal"].currentStatus).toBe("blocked");
    expect(result.agents["fiscal"].blockedReason).toBe("Sin permiso");
    expect(result.agents["fiscal"].isReal).toBe(true);
  });

  it("applies owner_changed", () => {
    const event: OfficeStreamEvent = {
      type: "owner_changed",
      data: { agentId: "recepcion", newCaseId: "case-99" },
      timestamp: new Date().toISOString(),
    };
    const result = applyStreamEvent(baseSnapshot, event);
    expect(result.agents["recepcion"].visibleOwnerCaseId).toBe("case-99");
  });

  it("applies delegation_started", () => {
    const event: OfficeStreamEvent = {
      type: "delegation_started",
      data: {
        fromAgentId: "ceo",
        toAgentId: "recepcion",
        reason: "Urgente",
        caseId: null,
      },
      timestamp: new Date().toISOString(),
    };
    const result = applyStreamEvent(baseSnapshot, event);
    expect(result.activeDelegations.length).toBe(1);
    expect(result.activeDelegations[0].fromAgentId).toBe("ceo");
  });

  it("applies delegation_finished — removes matching delegation", () => {
    const withDel = makeSnapshot();
    withDel.activeDelegations = [
      {
        fromAgentId: "ceo",
        toAgentId: "fiscal",
        reason: "IVA",
        caseId: null,
        timestamp: new Date().toISOString(),
      },
    ];
    const event: OfficeStreamEvent = {
      type: "delegation_finished",
      data: { fromAgentId: "ceo", toAgentId: "fiscal" },
      timestamp: new Date().toISOString(),
    };
    const result = applyStreamEvent(withDel, event);
    expect(result.activeDelegations.length).toBe(0);
  });

  it("applies activity — adds to front, deduplicates", () => {
    const event: OfficeStreamEvent = {
      type: "activity",
      data: {
        id: "act-new",
        agentId: "recepcion",
        eventType: "tool_called",
        result: "ok",
        summary: "Nuevo evento",
        caseId: null,
      },
      timestamp: new Date().toISOString(),
    };
    const result = applyStreamEvent(baseSnapshot, event);
    expect(result.recentActivity.length).toBe(1);
    expect(result.recentActivity[0].id).toBe("act-new");

    // Apply same event again — should not duplicate
    const result2 = applyStreamEvent(result, event);
    expect(result2.recentActivity.length).toBe(1);
  });

  it("applies heartbeat — no state change", () => {
    const event: OfficeStreamEvent = {
      type: "heartbeat",
      data: {},
      timestamp: new Date().toISOString(),
    };
    const result = applyStreamEvent(baseSnapshot, event);
    expect(result).toBe(baseSnapshot); // exact same reference
  });

  it("ignores unknown agent in agent_status_changed", () => {
    const event: OfficeStreamEvent = {
      type: "agent_status_changed",
      data: {
        agentId: "unknown-agent-xyz",
        newStatus: "active",
        taskSummary: null,
        activeCaseId: null,
      },
      timestamp: new Date().toISOString(),
    };
    const result = applyStreamEvent(baseSnapshot, event);
    expect(result).toBe(baseSnapshot);
  });
});

// ─── SS9: Unknown events ───────────────────────────────────────────────

describe("SS9: applyStreamEvent — unknown events are safe", () => {
  it("returns snapshot unchanged for unknown event type", () => {
    const snap = makeSnapshot();
    const event = {
      type: "totally_new_event_type" as OfficeStreamEvent["type"],
      data: { foo: "bar" },
      timestamp: new Date().toISOString(),
    };
    const result = applyStreamEvent(snap, event);
    expect(result).toBe(snap);
  });
});

// ─── SS10: Hook file structure ─────────────────────────────────────────

describe("SS10: useOfficeStream hook file", () => {
  const hookPath = path.resolve(__dirname, "../../src/hooks/useOfficeStream.ts");
  const content = fs.readFileSync(hookPath, "utf-8");

  it("exports useOfficeStream function", () => {
    expect(content).toMatch(/export function useOfficeStream/);
  });

  it("exports applyStreamEvent for testing", () => {
    expect(content).toMatch(/export \{ applyStreamEvent \}/);
  });

  it("exports ConnectionStatus type", () => {
    expect(content).toMatch(/export type ConnectionStatus/);
  });

  it("connects to /api/office-state/stream", () => {
    expect(content).toContain("/api/office-state/stream");
  });

  it("has polling fallback", () => {
    expect(content).toContain("/api/office-state?window=300");
    expect(content).toMatch(/POLL_INTERVAL/);
  });

  it("has reconnection with max attempts", () => {
    expect(content).toMatch(/MAX_RECONNECT_ATTEMPTS/);
    expect(content).toMatch(/RECONNECT_DELAY/);
  });

  it("uses AbortController for clean teardown", () => {
    expect(content).toMatch(/AbortController/);
  });
});

// ─── SS11: SSE stream route ────────────────────────────────────────────

describe("SS11: SSE stream route", () => {
  const routePath = path.resolve(
    __dirname,
    "../../src/app/api/office-state/stream/route.ts",
  );
  const content = fs.readFileSync(routePath, "utf-8");

  it("exports GET handler", () => {
    expect(content).toMatch(/export async function GET/);
  });

  it("uses force-dynamic", () => {
    expect(content).toContain('force-dynamic');
  });

  it("sets maxDuration for Vercel", () => {
    expect(content).toMatch(/maxDuration\s*=\s*300/);
  });

  it("sets correct SSE headers", () => {
    expect(content).toContain("text/event-stream");
    expect(content).toContain("no-store");
  });

  it("handles abort signal for client disconnect", () => {
    expect(content).toContain("req.signal");
    expect(content).toMatch(/abort/);
  });

  it("sends initial snapshot then diffs", () => {
    expect(content).toMatch(/serializeSnapshot/);
    expect(content).toMatch(/diffOfficeState/);
  });

  it("sends heartbeats", () => {
    expect(content).toMatch(/serializeHeartbeat/);
  });
});

// ─── SS12: AgentOfficeMap blocked visual ───────────────────────────────

describe("SS12: AgentOfficeMap — blocked visual state", () => {
  const mapPath = path.resolve(
    __dirname,
    "../../src/components/AgentOfficeMap.tsx",
  );
  const content = fs.readFileSync(mapPath, "utf-8");

  it("includes 'blocked' in AgentStatus type", () => {
    expect(content).toMatch(/type AgentStatus\s*=.*"blocked"/);
  });

  it("includes 'blocked' entry in STATUS_LABEL with 'Bloqueado'", () => {
    expect(content).toMatch(/blocked:\s*"Bloqueado"/);
  });

  it("maps real blocked status to visual blocked (not idle)", () => {
    expect(content).toMatch(/blocked:\s*"blocked"/);
  });

  it("has red visual indicator for blocked agents", () => {
    expect(content).toMatch(/blocked.*bg-red-500/s);
  });

  it("has red glow styling for blocked agent badges", () => {
    expect(content).toMatch(/rgba\(239,68,68/);
  });

  it("has bold/colored label for blocked status text", () => {
    expect(content).toMatch(/blocked.*text-red-400.*font-semibold/s);
  });
});

// ─── SS13: AgentOfficeMap uses SSE hook ────────────────────────────────

describe("SS13: AgentOfficeMap — uses useOfficeStream", () => {
  const mapPath = path.resolve(
    __dirname,
    "../../src/components/AgentOfficeMap.tsx",
  );
  const content = fs.readFileSync(mapPath, "utf-8");

  it("imports useOfficeStream hook", () => {
    expect(content).toMatch(/import.*useOfficeStream.*from/);
  });

  it("calls useOfficeStream()", () => {
    expect(content).toMatch(/useOfficeStream\(\)/);
  });

  it("does NOT directly fetch /api/office-state for polling", () => {
    // Should no longer have the old polling pattern
    const pollPattern = /fetch\("\/api\/office-state\?window=300"\)/;
    expect(content).not.toMatch(pollPattern);
  });

  it("does NOT have setInterval-based polling for office state", () => {
    // Old pattern was setInterval(pollRealState, 5000)
    expect(content).not.toMatch(/setInterval\(pollRealState/);
  });

  it("uses officeSnapshot from hook", () => {
    expect(content).toMatch(/officeSnapshot/);
  });
});
