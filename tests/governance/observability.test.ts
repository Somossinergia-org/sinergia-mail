/**
 * OBSERVABILITY TESTS — Verificar que la capa de auditoría registra eventos correctamente.
 * Categoría G del plan de tests de gobernanza.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  auditLog,
  AuditLogger,
  MemoryAuditStore,
  validateAndAuditToolAccess,
  validateSingleVoice,
  validateOwnerAssignment,
  auditExternalMessage,
} from "@/lib/audit";
import type { AuditEvent, AuditEventType } from "@/lib/audit";
import {
  resolveAgentId,
  VISIBLE_LAYERS,
  INTERNAL_LAYERS,
  _setAuditLogRef,
} from "@/lib/agent/swarm";

// ─── Helpers ─────────────────────────────────────────────────────────────

function freshLogger(): AuditLogger {
  const store = new MemoryAuditStore();
  return new AuditLogger({ consoleOutput: false, store });
}

const TEST_USER = "test-user-obs";
const TEST_CASE = "case-obs-001";

// ─── G1: AuditLogger — emit y query básicos ─────────────────────────────

describe("G1 — AuditLogger basics", () => {
  let log: AuditLogger;

  beforeEach(() => {
    log = freshLogger();
  });

  it("emit() devuelve evento con id y timestamp", () => {
    const evt = log.emit({
      eventType: "case_routed",
      result: "success",
      userId: TEST_USER,
      agentId: "recepcion",
      reason: "test",
    });
    expect(evt.id).toMatch(/^evt_/);
    expect(evt.timestamp).toBeTruthy();
    expect(evt.eventType).toBe("case_routed");
  });

  it("emit() auto-rellena campos opcionales a null", () => {
    const evt = log.emit({
      eventType: "tool_called",
      result: "info",
      userId: TEST_USER,
      agentId: "ceo",
      reason: "test",
    });
    expect(evt.caseId).toBeNull();
    expect(evt.visibleOwnerId).toBeNull();
    expect(evt.targetAgentId).toBeNull();
    expect(evt.toolName).toBeNull();
  });

  it("query() filtra por eventType", () => {
    log.emit({ eventType: "case_routed", result: "success", userId: TEST_USER, agentId: "recepcion", reason: "r1" });
    log.emit({ eventType: "tool_called", result: "info", userId: TEST_USER, agentId: "recepcion", reason: "r2" });
    log.emit({ eventType: "case_routed", result: "success", userId: TEST_USER, agentId: "ceo", reason: "r3" });

    const routed = log.query({ eventType: "case_routed" });
    expect(routed).toHaveLength(2);
    expect(routed.every((e) => e.eventType === "case_routed")).toBe(true);
  });

  it("query() filtra por caseId", () => {
    log.emit({ eventType: "case_routed", result: "success", userId: TEST_USER, agentId: "recepcion", caseId: "c1", reason: "r1" });
    log.emit({ eventType: "case_routed", result: "success", userId: TEST_USER, agentId: "recepcion", caseId: "c2", reason: "r2" });

    const c1 = log.query({ caseId: "c1" });
    expect(c1).toHaveLength(1);
    expect(c1[0].caseId).toBe("c1");
  });

  it("query() filtra por agentId", () => {
    log.emit({ eventType: "tool_called", result: "info", userId: TEST_USER, agentId: "fiscal", reason: "r1" });
    log.emit({ eventType: "tool_called", result: "info", userId: TEST_USER, agentId: "ceo", reason: "r2" });

    const fiscal = log.query({ agentId: "fiscal" });
    expect(fiscal).toHaveLength(1);
    expect(fiscal[0].agentId).toBe("fiscal");
  });

  it("query() filtra por result", () => {
    log.emit({ eventType: "tool_blocked", result: "blocked", userId: TEST_USER, agentId: "fiscal", reason: "r1" });
    log.emit({ eventType: "tool_called", result: "info", userId: TEST_USER, agentId: "fiscal", reason: "r2" });

    const blocked = log.query({ result: "blocked" });
    expect(blocked).toHaveLength(1);
  });

  it("query() con limit", () => {
    for (let i = 0; i < 10; i++) {
      log.emit({ eventType: "tool_called", result: "info", userId: TEST_USER, agentId: "ceo", reason: `r${i}` });
    }
    const limited = log.query({ limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it("getStats() refleja eventos emitidos", () => {
    log.emit({ eventType: "tool_blocked", result: "blocked", userId: TEST_USER, agentId: "fiscal", reason: "r1" });
    log.emit({ eventType: "governance_rule_triggered", result: "blocked", userId: TEST_USER, agentId: "fiscal", reason: "r2" });
    log.emit({ eventType: "tool_called", result: "info", userId: TEST_USER, agentId: "ceo", reason: "r3" });
    log.emit({ eventType: "legacy_alias_resolved", result: "info", userId: TEST_USER, agentId: "recepcion", reason: "r4" });

    const stats = log.getStats();
    expect(stats.totalEvents).toBe(4);
    expect(stats.blocked).toBe(2);
    expect(stats.violations).toBe(1);
    expect(stats.legacyResolutions).toBe(1);
  });

  it("clear() limpia todos los eventos", () => {
    log.emit({ eventType: "case_routed", result: "success", userId: TEST_USER, agentId: "recepcion", reason: "r1" });
    expect(log.getStats().totalEvents).toBe(1);
    log.clear();
    expect(log.getStats().totalEvents).toBe(0);
  });
});

// ─── G2: MemoryAuditStore — indexación y timeline ────────────────────────

describe("G2 — MemoryAuditStore", () => {
  let log: AuditLogger;

  beforeEach(() => {
    log = freshLogger();
  });

  it("getCaseTimeline devuelve eventos ordenados por timestamp", () => {
    log.emit({ eventType: "case_routed", result: "success", userId: TEST_USER, agentId: "recepcion", caseId: TEST_CASE, reason: "r1" });
    log.emit({ eventType: "agent_selected", result: "success", userId: TEST_USER, agentId: "comercial-principal", caseId: TEST_CASE, reason: "r2" });
    log.emit({ eventType: "tool_called", result: "info", userId: TEST_USER, agentId: "comercial-principal", caseId: TEST_CASE, reason: "r3" });

    const timeline = log.getCaseTimeline(TEST_CASE);
    expect(timeline).toHaveLength(3);
    expect(timeline[0].offsetMs).toBe(0);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].offsetMs).toBeGreaterThanOrEqual(timeline[i - 1].offsetMs);
    }
  });

  it("getCaseTimeline devuelve vacío para caso inexistente", () => {
    const timeline = log.getCaseTimeline("nonexistent");
    expect(timeline).toHaveLength(0);
  });

  it("getBlockedToolAttempts filtra solo tool_blocked", () => {
    log.emit({ eventType: "tool_blocked", result: "blocked", userId: TEST_USER, agentId: "fiscal", caseId: TEST_CASE, toolName: "send_whatsapp", reason: "r1" });
    log.emit({ eventType: "tool_called", result: "info", userId: TEST_USER, agentId: "ceo", caseId: TEST_CASE, toolName: "send_whatsapp", reason: "r2" });

    const blocked = log.getBlockedToolAttempts(TEST_CASE);
    expect(blocked).toHaveLength(1);
    expect(blocked[0].agentId).toBe("fiscal");
  });

  it("getGovernanceViolations captura todas las familias de violación", () => {
    const violationTypes: AuditEventType[] = [
      "governance_rule_triggered",
      "ownership_conflict_detected",
      "visibility_violation_detected",
      "tool_blocked",
      "external_message_blocked",
    ];
    for (const evtType of violationTypes) {
      log.emit({ eventType: evtType, result: "blocked", userId: TEST_USER, agentId: "fiscal", caseId: TEST_CASE, reason: evtType });
    }
    // Add a non-violation event
    log.emit({ eventType: "case_routed", result: "success", userId: TEST_USER, agentId: "recepcion", caseId: TEST_CASE, reason: "ok" });

    const violations = log.getGovernanceViolations(TEST_CASE);
    expect(violations).toHaveLength(5);
  });

  it("getExternalCommunicationEvents captura attempted + blocked + sent", () => {
    log.emit({ eventType: "external_message_attempted", result: "info", userId: TEST_USER, agentId: "recepcion", caseId: TEST_CASE, reason: "r1" });
    log.emit({ eventType: "external_message_blocked", result: "blocked", userId: TEST_USER, agentId: "fiscal", caseId: TEST_CASE, reason: "r2" });
    log.emit({ eventType: "external_message_sent", result: "success", userId: TEST_USER, agentId: "recepcion", caseId: TEST_CASE, reason: "r3" });

    const comms = log.getExternalCommunicationEvents(TEST_CASE);
    expect(comms).toHaveLength(3);
  });

  it("getVisibleOwnerTransitions captura solo case_owner_changed", () => {
    log.emit({ eventType: "case_owner_changed", result: "success", userId: TEST_USER, agentId: "comercial-principal", caseId: TEST_CASE, reason: "r1" });
    log.emit({ eventType: "case_routed", result: "success", userId: TEST_USER, agentId: "recepcion", caseId: TEST_CASE, reason: "r2" });

    const transitions = log.getVisibleOwnerTransitions(TEST_CASE);
    expect(transitions).toHaveLength(1);
  });

  it("getAgentActivity filtra por agente", () => {
    log.emit({ eventType: "tool_called", result: "info", userId: TEST_USER, agentId: "fiscal", reason: "r1" });
    log.emit({ eventType: "tool_called", result: "info", userId: TEST_USER, agentId: "fiscal", reason: "r2" });
    log.emit({ eventType: "tool_called", result: "info", userId: TEST_USER, agentId: "ceo", reason: "r3" });

    const activity = log.getAgentActivity("fiscal");
    expect(activity).toHaveLength(2);
  });

  it("getLegacyAliasResolutions captura resoluciones de alias", () => {
    log.emit({ eventType: "legacy_alias_resolved", result: "info", userId: TEST_USER, agentId: "recepcion", reason: "r1" });
    log.emit({ eventType: "case_routed", result: "success", userId: TEST_USER, agentId: "recepcion", reason: "r2" });

    const resolutions = log.getLegacyAliasResolutions();
    expect(resolutions).toHaveLength(1);
  });
});

// ─── G3: Governance validators — validateAndAuditToolAccess ──────────────

describe("G3 — validateAndAuditToolAccess", () => {
  beforeEach(() => {
    auditLog.clear();
  });

  const COMM_TOOLS = ["send_whatsapp", "send_sms", "send_telegram", "send_email_transactional", "make_phone_call", "draft_and_send", "speak_with_voice"];
  const INTERNAL_AGENTS = ["consultor-servicios", "consultor-digital", "legal-rgpd", "fiscal", "bi-scoring", "marketing-automation"];

  it("bloquea agentes internos en todas las tools de comunicación y genera 2 eventos audit", () => {
    for (const agent of INTERNAL_AGENTS) {
      for (const tool of COMM_TOOLS) {
        auditLog.clear();
        const result = validateAndAuditToolAccess(TEST_USER, TEST_CASE, agent, tool, null);
        expect(result.allowed).toBe(false);
        expect(result.violation).toBe(true);

        // Must emit tool_blocked + governance_rule_triggered
        const events = auditLog.query({});
        const types = events.map((e) => e.eventType);
        expect(types).toContain("tool_blocked");
        expect(types).toContain("governance_rule_triggered");
      }
    }
  });

  it("permite agentes visibles en tools de comunicación sin generar bloqueos", () => {
    const visibleAgents = ["recepcion", "comercial-principal", "comercial-junior", "ceo"];
    for (const agent of visibleAgents) {
      auditLog.clear();
      const result = validateAndAuditToolAccess(TEST_USER, TEST_CASE, agent, "send_whatsapp", null);
      expect(result.allowed).toBe(true);
      expect(result.violation).toBe(false);
      expect(auditLog.getStats().blocked).toBe(0);
    }
  });

  it("permite cualquier agente en tools no-comunicación", () => {
    for (const agent of INTERNAL_AGENTS) {
      auditLog.clear();
      const result = validateAndAuditToolAccess(TEST_USER, TEST_CASE, agent, "web_search", null);
      expect(result.allowed).toBe(true);
    }
  });
});

// ─── G4: validateSingleVoice — detección "doble voz" ────────────────────

describe("G4 — validateSingleVoice", () => {
  beforeEach(() => {
    auditLog.clear();
  });

  it("sin owner, solo recepcion y ceo pueden hablar", () => {
    const r = validateSingleVoice(TEST_USER, TEST_CASE, "recepcion", null, "hablar");
    expect(r.allowed).toBe(true);

    const c = validateSingleVoice(TEST_USER, TEST_CASE, "ceo", null, "hablar");
    expect(c.allowed).toBe(true);
  });

  it("sin owner, otros agentes visibles son bloqueados", () => {
    const r = validateSingleVoice(TEST_USER, TEST_CASE, "comercial-principal", null, "hablar");
    expect(r.allowed).toBe(false);
    expect(r.violation).toBe(true);

    const events = auditLog.query({ eventType: "visibility_violation_detected" });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("con owner, solo el owner y CEO pueden hablar", () => {
    const owner = validateSingleVoice(TEST_USER, TEST_CASE, "comercial-principal", "comercial-principal", "hablar");
    expect(owner.allowed).toBe(true);

    const ceo = validateSingleVoice(TEST_USER, TEST_CASE, "ceo", "comercial-principal", "hablar");
    expect(ceo.allowed).toBe(true);
  });

  it("con owner, otro agente visible es bloqueado (doble voz)", () => {
    auditLog.clear();
    const r = validateSingleVoice(TEST_USER, TEST_CASE, "recepcion", "comercial-principal", "hablar");
    expect(r.allowed).toBe(false);
    expect(r.violation).toBe(true);

    const events = auditLog.query({ eventType: "ownership_conflict_detected" });
    expect(events.length).toBe(1);
    expect(events[0].visibleOwnerId).toBe("comercial-principal");
  });

  it("con owner, agente interno es bloqueado", () => {
    auditLog.clear();
    const r = validateSingleVoice(TEST_USER, TEST_CASE, "fiscal", "comercial-principal", "hablar");
    expect(r.allowed).toBe(false);
    expect(r.violation).toBe(true);
  });
});

// ─── G5: validateOwnerAssignment — solo visibles como owner ──────────────

describe("G5 — validateOwnerAssignment", () => {
  beforeEach(() => {
    auditLog.clear();
  });

  it("acepta agentes visibles como owner", () => {
    for (const visId of ["recepcion", "comercial-principal", "comercial-junior", "ceo"]) {
      auditLog.clear();
      const r = validateOwnerAssignment(TEST_USER, TEST_CASE, visId, null);
      expect(r.allowed).toBe(true);
      expect(r.violation).toBe(false);

      // Must emit case_owner_changed
      const changes = auditLog.query({ eventType: "case_owner_changed" });
      expect(changes.length).toBe(1);
      expect(changes[0].agentId).toBe(visId);
    }
  });

  it("rechaza agentes internos como owner", () => {
    const internals = ["consultor-servicios", "consultor-digital", "legal-rgpd", "fiscal", "bi-scoring", "marketing-automation"];
    for (const intId of internals) {
      auditLog.clear();
      const r = validateOwnerAssignment(TEST_USER, TEST_CASE, intId, null);
      expect(r.allowed).toBe(false);
      expect(r.violation).toBe(true);

      const violations = auditLog.query({ eventType: "visibility_violation_detected" });
      expect(violations.length).toBe(1);
    }
  });

  it("registra transición de owner con metadata from/to", () => {
    auditLog.clear();
    validateOwnerAssignment(TEST_USER, TEST_CASE, "comercial-principal", "recepcion");

    const changes = auditLog.query({ eventType: "case_owner_changed" });
    expect(changes).toHaveLength(1);
    expect(changes[0].metadata).toMatchObject({ from: "recepcion", to: "comercial-principal" });
  });
});

// ─── G6: auditExternalMessage — log de comunicación externa ──────────────

describe("G6 — auditExternalMessage", () => {
  beforeEach(() => {
    auditLog.clear();
  });

  it("registra external_message_blocked cuando allowed=false", () => {
    auditExternalMessage(TEST_USER, TEST_CASE, "fiscal", "send_whatsapp", null, false);

    const blocked = auditLog.query({ eventType: "external_message_blocked" });
    expect(blocked).toHaveLength(1);
    expect(blocked[0].agentId).toBe("fiscal");
    expect(blocked[0].toolName).toBe("send_whatsapp");
  });

  it("registra external_message_attempted cuando allowed=true", () => {
    auditExternalMessage(TEST_USER, TEST_CASE, "recepcion", "send_whatsapp", null, true);

    const attempted = auditLog.query({ eventType: "external_message_attempted" });
    expect(attempted).toHaveLength(1);
    expect(attempted[0].agentId).toBe("recepcion");
  });
});

// ─── G7: resolveAgentId — registro de alias legacy ──────────────────────

describe("G7 — resolveAgentId audit logging", () => {
  beforeEach(() => {
    auditLog.clear();
    // Inject the singleton auditLog so resolveAgentId can use it in test env
    _setAuditLogRef(auditLog);
  });

  it("resuelve alias legacy y emite evento legacy_alias_resolved", () => {
    const resolved = resolveAgentId("recepcionista", TEST_USER, TEST_CASE);
    expect(resolved).toBe("recepcion");

    const events = auditLog.getLegacyAliasResolutions();
    expect(events.length).toBeGreaterThanOrEqual(1);
    const last = events[events.length - 1];
    expect(last.agentId).toBe("recepcion");
    expect(last.metadata).toMatchObject({ legacyId: "recepcionista", resolvedId: "recepcion" });
  });

  it("ID v2 no genera evento legacy_alias_resolved", () => {
    resolveAgentId("recepcion", TEST_USER, TEST_CASE);
    const events = auditLog.getLegacyAliasResolutions();
    expect(events).toHaveLength(0);
  });

  it("todos los alias legacy generan evento", () => {
    const aliases: Record<string, string> = {
      "recepcionista": "recepcion",
      "director-comercial": "comercial-principal",
      "fiscal-controller": "fiscal",
      "analista-bi": "bi-scoring",
      "marketing-director": "marketing-automation",
    };

    for (const [legacy, expected] of Object.entries(aliases)) {
      auditLog.clear();
      const resolved = resolveAgentId(legacy, TEST_USER);
      expect(resolved).toBe(expected);

      const events = auditLog.getLegacyAliasResolutions();
      expect(events).toHaveLength(1);
      expect(events[0].metadata).toMatchObject({ legacyId: legacy, resolvedId: expected });
    }
  });
});

// ─── G8: Timeline ordering — coherencia temporal ─────────────────────────

describe("G8 — Timeline ordering", () => {
  let log: AuditLogger;

  beforeEach(() => {
    log = freshLogger();
  });

  it("eventos en secuencia mantienen orden temporal en timeline", () => {
    const types: AuditEventType[] = ["case_routed", "agent_selected", "tool_called", "tool_succeeded"];
    for (const t of types) {
      log.emit({ eventType: t, result: "success", userId: TEST_USER, agentId: "recepcion", caseId: TEST_CASE, reason: t });
    }

    const timeline = log.getCaseTimeline(TEST_CASE);
    expect(timeline).toHaveLength(4);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].event.timestamp >= timeline[i - 1].event.timestamp).toBe(true);
    }
  });

  it("offsetMs es siempre >= 0", () => {
    for (let i = 0; i < 5; i++) {
      log.emit({ eventType: "tool_called", result: "info", userId: TEST_USER, agentId: "ceo", caseId: TEST_CASE, reason: `r${i}` });
    }
    const timeline = log.getCaseTimeline(TEST_CASE);
    for (const entry of timeline) {
      expect(entry.offsetMs).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── G9: Escenarios integrados ───────────────────────────────────────────

describe("G9 — Escenarios integrados de gobernanza", () => {
  beforeEach(() => {
    auditLog.clear();
  });

  it("flujo completo: route → select → tool_blocked → governance_rule", () => {
    // Simulate a full flow with the singleton auditLog
    auditLog.emit({
      eventType: "case_routed",
      result: "success",
      userId: TEST_USER,
      caseId: TEST_CASE,
      agentId: "recepcion",
      reason: "Caso ruteado a recepcion",
    });
    auditLog.emit({
      eventType: "agent_selected",
      result: "success",
      userId: TEST_USER,
      caseId: TEST_CASE,
      agentId: "recepcion",
      reason: "Agente recepcion seleccionado",
    });

    // Internal agent tries external comm
    validateAndAuditToolAccess(TEST_USER, TEST_CASE, "fiscal", "send_whatsapp", "recepcion");

    const timeline = auditLog.getCaseTimeline(TEST_CASE);
    expect(timeline.length).toBeGreaterThanOrEqual(4); // route + select + tool_blocked + governance_rule

    const types = timeline.map((t) => t.event.eventType);
    expect(types).toContain("case_routed");
    expect(types).toContain("agent_selected");
    expect(types).toContain("tool_blocked");
    expect(types).toContain("governance_rule_triggered");
  });

  it("flujo de ownership: assign → change → conflict", () => {
    // Initial assignment
    validateOwnerAssignment(TEST_USER, TEST_CASE, "recepcion", null);
    // Change owner
    validateOwnerAssignment(TEST_USER, TEST_CASE, "comercial-principal", "recepcion");
    // Conflict: recepcion tries to talk when comercial-principal owns
    validateSingleVoice(TEST_USER, TEST_CASE, "recepcion", "comercial-principal", "hablar");

    const changes = auditLog.getVisibleOwnerTransitions(TEST_CASE);
    expect(changes).toHaveLength(2);

    const violations = auditLog.getGovernanceViolations(TEST_CASE);
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations.some((v) => v.eventType === "ownership_conflict_detected")).toBe(true);
  });

  it("múltiples agentes internos bloqueados generan múltiples violaciones", () => {
    const agents = ["fiscal", "bi-scoring", "marketing-automation"];
    for (const a of agents) {
      validateAndAuditToolAccess(TEST_USER, TEST_CASE, a, "send_email_transactional", "recepcion");
    }

    const violations = auditLog.getGovernanceViolations(TEST_CASE);
    // Each blocked agent generates 2 events: tool_blocked + governance_rule_triggered
    expect(violations.length).toBe(agents.length * 2);
  });

  it("agente interno bloqueado + external_message_blocked en mismo flujo", () => {
    // This simulates what happens in executeToolCall when an internal agent tries comm
    const result = validateAndAuditToolAccess(TEST_USER, TEST_CASE, "consultor-servicios", "send_whatsapp", "comercial-principal");
    expect(result.allowed).toBe(false);

    auditExternalMessage(TEST_USER, TEST_CASE, "consultor-servicios", "send_whatsapp", "comercial-principal", false);

    const allEvents = auditLog.query({ caseId: TEST_CASE });
    const types = allEvents.map((e) => e.eventType);
    expect(types).toContain("tool_blocked");
    expect(types).toContain("governance_rule_triggered");
    expect(types).toContain("external_message_blocked");
  });
});

// ─── G10: Store adapter pattern ──────────────────────────────────────────

describe("G10 — Store adapter pattern", () => {
  it("MemoryAuditStore implementa todas las operaciones de AuditStore", () => {
    const store = new MemoryAuditStore();
    expect(typeof store.append).toBe("function");
    expect(typeof store.query).toBe("function");
    expect(typeof store.getCaseTimeline).toBe("function");
    expect(typeof store.count).toBe("function");
    expect(typeof store.clear).toBe("function");
  });

  it("se puede crear AuditLogger con store personalizado", () => {
    const store = new MemoryAuditStore();
    const customLog = new AuditLogger({ consoleOutput: false, store });

    customLog.emit({ eventType: "case_routed", result: "success", userId: TEST_USER, agentId: "ceo", reason: "custom store" });

    expect(store.count()).toBe(1);
    expect(customLog.getStats().totalEvents).toBe(1);
  });

  it("múltiples loggers con stores independientes no interfieren", () => {
    const log1 = freshLogger();
    const log2 = freshLogger();

    log1.emit({ eventType: "case_routed", result: "success", userId: TEST_USER, agentId: "ceo", reason: "log1" });
    log2.emit({ eventType: "tool_called", result: "info", userId: TEST_USER, agentId: "fiscal", reason: "log2" });
    log2.emit({ eventType: "tool_called", result: "info", userId: TEST_USER, agentId: "fiscal", reason: "log2b" });

    expect(log1.getStats().totalEvents).toBe(1);
    expect(log2.getStats().totalEvents).toBe(2);
  });
});
