/**
 * SMOKE TESTS — Verificar que lo mínimo del sistema v2 funciona.
 * Categoría A del plan de tests de gobernanza.
 */
import { describe, it, expect } from "vitest";
import {
  getSwarmAgents,
  getAgentById,
  resolveAgentId,
  LEGACY_AGENT_ID_ALIASES,
  buildToolsForAgent,
  isExternalCommunicationTool,
  VISIBLE_LAYERS,
  INTERNAL_LAYERS,
} from "@/lib/agent/swarm";

// ─── A1: Carga de los 10 agentes ──────────────────────────────────────────

describe("A1 — Carga de agentes", () => {
  const agents = getSwarmAgents();
  const ALL_V2_IDS = [
    "ceo", "recepcion", "comercial-principal", "comercial-junior",
    "consultor-servicios", "consultor-digital", "legal-rgpd",
    "fiscal", "bi-scoring", "marketing-automation",
  ];

  it("debe tener exactamente 10 agentes", () => {
    expect(agents).toHaveLength(10);
  });

  it("todos los IDs v2 existen", () => {
    const ids = agents.map((a) => a.id);
    for (const expected of ALL_V2_IDS) {
      expect(ids).toContain(expected);
    }
  });

  it("no contiene IDs legacy", () => {
    const ids = agents.map((a) => a.id);
    const legacyIds = Object.keys(LEGACY_AGENT_ID_ALIASES);
    for (const legacy of legacyIds) {
      expect(ids).not.toContain(legacy);
    }
  });

  it("cada agente tiene layer definido", () => {
    for (const agent of agents) {
      expect(["gobierno", "visible", "experta-interna", "modulo-interno"]).toContain(agent.layer);
    }
  });

  it("cada agente tiene systemPrompt no vacío", () => {
    for (const agent of agents) {
      expect(agent.systemPrompt.length).toBeGreaterThan(50);
    }
  });

  it("cada agente tiene allowedTools como array no vacío", () => {
    for (const agent of agents) {
      expect(Array.isArray(agent.allowedTools)).toBe(true);
      expect(agent.allowedTools.length).toBeGreaterThan(0);
    }
  });
});

// ─── A2: Resolución de IDs ────────────────────────────────────────────────

describe("A2 — Resolución de IDs y aliases legacy", () => {
  it("IDs v2 se resuelven a sí mismos", () => {
    expect(resolveAgentId("recepcion")).toBe("recepcion");
    expect(resolveAgentId("ceo")).toBe("ceo");
    expect(resolveAgentId("comercial-principal")).toBe("comercial-principal");
    expect(resolveAgentId("comercial-junior")).toBe("comercial-junior");
    expect(resolveAgentId("fiscal")).toBe("fiscal");
    expect(resolveAgentId("bi-scoring")).toBe("bi-scoring");
    expect(resolveAgentId("marketing-automation")).toBe("marketing-automation");
  });

  it("aliases legacy se resuelven a IDs v2", () => {
    expect(resolveAgentId("recepcionista")).toBe("recepcion");
    expect(resolveAgentId("director-comercial")).toBe("comercial-principal");
    expect(resolveAgentId("fiscal-controller")).toBe("fiscal");
    expect(resolveAgentId("analista-bi")).toBe("bi-scoring");
    expect(resolveAgentId("marketing-director")).toBe("marketing-automation");
  });

  it("ID desconocido se devuelve sin cambios", () => {
    expect(resolveAgentId("agente-fantasma")).toBe("agente-fantasma");
  });

  it("getAgentById resuelve agentes existentes", () => {
    for (const agent of getSwarmAgents()) {
      expect(getAgentById(agent.id)).toBeDefined();
      expect(getAgentById(agent.id)!.id).toBe(agent.id);
    }
  });
});

// ─── A3: Build de toolsets ────────────────────────────────────────────────

describe("A3 — Build de toolsets por agente", () => {
  const agents = getSwarmAgents();

  it("buildToolsForAgent devuelve array para cada agente", () => {
    for (const agent of agents) {
      const tools = buildToolsForAgent(agent);
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    }
  });

  it("agentes internos NO reciben herramientas de comunicación externa en su toolset", () => {
    const commTools = ["send_whatsapp", "send_sms", "send_telegram", "send_email_transactional", "make_phone_call", "draft_and_send", "speak_with_voice"];
    const internalAgents = agents.filter((a) => INTERNAL_LAYERS.has(a.id));

    for (const agent of internalAgents) {
      const tools = buildToolsForAgent(agent);
      const toolNames = tools.map((t: any) => t.function?.name).filter(Boolean);
      for (const commTool of commTools) {
        expect(toolNames).not.toContain(commTool);
      }
    }
  });

  it("agentes visibles SÍ pueden tener herramientas de comunicación", () => {
    const recepcion = getAgentById("recepcion")!;
    const tools = buildToolsForAgent(recepcion);
    const toolNames = tools.map((t: any) => t.function?.name).filter(Boolean);
    // Recepción debe tener al menos alguna herramienta de comunicación
    const hasComm = toolNames.some((n: string) =>
      ["send_whatsapp", "send_sms", "send_telegram", "send_email_transactional", "draft_and_send", "speak_with_voice"].includes(n)
    );
    expect(hasComm).toBe(true);
  });
});

// ─── A4: Clasificación de herramientas de comunicación ────────────────────

describe("A4 — isExternalCommunicationTool", () => {
  it("detecta todas las herramientas de comunicación", () => {
    expect(isExternalCommunicationTool("send_whatsapp")).toBe(true);
    expect(isExternalCommunicationTool("send_sms")).toBe(true);
    expect(isExternalCommunicationTool("send_telegram")).toBe(true);
    expect(isExternalCommunicationTool("send_email_transactional")).toBe(true);
    expect(isExternalCommunicationTool("make_phone_call")).toBe(true);
    expect(isExternalCommunicationTool("draft_and_send")).toBe(true);
    expect(isExternalCommunicationTool("speak_with_voice")).toBe(true);
  });

  it("NO clasifica herramientas internas como comunicación", () => {
    expect(isExternalCommunicationTool("web_search")).toBe(false);
    expect(isExternalCommunicationTool("memory_search")).toBe(false);
    expect(isExternalCommunicationTool("create_draft")).toBe(false);
    expect(isExternalCommunicationTool("search_emails")).toBe(false);
    expect(isExternalCommunicationTool("create_task")).toBe(false);
  });
});

// ─── A5: Layers coherentes ────────────────────────────────────────────────

describe("A5 — Coherencia de capas", () => {
  it("VISIBLE_LAYERS contiene exactamente los agentes visibles", () => {
    expect(VISIBLE_LAYERS.has("recepcion")).toBe(true);
    expect(VISIBLE_LAYERS.has("comercial-principal")).toBe(true);
    expect(VISIBLE_LAYERS.has("comercial-junior")).toBe(true);
    expect(VISIBLE_LAYERS.has("ceo")).toBe(true);
    expect(VISIBLE_LAYERS.size).toBe(4);
  });

  it("INTERNAL_LAYERS contiene exactamente los agentes internos", () => {
    expect(INTERNAL_LAYERS.has("consultor-servicios")).toBe(true);
    expect(INTERNAL_LAYERS.has("consultor-digital")).toBe(true);
    expect(INTERNAL_LAYERS.has("legal-rgpd")).toBe(true);
    expect(INTERNAL_LAYERS.has("fiscal")).toBe(true);
    expect(INTERNAL_LAYERS.has("bi-scoring")).toBe(true);
    expect(INTERNAL_LAYERS.has("marketing-automation")).toBe(true);
    expect(INTERNAL_LAYERS.size).toBe(6);
  });

  it("ningún agente está en ambas capas", () => {
    for (const id of VISIBLE_LAYERS) {
      expect(INTERNAL_LAYERS.has(id)).toBe(false);
    }
    for (const id of INTERNAL_LAYERS) {
      expect(VISIBLE_LAYERS.has(id)).toBe(false);
    }
  });

  it("cada agente definido pertenece a exactamente una capa", () => {
    for (const agent of getSwarmAgents()) {
      const inVisible = VISIBLE_LAYERS.has(agent.id);
      const inInternal = INTERNAL_LAYERS.has(agent.id);
      expect(inVisible || inInternal).toBe(true);
      expect(inVisible && inInternal).toBe(false);
    }
  });
});
