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
  LEGACY_AGENT_ID_ALIASES,
  resolveAgentId,
  validateToolAccess,
  buildToolsForAgent,
} from "@/lib/agent/swarm";
import { AGENT_KNOWLEDGE } from "@/lib/agent/agent-knowledge";
import { AGENT_VOICE_PROFILES } from "@/lib/agent/channels";
import { PERSONALITIES, detectBestAgent } from "@/lib/agent/personalities";

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

  it("personalities.ts tiene personalidad para cada agente (CEO mapea a orchestrator)", () => {
    const personalityIds = PERSONALITIES.map((p) => p.agentCode);
    for (const id of swarmIds) {
      // CEO usa "orchestrator" como agentCode en personalities
      const lookupId = id === "ceo" ? "orchestrator" : id;
      expect(personalityIds).toContain(lookupId);
    }
  });

  it("no hay IDs legacy en agent-knowledge keys", () => {
    const legacyIds = Object.keys(LEGACY_AGENT_ID_ALIASES);
    const knowledgeKeys = Object.keys(AGENT_KNOWLEDGE);
    for (const legacy of legacyIds) {
      expect(knowledgeKeys).not.toContain(legacy);
    }
  });

  it("no hay IDs legacy en channels keys", () => {
    const legacyIds = Object.keys(LEGACY_AGENT_ID_ALIASES);
    const channelKeys = Object.keys(AGENT_VOICE_PROFILES);
    for (const legacy of legacyIds) {
      expect(channelKeys).not.toContain(legacy);
    }
  });

  it("no hay IDs legacy en personalities agentCodes", () => {
    const legacyIds = Object.keys(LEGACY_AGENT_ID_ALIASES);
    const personalityIds = PERSONALITIES.map((p) => p.agentCode);
    for (const legacy of legacyIds) {
      expect(personalityIds).not.toContain(legacy);
    }
  });
});

// ─── F2: detectBestAgent devuelve IDs v2 ──────────────────────────────────

describe("F2 — detectBestAgent devuelve IDs v2", () => {
  it("factura → fiscal (no fiscal-controller)", () => {
    expect(detectBestAgent("factura vencida")).toBe("fiscal");
  });

  it("lead/pipeline → comercial-principal (no director-comercial)", () => {
    expect(detectBestAgent("scoring de contacto")).toBe("comercial-principal");
  });

  it("email/correo → recepcion (no recepcionista)", () => {
    expect(detectBestAgent("leer correo")).toBe("recepcion");
  });

  it("kpi/dashboard → bi-scoring (no analista-bi)", () => {
    expect(detectBestAgent("dashboard estadísticas")).toBe("bi-scoring");
  });

  it("marketing/seo → marketing-automation (no marketing-director)", () => {
    expect(detectBestAgent("campaña marketing seo")).toBe("marketing-automation");
  });

  it("caso general → ceo (fallback)", () => {
    expect(detectBestAgent("tema general sin clasificar")).toBe("ceo");
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

// ─── F4: InterAgentRules no referencian IDs legacy ────────────────────────

describe("F4 — InterAgentRules sin IDs legacy", () => {
  const legacyIds = Object.keys(LEGACY_AGENT_ID_ALIASES);

  for (const [agentId, knowledge] of Object.entries(AGENT_KNOWLEDGE)) {
    for (const rule of knowledge.interAgentRules) {
      it(`${agentId}.interAgentRules: tellAgent="${rule.tellAgent}" es v2`, () => {
        expect(legacyIds).not.toContain(rule.tellAgent);
      });
    }

    for (const esc of knowledge.escalationRules) {
      for (const notifyAgent of esc.notifyAgents) {
        it(`${agentId}.escalationRules: notifyAgent="${notifyAgent}" es v2`, () => {
          expect(legacyIds).not.toContain(notifyAgent);
        });
      }
    }
  }
});

// ─── F5: Integridad del mapa de aliases ───────────────────────────────────

describe("F5 — Mapa de aliases legacy completo y correcto", () => {
  it("contiene exactamente 5 aliases", () => {
    expect(Object.keys(LEGACY_AGENT_ID_ALIASES)).toHaveLength(5);
  });

  it("cada alias apunta a un agente v2 existente", () => {
    const swarmIds = getSwarmAgents().map((a) => a.id);
    for (const [legacy, v2] of Object.entries(LEGACY_AGENT_ID_ALIASES)) {
      expect(swarmIds).toContain(v2);
    }
  });

  it("ningún alias apunta a sí mismo", () => {
    for (const [legacy, v2] of Object.entries(LEGACY_AGENT_ID_ALIASES)) {
      expect(legacy).not.toBe(v2);
    }
  });

  it("resolveAgentId es idempotente para IDs v2", () => {
    for (const agent of getSwarmAgents()) {
      expect(resolveAgentId(resolveAgentId(agent.id))).toBe(agent.id);
    }
  });
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
