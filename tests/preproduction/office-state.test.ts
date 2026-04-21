/**
 * PREPRODUCTION TESTS — Office State: Real swarm state → office visual
 *
 * Validates:
 *   OS1: buildOfficeState from real audit events
 *   OS2: Event → status mapping (active, delegating, blocked, internal_work)
 *   OS3: Visible ownership reflected correctly
 *   OS4: Fallback when no data
 *   OS5: Delegation extraction
 *   OS6: Activity feed construction
 *   OS7: Agent layer mapping
 *   OS8: API endpoint route file exists with correct structure
 *   OS9: AgentOfficeMap.tsx integration (polls real state)
 *   OS10: Module exports
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

import {
  buildOfficeState,
  buildFallbackState,
  deriveAgentStatus,
  extractDelegations,
  buildActivityFeed,
  AGENT_LAYER_MAP,
  ALL_AGENT_IDS,
} from "@/lib/office";

import type { AuditEvent } from "@/lib/audit/types";

// ─── Helpers ─────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "../..");

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    eventType: "tool_called",
    result: "success",
    caseId: "case-1",
    userId: "user-1",
    agentId: "recepcion",
    agentLayer: "visible",
    visibleOwnerId: null,
    targetAgentId: null,
    toolName: null,
    reason: "Test event",
    metadata: {},
    ...overrides,
  };
}

// ─── OS1: buildOfficeState from real events ──────────────────────────────

describe("OS1: buildOfficeState from real events", () => {
  it("produces snapshot with all 10 agents", () => {
    const snapshot = buildOfficeState({
      recentEvents: [makeEvent({ agentId: "recepcion", eventType: "tool_called" })],
      activeCases: [],
    });
    expect(Object.keys(snapshot.agents)).toHaveLength(10);
    expect(snapshot.hasRealData).toBe(true);
  });

  it("marks agent with events as isReal: true", () => {
    const snapshot = buildOfficeState({
      recentEvents: [makeEvent({ agentId: "fiscal", eventType: "tool_called" })],
      activeCases: [],
    });
    expect(snapshot.agents["fiscal"].isReal).toBe(true);
    expect(snapshot.agents["ceo"].isReal).toBe(false); // no events for CEO
  });

  it("includes generatedAt timestamp", () => {
    const snapshot = buildOfficeState({ recentEvents: [], activeCases: [] });
    expect(snapshot.generatedAt).toBeTruthy();
    expect(new Date(snapshot.generatedAt).getTime()).toBeGreaterThan(0);
  });

  it("hasRealData false when no events and no cases", () => {
    const snapshot = buildOfficeState({ recentEvents: [], activeCases: [] });
    expect(snapshot.hasRealData).toBe(false);
  });
});

// ─── OS2: Event → Status Mapping ─────────────────────────────────────────

describe("OS2: Event → status mapping", () => {
  it("tool_called → active for visible agents", () => {
    const events = [makeEvent({ agentId: "recepcion", eventType: "tool_called", toolName: "search_emails" })];
    const { status, taskSummary } = deriveAgentStatus(events, "recepcion");
    expect(status).toBe("active");
    expect(taskSummary).toContain("search_emails");
  });

  it("tool_called → internal_work for modulo-interno agents", () => {
    const events = [makeEvent({ agentId: "fiscal", eventType: "tool_called", toolName: "extract_invoice" })];
    const { status } = deriveAgentStatus(events, "fiscal");
    expect(status).toBe("internal_work");
  });

  it("tool_called → internal_work for experta-interna agents", () => {
    const events = [makeEvent({ agentId: "consultor-servicios", eventType: "tool_called" })];
    const { status } = deriveAgentStatus(events, "consultor-servicios");
    expect(status).toBe("internal_work");
  });

  it("agent_delegated → delegating for source agent", () => {
    const events = [makeEvent({
      agentId: "ceo",
      eventType: "agent_delegated",
      targetAgentId: "recepcion",
      reason: "Revisar bandeja",
    })];
    const { status, taskSummary } = deriveAgentStatus(events, "ceo");
    expect(status).toBe("delegating");
    expect(taskSummary).toContain("Delegando");
  });

  it("agent_delegated → active for target agent", () => {
    const events = [makeEvent({
      agentId: "ceo",
      eventType: "agent_delegated",
      targetAgentId: "recepcion",
      reason: "Revisar bandeja",
    })];
    const { status } = deriveAgentStatus(events, "recepcion");
    expect(status).toBe("active");
  });

  it("tool_blocked → blocked", () => {
    const events = [makeEvent({
      agentId: "recepcion",
      eventType: "tool_blocked",
      result: "blocked",
      reason: "Rate limit exceeded",
    })];
    const { status, blockedReason } = deriveAgentStatus(events, "recepcion");
    expect(status).toBe("blocked");
    expect(blockedReason).toContain("Rate limit");
  });

  it("agent_blocked → blocked", () => {
    const events = [makeEvent({
      agentId: "fiscal",
      eventType: "agent_blocked",
      result: "blocked",
      reason: "Kill switch KILL_MUTATIONS active",
    })];
    const { status, blockedReason } = deriveAgentStatus(events, "fiscal");
    expect(status).toBe("blocked");
    expect(blockedReason).toContain("Kill switch");
  });

  it("governance_rule_triggered → blocked", () => {
    const events = [makeEvent({
      agentId: "comercial-principal",
      eventType: "governance_rule_triggered",
      reason: "Ownership conflict",
    })];
    const { status } = deriveAgentStatus(events, "comercial-principal");
    expect(status).toBe("blocked");
  });

  it("no events → idle", () => {
    const { status, lastEvent } = deriveAgentStatus([], "ceo");
    expect(status).toBe("idle");
    expect(lastEvent).toBeNull();
  });

  it("case_routed → active", () => {
    const events = [makeEvent({ agentId: "ceo", eventType: "case_routed" })];
    const { status } = deriveAgentStatus(events, "ceo");
    expect(status).toBe("active");
  });

  it("external_message_sent → active", () => {
    const events = [makeEvent({ agentId: "recepcion", eventType: "external_message_sent" })];
    const { status } = deriveAgentStatus(events, "recepcion");
    expect(status).toBe("active");
  });
});

// ─── OS3: Visible ownership ──────────────────────────────────────────────

describe("OS3: Visible ownership reflected", () => {
  it("agent with visibleOwnerId on active case gets visibleOwnerCaseId", () => {
    const snapshot = buildOfficeState({
      recentEvents: [],
      activeCases: [{
        id: 42,
        visibleOwnerId: "recepcion",
        status: "active",
        subject: "Consulta energía",
        channel: "chat",
        updatedAt: new Date(),
      }],
    });
    expect(snapshot.agents["recepcion"].visibleOwnerCaseId).toBe("42");
    expect(snapshot.agents["ceo"].visibleOwnerCaseId).toBeNull();
  });

  it("active cases included in snapshot", () => {
    const snapshot = buildOfficeState({
      recentEvents: [],
      activeCases: [{
        id: 10,
        visibleOwnerId: "comercial-principal",
        status: "open",
        subject: "Propuesta solar",
        channel: "email",
        updatedAt: new Date(),
      }],
    });
    expect(snapshot.activeCases).toHaveLength(1);
    expect(snapshot.activeCases[0].caseId).toBe("10");
    expect(snapshot.activeCases[0].visibleOwnerId).toBe("comercial-principal");
  });

  it("agent linked to case via events gets activeCaseId", () => {
    const snapshot = buildOfficeState({
      recentEvents: [makeEvent({ agentId: "fiscal", caseId: "case-77", eventType: "tool_called" })],
      activeCases: [],
    });
    expect(snapshot.agents["fiscal"].activeCaseId).toBe("case-77");
  });
});

// ─── OS4: Fallback when no data ──────────────────────────────────────────

describe("OS4: Fallback state", () => {
  it("buildFallbackState returns all agents idle", () => {
    const snapshot = buildFallbackState();
    expect(snapshot.hasRealData).toBe(false);
    expect(Object.keys(snapshot.agents)).toHaveLength(10);
    for (const agent of Object.values(snapshot.agents)) {
      expect(agent.currentStatus).toBe("idle");
      expect(agent.isReal).toBe(false);
    }
  });

  it("fallback has empty delegations and activity", () => {
    const snapshot = buildFallbackState();
    expect(snapshot.activeDelegations).toHaveLength(0);
    expect(snapshot.recentActivity).toHaveLength(0);
    expect(snapshot.activeCases).toHaveLength(0);
  });
});

// ─── OS5: Delegation extraction ──────────────────────────────────────────

describe("OS5: Delegation extraction", () => {
  it("extracts delegations from agent_delegated events", () => {
    const events = [
      makeEvent({
        agentId: "ceo",
        eventType: "agent_delegated",
        targetAgentId: "recepcion",
        reason: "Revisar bandeja urgente",
        caseId: "case-5",
      }),
    ];
    const delegations = extractDelegations(events);
    expect(delegations).toHaveLength(1);
    expect(delegations[0].fromAgentId).toBe("ceo");
    expect(delegations[0].toAgentId).toBe("recepcion");
    expect(delegations[0].reason).toBe("Revisar bandeja urgente");
    expect(delegations[0].caseId).toBe("case-5");
  });

  it("limits to 5 delegations", () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      makeEvent({
        agentId: "ceo",
        eventType: "agent_delegated",
        targetAgentId: `agent-${i}`,
        reason: `Task ${i}`,
      }),
    );
    const delegations = extractDelegations(events);
    expect(delegations).toHaveLength(5);
  });

  it("ignores non-delegation events", () => {
    const events = [
      makeEvent({ eventType: "tool_called" }),
      makeEvent({ eventType: "case_routed" }),
    ];
    const delegations = extractDelegations(events);
    expect(delegations).toHaveLength(0);
  });
});

// ─── OS6: Activity feed ──────────────────────────────────────────────────

describe("OS6: Activity feed construction", () => {
  it("builds activity entries with summaries", () => {
    const events = [
      makeEvent({ agentId: "fiscal", eventType: "tool_called", toolName: "extract_invoice" }),
      makeEvent({ agentId: "ceo", eventType: "agent_delegated", targetAgentId: "recepcion" }),
    ];
    const feed = buildActivityFeed(events);
    expect(feed).toHaveLength(2);
    expect(feed[0].summary).toContain("extract_invoice");
    expect(feed[1].summary).toContain("recepcion");
  });

  it("respects limit", () => {
    const events = Array.from({ length: 30 }, () => makeEvent());
    const feed = buildActivityFeed(events, 5);
    expect(feed).toHaveLength(5);
  });

  it("includes event metadata", () => {
    const events = [makeEvent({ agentId: "bi-scoring", eventType: "tool_blocked", result: "blocked" })];
    const feed = buildActivityFeed(events);
    expect(feed[0].result).toBe("blocked");
    expect(feed[0].agentId).toBe("bi-scoring");
  });
});

// ─── OS7: Agent layer mapping ────────────────────────────────────────────

describe("OS7: Agent layer mapping", () => {
  it("has all 10 agents", () => {
    expect(ALL_AGENT_IDS).toHaveLength(10);
  });

  it("CEO is gobierno layer", () => {
    expect(AGENT_LAYER_MAP["ceo"]).toBe("gobierno");
  });

  it("recepcion, comercial-principal, comercial-junior are visible", () => {
    expect(AGENT_LAYER_MAP["recepcion"]).toBe("visible");
    expect(AGENT_LAYER_MAP["comercial-principal"]).toBe("visible");
    expect(AGENT_LAYER_MAP["comercial-junior"]).toBe("visible");
  });

  it("consultor-servicios, consultor-digital, legal-rgpd are experta-interna", () => {
    expect(AGENT_LAYER_MAP["consultor-servicios"]).toBe("experta-interna");
    expect(AGENT_LAYER_MAP["consultor-digital"]).toBe("experta-interna");
    expect(AGENT_LAYER_MAP["legal-rgpd"]).toBe("experta-interna");
  });

  it("fiscal, bi-scoring, marketing-automation are modulo-interno", () => {
    expect(AGENT_LAYER_MAP["fiscal"]).toBe("modulo-interno");
    expect(AGENT_LAYER_MAP["bi-scoring"]).toBe("modulo-interno");
    expect(AGENT_LAYER_MAP["marketing-automation"]).toBe("modulo-interno");
  });

  it("isVisible is true for gobierno + visible layers in snapshot", () => {
    const snapshot = buildFallbackState();
    expect(snapshot.agents["ceo"].isVisible).toBe(true);
    expect(snapshot.agents["recepcion"].isVisible).toBe(true);
    expect(snapshot.agents["comercial-principal"].isVisible).toBe(true);
    expect(snapshot.agents["fiscal"].isVisible).toBe(false);
    expect(snapshot.agents["consultor-servicios"].isVisible).toBe(false);
  });
});

// ─── OS8: API endpoint structure ─────────────────────────────────────────

describe("OS8: API endpoint route file", () => {
  const routeSource = readFile("src/app/api/office-state/route.ts");

  it("exists and exports GET handler", () => {
    expect(routeSource).toContain("export async function GET");
  });

  it("imports buildOfficeState", () => {
    expect(routeSource).toContain("buildOfficeState");
  });

  it("imports buildFallbackState for error case", () => {
    expect(routeSource).toContain("buildFallbackState");
  });

  it("queries audit events", () => {
    expect(routeSource).toContain("auditLog");
  });

  it("queries active cases", () => {
    expect(routeSource).toContain("cases");
    expect(routeSource).toContain("inArray");
  });

  it("has Cache-Control no-store", () => {
    expect(routeSource).toContain("no-store");
  });

  it("has force-dynamic", () => {
    expect(routeSource).toContain("force-dynamic");
  });

  it("has fallback in catch block", () => {
    expect(routeSource).toContain("buildFallbackState()");
  });

  it("supports window query param", () => {
    expect(routeSource).toContain("window");
  });
});

// ─── OS9: AgentOfficeMap.tsx integration ─────────────────────────────────

describe("OS9: AgentOfficeMap uses real state (via SSE hook)", () => {
  const officeSource = readFile("src/components/AgentOfficeMap.tsx");

  it("imports useOfficeStream hook (replaces direct polling)", () => {
    expect(officeSource).toMatch(/import.*useOfficeStream/);
  });

  it("has STATUS_MAP for real → visual mapping", () => {
    expect(officeSource).toContain("STATUS_MAP");
  });

  it("maps active → working", () => {
    expect(officeSource).toContain('active: "working"');
  });

  it("maps delegating → delegating", () => {
    expect(officeSource).toContain('delegating: "delegating"');
  });

  it("maps internal_work → thinking", () => {
    expect(officeSource).toContain('internal_work: "thinking"');
  });

  it("checks hasRealData before applying", () => {
    expect(officeSource).toContain("hasRealData");
  });

  it("checks isReal per agent", () => {
    expect(officeSource).toContain("isReal");
  });

  it("preserves walking/talking/delegating visual states", () => {
    expect(officeSource).toContain('"walking"');
    expect(officeSource).toContain('"talking"');
  });

  it("injects real delegations into visual", () => {
    expect(officeSource).toContain("activeDelegations");
  });

  it("injects real activity into log", () => {
    expect(officeSource).toContain("recentActivity");
  });

  it("no longer polls /api/agent-gpt5 for office state", () => {
    // The old pattern: fetch("/api/agent-gpt5") in the polling useEffect
    // Should only appear in chat/send contexts now, not in the status poll
    const pollSection = officeSource.slice(
      officeSource.indexOf("Poll REAL office state"),
      officeSource.indexOf("Poll REAL office state") + 2000,
    );
    expect(pollSection).not.toContain('fetch("/api/agent-gpt5")');
  });
});

// ─── OS10: Module exports ────────────────────────────────────────────────

describe("OS10: Module exports", () => {
  it("exports all types and functions from index", () => {
    const indexSource = readFile("src/lib/office/index.ts");
    expect(indexSource).toContain("OfficeAgentState");
    expect(indexSource).toContain("OfficeStateSnapshot");
    expect(indexSource).toContain("buildOfficeState");
    expect(indexSource).toContain("buildFallbackState");
    expect(indexSource).toContain("deriveAgentStatus");
    expect(indexSource).toContain("AGENT_LAYER_MAP");
    expect(indexSource).toContain("ALL_AGENT_IDS");
  });
});
