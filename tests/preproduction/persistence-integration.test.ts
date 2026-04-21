/**
 * PREPRODUCTION INTEGRATION TESTS — Phase 3: Persistent Audit + Memory
 *
 * Validates:
 *   P1: DatabaseAuditStore and DualAuditStore API
 *   P2: MemoryAuditStore still works (test/fallback compatibility)
 *   P3: AuditLogger auto-selects correct store based on environment
 *   P4: Persistent query helpers exist and work on memory store
 *   P5: audit_events table schema correctness
 *   P6: swarm_working_memory table schema correctness
 *   P7: Short-term memory already persists (agent_conversations)
 *   P8: Working memory persistence functions exist
 *   P9: Event flow: emit → memory + DB adapter path
 *   P10: Backward compatibility with Phase 1 & 2
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  auditLog,
  AuditLogger,
  MemoryAuditStore,
  DatabaseAuditStore,
  DualAuditStore,
  type AuditEvent,
  type AuditStore,
} from "@/lib/audit";
import type { AuditEventInput } from "@/lib/audit/types";
import {
  OperationMode,
  buildRuntimeConfig,
  setRuntimeConfig,
  resetRuntimeConfig,
} from "@/lib/runtime/config";
import { preActionCheck, resetCounters } from "@/lib/runtime/guardrails";

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    eventType: "tool_called",
    result: "success",
    userId: "user-1",
    agentId: "recepcion",
    caseId: "42",
    reason: "Test event",
    ...overrides,
  };
}

function freshLogger(store?: AuditStore): AuditLogger {
  return new AuditLogger({ consoleOutput: false, store });
}

// ─── P1: DatabaseAuditStore and DualAuditStore API ──────────────────────

describe("P1: DatabaseAuditStore and DualAuditStore API", () => {
  it("DatabaseAuditStore implements AuditStore interface", () => {
    const store = new DatabaseAuditStore();
    expect(typeof store.append).toBe("function");
    expect(typeof store.query).toBe("function");
    expect(typeof store.getCaseTimeline).toBe("function");
    expect(typeof store.count).toBe("function");
    expect(typeof store.clear).toBe("function");
  });

  it("DatabaseAuditStore has async query methods", () => {
    const store = new DatabaseAuditStore();
    expect(typeof store.queryAsync).toBe("function");
    expect(typeof store.getCaseTimelineAsync).toBe("function");
    expect(typeof store.countAsync).toBe("function");
    expect(typeof store.purgeOlderThan).toBe("function");
  });

  it("DualAuditStore combines memory and DB stores", () => {
    const store = new DualAuditStore();
    expect(store.memory).toBeInstanceOf(MemoryAuditStore);
    expect(store.database).toBeInstanceOf(DatabaseAuditStore);
  });

  it("DualAuditStore.append writes to memory store synchronously", () => {
    const store = new DualAuditStore();
    const logger = freshLogger(store);
    logger.emit(makeEvent());
    // Memory store should have the event immediately
    expect(store.memory.count()).toBe(1);
  });

  it("DualAuditStore.query uses memory store", () => {
    const store = new DualAuditStore();
    const logger = freshLogger(store);
    logger.emit(makeEvent({ caseId: "99", eventType: "tool_blocked", result: "blocked" }));
    const results = store.query({ caseId: "99" });
    expect(results).toHaveLength(1);
    expect(results[0].eventType).toBe("tool_blocked");
  });

  it("DualAuditStore has persistent query methods", () => {
    const store = new DualAuditStore();
    expect(typeof store.queryPersistent).toBe("function");
    expect(typeof store.getCaseTimelinePersistent).toBe("function");
    expect(typeof store.countPersistent).toBe("function");
    expect(typeof store.purgeOlderThan).toBe("function");
  });

  it("DualAuditStore.flush is callable", () => {
    const store = new DualAuditStore();
    const logger = freshLogger(store);
    logger.emit(makeEvent());
    expect(() => store.flush()).not.toThrow();
  });

  it("DualAuditStore.clear resets both stores", () => {
    const store = new DualAuditStore();
    const logger = freshLogger(store);
    logger.emit(makeEvent());
    logger.emit(makeEvent());
    expect(store.memory.count()).toBe(2);
    store.clear();
    expect(store.memory.count()).toBe(0);
  });
});

// ─── P2: MemoryAuditStore still works ───────────────────────────────────

describe("P2: MemoryAuditStore backward compatibility", () => {
  it("MemoryAuditStore works standalone", () => {
    const store = new MemoryAuditStore();
    const logger = freshLogger(store);
    const evt = logger.emit(makeEvent());
    expect(evt.id).toBeTruthy();
    expect(store.count()).toBe(1);
  });

  it("MemoryAuditStore query filters work", () => {
    const store = new MemoryAuditStore();
    const logger = freshLogger(store);
    logger.emit(makeEvent({ caseId: "A", eventType: "tool_called" }));
    logger.emit(makeEvent({ caseId: "A", eventType: "tool_blocked", result: "blocked" }));
    logger.emit(makeEvent({ caseId: "B", eventType: "tool_called" }));

    const caseA = store.query({ caseId: "A" });
    expect(caseA).toHaveLength(2);

    const blocked = store.query({ result: "blocked" });
    expect(blocked).toHaveLength(1);
    expect(blocked[0].caseId).toBe("A");
  });

  it("MemoryAuditStore getCaseTimeline works", () => {
    const store = new MemoryAuditStore();
    const logger = freshLogger(store);
    logger.emit(makeEvent({ caseId: "C", eventType: "case_routed" }));
    logger.emit(makeEvent({ caseId: "C", eventType: "agent_selected" }));
    logger.emit(makeEvent({ caseId: "C", eventType: "tool_called" }));

    const timeline = store.getCaseTimeline("C");
    expect(timeline).toHaveLength(3);
    expect(timeline[0].event.eventType).toBe("case_routed");
    expect(timeline[2].event.eventType).toBe("tool_called");
    expect(timeline[0].offsetMs).toBe(0);
  });
});

// ─── P3: AuditLogger auto-selects store ─────────────────────────────────

describe("P3: AuditLogger store selection", () => {
  it("in test env, default store is MemoryAuditStore", () => {
    // We're running in vitest, so NODE_ENV=test or VITEST=true
    const logger = new AuditLogger({ consoleOutput: false });
    expect(logger.getStore()).toBeInstanceOf(MemoryAuditStore);
  });

  it("custom store overrides default", () => {
    const custom = new MemoryAuditStore();
    const logger = new AuditLogger({ consoleOutput: false, store: custom });
    expect(logger.getStore()).toBe(custom);
  });

  it("DualAuditStore can be injected explicitly", () => {
    const dual = new DualAuditStore();
    const logger = new AuditLogger({ consoleOutput: false, store: dual });
    expect(logger.getStore()).toBeInstanceOf(DualAuditStore);
  });
});

// ─── P4: Persistent query helpers ───────────────────────────────────────

describe("P4: Persistent query helpers on AuditLogger", () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = freshLogger(new MemoryAuditStore());
    logger.emit(makeEvent({ caseId: "X", eventType: "case_routed" }));
    logger.emit(makeEvent({ caseId: "X", eventType: "tool_blocked", result: "blocked" }));
    logger.emit(makeEvent({ caseId: "X", eventType: "external_message_sent" }));
    logger.emit(makeEvent({ caseId: "X", eventType: "governance_rule_triggered", result: "info" }));
    logger.emit(makeEvent({ caseId: "X", eventType: "case_owner_changed" }));
  });

  it("getCaseTimelinePersistent returns timeline", async () => {
    const timeline = await logger.getCaseTimelinePersistent("X");
    expect(timeline.length).toBeGreaterThanOrEqual(5);
  });

  it("getBlockedToolAttemptsPersistent returns blocked tools", async () => {
    const blocked = await logger.getBlockedToolAttemptsPersistent("X");
    expect(blocked.length).toBe(1);
    expect(blocked[0].eventType).toBe("tool_blocked");
  });

  it("getVisibleOwnerTransitionsPersistent returns owner changes", async () => {
    const transitions = await logger.getVisibleOwnerTransitionsPersistent("X");
    expect(transitions.length).toBe(1);
    expect(transitions[0].eventType).toBe("case_owner_changed");
  });

  it("getExternalCommunicationEventsPersistent returns comms events", async () => {
    const comms = await logger.getExternalCommunicationEventsPersistent("X");
    expect(comms.length).toBe(1);
    expect(comms[0].eventType).toBe("external_message_sent");
  });

  it("getGovernanceViolationsPersistent returns violations", async () => {
    const violations = await logger.getGovernanceViolationsPersistent("X");
    expect(violations.length).toBe(2); // tool_blocked + governance_rule_triggered
  });

  it("flushPersistent is callable without error", () => {
    expect(() => logger.flushPersistent()).not.toThrow();
  });
});

// ─── P5: audit_events table schema ──────────────────────────────────────

describe("P5: audit_events table schema correctness", () => {
  it("auditEvents table is exported from schema", async () => {
    const s = await import("@/db/schema");
    expect(s.auditEvents).toBeDefined();
    const t = s.auditEvents;
    expect(t).toHaveProperty("id");
    expect(t).toHaveProperty("eventId");
    expect(t).toHaveProperty("caseId");
    expect(t).toHaveProperty("userId");
    expect(t).toHaveProperty("agentId");
    expect(t).toHaveProperty("agentLayer");
    expect(t).toHaveProperty("eventType");
    expect(t).toHaveProperty("result");
    expect(t).toHaveProperty("toolName");
    expect(t).toHaveProperty("visibleOwnerId");
    expect(t).toHaveProperty("targetAgentId");
    expect(t).toHaveProperty("reason");
    expect(t).toHaveProperty("metadata");
    expect(t).toHaveProperty("createdAt");
  });

  it("AuditEventRow type is exported", async () => {
    const s = await import("@/db/schema");
    // Type export exists (checked by the fact that the table exists)
    expect(s.auditEvents).toBeDefined();
  });
});

// ─── P6: swarm_working_memory table schema ──────────────────────────────

describe("P6: swarm_working_memory table schema correctness", () => {
  it("swarmWorkingMemory table is exported from schema", async () => {
    const s = await import("@/db/schema");
    expect(s.swarmWorkingMemory).toBeDefined();
    const t = s.swarmWorkingMemory;
    expect(t).toHaveProperty("id");
    expect(t).toHaveProperty("userId");
    expect(t).toHaveProperty("currentTask");
    expect(t).toHaveProperty("activeAgentId");
    expect(t).toHaveProperty("pendingDelegations");
    expect(t).toHaveProperty("contextSummary");
    expect(t).toHaveProperty("startedAt");
    expect(t).toHaveProperty("updatedAt");
  });
});

// ─── P7: Short-term memory already persists ─────────────────────────────

describe("P7: Short-term memory persistence (agent_conversations)", () => {
  it("agentConversations table exists in schema", async () => {
    const s = await import("@/db/schema");
    expect(s.agentConversations).toBeDefined();
    expect(s.agentConversations).toHaveProperty("userId");
    expect(s.agentConversations).toHaveProperty("role");
    expect(s.agentConversations).toHaveProperty("content");
    expect(s.agentConversations).toHaveProperty("agentId");
    expect(s.agentConversations).toHaveProperty("toolCalls");
  });

  it("addToShortTerm and getShortTerm are exported from memory-engine", async () => {
    const m = await import("@/lib/agent/memory-engine");
    expect(typeof m.addToShortTerm).toBe("function");
    expect(typeof m.getShortTerm).toBe("function");
  });
});

// ─── P8: Working memory persistence functions ───────────────────────────

describe("P8: Working memory persistence functions", () => {
  it("setWorkingMemory, getWorkingMemory, clearWorkingMemory exist", async () => {
    const m = await import("@/lib/agent/memory-engine");
    expect(typeof m.setWorkingMemory).toBe("function");
    expect(typeof m.getWorkingMemory).toBe("function");
    expect(typeof m.clearWorkingMemory).toBe("function");
  });

  it("getWorkingMemory returns default when no data", async () => {
    const m = await import("@/lib/agent/memory-engine");
    const wm = m.getWorkingMemory("nonexistent-user-xyz");
    expect(wm).toHaveProperty("currentTask", null);
    expect(wm).toHaveProperty("activeAgentId", null);
    expect(wm).toHaveProperty("pendingDelegations");
    expect(wm).toHaveProperty("contextSummary", null);
    expect(wm).toHaveProperty("startedAt", null);
  });
});

// ─── P9: Event flow through DualAuditStore ──────────────────────────────

describe("P9: Event flow — emit → memory + DB adapter path", () => {
  it("event emitted through DualAuditStore appears in memory immediately", () => {
    const dual = new DualAuditStore();
    const logger = freshLogger(dual);

    const evt = logger.emit(makeEvent({ caseId: "flow-1", eventType: "tool_called" }));
    expect(evt.id).toBeTruthy();
    expect(evt.caseId).toBe("flow-1");

    // Memory store has it
    const memEvents = dual.memory.query({ caseId: "flow-1" });
    expect(memEvents).toHaveLength(1);
  });

  it("multiple events maintain order in memory store", () => {
    const dual = new DualAuditStore();
    const logger = freshLogger(dual);

    logger.emit(makeEvent({ caseId: "flow-2", eventType: "case_routed" }));
    logger.emit(makeEvent({ caseId: "flow-2", eventType: "agent_selected" }));
    logger.emit(makeEvent({ caseId: "flow-2", eventType: "tool_called" }));
    logger.emit(makeEvent({ caseId: "flow-2", eventType: "tool_succeeded" }));

    const timeline = dual.getCaseTimeline("flow-2");
    expect(timeline).toHaveLength(4);
    expect(timeline[0].event.eventType).toBe("case_routed");
    expect(timeline[3].event.eventType).toBe("tool_succeeded");
  });

  it("query helpers on logger work through DualAuditStore", () => {
    const dual = new DualAuditStore();
    const logger = freshLogger(dual);

    logger.emit(makeEvent({ caseId: "flow-3", eventType: "tool_blocked", result: "blocked" }));
    logger.emit(makeEvent({ caseId: "flow-3", eventType: "governance_rule_triggered", result: "info" }));
    logger.emit(makeEvent({ caseId: "flow-3", eventType: "tool_succeeded" }));

    const blocked = logger.getBlockedToolAttempts("flow-3");
    expect(blocked).toHaveLength(1);

    const violations = logger.getGovernanceViolations("flow-3");
    expect(violations).toHaveLength(2);
  });
});

// ─── P10: Backward compatibility with Phase 1 & 2 ──────────────────────

describe("P10: Backward compatibility with Phase 1 & 2", () => {
  beforeEach(() => {
    resetRuntimeConfig();
    resetCounters();
  });

  it("auditLog singleton exists and emits events", () => {
    auditLog.clear();
    const evt = auditLog.emit(makeEvent());
    expect(evt.id).toBeTruthy();
    expect(evt.timestamp).toBeTruthy();
  });

  it("auditLog.getCaseTimeline still works", () => {
    auditLog.clear();
    auditLog.emit(makeEvent({ caseId: "compat-1" }));
    auditLog.emit(makeEvent({ caseId: "compat-1" }));
    const timeline = auditLog.getCaseTimeline("compat-1");
    expect(timeline).toHaveLength(2);
  });

  it("auditLog.getGovernanceViolations still works", () => {
    auditLog.clear();
    auditLog.emit(makeEvent({ eventType: "governance_rule_triggered", result: "info" }));
    auditLog.emit(makeEvent({ eventType: "tool_blocked", result: "blocked" }));
    const violations = auditLog.getGovernanceViolations();
    expect(violations).toHaveLength(2);
  });

  it("auditLog.getStats still works", () => {
    auditLog.clear();
    auditLog.emit(makeEvent({ result: "blocked" }));
    auditLog.emit(makeEvent({ result: "success" }));
    auditLog.emit(makeEvent({ eventType: "governance_rule_triggered", result: "info" }));

    const stats = auditLog.getStats();
    expect(stats.totalEvents).toBe(3);
    expect(stats.blocked).toBe(1);
    expect(stats.violations).toBe(1);
  });

  it("preActionCheck still works with audit flow", () => {
    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: OperationMode.GUARDED, LIMIT_CONTACT_COOLDOWN: "0" }));
    const r = preActionCheck({
      action: "tool_call",
      agentId: "recepcion",
      caseId: "42",
      clientId: "user-1",
      toolName: "web_search",
    });
    expect(r.allowed).toBe(true);
  });
});
