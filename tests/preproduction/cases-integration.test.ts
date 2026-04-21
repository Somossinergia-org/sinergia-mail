/**
 * PREPRODUCTION INTEGRATION TESTS — Cases Entity & Ownership Wiring
 *
 * Validates:
 *   C1: Case service types and functions exist
 *   C2: validateOwnership logic (single-voice principle)
 *   C3: Case status transitions
 *   C4: preActionCheck with real caseId (rate limits apply)
 *   C5: validateBeforeSend with real ownership (enforcement in guarded mode)
 *   C6: Backward compatibility — null caseId still works
 *   C7: CEO override on ownership
 *   C8: cases table schema correctness
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  OperationMode,
  buildRuntimeConfig,
  setRuntimeConfig,
  resetRuntimeConfig,
} from "@/lib/runtime/config";
import {
  preActionCheck,
  validateBeforeSend,
  resetCounters,
} from "@/lib/runtime/guardrails";
import {
  validateOwnership,
  type CaseRecord,
  type CaseStatus,
} from "@/lib/cases";
import {
  INTERNAL_LAYERS,
  VISIBLE_LAYERS,
} from "@/lib/agent/swarm";

// ─── Helpers ─────────────────────────────────────────────────────────────

function setMode(mode: OperationMode, overrides: Record<string, string> = {}) {
  resetRuntimeConfig();
  resetCounters();
  setRuntimeConfig(buildRuntimeConfig({ SINERGIA_MODE: mode, LIMIT_CONTACT_COOLDOWN: "0", ...overrides }));
}

function makeCaseRecord(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    id: 1,
    userId: "user-1",
    contactId: null,
    clientIdentifier: "client@test.com",
    visibleOwnerId: "comercial-junior",
    status: "active" as CaseStatus,
    subject: "Test case",
    channel: "email",
    metadata: null,
    interactionCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    closedAt: null,
    ...overrides,
  };
}

// ─── C1: Case service types and exports ──────────────────────────────────

describe("C1: Case service types and exports", () => {
  it("validateOwnership is a function", () => {
    expect(typeof validateOwnership).toBe("function");
  });

  it("CaseRecord type has required fields", () => {
    const record = makeCaseRecord();
    expect(record).toHaveProperty("id");
    expect(record).toHaveProperty("userId");
    expect(record).toHaveProperty("clientIdentifier");
    expect(record).toHaveProperty("visibleOwnerId");
    expect(record).toHaveProperty("status");
    expect(record).toHaveProperty("interactionCount");
    expect(record).toHaveProperty("createdAt");
    expect(record).toHaveProperty("updatedAt");
    expect(record).toHaveProperty("closedAt");
  });

  it("CaseStatus values are valid", () => {
    const validStatuses: CaseStatus[] = ["open", "active", "waiting", "closed"];
    validStatuses.forEach((s) => {
      const record = makeCaseRecord({ status: s });
      expect(record.status).toBe(s);
    });
  });
});

// ─── C2: validateOwnership (single-voice principle) ─────────────────────

describe("C2: validateOwnership — single-voice principle", () => {
  it("allows action when agent IS the visible owner", () => {
    const record = makeCaseRecord({ visibleOwnerId: "comercial-junior" });
    const result = validateOwnership(record, "comercial-junior");
    expect(result.valid).toBe(true);
    expect(result.currentOwner).toBe("comercial-junior");
  });

  it("blocks action when agent is NOT the visible owner", () => {
    const record = makeCaseRecord({ visibleOwnerId: "comercial-junior" });
    const result = validateOwnership(record, "soporte");
    expect(result.valid).toBe(false);
    expect(result.currentOwner).toBe("comercial-junior");
    expect(result.reason).toContain("soporte");
    expect(result.reason).toContain("comercial-junior");
  });

  it("allows action when no owner is assigned (claimable)", () => {
    const record = makeCaseRecord({ visibleOwnerId: null });
    const result = validateOwnership(record, "recepcion");
    expect(result.valid).toBe(true);
    expect(result.currentOwner).toBeNull();
  });

  it("CEO always passes ownership check (override)", () => {
    const record = makeCaseRecord({ visibleOwnerId: "comercial-junior" });
    const result = validateOwnership(record, "ceo");
    expect(result.valid).toBe(true);
    expect(result.reason).toContain("CEO");
  });

  it("blocks even visible-layer agents if they're not the owner", () => {
    const record = makeCaseRecord({ visibleOwnerId: "comercial-senior" });
    for (const layer of VISIBLE_LAYERS) {
      if (layer === "comercial-senior" || layer === "ceo") continue;
      const result = validateOwnership(record, layer);
      expect(result.valid).toBe(false);
    }
  });
});

// ─── C3: Case status transitions ────────────────────────────────────────

describe("C3: Case status transitions", () => {
  it("all valid statuses can be set on a CaseRecord", () => {
    const statuses: CaseStatus[] = ["open", "active", "waiting", "closed"];
    statuses.forEach((s) => {
      const record = makeCaseRecord({ status: s });
      expect(record.status).toBe(s);
    });
  });

  it("closed case includes closedAt timestamp conceptually", () => {
    const now = new Date();
    const record = makeCaseRecord({ status: "closed", closedAt: now });
    expect(record.closedAt).toEqual(now);
  });

  it("open case has no closedAt", () => {
    const record = makeCaseRecord({ status: "open", closedAt: null });
    expect(record.closedAt).toBeNull();
  });
});

// ─── C4: preActionCheck with real caseId ────────────────────────────────

describe("C4: preActionCheck with real caseId (rate limits)", () => {
  beforeEach(() => setMode(OperationMode.GUARDED));

  it("rate limit per case triggers with real caseId", () => {
    setMode(OperationMode.GUARDED, { LIMIT_MSG_PER_CASE: "3" });
    const caseId = "42";
    for (let i = 0; i < 3; i++) {
      const r = preActionCheck({
        action: "tool_call",
        agentId: "recepcion",
        caseId,
        clientId: "user-1",
        toolName: "send_email_transactional",
      });
      expect(r.allowed).toBe(true);
    }
    // 4th should be blocked
    const r = preActionCheck({
      action: "tool_call",
      agentId: "recepcion",
      caseId,
      clientId: "user-1",
      toolName: "send_email_transactional",
    });
    expect(r.allowed).toBe(false);
    expect(r.blockedBy).toBe("rate_limit");
  });

  it("different caseIds have independent counters", () => {
    setMode(OperationMode.GUARDED, { LIMIT_MSG_PER_CASE: "2" });
    // Case A: 2 messages
    for (let i = 0; i < 2; i++) {
      preActionCheck({
        action: "tool_call", agentId: "recepcion", caseId: "A",
        clientId: "user-1", toolName: "send_email_transactional",
      });
    }
    // Case B: should still allow
    const r = preActionCheck({
      action: "tool_call", agentId: "recepcion", caseId: "B",
      clientId: "user-1", toolName: "send_email_transactional",
    });
    expect(r.allowed).toBe(true);
  });

  it("null caseId skips per-case rate limits", () => {
    setMode(OperationMode.GUARDED, { LIMIT_MSG_PER_CASE: "1000" });
    // Multiple sends with null caseId — per-case limit should NOT block
    for (let i = 0; i < 5; i++) {
      const r = preActionCheck({
        action: "tool_call", agentId: "recepcion", caseId: null,
        clientId: "user-1", toolName: "send_email_transactional",
      });
      expect(r.allowed).toBe(true);
    }
  });

  it("escalation counter works with real caseId", () => {
    setMode(OperationMode.GUARDED, { LIMIT_ESCALATIONS: "2" });
    const caseId = "99";
    for (let i = 0; i < 2; i++) {
      const r = preActionCheck({
        action: "escalation", agentId: "comercial-junior", caseId,
        clientId: "user-1", targetAgentId: "comercial-senior",
      });
      expect(r.allowed).toBe(true);
    }
    // 3rd escalation blocked
    const r = preActionCheck({
      action: "escalation", agentId: "comercial-junior", caseId,
      clientId: "user-1", targetAgentId: "comercial-senior",
    });
    expect(r.allowed).toBe(false);
    expect(r.blockedBy).toBe("rate_limit");
  });
});

// ─── C5: validateBeforeSend with real ownership ─────────────────────────

describe("C5: validateBeforeSend with real ownership", () => {
  it("passes when agent is the visible owner", () => {
    const result = validateBeforeSend({
      caseId: "42",
      agentId: "comercial-junior",
      visibleOwnerId: "comercial-junior",
      hasClientData: true,
      isLegalDocument: false,
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("fails when agent is NOT the visible owner", () => {
    const result = validateBeforeSend({
      caseId: "42",
      agentId: "soporte",
      visibleOwnerId: "comercial-junior",
      hasClientData: true,
      isLegalDocument: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((i: string) => i.includes("soporte"))).toBe(true);
  });

  it("fails when no visible owner is assigned", () => {
    const result = validateBeforeSend({
      caseId: "42",
      agentId: "recepcion",
      visibleOwnerId: null,
      hasClientData: true,
      isLegalDocument: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i: string) => i.includes("owner"))).toBe(true);
  });

  it("CEO always passes ownership validation", () => {
    const result = validateBeforeSend({
      caseId: "42",
      agentId: "ceo",
      visibleOwnerId: "comercial-junior",
      hasClientData: true,
      isLegalDocument: false,
    });
    expect(result.valid).toBe(true);
  });

  it("internal agents always fail", () => {
    for (const internalAgent of INTERNAL_LAYERS) {
      const result = validateBeforeSend({
        caseId: "42",
        agentId: internalAgent,
        visibleOwnerId: internalAgent, // Even if it's the "owner"
        hasClientData: true,
        isLegalDocument: false,
      });
      expect(result.valid).toBe(false);
      expect(result.issues.some((i: string) => i.includes("interno"))).toBe(true);
    }
  });

  it("fails when hasClientData is false", () => {
    const result = validateBeforeSend({
      caseId: "42",
      agentId: "comercial-junior",
      visibleOwnerId: "comercial-junior",
      hasClientData: false,
      isLegalDocument: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i: string) => i.includes("datos") || i.includes("client"))).toBe(true);
  });

  it("legal docs in guarded mode require extra review", () => {
    setMode(OperationMode.GUARDED);
    const result = validateBeforeSend({
      caseId: "42",
      agentId: "legal",
      visibleOwnerId: "legal",
      hasClientData: true,
      isLegalDocument: true,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i: string) => i.includes("legal") || i.includes("Legal"))).toBe(true);
  });
});

// ─── C6: Backward compatibility — null caseId ───────────────────────────

describe("C6: Backward compatibility with null caseId", () => {
  beforeEach(() => setMode(OperationMode.GUARDED));

  it("preActionCheck allows tool calls with null caseId", () => {
    const r = preActionCheck({
      action: "tool_call",
      agentId: "recepcion",
      caseId: null,
      clientId: "user-1",
      toolName: "send_email_transactional",
    });
    expect(r.allowed).toBe(true);
  });

  it("preActionCheck allows delegations with null caseId", () => {
    const r = preActionCheck({
      action: "delegation",
      agentId: "recepcion",
      caseId: null,
      clientId: "user-1",
      targetAgentId: "comercial-junior",
    });
    expect(r.allowed).toBe(true);
  });

  it("validateBeforeSend reports issues but does not crash with null caseId", () => {
    const result = validateBeforeSend({
      caseId: null,
      agentId: "recepcion",
      visibleOwnerId: null,
      hasClientData: true,
      isLegalDocument: false,
    });
    // Should report issues (no owner) but NOT throw
    expect(result).toHaveProperty("valid");
    expect(result).toHaveProperty("issues");
  });
});

// ─── C7: CEO override on ownership ──────────────────────────────────────

describe("C7: CEO override on ownership", () => {
  it("CEO can speak to client even when another agent owns the case", () => {
    const record = makeCaseRecord({ visibleOwnerId: "soporte" });
    const ownership = validateOwnership(record, "ceo");
    expect(ownership.valid).toBe(true);

    const sendCheck = validateBeforeSend({
      caseId: String(record.id),
      agentId: "ceo",
      visibleOwnerId: "soporte",
      hasClientData: true,
      isLegalDocument: false,
    });
    expect(sendCheck.valid).toBe(true);
  });

  it("CEO override works for all possible owners", () => {
    for (const owner of VISIBLE_LAYERS) {
      const record = makeCaseRecord({ visibleOwnerId: owner });
      const result = validateOwnership(record, "ceo");
      expect(result.valid).toBe(true);
    }
  });
});

// ─── C8: Cases table schema correctness ─────────────────────────────────

describe("C8: Cases table schema exists in DB schema", () => {
  it("cases table is exported from schema", async () => {
    // Dynamic import to test the schema export exists
    const schema = await import("@/db/schema");
    expect(schema.cases).toBeDefined();
    expect(typeof schema.cases).toBe("object");
  });

  it("Case type is exported from schema", async () => {
    const schema = await import("@/db/schema");
    // Type check — Case should be a type export (we can't test types directly, but we can test the table)
    const caseTable = schema.cases;
    // Check the table has the expected columns by checking the SQL name
    expect(caseTable).toHaveProperty("id");
    expect(caseTable).toHaveProperty("userId");
    expect(caseTable).toHaveProperty("clientIdentifier");
    expect(caseTable).toHaveProperty("visibleOwnerId");
    expect(caseTable).toHaveProperty("status");
    expect(caseTable).toHaveProperty("interactionCount");
    expect(caseTable).toHaveProperty("createdAt");
    expect(caseTable).toHaveProperty("updatedAt");
    expect(caseTable).toHaveProperty("closedAt");
    expect(caseTable).toHaveProperty("contactId");
    expect(caseTable).toHaveProperty("channel");
    expect(caseTable).toHaveProperty("metadata");
    expect(caseTable).toHaveProperty("subject");
  });
});
