/**
 * Runtime Guardrails — Pre-action validation layer for safe go-live.
 *
 * This module sits between the swarm's decision to act and the actual execution.
 * It enforces operation mode, kill switches, rate limits, and safety checks
 * before any external or high-risk action is permitted.
 *
 * Usage:
 *   import { preActionCheck } from "@/lib/runtime/guardrails";
 *   const check = preActionCheck({ ... });
 *   if (!check.allowed) { // log + block }
 */

import {
  getRuntimeConfig,
  OperationMode,
  HIGH_RISK_TOOLS,
  isExternalCommsBlocked,
  isChannelBlocked,
  isDelegationBlocked,
  isJuniorDisabled,
  isReadOnly,
} from "./config";
import { isExternalCommunicationTool, VISIBLE_LAYERS, INTERNAL_LAYERS } from "@/lib/agent/swarm";
import { isReadOnlyTool, getToolCategory } from "./tool-classification";

// ─── Rate Limit Tracking (in-memory, resets on deploy) ───────────────────

interface CaseCounters {
  messages: number;
  calls: number;
  escalations: number;
  highRiskTools: number;
  lastContactTimestamp: number;
}

interface ClientCounters {
  messages: number;
  windowStart: number;
}

const caseCounters = new Map<string, CaseCounters>();
const clientCounters = new Map<string, ClientCounters>();
const toolRetryCounters = new Map<string, number>(); // key: `${caseId}:${toolName}`

function getCaseCounter(caseId: string): CaseCounters {
  if (!caseCounters.has(caseId)) {
    caseCounters.set(caseId, { messages: 0, calls: 0, escalations: 0, highRiskTools: 0, lastContactTimestamp: 0 });
  }
  return caseCounters.get(caseId)!;
}

function getClientCounter(clientId: string): ClientCounters {
  const now = Date.now();
  const existing = clientCounters.get(clientId);
  const cfg = getRuntimeConfig();
  const windowMs = cfg.rateLimits.clientWindowMinutes * 60_000;

  if (!existing || (now - existing.windowStart) > windowMs) {
    clientCounters.set(clientId, { messages: 0, windowStart: now });
    return clientCounters.get(clientId)!;
  }
  return existing;
}

/** Reset counters (for testing) */
export function resetCounters(): void {
  caseCounters.clear();
  clientCounters.clear();
  toolRetryCounters.clear();
}

// ─── Pre-Action Check Input/Output ──────────────────────────────────────

export interface PreActionInput {
  /** Action type being attempted */
  action: "tool_call" | "delegation" | "speak_to_client" | "escalation";
  /** Agent attempting the action */
  agentId: string;
  /** Case identifier */
  caseId: string | null;
  /** Client/user identifier (for per-client limits) */
  clientId: string;
  /** Tool name (if action is tool_call) */
  toolName?: string;
  /** Target agent (if delegation/escalation) */
  targetAgentId?: string;
  /** Current visible owner */
  visibleOwnerId?: string | null;
  /** Is this a retry of a failed tool? */
  isRetry?: boolean;
}

export interface PreActionResult {
  allowed: boolean;
  reason: string;
  /** What blocked it */
  blockedBy: "mode" | "kill_switch" | "rate_limit" | "governance" | "validation" | null;
  /** Should the action be simulated instead of real? (dry-run / shadow) */
  simulate: boolean;
  /** Should this be audited even if blocked? */
  audit: boolean;
}

// ─── Main Pre-Action Check ───────────────────────────────────────────────

export function preActionCheck(input: PreActionInput): PreActionResult {
  const cfg = getRuntimeConfig();
  const { mode, killSwitches, rateLimits } = cfg;

  // ── Read-Only Mode ──
  // Read-only tools are always allowed (even in readonly / dry-run)
  if (input.action === "tool_call" && input.toolName && isReadOnlyTool(input.toolName)) {
    return allow();
  }

  if (isReadOnly()) {
    return block("mode", "Sistema en modo solo lectura (KILL_FORCE_READONLY)");
  }

  // ── Dry-Run: simulate non-read actions ──
  if (mode === OperationMode.DRY_RUN) {
    return simulate("Modo dry-run: acción simulada, no real");
  }

  // ── Action-specific checks ──
  switch (input.action) {
    case "tool_call":
      return checkToolCall(input, cfg);
    case "delegation":
      return checkDelegation(input, cfg);
    case "speak_to_client":
      return checkSpeakToClient(input, cfg);
    case "escalation":
      return checkEscalation(input, cfg);
    default:
      return allow();
  }
}

// ─── Tool Call Checks ────────────────────────────────────────────────────

function checkToolCall(input: PreActionInput, cfg: ReturnType<typeof getRuntimeConfig>): PreActionResult {
  const { toolName, agentId, caseId, clientId, isRetry } = input;
  if (!toolName) return allow();

  // Kill switch: block all external comms
  if (isExternalCommunicationTool(toolName) && isExternalCommsBlocked()) {
    return block("kill_switch", `Comunicación externa bloqueada (modo: ${cfg.mode})`);
  }

  // Kill switch: block specific channel
  if (isExternalCommunicationTool(toolName) && isChannelBlocked(toolName)) {
    return block("kill_switch", `Canal ${toolName} bloqueado por kill switch`);
  }

  // Kill switch: high-risk tools
  if (HIGH_RISK_TOOLS.has(toolName) && cfg.killSwitches.blockHighRiskTools) {
    return block("kill_switch", `Tool de alto riesgo ${toolName} bloqueada (KILL_BLOCK_HIGH_RISK)`);
  }

  // Rate limit: messages per case
  if (isExternalCommunicationTool(toolName) && caseId) {
    const counter = getCaseCounter(caseId);
    if (counter.messages >= cfg.rateLimits.maxMessagesPerCase) {
      return block("rate_limit", `Límite de mensajes por caso alcanzado (${cfg.rateLimits.maxMessagesPerCase})`);
    }
  }

  // Rate limit: messages per client window
  if (isExternalCommunicationTool(toolName)) {
    const counter = getClientCounter(clientId);
    if (counter.messages >= cfg.rateLimits.maxMessagesPerClientWindow) {
      return block("rate_limit", `Límite de mensajes por cliente alcanzado (${cfg.rateLimits.maxMessagesPerClientWindow}/${cfg.rateLimits.clientWindowMinutes}min)`);
    }
  }

  // Rate limit: calls per case
  if (toolName === "make_phone_call" && caseId) {
    const counter = getCaseCounter(caseId);
    if (counter.calls >= cfg.rateLimits.maxCallsPerCase) {
      return block("rate_limit", `Límite de llamadas por caso alcanzado (${cfg.rateLimits.maxCallsPerCase})`);
    }
  }

  // Rate limit: high-risk tools per case
  if (HIGH_RISK_TOOLS.has(toolName) && caseId) {
    const counter = getCaseCounter(caseId);
    if (counter.highRiskTools >= cfg.rateLimits.maxHighRiskToolsPerCase) {
      return block("rate_limit", `Límite de tools de alto riesgo por caso alcanzado (${cfg.rateLimits.maxHighRiskToolsPerCase})`);
    }
  }

  // Rate limit: tool retries
  if (isRetry && caseId) {
    const key = `${caseId}:${toolName}`;
    const retries = toolRetryCounters.get(key) ?? 0;
    if (retries >= cfg.rateLimits.maxToolRetries) {
      return block("rate_limit", `Límite de reintentos para ${toolName} alcanzado (${cfg.rateLimits.maxToolRetries})`);
    }
  }

  // Rate limit: cooldown between contacts
  if (isExternalCommunicationTool(toolName) && caseId) {
    const counter = getCaseCounter(caseId);
    const elapsed = (Date.now() - counter.lastContactTimestamp) / 1000;
    if (counter.lastContactTimestamp > 0 && elapsed < cfg.rateLimits.cooldownBetweenContactsSec) {
      return block("rate_limit", `Cooldown activo: ${Math.ceil(cfg.rateLimits.cooldownBetweenContactsSec - elapsed)}s restantes`);
    }
  }

  // Shadow mode: external comms are simulated
  if (cfg.mode === OperationMode.SHADOW && isExternalCommunicationTool(toolName)) {
    return simulate(`Shadow mode: ${toolName} simulado`);
  }

  // Governance: internal agents can't use external tools (already in swarm, but double-check)
  if (isExternalCommunicationTool(toolName) && INTERNAL_LAYERS.has(agentId)) {
    return block("governance", `Agente interno ${agentId} no puede usar ${toolName}`);
  }

  // If allowed, increment counters
  if (caseId) {
    const counter = getCaseCounter(caseId);
    if (isExternalCommunicationTool(toolName)) {
      counter.messages++;
      counter.lastContactTimestamp = Date.now();
      getClientCounter(clientId).messages++;
    }
    if (toolName === "make_phone_call") counter.calls++;
    if (HIGH_RISK_TOOLS.has(toolName)) counter.highRiskTools++;
  }

  if (isRetry && caseId) {
    const key = `${caseId}:${toolName}`;
    toolRetryCounters.set(key, (toolRetryCounters.get(key) ?? 0) + 1);
  }

  return allow();
}

// ─── Delegation Checks ───────────────────────────────────────────────────

function checkDelegation(input: PreActionInput, cfg: ReturnType<typeof getRuntimeConfig>): PreActionResult {
  if (isDelegationBlocked()) {
    return block("kill_switch", "Delegación bloqueada (KILL_BLOCK_DELEGATION)");
  }

  // Shadow mode: delegations are allowed but logged specially
  if (cfg.mode === OperationMode.SHADOW) {
    return allow(); // delegations are internal, allow them
  }

  // Kill: disable Junior — reroute to Principal
  if (isJuniorDisabled() && input.targetAgentId === "comercial-junior") {
    return block("kill_switch", "Comercial Junior desactivado (KILL_DISABLE_JUNIOR). Redirigir a Principal.");
  }

  return allow();
}

// ─── Speak to Client Checks ─────────────────────────────────────────────

function checkSpeakToClient(input: PreActionInput, cfg: ReturnType<typeof getRuntimeConfig>): PreActionResult {
  const { agentId, visibleOwnerId } = input;

  // Read-only or dry-run
  if (isExternalCommsBlocked()) {
    return block("kill_switch", "Comunicación externa bloqueada");
  }

  // Shadow mode: simulate client comms
  if (cfg.mode === OperationMode.SHADOW) {
    return simulate("Shadow mode: comunicación con cliente simulada");
  }

  // Governance: only visible owner or CEO
  if (visibleOwnerId && agentId !== visibleOwnerId && agentId !== "ceo") {
    return block("governance", `Solo el owner (${visibleOwnerId}) o CEO puede hablar con cliente`);
  }

  // Governance: internal agents cannot speak
  if (INTERNAL_LAYERS.has(agentId)) {
    return block("governance", `Agente interno ${agentId} no puede comunicarse con cliente`);
  }

  return allow();
}

// ─── Escalation Checks ───────────────────────────────────────────────────

function checkEscalation(input: PreActionInput, cfg: ReturnType<typeof getRuntimeConfig>): PreActionResult {
  if (isDelegationBlocked()) {
    return block("kill_switch", "Escalación bloqueada (delegación desactivada)");
  }

  // Rate limit: chained escalations
  if (input.caseId) {
    const counter = getCaseCounter(input.caseId);
    if (counter.escalations >= cfg.rateLimits.maxChainedEscalations) {
      return block("rate_limit", `Límite de escalaciones encadenadas alcanzado (${cfg.rateLimits.maxChainedEscalations}). Requiere revisión humana.`);
    }
    counter.escalations++;
  }

  return allow();
}

// ─── Result Builders ─────────────────────────────────────────────────────

function allow(): PreActionResult {
  return { allowed: true, reason: "ok", blockedBy: null, simulate: false, audit: true };
}

function block(by: PreActionResult["blockedBy"], reason: string): PreActionResult {
  return { allowed: false, reason, blockedBy: by, simulate: false, audit: true };
}

function simulate(reason: string): PreActionResult {
  return { allowed: true, reason, blockedBy: null, simulate: true, audit: true };
}

// ─── Persistent Pre-Action Check (DB-backed counters + kill switches) ────

/**
 * Async version of preActionCheck that uses DB-backed kill switches and
 * persistent rate limit counters. Falls back to the sync in-memory version
 * if DB is unavailable.
 */
export async function preActionCheckAsync(input: PreActionInput): Promise<PreActionResult> {
  try {
    const { getRuntimeConfigAsync } = await import("./config");
    const cfg = await getRuntimeConfigAsync();
    const { mode, rateLimits } = cfg;

    // Read-only tools always allowed
    if (input.action === "tool_call" && input.toolName && isReadOnlyTool(input.toolName)) {
      return allow();
    }

    if (cfg.killSwitches.forceReadOnly) {
      return block("mode", "Sistema en modo solo lectura (KILL_FORCE_READONLY)");
    }

    if (mode === OperationMode.DRY_RUN) {
      return simulate("Modo dry-run: acción simulada, no real");
    }

    // Import persistent counters
    const dbRL = await import("./db-rate-limits");

    // Tool call with persistent counters
    if (input.action === "tool_call" && input.toolName) {
      const toolName = input.toolName;

      if (isExternalCommunicationTool(toolName) && cfg.killSwitches.blockAllExternalComms) {
        return block("kill_switch", `Comunicación externa bloqueada (modo: ${mode})`);
      }
      if (isExternalCommunicationTool(toolName) && isChannelBlocked(toolName)) {
        return block("kill_switch", `Canal ${toolName} bloqueado por kill switch`);
      }
      if (HIGH_RISK_TOOLS.has(toolName) && cfg.killSwitches.blockHighRiskTools) {
        return block("kill_switch", `Tool de alto riesgo ${toolName} bloqueada`);
      }

      // Persistent rate limits
      if (isExternalCommunicationTool(toolName) && input.caseId) {
        const count = await dbRL.getCaseCount(input.caseId, "messages");
        if (count >= rateLimits.maxMessagesPerCase) {
          return block("rate_limit", `Límite persistente de mensajes por caso (${rateLimits.maxMessagesPerCase})`);
        }
      }

      if (isExternalCommunicationTool(toolName)) {
        const count = await dbRL.getClientMessageCount(input.clientId, rateLimits.clientWindowMinutes);
        if (count >= rateLimits.maxMessagesPerClientWindow) {
          return block("rate_limit", `Límite persistente de mensajes por cliente (${rateLimits.maxMessagesPerClientWindow})`);
        }
      }

      if (toolName === "make_phone_call" && input.caseId) {
        const count = await dbRL.getCaseCount(input.caseId, "calls");
        if (count >= rateLimits.maxCallsPerCase) {
          return block("rate_limit", `Límite persistente de llamadas por caso (${rateLimits.maxCallsPerCase})`);
        }
      }

      if (HIGH_RISK_TOOLS.has(toolName) && input.caseId) {
        const count = await dbRL.getCaseCount(input.caseId, "highRiskTools");
        if (count >= rateLimits.maxHighRiskToolsPerCase) {
          return block("rate_limit", `Límite persistente de tools de alto riesgo (${rateLimits.maxHighRiskToolsPerCase})`);
        }
      }

      if (input.isRetry && input.caseId) {
        const retries = await dbRL.getToolRetries(input.caseId, toolName);
        if (retries >= rateLimits.maxToolRetries) {
          return block("rate_limit", `Límite persistente de reintentos para ${toolName} (${rateLimits.maxToolRetries})`);
        }
      }

      if (isExternalCommunicationTool(toolName) && input.caseId) {
        const lastTs = await dbRL.getLastContactTimestamp(input.caseId);
        const elapsed = (Date.now() - lastTs) / 1000;
        if (lastTs > 0 && elapsed < rateLimits.cooldownBetweenContactsSec) {
          return block("rate_limit", `Cooldown persistente activo: ${Math.ceil(rateLimits.cooldownBetweenContactsSec - elapsed)}s`);
        }
      }

      if (mode === OperationMode.SHADOW && isExternalCommunicationTool(toolName)) {
        return simulate(`Shadow mode: ${toolName} simulado`);
      }

      if (isExternalCommunicationTool(toolName) && INTERNAL_LAYERS.has(input.agentId)) {
        return block("governance", `Agente interno ${input.agentId} no puede usar ${toolName}`);
      }

      // Allowed — increment persistent counters
      if (input.caseId) {
        if (isExternalCommunicationTool(toolName)) {
          await dbRL.incrementCaseCount(input.caseId, "messages");
          await dbRL.touchLastContact(input.caseId);
          await dbRL.incrementClientMessages(input.clientId);
        }
        if (toolName === "make_phone_call") await dbRL.incrementCaseCount(input.caseId, "calls");
        if (HIGH_RISK_TOOLS.has(toolName)) await dbRL.incrementCaseCount(input.caseId, "highRiskTools");
      }
      if (input.isRetry && input.caseId) {
        await dbRL.incrementToolRetries(input.caseId, toolName);
      }

      return allow();
    }

    // Delegation / escalation / speak — use same sync logic (no counters needed)
    if (input.action === "delegation") return checkDelegation(input, cfg);
    if (input.action === "speak_to_client") return checkSpeakToClient(input, cfg);
    if (input.action === "escalation") {
      if (isDelegationBlocked()) return block("kill_switch", "Escalación bloqueada");
      if (input.caseId) {
        const count = await dbRL.getCaseCount(input.caseId, "escalations");
        if (count >= rateLimits.maxChainedEscalations) {
          return block("rate_limit", `Límite persistente de escalaciones (${rateLimits.maxChainedEscalations})`);
        }
        await dbRL.incrementCaseCount(input.caseId, "escalations");
      }
      return allow();
    }

    return allow();
  } catch {
    // DB unavailable — fall back to sync in-memory version
    return preActionCheck(input);
  }
}

// ─── Validation Helpers for Pre-Send Checks ──────────────────────────────

export interface PreSendValidation {
  valid: boolean;
  issues: string[];
}

/**
 * Validate that a case is ready for external communication.
 * Call before any real send to catch issues early.
 */
export function validateBeforeSend(input: {
  caseId: string | null;
  agentId: string;
  visibleOwnerId: string | null;
  hasClientData: boolean;
  isLegalDocument: boolean;
}): PreSendValidation {
  const issues: string[] = [];

  // Must have a clear owner
  if (!input.visibleOwnerId) {
    issues.push("No hay owner visible asignado al caso");
  }

  // Agent must be the owner or CEO
  if (input.visibleOwnerId && input.agentId !== input.visibleOwnerId && input.agentId !== "ceo") {
    issues.push(`Agente ${input.agentId} no es el owner visible (${input.visibleOwnerId})`);
  }

  // Must not be internal
  if (INTERNAL_LAYERS.has(input.agentId)) {
    issues.push(`Agente ${input.agentId} es interno — no puede enviar directamente`);
  }

  // Must have client data
  if (!input.hasClientData) {
    issues.push("Faltan datos críticos del cliente para envío");
  }

  // Legal documents require extra review in guarded mode
  if (input.isLegalDocument && getRuntimeConfig().mode === OperationMode.GUARDED) {
    issues.push("Documento legal requiere revisión adicional en modo guarded");
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Check if system is healthy enough for go-live.
 * Returns a scorecard-style check.
 */
export interface HealthCheck {
  ready: boolean;
  checks: Array<{ name: string; pass: boolean; detail: string }>;
  score: number; // 0-100
}

export function runHealthCheck(stats: {
  totalCases: number;
  governanceViolations: number;
  toolFailures: number;
  doubleVoiceIncidents: number;
  ownerlessActions: number;
  blockedAttempts: number;
  successfulFlows: number;
}): HealthCheck {
  const checks: HealthCheck["checks"] = [];

  // No double-voice incidents
  checks.push({
    name: "single_voice",
    pass: stats.doubleVoiceIncidents === 0,
    detail: `${stats.doubleVoiceIncidents} incidentes de doble voz`,
  });

  // Governance violations under threshold (< 1% of cases)
  const violationRate = stats.totalCases > 0 ? stats.governanceViolations / stats.totalCases : 0;
  checks.push({
    name: "governance_clean",
    pass: violationRate < 0.01,
    detail: `Tasa violaciones: ${(violationRate * 100).toFixed(2)}% (umbral: <1%)`,
  });

  // Tool failure rate under 5%
  const totalToolAttempts = stats.successfulFlows + stats.toolFailures;
  const failureRate = totalToolAttempts > 0 ? stats.toolFailures / totalToolAttempts : 0;
  checks.push({
    name: "tool_reliability",
    pass: failureRate < 0.05,
    detail: `Tasa fallos tools: ${(failureRate * 100).toFixed(2)}% (umbral: <5%)`,
  });

  // No ownerless external actions
  checks.push({
    name: "ownership_integrity",
    pass: stats.ownerlessActions === 0,
    detail: `${stats.ownerlessActions} acciones sin owner`,
  });

  // Blocked attempts are expected (governance working) — not a failure
  checks.push({
    name: "governance_active",
    pass: stats.blockedAttempts >= 0, // Always passes — just informational
    detail: `${stats.blockedAttempts} intentos bloqueados correctamente`,
  });

  // Minimum case volume
  checks.push({
    name: "minimum_volume",
    pass: stats.totalCases >= 10,
    detail: `${stats.totalCases} casos procesados (mínimo: 10)`,
  });

  const passing = checks.filter((c) => c.pass).length;
  const score = Math.round((passing / checks.length) * 100);

  return {
    ready: checks.every((c) => c.pass),
    checks,
    score,
  };
}
