/**
 * voice-filter.ts — Capa real de filtrado de salida antes de hablar al cliente.
 *
 * Este módulo procesa cada respuesta de agente visible ANTES de que llegue al cliente.
 * No es un prompt que "evalúa" — es código que actúa:
 * 1. Aplica reemplazos de vocabulario
 * 2. Elimina frases prohibidas
 * 3. Traduce tecnicismos si el cliente no los usó
 * 4. Verifica longitud por canal
 * 5. Comprueba triggers de escalado
 * 6. Añade cierre contextual si falta siguiente paso
 * 7. Marca como "no enviar" si hay que escalar a David
 */

import {
  type ClientType,
  type Channel,
  type FlowMoment,
  type AgentSlug,
  applyVocabReplacements,
  detectForbiddenPhrases,
  detectTechTerms,
  checkEscalationTriggers,
  isClientFacing,
  getContextualClosing,
  FORBIDDEN_PHRASES,
  TECH_TERMS_NEEDING_CONTEXT,
  MESSAGE_TEMPLATES,
} from "./brand-voice";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VoiceFilterInput {
  /** Mensaje generado por el agente */
  agentMessage: string;
  /** Slug del agente que generó el mensaje */
  agentSlug: AgentSlug;
  /** Tipo de cliente (si se conoce) */
  clientType?: ClientType;
  /** Canal de comunicación */
  channel?: Channel;
  /** Momento del flujo */
  flowMoment?: FlowMoment;
  /** Último mensaje del cliente (para detectar si usó tecnicismos) */
  clientLastMessage?: string;
  /** Contexto adicional para escalado */
  escalationContext?: {
    isVip?: boolean;
    scoring?: number;
    amount?: number;
    confidence?: number;
  };
}

export interface VoiceFilterOutput {
  /** Mensaje filtrado listo para enviar (o mensaje de escalado) */
  filteredMessage: string;
  /** Si es true, el mensaje puede enviarse al cliente. Si false, debe escalarse. */
  canSend: boolean;
  /** Razón por la que no se puede enviar (si canSend=false) */
  blockReason?: string;
  /** Cambios aplicados (para logging/aprendizaje) */
  changes: string[];
  /** Si se activó un trigger de escalado */
  escalationTriggered?: string;
  /** Mensaje de escalado para uso interno */
  escalationMessage?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_WHATSAPP_WORDS = 150;
const MAX_SMS_CHARS = 160;

/** Patrones que indican que el mensaje NO tiene siguiente paso */
const MISSING_NEXT_STEP_PATTERNS = [
  /[.!?]\s*$/,  // Termina en punto/exclamación/interrogación sin acción
];

/** Patrones que indican que SÍ hay siguiente paso */
const HAS_NEXT_STEP_PATTERNS = [
  /me dices/i,
  /me escribes/i,
  /me pasas/i,
  /te llamo/i,
  /te escribo/i,
  /te contacta/i,
  /te digo/i,
  /te aviso/i,
  /te confirmo/i,
  /aquí estoy/i,
  /cualquier duda/i,
  /cualquier cosa/i,
  /cuando lo tengas/i,
  /sin prisa/i,
  /\?$/,  // Termina con pregunta
];

/** Patrones internos que nunca deben llegar al cliente */
const INTERNAL_LEAK_PATTERNS = [
  /agente\s+(recepci[oó]n|comercial|consultor|legal|fiscal|bi|marketing|ceo)/i,
  /sistema\s+de\s+agentes/i,
  /swarm/i,
  /routing/i,
  /delegaci[oó]n\s+interna/i,
  /memoria\s+(corta|larga|epis[oó]dica|operativa)/i,
  /tool\s+call/i,
  /pipeline/i,
  /back-?office/i,
  /escalado?\s+interno/i,
  /sprint|backlog|jira|ticket/i,
];

// ─── Main Filter ─────────────────────────────────────────────────────────────

/**
 * Filtro principal de salida. Procesa el mensaje de un agente visible
 * antes de que llegue al cliente.
 *
 * Es determinista y rápido — no llama a ningún LLM.
 * Si necesita reescritura profunda, marca para revisión.
 */
export function applyOutputFilter(input: VoiceFilterInput): VoiceFilterOutput {
  const changes: string[] = [];
  let message = input.agentMessage;
  const channel = input.channel ?? "chat";
  const clientType = input.clientType ?? "particular";

  // ── 0. Gate: solo agentes visibles pasan por aquí ──
  if (!isClientFacing(input.agentSlug)) {
    return {
      filteredMessage: message,
      canSend: false,
      blockReason: `Agente ${input.agentSlug} no es visible al cliente`,
      changes: ["blocked: agente interno"],
    };
  }

  // ── 1. Check escalación PRIMERO (sobre el mensaje del cliente, no del agente) ──
  if (input.clientLastMessage) {
    const trigger = checkEscalationTriggers(input.clientLastMessage, input.escalationContext ?? {});
    if (trigger) {
      const escalationMsg = buildEscalationResponse(trigger.id, clientType);
      return {
        filteredMessage: escalationMsg,
        canSend: true, // El mensaje de escalado SÍ se envía al cliente
        changes: [`escalation: ${trigger.id}`],
        escalationTriggered: trigger.id,
        escalationMessage: `[ESCALADO A DAVID] Trigger: ${trigger.description}. Mensaje cliente: "${input.clientLastMessage?.slice(0, 100)}"`,
      };
    }
  }

  // ── 2. Check escalación por baja confianza ──
  if (input.escalationContext?.confidence !== undefined && input.escalationContext.confidence < 0.7) {
    return {
      filteredMessage: MESSAGE_TEMPLATES.internalReview.replace("{nombre}", ""),
      canSend: true,
      changes: ["escalation: low_confidence"],
      escalationTriggered: "insufficient_data",
      escalationMessage: `[ESCALADO INTERNO] Confianza baja (${input.escalationContext.confidence}). Respuesta original guardada como borrador.`,
    };
  }

  // ── 3. Reemplazos de vocabulario ──
  const beforeVocab = message;
  message = applyVocabReplacements(message);
  if (message !== beforeVocab) {
    changes.push("vocab: reemplazos aplicados");
  }

  // ── 4. Eliminar frases prohibidas ──
  const forbidden = detectForbiddenPhrases(message);
  if (forbidden.length > 0) {
    for (const phrase of forbidden) {
      // Eliminar la frase (y puntuación/espacios alrededor)
      const regex = new RegExp(`[.,;:!?\\s]*${escapeRegex(phrase)}[.,;:!?\\s]*`, "gi");
      message = message.replace(regex, " ");
    }
    message = message.replace(/\s{2,}/g, " ").trim();
    changes.push(`forbidden: eliminadas ${forbidden.length} frases (${forbidden.join(", ")})`);
  }

  // ── 5. Traducir tecnicismos ──
  const techTerms = detectTechTerms(message, input.clientLastMessage);
  if (techTerms.length > 0) {
    for (const { term, explanation } of techTerms) {
      // Reemplazar el tecnicismo por versión explicada (solo la primera vez)
      const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
      message = message.replace(regex, `${term} (${explanation})`);
    }
    changes.push(`tech: traducidos ${techTerms.length} términos`);
  }

  // ── 6. Limpiar referencias internas ──
  for (const pattern of INTERNAL_LEAK_PATTERNS) {
    if (pattern.test(message)) {
      // Intentar reemplazar con algo genérico
      message = message.replace(pattern, "el equipo");
      changes.push(`internal: limpiada referencia interna`);
    }
  }

  // ── 7. Verificar longitud por canal ──
  if (channel === "whatsapp") {
    const wordCount = message.split(/\s+/).length;
    if (wordCount > MAX_WHATSAPP_WORDS) {
      // No truncar — marcar para revisión
      changes.push(`length: WhatsApp ${wordCount} palabras (max ${MAX_WHATSAPP_WORDS}), considerar acortar`);
    }
  } else if (channel === "sms") {
    if (message.length > MAX_SMS_CHARS) {
      message = message.slice(0, MAX_SMS_CHARS - 3) + "...";
      changes.push(`length: SMS truncado a ${MAX_SMS_CHARS} chars`);
    }
  }

  // ── 8. Verificar siguiente paso ──
  const hasNextStep = HAS_NEXT_STEP_PATTERNS.some((p) => p.test(message));
  if (!hasNextStep && message.length > 50) {
    // Añadir cierre contextual
    const closing = getContextualClosing(input.flowMoment ?? "inicio");
    message = message.trimEnd();
    // Asegurar que termina con punto antes del cierre
    if (!/[.!?]$/.test(message)) message += ".";
    message += ` ${closing}`;
    changes.push(`closing: añadido cierre contextual "${closing}"`);
  }

  // ── 9. Limpieza final ──
  message = message
    .replace(/\n{3,}/g, "\n\n") // Max 2 saltos de línea seguidos
    .replace(/\s{2,}/g, " ") // Espacios dobles
    .replace(/^\s+|\s+$/gm, "") // Trim por línea
    .trim();

  return {
    filteredMessage: message,
    canSend: true,
    changes,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Genera un mensaje de escalado apropiado para el cliente según el trigger.
 */
function buildEscalationResponse(triggerId: string, clientType: ClientType): string {
  const templates: Record<string, string> = {
    client_requests_person:
      "Por supuesto. Ahora mismo se lo paso a David para que te atienda directamente. Te contacta en breve.",
    formal_complaint:
      "Entiendo tu preocupación. Esto lo va a revisar David personalmente para asegurar que queda bien resuelto. Te contacta hoy.",
    non_standard_conditions:
      "Eso lo tiene que ver David directamente. Le paso tu caso y te llama para hablarlo contigo.",
    payment_issue:
      "Esto lo va a gestionar David personalmente. Te contacta para resolverlo.",
    insufficient_data:
      "Quiero darte una respuesta bien hecha. Dame un momento que lo reviso con calma y te escribo en cuanto lo tenga claro.",
    vip_client:
      "David va a atender tu caso personalmente. Te contacta en breve.",
    economic_commitment:
      "Esto lo tiene que valorar David antes de darte una propuesta firme. Le paso tu caso y te contacta.",
  };

  let msg = templates[triggerId] || MESSAGE_TEMPLATES.escalateToOwner;

  // Ajustar formalidad para empresa
  if (clientType === "empresa") {
    msg = msg
      .replace("te atienda", "os atienda")
      .replace("Te contacta", "Os contacta")
      .replace("te llama", "os llama")
      .replace("te escribo", "os escribo")
      .replace("tu caso", "vuestro caso");
  }

  return msg;
}

/**
 * Versión simplificada del filtro para agentes internos que
 * generan contenido que luego presentará un agente visible.
 * Solo limpia referencias internas y tecnicismos.
 */
export function sanitizeInternalOutput(text: string): string {
  let result = text;
  for (const pattern of INTERNAL_LEAK_PATTERNS) {
    result = result.replace(pattern, "");
  }
  return result.replace(/\s{2,}/g, " ").trim();
}
