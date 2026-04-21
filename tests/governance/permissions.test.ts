/**
 * PERMISSIONS TESTS — Verificar que cada agente tiene exactamente los tools permitidos.
 * Categoría D del plan de tests de gobernanza.
 */
import { describe, it, expect } from "vitest";
import {
  getAgentById,
  getSwarmAgents,
  validateToolAccess,
  canCommunicateExternally,
  INTERNAL_LAYERS,
  VISIBLE_LAYERS,
} from "@/lib/agent/swarm";

// ─── Herramientas de comunicación externa ─────────────────────────────────
const EXTERNAL_COMM_TOOLS = [
  "send_whatsapp", "send_sms", "send_telegram",
  "send_email_transactional", "make_phone_call",
  "draft_and_send", "speak_with_voice",
];

// ─── D1: Agentes internos no pueden comunicar externamente ────────────────

describe("D1 — Agentes internos bloqueados de comunicación externa", () => {
  const internalIds = [
    "consultor-servicios", "consultor-digital", "legal-rgpd",
    "fiscal", "bi-scoring", "marketing-automation",
  ];

  for (const agentId of internalIds) {
    describe(`${agentId}`, () => {
      it("canCommunicateExternally → false", () => {
        expect(canCommunicateExternally(agentId)).toBe(false);
      });

      for (const tool of EXTERNAL_COMM_TOOLS) {
        it(`validateToolAccess("${tool}") → bloqueado`, () => {
          const result = validateToolAccess(agentId, tool);
          expect(result.allowed).toBe(false);
          expect(result.reason).toContain("GOBERNANZA");
        });
      }

      it("allowedTools no contiene herramientas de comunicación", () => {
        const agent = getAgentById(agentId)!;
        for (const tool of EXTERNAL_COMM_TOOLS) {
          expect(agent.allowedTools).not.toContain(tool);
        }
      });
    });
  }
});

// ─── D2: Agentes visibles SÍ pueden comunicar externamente ───────────────

describe("D2 — Agentes visibles pueden comunicar", () => {
  const visibleIds = ["recepcion", "comercial-principal", "comercial-junior", "ceo"];

  for (const agentId of visibleIds) {
    it(`${agentId} canCommunicateExternally → true`, () => {
      expect(canCommunicateExternally(agentId)).toBe(true);
    });

    it(`${agentId} validateToolAccess("send_whatsapp") → permitido`, () => {
      const result = validateToolAccess(agentId, "send_whatsapp");
      expect(result.allowed).toBe(true);
    });
  }
});

// ─── D3: Restricciones específicas por agente ─────────────────────────────

describe("D3 — Restricciones específicas de la Matriz de Permisos", () => {
  it("recepcion NO tiene make_phone_call en allowedTools", () => {
    const agent = getAgentById("recepcion")!;
    expect(agent.allowedTools).not.toContain("make_phone_call");
  });

  it("ceo NO tiene create_email_rule en allowedTools", () => {
    const agent = getAgentById("ceo")!;
    expect(agent.allowedTools).not.toContain("create_email_rule");
  });

  it("ceo NO tiene bulk_categorize en allowedTools", () => {
    const agent = getAgentById("ceo")!;
    expect(agent.allowedTools).not.toContain("bulk_categorize");
  });

  it("consultor-digital NO tiene save_invoice_to_drive en allowedTools", () => {
    const agent = getAgentById("consultor-digital")!;
    expect(agent.allowedTools).not.toContain("save_invoice_to_drive");
  });
});

// ─── D4: delegate_task solo donde corresponde ─────────────────────────────

describe("D4 — delegate_task restringido", () => {
  it("CEO puede delegar", () => {
    const agent = getAgentById("ceo")!;
    expect(agent.allowedTools).toContain("delegate_task");
    expect(agent.canDelegate.length).toBeGreaterThan(0);
  });

  it("recepcion puede delegar", () => {
    const agent = getAgentById("recepcion")!;
    expect(agent.allowedTools).toContain("delegate_task");
    expect(agent.canDelegate.length).toBeGreaterThan(0);
  });

  it("comercial-principal puede delegar", () => {
    const agent = getAgentById("comercial-principal")!;
    expect(agent.allowedTools).toContain("delegate_task");
    expect(agent.canDelegate.length).toBeGreaterThan(0);
  });

  it("comercial-junior NO puede delegar", () => {
    const agent = getAgentById("comercial-junior")!;
    expect(agent.allowedTools).not.toContain("delegate_task");
    expect(agent.canDelegate).toHaveLength(0);
  });

  it("internos y módulos NO pueden delegar", () => {
    const noDelegate = ["consultor-servicios", "consultor-digital", "legal-rgpd", "fiscal", "bi-scoring", "marketing-automation"];
    for (const id of noDelegate) {
      const agent = getAgentById(id)!;
      expect(agent.canDelegate).toHaveLength(0);
    }
  });
});

// ─── D5: Perímetro acotado de comercial-junior ────────────────────────────

describe("D5 — Perímetro de comercial-junior", () => {
  const junior = getAgentById("comercial-junior")!;

  it("NO tiene make_phone_call (solo Principal)", () => {
    expect(junior.allowedTools).not.toContain("make_phone_call");
  });

  it("NO tiene forecast_revenue (es para BI/CEO)", () => {
    expect(junior.allowedTools).not.toContain("forecast_revenue");
  });

  it("NO tiene analyze_sentiment_trend (es para Principal/BI)", () => {
    expect(junior.allowedTools).not.toContain("analyze_sentiment_trend");
  });

  it("NO puede delegar tareas", () => {
    expect(junior.canDelegate).toHaveLength(0);
  });

  it("SÍ tiene herramientas básicas de comunicación", () => {
    expect(junior.allowedTools).toContain("send_sms");
    expect(junior.allowedTools).toContain("send_whatsapp");
    expect(junior.allowedTools).toContain("send_telegram");
    expect(junior.allowedTools).toContain("send_email_transactional");
  });

  it("SÍ tiene herramientas de búsqueda y memoria", () => {
    expect(junior.allowedTools).toContain("smart_search");
    expect(junior.allowedTools).toContain("memory_search");
    expect(junior.allowedTools).toContain("knowledge_search");
  });
});

// ─── D6: Tools no vacías y coherentes con layer ───────────────────────────

describe("D6 — Coherencia tools-layer", () => {
  it("ningún agente tiene tools duplicadas en allowedTools", () => {
    for (const agent of getSwarmAgents()) {
      const unique = new Set(agent.allowedTools);
      expect(unique.size).toBe(agent.allowedTools.length);
    }
  });

  it("todos los agentes visibles tienen al menos una herramienta de comunicación en allowedTools", () => {
    for (const id of VISIBLE_LAYERS) {
      if (id === "ceo") continue; // CEO no necesita comunicación directa de rutina
      const agent = getAgentById(id)!;
      const hasComm = EXTERNAL_COMM_TOOLS.some((t) => agent.allowedTools.includes(t));
      expect(hasComm).toBe(true);
    }
  });
});
