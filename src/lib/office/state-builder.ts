/**
 * Office State Builder — Derives office visual state from real audit events,
 * case data, and working memory.
 *
 * This is the "adapter" layer: swarm/audit/cases → OfficeStateSnapshot.
 * The UI never touches audit or cases directly.
 *
 * Data flow:
 *   1. Query recent audit events (last N minutes)
 *   2. Query active cases with ownership
 *   3. Build per-agent state by analyzing event patterns
 *   4. Return OfficeStateSnapshot with fallback for missing data
 */

import type { AuditEvent } from "@/lib/audit/types";
import type {
  OfficeAgentState,
  OfficeAgentStatus,
  OfficeAgentLayer,
  OfficeDelegation,
  OfficeActivityEntry,
  OfficeActiveCase,
  OfficeStateSnapshot,
} from "./types";

// ─── Agent Registry (layer mapping, matches swarm.ts) ────────────────────

export const AGENT_LAYER_MAP: Record<string, OfficeAgentLayer> = {
  "ceo": "gobierno",
  "recepcion": "visible",
  "comercial-principal": "visible",
  "comercial-junior": "visible",
  "consultor-servicios": "experta-interna",
  "consultor-digital": "experta-interna",
  "legal-rgpd": "experta-interna",
  "fiscal": "modulo-interno",
  "bi-scoring": "modulo-interno",
  "marketing-automation": "modulo-interno",
};

const VISIBLE_LAYERS = new Set<OfficeAgentLayer>(["gobierno", "visible"]);

export const ALL_AGENT_IDS = Object.keys(AGENT_LAYER_MAP);

// ─── Event → Status Mapping ──────────────────────────────────────────────

/**
 * Derive agent status from the most recent event involving that agent.
 * Priority: blocked > delegating > active > internal_work > idle
 */
export function deriveAgentStatus(
  recentEvents: AuditEvent[],
  agentId: string,
): { status: OfficeAgentStatus; blockedReason: string | null; lastEvent: AuditEvent | null; taskSummary: string | null } {
  // Find events for this agent (as primary actor or target)
  const agentEvents = recentEvents.filter(
    (e) => e.agentId === agentId || e.targetAgentId === agentId,
  );

  if (agentEvents.length === 0) {
    return { status: "idle", blockedReason: null, lastEvent: null, taskSummary: null };
  }

  // Events are newest-first (pre-sorted)
  const latest = agentEvents[0];

  // Check for blocked state
  if (
    latest.result === "blocked" ||
    latest.eventType === "tool_blocked" ||
    latest.eventType === "agent_blocked" ||
    latest.eventType === "external_message_blocked"
  ) {
    return {
      status: "blocked",
      blockedReason: latest.reason || `${latest.eventType} (${latest.toolName || "governance"})`,
      lastEvent: latest,
      taskSummary: null,
    };
  }

  // Check for delegation (agent initiated or is target)
  if (latest.eventType === "agent_delegated") {
    if (latest.agentId === agentId) {
      return {
        status: "delegating",
        blockedReason: null,
        lastEvent: latest,
        taskSummary: `Delegando: ${latest.reason?.slice(0, 60) || "tarea"}`,
      };
    }
    // This agent is the target of delegation — they're actively working
    return {
      status: "active",
      blockedReason: null,
      lastEvent: latest,
      taskSummary: `Recibida delegación: ${latest.reason?.slice(0, 60) || "tarea"}`,
    };
  }

  // Check for active work
  if (
    latest.eventType === "tool_called" ||
    latest.eventType === "tool_succeeded" ||
    latest.eventType === "case_routed" ||
    latest.eventType === "agent_selected" ||
    latest.eventType === "external_message_attempted" ||
    latest.eventType === "external_message_sent"
  ) {
    const layer = AGENT_LAYER_MAP[agentId];
    const isInternal = layer === "modulo-interno" || layer === "experta-interna";

    return {
      status: isInternal ? "internal_work" : "active",
      blockedReason: null,
      lastEvent: latest,
      taskSummary: latest.toolName
        ? `Usando ${latest.toolName}`
        : latest.reason?.slice(0, 60) || null,
    };
  }

  // Governance events — agent triggered a rule
  if (
    latest.eventType === "governance_rule_triggered" ||
    latest.eventType === "ownership_conflict_detected" ||
    latest.eventType === "visibility_violation_detected"
  ) {
    return {
      status: "blocked",
      blockedReason: latest.reason || latest.eventType,
      lastEvent: latest,
      taskSummary: null,
    };
  }

  // Case lifecycle events — agent is active
  if (
    latest.eventType === "case_created" ||
    latest.eventType === "case_owner_changed" ||
    latest.eventType === "case_escalated" ||
    latest.eventType === "case_status_changed"
  ) {
    return {
      status: "active",
      blockedReason: null,
      lastEvent: latest,
      taskSummary: latest.reason?.slice(0, 60) || "Gestionando caso",
    };
  }

  // Default: if there's recent activity, show as idle (event was informational)
  return { status: "idle", blockedReason: null, lastEvent: latest, taskSummary: null };
}

// ─── Extract Active Delegations ──────────────────────────────────────────

export function extractDelegations(recentEvents: AuditEvent[]): OfficeDelegation[] {
  return recentEvents
    .filter((e) => e.eventType === "agent_delegated" && e.targetAgentId)
    .slice(0, 5) // max 5 active delegations shown
    .map((e) => ({
      fromAgentId: e.agentId,
      toAgentId: e.targetAgentId!,
      reason: e.reason || "Delegación",
      caseId: e.caseId,
      timestamp: e.timestamp,
    }));
}

// ─── Build Activity Feed ─────────────────────────────────────────────────

const EVENT_SUMMARIES: Record<string, string> = {
  case_created: "Caso creado",
  case_routed: "Caso enrutado",
  case_escalated: "Caso escalado",
  case_owner_changed: "Owner cambiado",
  case_closed: "Caso cerrado",
  agent_selected: "Agente seleccionado",
  agent_blocked: "Agente bloqueado",
  agent_delegated: "Delegación",
  tool_called: "Herramienta usada",
  tool_blocked: "Herramienta bloqueada",
  tool_succeeded: "Herramienta exitosa",
  tool_failed: "Herramienta fallida",
  external_message_sent: "Mensaje externo enviado",
  external_message_blocked: "Mensaje externo bloqueado",
  governance_rule_triggered: "Regla de gobernanza",
  ownership_conflict_detected: "Conflicto de ownership",
};

export function buildActivityFeed(events: AuditEvent[], limit = 20): OfficeActivityEntry[] {
  return events.slice(0, limit).map((e) => {
    const base = EVENT_SUMMARIES[e.eventType] || e.eventType;
    const tool = e.toolName ? ` (${e.toolName})` : "";
    const target = e.targetAgentId ? ` → ${e.targetAgentId}` : "";

    return {
      id: e.id,
      agentId: e.agentId,
      eventType: e.eventType,
      result: e.result,
      summary: `${base}${tool}${target}`,
      caseId: e.caseId,
      timestamp: e.timestamp,
    };
  });
}

// ─── Build Full Snapshot ─────────────────────────────────────────────────

export interface BuildOfficeStateInput {
  /** Recent audit events, newest first */
  recentEvents: AuditEvent[];
  /** Active cases from DB */
  activeCases: Array<{
    id: number | string;
    visibleOwnerId: string | null;
    status: string;
    subject: string | null;
    channel: string | null;
    updatedAt: Date | string | null;
  }>;
}

export function buildOfficeState(input: BuildOfficeStateInput): OfficeStateSnapshot {
  const { recentEvents, activeCases } = input;
  const hasRealData = recentEvents.length > 0 || activeCases.length > 0;

  // ── Build ownership map: agentId → caseId where they're visible owner
  const ownershipMap = new Map<string, string>();
  for (const c of activeCases) {
    if (c.visibleOwnerId) {
      ownershipMap.set(c.visibleOwnerId, String(c.id));
    }
  }

  // ── Build case map: caseId → active agents from events
  const caseAgentMap = new Map<string, string>();
  for (const e of recentEvents) {
    if (e.caseId && e.agentId && !caseAgentMap.has(e.agentId)) {
      caseAgentMap.set(e.agentId, e.caseId);
    }
  }

  // ── Per-agent state
  const agents: Record<string, OfficeAgentState> = {};

  for (const agentId of ALL_AGENT_IDS) {
    const layer = AGENT_LAYER_MAP[agentId];
    const { status, blockedReason, lastEvent, taskSummary } = deriveAgentStatus(recentEvents, agentId);

    agents[agentId] = {
      agentId,
      layer,
      isVisible: VISIBLE_LAYERS.has(layer),
      currentStatus: status,
      activeCaseId: caseAgentMap.get(agentId) ?? null,
      visibleOwnerCaseId: ownershipMap.get(agentId) ?? null,
      lastEventType: lastEvent?.eventType ?? null,
      lastActivityAt: lastEvent?.timestamp ?? null,
      currentTaskSummary: taskSummary,
      blockedReason,
      isReal: lastEvent !== null,
    };
  }

  // ── Delegations
  const activeDelegations = extractDelegations(recentEvents);

  // ── Activity feed
  const recentActivity = buildActivityFeed(recentEvents);

  // ── Active cases
  const officeCases: OfficeActiveCase[] = activeCases.map((c) => ({
    caseId: String(c.id),
    visibleOwnerId: c.visibleOwnerId,
    status: c.status,
    subject: c.subject,
    channel: c.channel,
    lastActivityAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
  }));

  return {
    agents,
    activeDelegations,
    recentActivity,
    activeCases: officeCases,
    generatedAt: new Date().toISOString(),
    hasRealData,
  };
}

// ─── Fallback: All agents idle, no real data ─────────────────────────────

export function buildFallbackState(): OfficeStateSnapshot {
  return buildOfficeState({ recentEvents: [], activeCases: [] });
}
