/**
 * E2E Simulation Helpers — Flujos de negocio completos sobre Arquitectura v2.
 *
 * Estas utilidades permiten simular un caso de negocio paso a paso,
 * ejercitando las funciones reales de routing, gobernanza, ownership,
 * permisos y auditoría — sin necesitar LLM real.
 *
 * Arquitectura:
 *   SimulatedCase  →  acumula pasos del flujo
 *   step()         →  ejecuta una acción (route, assign, tool, delegate, comm)
 *   assert*()      →  helpers de validación sobre el timeline resultante
 */

import { expect } from "vitest";
import {
  routeToAgent,
  getAgentById,
  validateToolAccess,
  isExternalCommunicationTool,
  canCommunicateExternally,
  VISIBLE_LAYERS,
  INTERNAL_LAYERS,
  _setAuditLogRef,
} from "@/lib/agent/swarm";
import {
  auditLog,
  AuditLogger,
  MemoryAuditStore,
  validateAndAuditToolAccess,
  validateSingleVoice,
  validateOwnerAssignment,
  auditExternalMessage,
} from "@/lib/audit";
import type { AuditEvent, AuditEventType, AuditAgentLayer } from "@/lib/audit";

// ─── Layer helper (mirrors governance.ts) ────────────────────────────────

const VISIBLE_IDS = new Set(["recepcion", "comercial-principal", "comercial-junior", "ceo"]);

function getLayer(agentId: string): AuditAgentLayer | null {
  if (agentId === "ceo") return "gobierno";
  if (VISIBLE_IDS.has(agentId)) return "visible";
  if (["consultor-servicios", "consultor-digital", "legal-rgpd"].includes(agentId)) return "experta-interna";
  if (["fiscal", "bi-scoring", "marketing-automation"].includes(agentId)) return "modulo-interno";
  return null;
}

// ─── SimulatedCase ───────────────────────────────────────────────────────

export interface CaseStep {
  action: string;
  agentId: string;
  detail: string;
  result: "ok" | "blocked" | "escalated";
}

export class SimulatedCase {
  readonly caseId: string;
  readonly userId: string;
  /** Uses the global auditLog singleton so governance validators write to the same store */
  readonly log = auditLog;

  private _owner: string | null = null;
  private _steps: CaseStep[] = [];
  private _agents: Set<string> = new Set();

  constructor(caseId: string, userId: string = "e2e-user") {
    this.caseId = caseId;
    this.userId = userId;
    // Clear the global singleton so each case starts fresh
    auditLog.clear();
  }

  get owner(): string | null { return this._owner; }
  get steps(): CaseStep[] { return [...this._steps]; }
  get agents(): string[] { return [...this._agents]; }

  // ── Actions ──────────────────────────────────────────────────────────

  /** Simulate routing a query — returns the routed agent ID */
  route(query: string): string {
    const agentId = routeToAgent(query);
    this._agents.add(agentId);

    this.log.emit({
      eventType: "case_routed",
      result: "success",
      userId: this.userId,
      caseId: this.caseId,
      agentId,
      agentLayer: getLayer(agentId),
      reason: `Caso ruteado a ${agentId} para: "${query.slice(0, 80)}"`,
      metadata: { query: query.slice(0, 120) },
    });

    this.log.emit({
      eventType: "agent_selected",
      result: "success",
      userId: this.userId,
      caseId: this.caseId,
      agentId,
      agentLayer: getLayer(agentId),
      reason: `Agente ${agentId} seleccionado`,
      metadata: {},
    });

    this._steps.push({ action: "route", agentId, detail: query.slice(0, 80), result: "ok" });
    return agentId;
  }

  /** Assign visible ownership of the case */
  assignOwner(agentId: string, previousOwner?: string | null): boolean {
    const check = validateOwnerAssignment(
      this.userId, this.caseId, agentId, previousOwner ?? this._owner,
    );
    if (check.allowed) {
      this._owner = agentId;
      this._agents.add(agentId);
      this._steps.push({ action: "assign_owner", agentId, detail: `owner → ${agentId}`, result: "ok" });
    } else {
      this._steps.push({ action: "assign_owner", agentId, detail: check.reason, result: "blocked" });
    }
    return check.allowed;
  }

  /** Simulate an agent trying to use a tool */
  useTool(agentId: string, toolName: string): boolean {
    this._agents.add(agentId);
    const layer = getLayer(agentId);

    // Log tool_called
    this.log.emit({
      eventType: "tool_called",
      result: "info",
      userId: this.userId,
      caseId: this.caseId,
      agentId,
      agentLayer: layer,
      visibleOwnerId: this._owner,
      toolName,
      reason: `${agentId} invoca ${toolName}`,
      metadata: {},
    });

    // Check governance
    const access = validateToolAccess(agentId, toolName);
    if (!access.allowed) {
      // Use the audit governance validators
      validateAndAuditToolAccess(this.userId, this.caseId, agentId, toolName, this._owner);
      if (isExternalCommunicationTool(toolName)) {
        auditExternalMessage(this.userId, this.caseId, agentId, toolName, this._owner, false);
      }
      this._steps.push({ action: "tool", agentId, detail: `${toolName} BLOCKED`, result: "blocked" });
      return false;
    }

    // External comm allowed
    if (isExternalCommunicationTool(toolName)) {
      auditExternalMessage(this.userId, this.caseId, agentId, toolName, this._owner, true);
    }

    // Log success
    this.log.emit({
      eventType: "tool_succeeded",
      result: "success",
      userId: this.userId,
      caseId: this.caseId,
      agentId,
      agentLayer: layer,
      visibleOwnerId: this._owner,
      toolName,
      reason: `${toolName} ejecutado por ${agentId}`,
      metadata: {},
    });

    this._steps.push({ action: "tool", agentId, detail: `${toolName} OK`, result: "ok" });
    return true;
  }

  /** Simulate an agent speaking to the client (validates single-voice) */
  speakToClient(agentId: string, action: string = "responder"): boolean {
    this._agents.add(agentId);
    const check = validateSingleVoice(this.userId, this.caseId, agentId, this._owner, action);
    if (check.allowed) {
      this._steps.push({ action: "speak", agentId, detail: `${agentId} habla con cliente`, result: "ok" });
    } else {
      this._steps.push({ action: "speak", agentId, detail: `${agentId} BLOCKED: ${check.reason}`, result: "blocked" });
    }
    return check.allowed;
  }

  /** Simulate internal work by an agent (no client-facing) */
  internalWork(agentId: string, description: string): void {
    this._agents.add(agentId);
    const layer = getLayer(agentId);

    this.log.emit({
      eventType: "tool_called",
      result: "info",
      userId: this.userId,
      caseId: this.caseId,
      agentId,
      agentLayer: layer,
      visibleOwnerId: this._owner,
      reason: `Trabajo interno: ${description}`,
      metadata: { type: "internal_work", description },
    });

    this.log.emit({
      eventType: "tool_succeeded",
      result: "success",
      userId: this.userId,
      caseId: this.caseId,
      agentId,
      agentLayer: layer,
      visibleOwnerId: this._owner,
      reason: `Trabajo interno completado: ${description}`,
      metadata: { type: "internal_work" },
    });

    this._steps.push({ action: "internal_work", agentId, detail: description, result: "ok" });
  }

  /** Simulate delegation from one agent to another */
  delegate(fromAgentId: string, toAgentId: string, reason: string): boolean {
    this._agents.add(fromAgentId);
    const fromAgent = getAgentById(fromAgentId);
    if (!fromAgent) {
      this._steps.push({ action: "delegate", agentId: fromAgentId, detail: `agente desconocido`, result: "blocked" });
      return false;
    }

    if (!fromAgent.canDelegate.includes(toAgentId)) {
      this.log.emit({
        eventType: "agent_blocked",
        result: "blocked",
        userId: this.userId,
        caseId: this.caseId,
        agentId: fromAgentId,
        agentLayer: getLayer(fromAgentId),
        targetAgentId: toAgentId,
        reason: `${fromAgentId} no puede delegar a ${toAgentId}`,
        metadata: { from: fromAgentId, to: toAgentId },
      });
      this._steps.push({ action: "delegate", agentId: fromAgentId, detail: `→${toAgentId} BLOCKED`, result: "blocked" });
      return false;
    }

    this._agents.add(toAgentId);
    this.log.emit({
      eventType: "agent_delegated",
      result: "success",
      userId: this.userId,
      caseId: this.caseId,
      agentId: fromAgentId,
      agentLayer: getLayer(fromAgentId),
      targetAgentId: toAgentId,
      reason: `${fromAgentId} delega a ${toAgentId}: ${reason}`,
      metadata: { reason },
    });

    this._steps.push({ action: "delegate", agentId: fromAgentId, detail: `→${toAgentId}: ${reason}`, result: "ok" });
    return true;
  }

  /** Simulate escalation (delegation + ownership change) */
  escalate(fromAgentId: string, toAgentId: string, reason: string): boolean {
    const delegated = this.delegate(fromAgentId, toAgentId, reason);
    if (!delegated) return false;

    // If target is visible, change ownership
    if (VISIBLE_LAYERS.has(toAgentId)) {
      this.assignOwner(toAgentId);
      this.log.emit({
        eventType: "case_escalated",
        result: "success",
        userId: this.userId,
        caseId: this.caseId,
        agentId: fromAgentId,
        agentLayer: getLayer(fromAgentId),
        targetAgentId: toAgentId,
        visibleOwnerId: toAgentId,
        reason: `Escalado de ${fromAgentId} a ${toAgentId}: ${reason}`,
        metadata: { reason },
      });
    }

    this._steps.push({ action: "escalate", agentId: fromAgentId, detail: `↑${toAgentId}: ${reason}`, result: "ok" });
    return true;
  }

  /** Simulate a BI/internal recommendation (info event, no execution) */
  recommend(agentId: string, recommendation: string): void {
    this._agents.add(agentId);
    const layer = getLayer(agentId);

    this.log.emit({
      eventType: "tool_succeeded",
      result: "info",
      userId: this.userId,
      caseId: this.caseId,
      agentId,
      agentLayer: layer,
      visibleOwnerId: this._owner,
      reason: `Recomendación interna: ${recommendation}`,
      metadata: { type: "recommendation", text: recommendation },
    });

    this._steps.push({ action: "recommend", agentId, detail: recommendation, result: "ok" });
  }

  // ── Getters for assertions ──────────────────────────────────────────

  getTimeline(): AuditEvent[] {
    return this.log.getCaseTimeline(this.caseId).map((t) => t.event);
  }

  getEvents(filter?: { eventType?: AuditEventType | AuditEventType[]; agentId?: string }): AuditEvent[] {
    return this.log.query({ caseId: this.caseId, ...filter });
  }

  getViolations(): AuditEvent[] {
    return this.log.getGovernanceViolations(this.caseId);
  }

  getOwnerTransitions(): AuditEvent[] {
    return this.log.getVisibleOwnerTransitions(this.caseId);
  }

  getBlockedTools(): AuditEvent[] {
    return this.log.getBlockedToolAttempts(this.caseId);
  }

  getExternalComms(): AuditEvent[] {
    return this.log.getExternalCommunicationEvents(this.caseId);
  }
}

// ─── Assertion Helpers ───────────────────────────────────────────────────

/**
 * Assert the ownership path of a case matches expected sequence.
 * e.g. expectCaseOwnerPath(c, ["recepcion", "comercial-junior"])
 */
export function expectCaseOwnerPath(c: SimulatedCase, expectedPath: string[]): void {
  const transitions = c.getOwnerTransitions();
  const actualPath = transitions.map((t) => t.agentId);
  expect(actualPath).toEqual(expectedPath);
}

/**
 * Assert no internal agent ever sent an external message.
 */
export function expectNoInternalExternalMessages(c: SimulatedCase): void {
  const comms = c.getExternalComms();
  const internalComms = comms.filter(
    (e) => e.eventType === "external_message_attempted" && INTERNAL_LAYERS.has(e.agentId),
  );
  expect(internalComms).toHaveLength(0);

  // Also check that any blocked messages from internals were properly blocked
  const blockedInternal = comms.filter(
    (e) => e.eventType === "external_message_blocked" && INTERNAL_LAYERS.has(e.agentId),
  );
  // These are OK — they mean the system caught the attempt
  // Just verify none slipped through as "attempted" (which would mean allowed)
}

/**
 * Assert at least one governance violation was recorded, optionally matching a rule.
 */
export function expectGovernanceViolation(c: SimulatedCase, rule?: string): void {
  const violations = c.getViolations();
  expect(violations.length).toBeGreaterThan(0);
  if (rule) {
    const matching = violations.filter(
      (v) => v.reason.includes(rule) || (v.metadata as any).rule === rule,
    );
    expect(matching.length).toBeGreaterThan(0);
  }
}

/**
 * Assert NO governance violations were recorded.
 */
export function expectNoGovernanceViolations(c: SimulatedCase): void {
  const violations = c.getViolations();
  expect(violations).toHaveLength(0);
}

/**
 * Assert a specific tool was blocked for a specific agent.
 */
export function expectToolBlocked(c: SimulatedCase, toolName: string, agentId: string): void {
  const blocked = c.getBlockedTools();
  const match = blocked.filter((b) => b.toolName === toolName && b.agentId === agentId);
  expect(match.length).toBeGreaterThan(0);
}

/**
 * Assert "single voice" principle: at no point did two non-CEO visible agents
 * speak to the client AFTER the final ownership was assigned.
 * Before transfers, the previous owner may have spoken — that's valid handoff.
 * The key rule is: after transfer, only the current owner speaks.
 *
 * Simplified check: no two non-CEO agents spoke AFTER the last ownership change.
 */
export function expectSingleVisibleVoice(c: SimulatedCase): void {
  const steps = c.steps;
  // Find last assign_owner step
  let lastOwnerIdx = -1;
  let lastOwner: string | null = null;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].action === "assign_owner" && steps[i].result === "ok") {
      lastOwnerIdx = i;
      lastOwner = steps[i].agentId;
      break;
    }
  }

  if (lastOwnerIdx === -1 || !lastOwner) return; // No owner assigned, skip

  // After last ownership change, only the final owner (or CEO) should speak
  const postOwnerSpeaks = steps
    .slice(lastOwnerIdx + 1)
    .filter((s) => s.action === "speak" && s.result === "ok")
    .map((s) => s.agentId)
    .filter((id) => id !== "ceo");

  const postOwnerSpeakers = new Set(postOwnerSpeaks);
  // Should only contain the final owner (or be empty)
  for (const speaker of postOwnerSpeakers) {
    expect(speaker).toBe(lastOwner);
  }
}

/**
 * Assert specific agents appear in the case timeline.
 */
export function expectAgentsInTimeline(c: SimulatedCase, expectedAgents: string[]): void {
  const timeline = c.getTimeline();
  const agentsInTimeline = new Set(timeline.map((e) => e.agentId));
  for (const expected of expectedAgents) {
    expect(agentsInTimeline.has(expected)).toBe(true);
  }
}

/**
 * Assert specific agents do NOT appear in the case timeline.
 */
export function expectAgentsNotInTimeline(c: SimulatedCase, excludedAgents: string[]): void {
  const timeline = c.getTimeline();
  const agentsInTimeline = new Set(timeline.map((e) => e.agentId));
  for (const excluded of excludedAgents) {
    expect(agentsInTimeline.has(excluded)).toBe(false);
  }
}

/**
 * Assert the timeline has the expected event types in order (subset check).
 */
export function expectTimelineContainsSequence(c: SimulatedCase, expectedTypes: AuditEventType[]): void {
  const timeline = c.getTimeline();
  const types = timeline.map((e) => e.eventType);

  let searchFrom = 0;
  for (const expected of expectedTypes) {
    const idx = types.indexOf(expected, searchFrom);
    expect(idx).toBeGreaterThanOrEqual(searchFrom);
    searchFrom = idx + 1;
  }
}

/**
 * Assert that a specific agent only did internal work (no external comms attempted).
 */
export function expectAgentOnlyInternal(c: SimulatedCase, agentId: string): void {
  const speakSteps = c.steps.filter(
    (s) => s.action === "speak" && s.agentId === agentId && s.result === "ok",
  );
  expect(speakSteps).toHaveLength(0);

  const externalComms = c.getExternalComms().filter(
    (e) => e.agentId === agentId && e.eventType === "external_message_attempted",
  );
  expect(externalComms).toHaveLength(0);
}

/**
 * Assert the first agent to receive the case was the expected one.
 */
export function expectFirstAgent(c: SimulatedCase, expectedAgentId: string): void {
  const timeline = c.getTimeline();
  const routed = timeline.find((e) => e.eventType === "case_routed");
  expect(routed).toBeDefined();
  expect(routed!.agentId).toBe(expectedAgentId);
}

/**
 * Assert total number of governance violations.
 */
export function expectViolationCount(c: SimulatedCase, count: number): void {
  expect(c.getViolations()).toHaveLength(count);
}
