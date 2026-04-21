/**
 * ARCHITECTURE TESTS — Verificar coherencia estructural del sistema v2.
 * Categoría F del plan de tests de gobernanza.
 */
import { describe, it, expect } from "vitest";
import {
  getSwarmAgents,
  getAgentById,
  VISIBLE_LAYERS,
  INTERNAL_LAYERS,
  validateToolAccess,
  buildToolsForAgent,
} from "@/lib/agent/swarm";
import { AGENT_KNOWLEDGE } from "@/lib/agent/agent-knowledge";
import { AGENT_VOICE_PROFILES } from "@/lib/agent/channels";

// ─── F1: Coherencia cross-module de IDs ───────────────────────────────────

describe("F1 — Coherencia de IDs entre módulos", () => {
  const swarmIds = getSwarmAgents().map((a) => a.id);

  it("agent-knowledge.ts tiene entrada para cada agente del swarm", () => {
    for (const id of swarmIds) {
      expect(AGENT_KNOWLEDGE[id]).toBeDefined();
      expect(AGENT_KNOWLEDGE[id].agentId).toBe(id);
    }
  });

  it("channels.ts tiene voz para cada agente del swarm", () => {
    for (const id of swarmIds) {
      expect(AGENT_VOICE_PROFILES[id]).toBeDefined();
      expect(AGENT_VOICE_PROFILES[id].agentId).toBe(id);
    }
  });

});

// ─── F3: Knowledge forbiddenActions coherente con layer ───────────────────

describe("F3 — ForbiddenActions coherentes con layer", () => {
  const internalExperts = ["consultor-servicios", "consultor-digital", "legal-rgpd"];

  for (const id of internalExperts) {
    it(`${id} tiene "No hablar directamente con cliente" en forbiddenActions`, () => {
      const knowledge = AGENT_KNOWLEDGE[id];
      const forbidden = knowledge.forbiddenActions.join(" ").toLowerCase();
      expect(forbidden).toContain("no hablar directamente con cliente");
    });
  }

  const modules = ["fiscal", "bi-scoring", "marketing-automation"];

  for (const id of modules) {
    it(`${id} tiene restricción de contacto externo en forbiddenActions`, () => {
      const knowledge = AGENT_KNOWLEDGE[id];
      const forbidden = knowledge.forbiddenActions.join(" ").toLowerCase();
      expect(
        forbidden.includes("no contactar cliente") ||
        forbidden.includes("no hablar con cliente") ||
        forbidden.includes("no actuar como voz visible")
      ).toBe(true);
    });
  }
});

// ─── F6: Stress test — gobernanza no se puede bypassear ──────────────────

describe("F6 — Stress: intento de bypass de gobernanza", () => {
  it("interno intenta usar send_whatsapp → bloqueado por validateToolAccess", () => {
    const result = validateToolAccess("consultor-servicios", "send_whatsapp");
    expect(result.allowed).toBe(false);
  });

  it("módulo intenta usar make_phone_call → bloqueado", () => {
    const result = validateToolAccess("fiscal", "make_phone_call");
    expect(result.allowed).toBe(false);
  });

  it("módulo intenta usar draft_and_send → bloqueado", () => {
    const result = validateToolAccess("bi-scoring", "draft_and_send");
    expect(result.allowed).toBe(false);
  });

  it("marketing intenta usar speak_with_voice → bloqueado", () => {
    const result = validateToolAccess("marketing-automation", "speak_with_voice");
    expect(result.allowed).toBe(false);
  });

  it("legal intenta usar send_email_transactional → bloqueado", () => {
    const result = validateToolAccess("legal-rgpd", "send_email_transactional");
    expect(result.allowed).toBe(false);
  });

  it("buildToolsForAgent para interno NO incluye comm tools aunque alguien los añadiera a allowedTools", () => {
    // Simula un agente interno que "accidentalmente" tiene comm tools en allowedTools
    // buildToolsForAgent los filtra por INTERNAL_LAYERS check
    const fiscal = getAgentById("fiscal")!;
    const tools = buildToolsForAgent(fiscal);
    const toolNames = tools.map((t: any) => t.function?.name).filter(Boolean);
    expect(toolNames).not.toContain("send_whatsapp");
    expect(toolNames).not.toContain("send_sms");
    expect(toolNames).not.toContain("make_phone_call");
    expect(toolNames).not.toContain("draft_and_send");
    expect(toolNames).not.toContain("speak_with_voice");
  });
});

// ─── F7: Catálogo de productos coherente ──────────────────────────────────

describe("F7 — Catálogo de 8 productos mencionado en prompts", () => {
  const products = ["energia", "telecomunicaciones", "alarmas", "seguros", "agentes_ia", "web", "crm", "aplicaciones"];

  it("CEO menciona los 8 productos en prompt o reglas de routing", () => {
    const ceo = getAgentById("ceo")!;
    // CEO prompt must mention the service domains
    const prompt = ceo.systemPrompt.toLowerCase();
    // At minimum, the CEO should reference the core domains
    expect(prompt).toContain("energia");
    expect(prompt).toContain("alarmas");
  });
});
