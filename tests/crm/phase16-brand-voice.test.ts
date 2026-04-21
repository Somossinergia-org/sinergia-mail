/**
 * Phase 16 — Brand Voice Integration Tests
 *
 * Validates that the brand-voice system is correctly connected to the agent swarm:
 * 1. Voice injection in visible agents
 * 2. Internal agents blocked from direct client output
 * 3. Output filter: forbidden phrases, vocab replacements, tech terms
 * 4. Escalation triggers
 * 5. Client type adaptation
 * 6. Contextual closings
 * 7. No regression on swarm types
 * 8. Build integrity
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── Direct imports from brand-voice.ts ──
import {
  AGENT_VISIBILITY,
  VOCAB_REPLACEMENTS,
  FORBIDDEN_PHRASES,
  TECH_TERMS_NEEDING_CONTEXT,
  CLIENT_PROFILES,
  CONTEXTUAL_CLOSINGS,
  FOLLOW_UP_TEMPLATES,
  MESSAGE_TEMPLATES,
  ESCALATION_TRIGGERS,
  OUTPUT_FILTER_PROMPT,
  buildVoiceInjection,
  applyVocabReplacements,
  detectForbiddenPhrases,
  detectTechTerms,
  getFollowUpTemplate,
  getContextualClosing,
  canSendToClient,
  isClientFacing,
  checkEscalationTriggers,
} from "@/lib/agent/brand-voice";

// ── Direct imports from voice-filter.ts ──
import {
  applyOutputFilter,
  sanitizeInternalOutput,
} from "@/lib/agent/voice-filter";

const SWARM_PATH = path.resolve("src/lib/agent/swarm.ts");
const BRAND_VOICE_PATH = path.resolve("src/lib/agent/brand-voice.ts");
const VOICE_FILTER_PATH = path.resolve("src/lib/agent/voice-filter.ts");

// ═══════════════════════════════════════════════════════════════════════════
// A. AGENT VISIBILITY — quién puede hablar al cliente y quién no
// ═══════════════════════════════════════════════════════════════════════════

describe("A. Agent Visibility", () => {
  it("defines visibility for all 10 agents", () => {
    const slugs = Object.keys(AGENT_VISIBILITY);
    expect(slugs).toHaveLength(10);
    expect(slugs).toContain("recepcion");
    expect(slugs).toContain("comercial-junior");
    expect(slugs).toContain("comercial-principal");
    expect(slugs).toContain("consultor-servicios");
    expect(slugs).toContain("consultor-digital");
    expect(slugs).toContain("legal");
    expect(slugs).toContain("finanzas");
    expect(slugs).toContain("bi-scoring");
    expect(slugs).toContain("marketing");
    expect(slugs).toContain("ceo");
  });

  it("only 3 agents are client-facing", () => {
    const clientFacing = Object.entries(AGENT_VISIBILITY)
      .filter(([, v]) => v.clientFacing)
      .map(([k]) => k);
    expect(clientFacing).toHaveLength(3);
    expect(clientFacing).toContain("recepcion");
    expect(clientFacing).toContain("comercial-junior");
    expect(clientFacing).toContain("comercial-principal");
  });

  it("internal agents cannot send directly to client", () => {
    const internalAgents = ["consultor-servicios", "consultor-digital", "legal", "finanzas", "bi-scoring", "marketing"];
    for (const slug of internalAgents) {
      expect(canSendToClient(slug as any)).toBe(false);
      expect(isClientFacing(slug as any)).toBe(false);
    }
  });

  it("CEO can send but is not client-facing by default", () => {
    expect(AGENT_VISIBILITY["ceo"].clientFacing).toBe(false);
    expect(AGENT_VISIBILITY["ceo"].canSendToClient).toBe(true);
  });

  it("all visible agents present as David / Somos Sinergia", () => {
    const visible = ["recepcion", "comercial-junior", "comercial-principal"];
    for (const slug of visible) {
      expect(AGENT_VISIBILITY[slug as keyof typeof AGENT_VISIBILITY].presentAs).toContain("David");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. VOICE INJECTION — buildVoiceInjection genera bloques correctos
// ═══════════════════════════════════════════════════════════════════════════

describe("B. Voice Injection", () => {
  it("generates voice block for particular via WhatsApp", () => {
    const voice = buildVoiceInjection("particular", "whatsapp", "Juan");
    expect(voice).toContain("VOZ SINERGIA");
    expect(voice).toContain("David Miquel Jordá");
    expect(voice).toContain("TIPO DE CLIENTE: particular");
    expect(voice).toContain("Tutea");
    expect(voice).toContain("CANAL WHATSAPP");
    expect(voice).toContain("max 150 palabras");
    expect(voice).toContain("Juan");
  });

  it("generates voice block for empresa via email", () => {
    const voice = buildVoiceInjection("empresa", "email");
    expect(voice).toContain("TIPO DE CLIENTE: empresa");
    expect(voice).toContain("Sigue lo que haga el cliente");
    expect(voice).toContain("CANAL EMAIL");
  });

  it("generates voice block for autonomo", () => {
    const voice = buildVoiceInjection("autonomo", "chat");
    expect(voice).toContain("TIPO DE CLIENTE: autonomo");
    expect(voice).toContain("Tutea");
  });

  it("includes absolute rules in every voice block", () => {
    const voice = buildVoiceInjection("particular", "chat");
    expect(voice).toContain("REGLAS ABSOLUTAS");
    expect(voice).toContain("Nunca uses frases corporativas");
    expect(voice).toContain("Nunca menciones agentes internos");
    expect(voice).toContain("Nunca prometas cifras exactas");
    expect(voice).toContain("lo reviso y te confirmo");
  });

  it("includes contextual closing when flowMoment provided", () => {
    const voice = buildVoiceInjection("particular", "chat", undefined, "cierre");
    expect(voice).toContain("CIERRE SUGERIDO");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. OUTPUT FILTER — reemplazos, frases, tecnicismos
// ═══════════════════════════════════════════════════════════════════════════

describe("C. Output Filter — Vocabulary", () => {
  it("replaces forbidden vocabulary", () => {
    const text = "Vamos a proceder con la migración de la tarifa del contrato.";
    const result = applyVocabReplacements(text);
    expect(result).not.toContain("migración");
    expect(result).toContain("cambio");
    expect(result).not.toContain("tarifa");
    expect(result).toContain("condiciones");
    expect(result).not.toContain("contrato");
    expect(result).toContain("acuerdo");
  });

  it("replaces proceder and gestionar", () => {
    const text = "Vamos a gestionar tu solicitud y proceder al cambio.";
    const result = applyVocabReplacements(text);
    expect(result).toContain("tramitar");
    expect(result).toContain("avanzar");
  });
});

describe("C. Output Filter — Forbidden Phrases", () => {
  it("detects forbidden phrases", () => {
    const text = "Estimado cliente, nos complace informarle de que quedamos a su disposición.";
    const found = detectForbiddenPhrases(text);
    expect(found.length).toBeGreaterThanOrEqual(2);
    expect(found.some(f => f.toLowerCase().includes("estimado"))).toBe(true);
  });

  it("has at least 20 forbidden phrases defined", () => {
    expect(FORBIDDEN_PHRASES.length).toBeGreaterThanOrEqual(20);
  });
});

describe("C. Output Filter — Tech Terms", () => {
  it("detects CUPS when client didn't use it", () => {
    const found = detectTechTerms("Tu CUPS es ES0021...", "quiero cambiar de luz");
    expect(found.length).toBe(1);
    expect(found[0].term).toBe("CUPS");
    expect(found[0].explanation).toContain("punto de suministro");
  });

  it("does NOT flag CUPS when client already used it", () => {
    const found = detectTechTerms("Tu CUPS es ES0021...", "dame mi CUPS por favor");
    expect(found).toHaveLength(0);
  });

  it("detects multiple tech terms", () => {
    const found = detectTechTerms("Tu CUPS y CIF están en la factura con los peajes", "hola");
    expect(found.length).toBeGreaterThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D. OUTPUT FILTER — full pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe("D. Output Filter — Full Pipeline", () => {
  it("blocks output from internal agents", () => {
    const result = applyOutputFilter({
      agentMessage: "Análisis completado.",
      agentSlug: "consultor-servicios",
    });
    expect(result.canSend).toBe(false);
    expect(result.blockReason).toContain("no es visible");
  });

  it("allows output from visible agents", () => {
    const result = applyOutputFilter({
      agentMessage: "Hola Juan, te cuento lo que hay. Cualquier duda me dices.",
      agentSlug: "recepcion",
    });
    expect(result.canSend).toBe(true);
  });

  it("replaces vocabulary in output", () => {
    const result = applyOutputFilter({
      agentMessage: "Vamos a proceder con la migración.",
      agentSlug: "comercial-junior",
    });
    expect(result.filteredMessage).not.toContain("migración");
    expect(result.filteredMessage).toContain("cambio");
    expect(result.changes.some(c => c.includes("vocab"))).toBe(true);
  });

  it("removes forbidden phrases from output", () => {
    const result = applyOutputFilter({
      agentMessage: "Estimado cliente, quedamos a su disposición para lo que necesite.",
      agentSlug: "comercial-principal",
    });
    expect(result.filteredMessage).not.toContain("Estimado cliente");
    expect(result.filteredMessage).not.toContain("disposición");
    expect(result.changes.some(c => c.includes("forbidden"))).toBe(true);
  });

  it("translates tech terms when client hasn't used them", () => {
    const result = applyOutputFilter({
      agentMessage: "Necesito que me des tu CUPS para avanzar.",
      agentSlug: "recepcion",
      clientLastMessage: "Quiero cambiar de luz",
    });
    expect(result.filteredMessage).toContain("punto de suministro");
    expect(result.changes.some(c => c.includes("tech"))).toBe(true);
  });

  it("adds contextual closing when message lacks next step", () => {
    const result = applyOutputFilter({
      agentMessage: "He revisado tu factura y hay un ahorro de entre 15 y 20 euros al mes.",
      agentSlug: "comercial-junior",
      flowMoment: "inicio",
    });
    // Should have added a closing since the original lacked a next step
    const hasClosing = result.filteredMessage.includes("duda") ||
      result.filteredMessage.includes("dices") ||
      result.filteredMessage.includes("pregunta") ||
      result.filteredMessage.includes("estoy");
    expect(hasClosing).toBe(true);
  });

  it("cleans internal references from output", () => {
    const result = applyOutputFilter({
      agentMessage: "El agente consultor servicios ha analizado tu factura. El sistema de agentes confirma ahorro. Me dices.",
      agentSlug: "comercial-principal",
    });
    expect(result.filteredMessage).not.toMatch(/agente\s+consultor/i);
    expect(result.filteredMessage).not.toMatch(/sistema\s+de\s+agentes/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E. ESCALATION TRIGGERS
// ═══════════════════════════════════════════════════════════════════════════

describe("E. Escalation Triggers", () => {
  it("defines at least 7 triggers", () => {
    expect(ESCALATION_TRIGGERS.length).toBeGreaterThanOrEqual(7);
  });

  it("triggers on 'quiero hablar con David'", () => {
    const trigger = checkEscalationTriggers("quiero hablar con david", {});
    expect(trigger).not.toBeNull();
    expect(trigger!.id).toBe("client_requests_person");
  });

  it("triggers on formal complaint keywords", () => {
    const trigger = checkEscalationTriggers("voy a poner una reclamación", {});
    expect(trigger).not.toBeNull();
    expect(trigger!.id).toBe("formal_complaint");
  });

  it("triggers on VIP client", () => {
    const trigger = checkEscalationTriggers("hola buenas", { isVip: true });
    expect(trigger).not.toBeNull();
    expect(trigger!.id).toBe("vip_client");
  });

  it("triggers on high economic commitment", () => {
    const trigger = checkEscalationTriggers("quiero una propuesta", { amount: 10000 });
    expect(trigger).not.toBeNull();
    expect(trigger!.id).toBe("economic_commitment");
  });

  it("triggers on low confidence", () => {
    const trigger = checkEscalationTriggers("hola", { confidence: 0.3 });
    expect(trigger).not.toBeNull();
    expect(trigger!.id).toBe("insufficient_data");
  });

  it("does NOT trigger on normal messages", () => {
    const trigger = checkEscalationTriggers("Hola, quiero cambiar de compañía de luz", {});
    expect(trigger).toBeNull();
  });

  it("output filter generates escalation message when trigger fires", () => {
    const result = applyOutputFilter({
      agentMessage: "Te cuento lo que hay...",
      agentSlug: "recepcion",
      clientLastMessage: "quiero hablar con una persona real",
    });
    expect(result.canSend).toBe(true); // Escalation message IS sent to client
    expect(result.escalationTriggered).toBe("client_requests_person");
    expect(result.filteredMessage).toContain("David");
    expect(result.escalationMessage).toContain("ESCALADO");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F. CLIENT TYPE ADAPTATION
// ═══════════════════════════════════════════════════════════════════════════

describe("F. Client Type Adaptation", () => {
  it("defines profiles for particular, autonomo, empresa", () => {
    expect(CLIENT_PROFILES.particular).toBeDefined();
    expect(CLIENT_PROFILES.autonomo).toBeDefined();
    expect(CLIENT_PROFILES.empresa).toBeDefined();
  });

  it("particular uses tu, minimo detail, corto messages", () => {
    const p = CLIENT_PROFILES.particular;
    expect(p.formality).toBe("tu");
    expect(p.detailLevel).toBe("minimo");
    expect(p.messageLength).toBe("corto");
  });

  it("empresa uses detectar formality, alto detail", () => {
    const p = CLIENT_PROFILES.empresa;
    expect(p.formality).toBe("detectar");
    expect(p.detailLevel).toBe("alto");
  });

  it("escalation adapts language for empresa", () => {
    const result = applyOutputFilter({
      agentMessage: "Te cuento...",
      agentSlug: "comercial-principal",
      clientType: "empresa",
      clientLastMessage: "necesito hablar con alguien responsable",
    });
    // Empresa escalation should use plural forms
    expect(result.escalationTriggered).toBeDefined();
    const msg = result.filteredMessage;
    expect(msg.includes("os") || msg.includes("vuestro")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G. CONTEXTUAL CLOSINGS & FOLLOW-UPS
// ═══════════════════════════════════════════════════════════════════════════

describe("G. Contextual Closings & Follow-ups", () => {
  it("defines closings for all 4 flow moments", () => {
    expect(CONTEXTUAL_CLOSINGS.inicio).toBeDefined();
    expect(CONTEXTUAL_CLOSINGS.proceso).toBeDefined();
    expect(CONTEXTUAL_CLOSINGS.cierre).toBeDefined();
    expect(CONTEXTUAL_CLOSINGS.postventa).toBeDefined();
    for (const [, closings] of Object.entries(CONTEXTUAL_CLOSINGS)) {
      expect(closings.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("getContextualClosing returns valid closing", () => {
    const closing = getContextualClosing("proceso");
    expect(typeof closing).toBe("string");
    expect(closing.length).toBeGreaterThan(5);
  });

  it("defines follow-up templates for 4 time ranges", () => {
    expect(FOLLOW_UP_TEMPLATES).toHaveLength(4);
  });

  it("getFollowUpTemplate returns correct template by days", () => {
    const t2 = getFollowUpTemplate(2);
    expect(t2).toContain("Sin prisa");

    const t7 = getFollowUpTemplate(7);
    expect(t7).toContain("Va todo bien");

    const t12 = getFollowUpTemplate(12);
    expect(t12).toContain("retomemos");

    const t25 = getFollowUpTemplate(25);
    expect(t25).toContain("hace tiempo");
  });

  it("returns null for day 0 (too soon)", () => {
    expect(getFollowUpTemplate(0)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// H. MESSAGE TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

describe("H. Message Templates", () => {
  it("defines all 10 required templates", () => {
    expect(MESSAGE_TEMPLATES.firstResponse).toBeDefined();
    expect(MESSAGE_TEMPLATES.firstResponse.whatsapp).toBeDefined();
    expect(MESSAGE_TEMPLATES.firstResponse.email).toBeDefined();
    expect(MESSAGE_TEMPLATES.clientDoubt).toBeDefined();
    expect(MESSAGE_TEMPLATES.requestDocs).toBeDefined();
    expect(MESSAGE_TEMPLATES.followUpSignature).toBeDefined();
    expect(MESSAGE_TEMPLATES.followUpDoc).toBeDefined();
    expect(MESSAGE_TEMPLATES.willReview).toBeDefined();
    expect(MESSAGE_TEMPLATES.proposeCall).toBeDefined();
    expect(MESSAGE_TEMPLATES.closedCase).toBeDefined();
    expect(MESSAGE_TEMPLATES.internalReview).toBeDefined();
    expect(MESSAGE_TEMPLATES.escalateToOwner).toBeDefined();
  });

  it("templates contain placeholders for personalization", () => {
    expect(MESSAGE_TEMPLATES.firstResponse.whatsapp).toContain("{nombre}");
    expect(MESSAGE_TEMPLATES.requestDocs).toContain("{doc_1}");
    expect(MESSAGE_TEMPLATES.proposeCall).toContain("{cuando}");
  });

  it("escalateToOwner mentions David", () => {
    expect(MESSAGE_TEMPLATES.escalateToOwner).toContain("David");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// I. SWARM INTEGRATION — voice connected to real swarm
// ═══════════════════════════════════════════════════════════════════════════

describe("I. Swarm Integration", () => {
  const swarmContent = fs.readFileSync(SWARM_PATH, "utf-8");

  it("swarm.ts imports brand-voice", () => {
    expect(swarmContent).toContain('from "./brand-voice"');
  });

  it("swarm.ts imports voice-filter", () => {
    expect(swarmContent).toContain('from "./voice-filter"');
  });

  it("swarm.ts calls buildVoiceInjection via buildConfigContext", () => {
    expect(swarmContent).toContain("buildVoiceInjection");
    expect(swarmContent).toContain("isClientFacing(agentSlug");
  });

  it("swarm.ts applies applyOutputFilter on result", () => {
    expect(swarmContent).toContain("applyOutputFilter");
    expect(swarmContent).toContain("voiceFiltered");
    expect(swarmContent).toContain("voiceChanges");
  });

  it("SwarmInput accepts channel, clientType, flowMoment, contactName", () => {
    expect(swarmContent).toContain("channel?: Channel");
    expect(swarmContent).toContain("clientType?: ClientType");
    expect(swarmContent).toContain("flowMoment?: FlowMoment");
    expect(swarmContent).toContain("contactName?: string");
  });

  it("SwarmResult includes voice filter fields", () => {
    expect(swarmContent).toContain("voiceFiltered?: boolean");
    expect(swarmContent).toContain("voiceChanges?: string[]");
    expect(swarmContent).toContain("escalationTriggered?: string");
    expect(swarmContent).toContain("escalationMessage?: string");
  });

  it("configContext is built AFTER routing (needs agent ID)", () => {
    const routingLine = swarmContent.indexOf("const agentId = agentOverride || routeToAgent");
    const configLine = swarmContent.indexOf("const configContext = agentConfig");
    expect(configLine).toBeGreaterThan(routingLine);
  });

  it("voice filter runs BEFORE logSwarmExecution", () => {
    const filterLine = swarmContent.indexOf("applyOutputFilter(filterInput)");
    const logLine = swarmContent.indexOf("await logSwarmExecution(userId, result)");
    expect(filterLine).toBeGreaterThan(0);
    expect(logLine).toBeGreaterThan(filterLine);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// J. INTERNAL AGENT SANITIZATION
// ═══════════════════════════════════════════════════════════════════════════

describe("J. Internal Agent Sanitization", () => {
  it("sanitizeInternalOutput removes internal references", () => {
    const text = "El agente consultor servicios detectó anomalía en el pipeline de routing.";
    const result = sanitizeInternalOutput(text);
    expect(result).not.toMatch(/agente\s+consultor/i);
    expect(result).not.toMatch(/pipeline/i);
    expect(result).not.toMatch(/routing/i);
  });

  it("sanitizeInternalOutput leaves clean text alone", () => {
    const text = "El ahorro estimado es de 20€ al mes.";
    const result = sanitizeInternalOutput(text);
    expect(result).toBe(text);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// K. NO REGRESSION — files exist and build OK
// ═══════════════════════════════════════════════════════════════════════════

describe("K. File Integrity & No Regression", () => {
  it("brand-voice.ts exists", () => {
    expect(fs.existsSync(BRAND_VOICE_PATH)).toBe(true);
  });

  it("voice-filter.ts exists", () => {
    expect(fs.existsSync(VOICE_FILTER_PATH)).toBe(true);
  });

  it("swarm.ts exists and is not empty", () => {
    expect(fs.existsSync(SWARM_PATH)).toBe(true);
    expect(fs.statSync(SWARM_PATH).size).toBeGreaterThan(50000); // Should be ~120KB
  });

  it("OUTPUT_FILTER_PROMPT is defined and substantial", () => {
    expect(typeof OUTPUT_FILTER_PROMPT).toBe("string");
    expect(OUTPUT_FILTER_PROMPT.length).toBeGreaterThan(500);
    expect(OUTPUT_FILTER_PROMPT).toContain("David Miquel Jordá");
    expect(OUTPUT_FILTER_PROMPT).toContain("NO ENVIAR");
  });

  it("all brand-voice exports are functions or constants", () => {
    expect(typeof buildVoiceInjection).toBe("function");
    expect(typeof applyVocabReplacements).toBe("function");
    expect(typeof detectForbiddenPhrases).toBe("function");
    expect(typeof detectTechTerms).toBe("function");
    expect(typeof getFollowUpTemplate).toBe("function");
    expect(typeof getContextualClosing).toBe("function");
    expect(typeof canSendToClient).toBe("function");
    expect(typeof isClientFacing).toBe("function");
    expect(typeof checkEscalationTriggers).toBe("function");
    expect(typeof applyOutputFilter).toBe("function");
    expect(typeof sanitizeInternalOutput).toBe("function");
  });
});
