/**
 * Governance Runtime Validators — Detect and log violations in real-time.
 *
 * These functions are called at critical points in the swarm to detect
 * violations of Architecture v2 rules. They both LOG the violation
 * and return a result indicating whether to block the action.
 */

import { auditLog } from "./logger";
import type { AuditAgentLayer } from "./types";

// ─── Layer Classification (mirrors swarm.ts, no import to avoid circular) ─

const VISIBLE_IDS = new Set(["recepcion", "comercial-principal", "comercial-junior", "ceo"]);
const INTERNAL_IDS = new Set(["consultor-servicios", "consultor-digital", "legal-rgpd", "fiscal", "bi-scoring", "marketing-automation"]);

const EXTERNAL_COMM_TOOLS = new Set([
  "send_whatsapp", "send_sms", "send_telegram",
  "send_email_transactional", "make_phone_call",
  "draft_and_send", "speak_with_voice",
]);

function getLayer(agentId: string): AuditAgentLayer | null {
  if (agentId === "ceo") return "gobierno";
  if (VISIBLE_IDS.has(agentId)) return "visible";
  if (["consultor-servicios", "consultor-digital", "legal-rgpd"].includes(agentId)) return "experta-interna";
  if (["fiscal", "bi-scoring", "marketing-automation"].includes(agentId)) return "modulo-interno";
  return null;
}

// ─── Validation Results ───────────────────────────────────────────────────

export interface GovernanceCheckResult {
  allowed: boolean;
  violation: boolean;
  reason: string;
}

// ─── Validators ───────────────────────────────────────────────────────────

/**
 * Validate that an agent can use a specific tool.
 * Logs tool_blocked if denied.
 */
export function validateAndAuditToolAccess(
  userId: string,
  caseId: string | null,
  agentId: string,
  toolName: string,
  visibleOwnerId: string | null,
): GovernanceCheckResult {
  const layer = getLayer(agentId);
  const isInternal = INTERNAL_IDS.has(agentId);
  const isCommTool = EXTERNAL_COMM_TOOLS.has(toolName);

  // Rule: Internal agents cannot use external communication tools
  if (isInternal && isCommTool) {
    auditLog.emit({
      eventType: "tool_blocked",
      result: "blocked",
      caseId,
      userId,
      agentId,
      agentLayer: layer,
      visibleOwnerId,
      toolName,
      reason: `Agente interno ${agentId} (${layer}) intentó usar tool de comunicación externa: ${toolName}`,
      metadata: { rule: "internal_no_external_comm", blocked: true },
    });

    auditLog.emit({
      eventType: "governance_rule_triggered",
      result: "blocked",
      caseId,
      userId,
      agentId,
      agentLayer: layer,
      visibleOwnerId,
      toolName,
      reason: `GOBERNANZA: ${agentId} es ${layer} y NO puede usar ${toolName}`,
      metadata: { rule: "internal_no_external_comm", violationType: "tool_access" },
    });

    return {
      allowed: false,
      violation: true,
      reason: `[GOBERNANZA] ${agentId} es un rol interno y NO puede usar ${toolName}.`,
    };
  }

  return { allowed: true, violation: false, reason: "ok" };
}

/**
 * Validate that the current communicator matches the visible owner.
 * Detects "multiple voice" violations.
 */
export function validateSingleVoice(
  userId: string,
  caseId: string,
  agentId: string,
  visibleOwnerId: string | null,
  action: string,
): GovernanceCheckResult {
  const layer = getLayer(agentId);

  // If there's no owner yet, only recepcion or ceo should be talking
  if (!visibleOwnerId) {
    if (agentId !== "recepcion" && agentId !== "ceo") {
      auditLog.emit({
        eventType: "visibility_violation_detected",
        result: "blocked",
        caseId,
        userId,
        agentId,
        agentLayer: layer,
        visibleOwnerId: null,
        reason: `${agentId} intentó comunicar con cliente sin owner asignado. Solo recepcion o ceo pueden iniciar.`,
        metadata: { action, violationType: "no_owner_comm" },
      });
      return { allowed: false, violation: true, reason: "No hay owner asignado. Solo recepcion/ceo pueden iniciar." };
    }
    return { allowed: true, violation: false, reason: "ok" };
  }

  // If there IS an owner, only the owner should be the visible voice
  if (agentId !== visibleOwnerId && agentId !== "ceo") {
    auditLog.emit({
      eventType: "ownership_conflict_detected",
      result: "blocked",
      caseId,
      userId,
      agentId,
      agentLayer: layer,
      visibleOwnerId,
      reason: `${agentId} intentó hablar con cliente pero el owner visible es ${visibleOwnerId}. Violación de "una sola voz".`,
      metadata: { action, currentOwner: visibleOwnerId, attemptedBy: agentId },
    });
    return { allowed: false, violation: true, reason: `Owner visible es ${visibleOwnerId}, no ${agentId}.` };
  }

  return { allowed: true, violation: false, reason: "ok" };
}

/**
 * Validate that a proposed owner is in a visible layer.
 */
export function validateOwnerAssignment(
  userId: string,
  caseId: string,
  proposedOwnerId: string,
  previousOwnerId: string | null,
): GovernanceCheckResult {
  const layer = getLayer(proposedOwnerId);

  if (!VISIBLE_IDS.has(proposedOwnerId)) {
    auditLog.emit({
      eventType: "visibility_violation_detected",
      result: "blocked",
      caseId,
      userId,
      agentId: proposedOwnerId,
      agentLayer: layer,
      visibleOwnerId: previousOwnerId,
      reason: `Intento de asignar owner visible a ${proposedOwnerId} (${layer}). Solo agentes visibles pueden ser owner.`,
      metadata: { proposedOwner: proposedOwnerId, previousOwner: previousOwnerId },
    });
    return { allowed: false, violation: true, reason: `${proposedOwnerId} no es un agente visible.` };
  }

  // Log the transition
  auditLog.emit({
    eventType: "case_owner_changed",
    result: "success",
    caseId,
    userId,
    agentId: proposedOwnerId,
    agentLayer: layer,
    visibleOwnerId: proposedOwnerId,
    targetAgentId: previousOwnerId,
    reason: `Owner cambia de ${previousOwnerId ?? "ninguno"} a ${proposedOwnerId}`,
    metadata: { from: previousOwnerId, to: proposedOwnerId },
  });

  return { allowed: true, violation: false, reason: "ok" };
}

/**
 * Validate external message attempt and log appropriately.
 */
export function auditExternalMessage(
  userId: string,
  caseId: string | null,
  agentId: string,
  toolName: string,
  visibleOwnerId: string | null,
  allowed: boolean,
): void {
  const layer = getLayer(agentId);

  if (!allowed) {
    auditLog.emit({
      eventType: "external_message_blocked",
      result: "blocked",
      caseId,
      userId,
      agentId,
      agentLayer: layer,
      visibleOwnerId,
      toolName,
      reason: `Mensaje externo bloqueado: ${agentId} (${layer}) no puede enviar vía ${toolName}`,
      metadata: { channel: toolName },
    });
  } else {
    auditLog.emit({
      eventType: "external_message_attempted",
      result: "info",
      caseId,
      userId,
      agentId,
      agentLayer: layer,
      visibleOwnerId,
      toolName,
      reason: `Mensaje externo intentado por ${agentId} vía ${toolName}`,
      metadata: { channel: toolName },
    });
  }
}
