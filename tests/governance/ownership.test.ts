/**
 * OWNERSHIP TESTS — Verificar single-voice, capas de ownership, restricciones.
 * Categoría C del plan de tests de gobernanza.
 */
import { describe, it, expect } from "vitest";
import {
  getSwarmAgents,
  getAgentById,
  canCommunicateExternally,
  VISIBLE_LAYERS,
  INTERNAL_LAYERS,
  type CaseOwnerLayer,
  type AgentLayer,
} from "@/lib/agent/swarm";

// ─── C1: Solo agentes visibles pueden ser owners ──────────────────────────

describe("C1 — Solo agentes visibles son owners válidos", () => {
  const validOwners: CaseOwnerLayer[] = ["recepcion", "comercial-principal", "comercial-junior", "ceo"];

  it("los 4 owners válidos coinciden con VISIBLE_LAYERS", () => {
    expect(VISIBLE_LAYERS.size).toBe(4);
    for (const owner of validOwners) {
      expect(VISIBLE_LAYERS.has(owner)).toBe(true);
    }
  });

  it("ningún agente interno puede ser owner visible", () => {
    for (const id of INTERNAL_LAYERS) {
      // Si alguien intentara crear un CaseOwnership con un interno, sería inválido
      expect(VISIBLE_LAYERS.has(id)).toBe(false);
      expect(canCommunicateExternally(id)).toBe(false);
    }
  });
});

// ─── C2: Layers correctamente asignadas ───────────────────────────────────

describe("C2 — Capas correctamente asignadas a cada agente", () => {
  const expectedLayers: Record<string, AgentLayer> = {
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

  for (const [id, expectedLayer] of Object.entries(expectedLayers)) {
    it(`${id} → layer "${expectedLayer}"`, () => {
      const agent = getAgentById(id)!;
      expect(agent).toBeDefined();
      expect(agent.layer).toBe(expectedLayer);
    });
  }
});

// ─── C3: CEO solo en excepción ────────────────────────────────────────────

describe("C3 — CEO no es comercial habitual", () => {
  const ceo = getAgentById("ceo")!;

  it("CEO tiene layer 'gobierno', no 'visible'", () => {
    expect(ceo.layer).toBe("gobierno");
  });

  it("prompt del CEO dice que NO es la voz normal", () => {
    expect(ceo.systemPrompt).toContain("No eres la voz normal del cliente");
  });

  it("prompt del CEO dice que NO es comercial", () => {
    expect(ceo.systemPrompt).toContain("no eres el comercial diario");
  });

  it("CEO puede delegar a todos los demás", () => {
    expect(ceo.canDelegate.length).toBe(9); // todos menos él mismo
  });
});

// ─── C4: Recepción como punto de entrada ──────────────────────────────────

describe("C4 — Recepción es el punto de entrada estándar", () => {
  const recepcion = getAgentById("recepcion")!;

  it("recepcion tiene layer 'visible'", () => {
    expect(recepcion.layer).toBe("visible");
  });

  it("recepcion tiene prioridad alta (9)", () => {
    expect(recepcion.priority).toBe(9);
  });

  it("recepcion puede delegar a comerciales y especialistas", () => {
    expect(recepcion.canDelegate).toContain("comercial-principal");
    expect(recepcion.canDelegate).toContain("comercial-junior");
    expect(recepcion.canDelegate).toContain("consultor-servicios");
    expect(recepcion.canDelegate).toContain("consultor-digital");
  });

  it("prompt de recepcion menciona clasificación y derivación", () => {
    expect(recepcion.systemPrompt).toContain("clasificar");
    expect(recepcion.systemPrompt).toContain("detectar");
  });
});

// ─── C5: Internos solo producen salida interna ────────────────────────────

describe("C5 — Agentes internos solo producen salida interna", () => {
  const internalExperts = ["consultor-servicios", "consultor-digital", "legal-rgpd"];
  const modules = ["fiscal", "bi-scoring", "marketing-automation"];

  for (const id of internalExperts) {
    it(`${id} — prompt prohíbe contacto directo con cliente`, () => {
      const agent = getAgentById(id)!;
      const prompt = agent.systemPrompt.toLowerCase();
      // Acepta variantes: "no hablar directamente con cliente", "no hablas directamente con cliente", "no puedes hablar"
      expect(
        prompt.includes("no hablar directamente con cliente") ||
        prompt.includes("no hablas directamente con cliente") ||
        prompt.includes("no hablar con cliente") ||
        prompt.includes("no puedes") && prompt.includes("cliente")
      ).toBe(true);
    });

    it(`${id} — prompt exige salida interna estructurada`, () => {
      const agent = getAgentById(id)!;
      expect(agent.systemPrompt.toLowerCase()).toContain("salida obligatoria");
    });
  }

  for (const id of modules) {
    it(`${id} — prompt prohíbe contacto directo con cliente`, () => {
      const agent = getAgentById(id)!;
      const prompt = agent.systemPrompt.toLowerCase();
      // Módulos internos: variantes de prohibición de contacto
      expect(
        prompt.includes("no hablar con cliente") ||
        prompt.includes("no hablas con cliente") ||
        prompt.includes("no convertirte en voz") ||
        prompt.includes("no enviar mensajes") ||
        (prompt.includes("no") && prompt.includes("cliente") && prompt.includes("voz"))
      ).toBe(true);
    });

    it(`${id} — prompt exige salida interna`, () => {
      const agent = getAgentById(id)!;
      expect(agent.systemPrompt.toLowerCase()).toContain("salida obligatoria");
    });
  }
});

// ─── C6: Marketing no toca leads activos ──────────────────────────────────

describe("C6 — Marketing Automation no toca leads activos", () => {
  const mktg = getAgentById("marketing-automation")!;

  it("prompt dice que no toca leads activos comerciales", () => {
    expect(mktg.systemPrompt.toLowerCase()).toContain("no tocar leads activos");
  });

  it("prompt dice que no interfiere en negociación", () => {
    expect(mktg.systemPrompt.toLowerCase()).toContain("no interferir en negociacion");
  });
});
