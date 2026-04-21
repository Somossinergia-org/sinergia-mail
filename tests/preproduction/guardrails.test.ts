/**
 * PREPRODUCTION TESTS — Guardrails, pre-action checks, rate limits, health checks.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  preActionCheck,
  validateBeforeSend,
  runHealthCheck,
  resetCounters,
  type PreActionInput,
} from "@/lib/runtime/guardrails";
import {
  OperationMode,
  buildRuntimeConfig,
  setRuntimeConfig,
  resetRuntimeConfig,
} from "@/lib/runtime/config";

// ─── Helpers ─────────────────────────────────────────────────────────────

function setMode(mode: OperationMode, overrides: Record<string, string> = {}): void {
  setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: mode, ...overrides }));
}

function toolCall(agentId: string, toolName: string, extra: Partial<PreActionInput> = {}): PreActionInput {
  return {
    action: "tool_call",
    agentId,
    caseId: "test-case",
    clientId: "test-client",
    toolName,
    ...extra,
  };
}

// ─── G1: Dry-Run Mode ────────────────────────────────────────────────────

describe("G1 — Dry-Run mode simulates everything", () => {
  beforeEach(() => {
    resetRuntimeConfig();
    resetCounters();
    setMode(OperationMode.DRY_RUN);
  });

  it("tool calls are simulated (allowed but simulate=true)", () => {
    const result = preActionCheck(toolCall("recepcion", "send_whatsapp"));
    expect(result.allowed).toBe(true);
    expect(result.simulate).toBe(true);
    expect(result.audit).toBe(true);
  });

  it("delegations are simulated", () => {
    const result = preActionCheck({
      action: "delegation",
      agentId: "recepcion",
      caseId: "c1",
      clientId: "cl1",
      targetAgentId: "comercial-principal",
    });
    expect(result.allowed).toBe(true);
    expect(result.simulate).toBe(true);
  });

  it("all actions produce audit=true", () => {
    const actions = ["tool_call", "delegation", "speak_to_client", "escalation"] as const;
    for (const action of actions) {
      const result = preActionCheck({
        action,
        agentId: "recepcion",
        caseId: "c1",
        clientId: "cl1",
        toolName: action === "tool_call" ? "send_whatsapp" : undefined,
      });
      expect(result.audit).toBe(true);
    }
  });
});

// ─── G2: Shadow Mode ─────────────────────────────────────────────────────

describe("G2 — Shadow mode simulates external comms", () => {
  beforeEach(() => {
    resetRuntimeConfig();
    resetCounters();
    setMode(OperationMode.SHADOW);
  });

  it("external comm tools are simulated", () => {
    const result = preActionCheck(toolCall("recepcion", "send_whatsapp"));
    expect(result.allowed).toBe(true);
    expect(result.simulate).toBe(true);
  });

  it("internal tools execute normally", () => {
    const result = preActionCheck(toolCall("recepcion", "web_search"));
    expect(result.allowed).toBe(true);
    expect(result.simulate).toBe(false);
  });

  it("delegations are allowed (not simulated)", () => {
    const result = preActionCheck({
      action: "delegation",
      agentId: "recepcion",
      caseId: "c1",
      clientId: "cl1",
      targetAgentId: "consultor-servicios",
    });
    expect(result.allowed).toBe(true);
    expect(result.simulate).toBe(false);
  });

  it("speak_to_client is simulated", () => {
    const result = preActionCheck({
      action: "speak_to_client",
      agentId: "recepcion",
      caseId: "c1",
      clientId: "cl1",
      visibleOwnerId: "recepcion",
    });
    expect(result.allowed).toBe(true);
    expect(result.simulate).toBe(true);
  });
});

// ─── G3: Kill Switches block actions ─────────────────────────────────────

describe("G3 — Kill switches block actions", () => {
  beforeEach(() => {
    resetRuntimeConfig();
    resetCounters();
  });

  it("KILL_BLOCK_ALL_COMMS blocks external tools", () => {
    setMode(OperationMode.PRODUCTION, { KILL_BLOCK_ALL_COMMS: "true" });
    const result = preActionCheck(toolCall("recepcion", "send_whatsapp"));
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe("kill_switch");
  });

  it("KILL_BLOCK_WA_SMS_PHONE blocks specific channels", () => {
    setMode(OperationMode.PRODUCTION, { KILL_BLOCK_WA_SMS_PHONE: "true" });

    expect(preActionCheck(toolCall("recepcion", "send_whatsapp")).allowed).toBe(false);
    expect(preActionCheck(toolCall("recepcion", "send_sms")).allowed).toBe(false);
    expect(preActionCheck(toolCall("recepcion", "make_phone_call")).allowed).toBe(false);
    // email still works
    expect(preActionCheck(toolCall("recepcion", "send_email_transactional")).allowed).toBe(true);
  });

  it("KILL_BLOCK_HIGH_RISK blocks high-risk tools", () => {
    setMode(OperationMode.PRODUCTION, { KILL_BLOCK_HIGH_RISK: "true" });
    const result = preActionCheck(toolCall("recepcion", "bulk_categorize"));
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe("kill_switch");

    // Normal tool still works
    expect(preActionCheck(toolCall("recepcion", "web_search")).allowed).toBe(true);
  });

  it("KILL_FORCE_READONLY blocks non-read tools", () => {
    setMode(OperationMode.PRODUCTION, { KILL_FORCE_READONLY: "true" });
    // Read-only tools pass through even in readonly mode
    expect(preActionCheck(toolCall("recepcion", "web_search")).allowed).toBe(true);
    // Mutation tools are blocked
    const result = preActionCheck(toolCall("recepcion", "create_draft"));
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe("mode");
  });

  it("KILL_BLOCK_DELEGATION blocks delegations", () => {
    setMode(OperationMode.PRODUCTION, { KILL_BLOCK_DELEGATION: "true" });
    const result = preActionCheck({
      action: "delegation",
      agentId: "recepcion",
      caseId: "c1",
      clientId: "cl1",
      targetAgentId: "consultor-servicios",
    });
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe("kill_switch");
  });

  it("KILL_DISABLE_JUNIOR blocks delegation to junior", () => {
    setMode(OperationMode.PRODUCTION, { KILL_DISABLE_JUNIOR: "true" });
    const result = preActionCheck({
      action: "delegation",
      agentId: "recepcion",
      caseId: "c1",
      clientId: "cl1",
      targetAgentId: "comercial-junior",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Junior");
  });

  it("KILL_BLOCKED_CHANNELS blocks named channels", () => {
    setMode(OperationMode.PRODUCTION, { KILL_BLOCKED_CHANNELS: "send_telegram" });
    expect(preActionCheck(toolCall("recepcion", "send_telegram")).allowed).toBe(false);
    expect(preActionCheck(toolCall("recepcion", "send_whatsapp")).allowed).toBe(true);
  });
});

// ─── G4: Rate Limits ─────────────────────────────────────────────────────

describe("G4 — Rate limits enforce caps", () => {
  beforeEach(() => {
    resetRuntimeConfig();
    resetCounters();
    // Guarded with cooldown=0 to avoid timing issues in tests
    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "guarded", LIMIT_CONTACT_COOLDOWN: "0" }));
  });

  it("blocks after max messages per case", () => {
    const input = toolCall("recepcion", "send_whatsapp");
    // Guarded allows 5
    for (let i = 0; i < 5; i++) {
      expect(preActionCheck(input).allowed).toBe(true);
    }
    // 6th is blocked
    const result = preActionCheck(input);
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe("rate_limit");
  });

  it("blocks after max calls per case", () => {
    const input = toolCall("recepcion", "make_phone_call");
    // Guarded allows 1
    expect(preActionCheck(input).allowed).toBe(true);
    // 2nd blocked
    expect(preActionCheck(input).allowed).toBe(false);
  });

  it("blocks after max messages per client window", () => {
    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "guarded", LIMIT_CONTACT_COOLDOWN: "0" }));
    for (let i = 0; i < 8; i++) {
      const input = toolCall("recepcion", "send_sms", { caseId: `case-${i}` });
      expect(preActionCheck(input).allowed).toBe(true);
    }
    // 9th from same client blocked
    const input = toolCall("recepcion", "send_sms", { caseId: "case-extra" });
    expect(preActionCheck(input).allowed).toBe(false);
    expect(preActionCheck(input).blockedBy).toBe("rate_limit");
  });

  it("blocks after max escalations", () => {
    // Guarded: 4 escalations max
    for (let i = 0; i < 4; i++) {
      const result = preActionCheck({
        action: "escalation",
        agentId: "recepcion",
        caseId: "esc-case",
        clientId: "cl",
        targetAgentId: "comercial-principal",
      });
      expect(result.allowed).toBe(true);
    }
    // 5th blocked
    const result = preActionCheck({
      action: "escalation",
      agentId: "recepcion",
      caseId: "esc-case",
      clientId: "cl",
      targetAgentId: "comercial-principal",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("escalacion");
  });

  it("blocks tool retries over limit", () => {
    setMode(OperationMode.GUARDED); // 2 retries max
    // Use a mutation tool (not read-only) so rate limits apply
    const input = toolCall("recepcion", "create_draft", { isRetry: true });

    expect(preActionCheck(input).allowed).toBe(true);
    expect(preActionCheck(input).allowed).toBe(true);
    // 3rd retry blocked
    expect(preActionCheck(input).allowed).toBe(false);
  });

  it("high-risk tools limited per case", () => {
    setMode(OperationMode.GUARDED); // 3 high-risk/case
    const input = toolCall("recepcion", "bulk_categorize");
    for (let i = 0; i < 3; i++) {
      expect(preActionCheck(input).allowed).toBe(true);
    }
    expect(preActionCheck(input).allowed).toBe(false);
  });

  it("resetCounters clears all state", () => {
    const input = toolCall("recepcion", "send_whatsapp");
    for (let i = 0; i < 5; i++) preActionCheck(input);
    expect(preActionCheck(input).allowed).toBe(false);

    resetCounters();
    expect(preActionCheck(input).allowed).toBe(true);
  });
});

// ─── G5: Governance double-check in guardrails ───────────────────────────

describe("G5 — Governance checks in guardrails", () => {
  beforeEach(() => {
    resetRuntimeConfig();
    resetCounters();
    setMode(OperationMode.PRODUCTION);
  });

  it("internal agent blocked from external tool", () => {
    const result = preActionCheck(toolCall("fiscal", "send_whatsapp"));
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe("governance");
  });

  it("internal agent blocked from speaking to client", () => {
    const result = preActionCheck({
      action: "speak_to_client",
      agentId: "bi-scoring",
      caseId: "c1",
      clientId: "cl1",
      visibleOwnerId: "recepcion",
    });
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe("governance");
  });

  it("non-owner blocked from speaking", () => {
    const result = preActionCheck({
      action: "speak_to_client",
      agentId: "comercial-junior",
      caseId: "c1",
      clientId: "cl1",
      visibleOwnerId: "comercial-principal",
    });
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe("governance");
  });

  it("CEO can always speak (exception)", () => {
    const result = preActionCheck({
      action: "speak_to_client",
      agentId: "ceo",
      caseId: "c1",
      clientId: "cl1",
      visibleOwnerId: "comercial-principal",
    });
    expect(result.allowed).toBe(true);
  });
});

// ─── G6: validateBeforeSend ──────────────────────────────────────────────

describe("G6 — validateBeforeSend", () => {
  beforeEach(() => {
    resetRuntimeConfig();
    setMode(OperationMode.PRODUCTION);
  });

  it("valid when owner matches and has data", () => {
    const result = validateBeforeSend({
      caseId: "c1",
      agentId: "comercial-principal",
      visibleOwnerId: "comercial-principal",
      hasClientData: true,
      isLegalDocument: false,
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("invalid when no owner assigned", () => {
    const result = validateBeforeSend({
      caseId: "c1",
      agentId: "recepcion",
      visibleOwnerId: null,
      hasClientData: true,
      isLegalDocument: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("owner"))).toBe(true);
  });

  it("invalid when agent is not owner", () => {
    const result = validateBeforeSend({
      caseId: "c1",
      agentId: "comercial-junior",
      visibleOwnerId: "comercial-principal",
      hasClientData: true,
      isLegalDocument: false,
    });
    expect(result.valid).toBe(false);
  });

  it("invalid when agent is internal", () => {
    const result = validateBeforeSend({
      caseId: "c1",
      agentId: "fiscal",
      visibleOwnerId: "fiscal",
      hasClientData: true,
      isLegalDocument: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("interno"))).toBe(true);
  });

  it("invalid when missing client data", () => {
    const result = validateBeforeSend({
      caseId: "c1",
      agentId: "recepcion",
      visibleOwnerId: "recepcion",
      hasClientData: false,
      isLegalDocument: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("datos"))).toBe(true);
  });

  it("legal document requires review in guarded mode", () => {
    setMode(OperationMode.GUARDED);
    const result = validateBeforeSend({
      caseId: "c1",
      agentId: "comercial-principal",
      visibleOwnerId: "comercial-principal",
      hasClientData: true,
      isLegalDocument: true,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("legal"))).toBe(true);
  });

  it("CEO is allowed even when not the owner (governance exception)", () => {
    const result = validateBeforeSend({
      caseId: "c1",
      agentId: "ceo",
      visibleOwnerId: "comercial-principal",
      hasClientData: true,
      isLegalDocument: false,
    });
    // CEO has an explicit exception in validateBeforeSend
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

// ─── G7: Health Check / Scorecard ────────────────────────────────────────

describe("G7 — Health Check scorecard", () => {
  it("perfect stats = ready", () => {
    const result = runHealthCheck({
      totalCases: 50,
      governanceViolations: 0,
      toolFailures: 1,
      doubleVoiceIncidents: 0,
      ownerlessActions: 0,
      blockedAttempts: 15,
      successfulFlows: 49,
    });
    expect(result.ready).toBe(true);
    expect(result.score).toBe(100);
  });

  it("double voice = not ready", () => {
    const result = runHealthCheck({
      totalCases: 50,
      governanceViolations: 0,
      toolFailures: 0,
      doubleVoiceIncidents: 1,
      ownerlessActions: 0,
      blockedAttempts: 10,
      successfulFlows: 50,
    });
    expect(result.ready).toBe(false);
    expect(result.checks.find((c) => c.name === "single_voice")!.pass).toBe(false);
  });

  it("high governance violation rate = not ready", () => {
    const result = runHealthCheck({
      totalCases: 100,
      governanceViolations: 5, // 5% > 1%
      toolFailures: 0,
      doubleVoiceIncidents: 0,
      ownerlessActions: 0,
      blockedAttempts: 10,
      successfulFlows: 100,
    });
    expect(result.ready).toBe(false);
    expect(result.checks.find((c) => c.name === "governance_clean")!.pass).toBe(false);
  });

  it("high tool failure rate = not ready", () => {
    const result = runHealthCheck({
      totalCases: 50,
      governanceViolations: 0,
      toolFailures: 10, // 10/(50+10) = 16% > 5%
      doubleVoiceIncidents: 0,
      ownerlessActions: 0,
      blockedAttempts: 5,
      successfulFlows: 50,
    });
    expect(result.ready).toBe(false);
  });

  it("ownerless actions = not ready", () => {
    const result = runHealthCheck({
      totalCases: 50,
      governanceViolations: 0,
      toolFailures: 0,
      doubleVoiceIncidents: 0,
      ownerlessActions: 1,
      blockedAttempts: 5,
      successfulFlows: 50,
    });
    expect(result.ready).toBe(false);
  });

  it("insufficient volume = not ready", () => {
    const result = runHealthCheck({
      totalCases: 5, // < 10
      governanceViolations: 0,
      toolFailures: 0,
      doubleVoiceIncidents: 0,
      ownerlessActions: 0,
      blockedAttempts: 0,
      successfulFlows: 5,
    });
    expect(result.ready).toBe(false);
  });
});

// ─── G8: Mode transitions (rollback) ────────────────────────────────────

describe("G8 — Mode transitions / rollback", () => {
  beforeEach(() => {
    resetRuntimeConfig();
    resetCounters();
  });

  it("can switch from production to dry-run instantly", () => {
    setMode(OperationMode.PRODUCTION);
    expect(preActionCheck(toolCall("recepcion", "send_whatsapp")).simulate).toBe(false);

    // "Rollback" to dry-run
    setMode(OperationMode.DRY_RUN);
    expect(preActionCheck(toolCall("recepcion", "send_whatsapp")).simulate).toBe(true);
  });

  it("can switch from guarded to shadow", () => {
    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "guarded", LIMIT_CONTACT_COOLDOWN: "0" }));
    const r1 = preActionCheck(toolCall("recepcion", "send_whatsapp"));
    expect(r1.allowed).toBe(true);
    expect(r1.simulate).toBe(false);

    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "shadow", LIMIT_CONTACT_COOLDOWN: "0" }));
    const r2 = preActionCheck(toolCall("recepcion", "send_whatsapp", { caseId: "case-2" }));
    expect(r2.allowed).toBe(true);
    expect(r2.simulate).toBe(true);
  });

  it("kill switch can activate mid-production", () => {
    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "production", LIMIT_CONTACT_COOLDOWN: "0" }));
    expect(preActionCheck(toolCall("recepcion", "send_whatsapp")).allowed).toBe(true);

    // Activate kill switch
    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "production", KILL_BLOCK_ALL_COMMS: "true", LIMIT_CONTACT_COOLDOWN: "0" }));
    expect(preActionCheck(toolCall("recepcion", "send_whatsapp", { caseId: "case-2" })).allowed).toBe(false);

    // Deactivate
    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "production", LIMIT_CONTACT_COOLDOWN: "0" }));
    expect(preActionCheck(toolCall("recepcion", "send_whatsapp", { caseId: "case-3" })).allowed).toBe(true);
  });

  it("rate limits persist across mode changes (counters are independent)", () => {
    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "guarded", LIMIT_CONTACT_COOLDOWN: "0" }));
    for (let i = 0; i < 5; i++) preActionCheck(toolCall("recepcion", "send_whatsapp"));

    // Switch to production (20 msgs/case) — counter already at 5
    setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: "production", LIMIT_CONTACT_COOLDOWN: "0" }));
    // Should still work (5 < 20)
    expect(preActionCheck(toolCall("recepcion", "send_whatsapp")).allowed).toBe(true);
  });
});
