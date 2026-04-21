/**
 * ESCALATION TESTS — Verificar reglas de escalado y perímetros.
 * Categoría E del plan de tests de gobernanza.
 */
import { describe, it, expect } from "vitest";
import { getAgentById } from "@/lib/agent/swarm";

// ─── E1: Comercial Junior → Principal (escalado) ─────────────────────────

describe("E1 — Comercial Junior: perímetro y escalado", () => {
  const junior = getAgentById("comercial-junior")!;

  it("prompt define perímetro: particular, bajo consumo, un servicio, estándar", () => {
    expect(junior.systemPrompt).toContain("particular");
    expect(junior.systemPrompt).toContain("un unico servicio");
    expect(junior.systemPrompt).toContain("caso estandar");
  });

  it("prompt exige escalar a Principal si aparece empresa", () => {
    expect(junior.systemPrompt.toLowerCase()).toContain("empresa");
    expect(junior.systemPrompt.toLowerCase()).toContain("escalar a comercial principal");
  });

  it("prompt exige escalar si más de un servicio", () => {
    expect(junior.systemPrompt.toLowerCase()).toContain("mas de un servicio");
  });

  it("prompt exige escalar si pricing no estándar", () => {
    expect(junior.systemPrompt.toLowerCase()).toContain("pricing no estandar");
  });

  it("prompt dice 'si dudas, escala'", () => {
    expect(junior.systemPrompt.toLowerCase()).toContain("si dudas");
    expect(junior.systemPrompt.toLowerCase()).toContain("escala");
  });
});

// ─── E2: Comercial Principal recibe escalados ─────────────────────────────

describe("E2 — Comercial Principal: destino de escalados", () => {
  const principal = getAgentById("comercial-principal")!;

  it("prompt gestiona empresas y casos complejos", () => {
    expect(principal.systemPrompt.toLowerCase()).toContain("empresas");
    expect(principal.systemPrompt.toLowerCase()).toContain("complejos");
    expect(principal.systemPrompt.toLowerCase()).toContain("multi-servicio");
  });

  it("prompt dice cuándo escalar al CEO", () => {
    expect(principal.systemPrompt.toLowerCase()).toContain("caso estrategico");
    expect(principal.systemPrompt.toLowerCase()).toContain("ceo");
  });

  it("puede delegar a especialistas internos", () => {
    expect(principal.canDelegate).toContain("consultor-servicios");
    expect(principal.canDelegate).toContain("consultor-digital");
    expect(principal.canDelegate).toContain("legal-rgpd");
    expect(principal.canDelegate).toContain("fiscal");
    expect(principal.canDelegate).toContain("bi-scoring");
  });
});

// ─── E3: Recepción clasifica correctamente según prompt ───────────────────

describe("E3 — Recepción: reglas de clasificación en prompt", () => {
  const recepcion = getAgentById("recepcion")!;

  it("regla: particular/bajo consumo → Junior", () => {
    expect(recepcion.systemPrompt.toLowerCase()).toContain("comercial junior");
  });

  it("regla: empresa/complejo/multi-servicio → Principal", () => {
    expect(recepcion.systemPrompt.toLowerCase()).toContain("comercial principal");
  });

  it("regla: energía/telecom/alarmas/seguros → Consultor Servicios", () => {
    expect(recepcion.systemPrompt.toLowerCase()).toContain("consultor servicios");
  });

  it("regla: IA/web/CRM/apps → Consultor Digital", () => {
    expect(recepcion.systemPrompt.toLowerCase()).toContain("consultor digital");
  });

  it("regla: firma/contrato/RGPD → Legal", () => {
    expect(recepcion.systemPrompt.toLowerCase()).toContain("legal / rgpd");
  });

  it("regla: facturación/vencimientos → Fiscal", () => {
    expect(recepcion.systemPrompt.toLowerCase()).toContain("fiscal");
  });
});

// ─── E4: BI recomienda, no decide ─────────────────────────────────────────

describe("E4 — BI/Scoring: recomienda, no decide", () => {
  const bi = getAgentById("bi-scoring")!;

  it("prompt dice que recomienda, Recepción decide", () => {
    expect(bi.systemPrompt.toLowerCase()).toContain("tu recomiendas");
    expect(bi.systemPrompt.toLowerCase()).toContain("recepcion decide");
  });

  it("prompt dice que no ejecuta acciones comerciales", () => {
    expect(bi.systemPrompt.toLowerCase()).toContain("no ejecutar acciones comerciales");
  });

  it("no puede delegar", () => {
    expect(bi.canDelegate).toHaveLength(0);
  });
});

// ─── E5: Legal prepara pero no envía ──────────────────────────────────────

describe("E5 — Legal/RGPD: prepara pero no envía", () => {
  const legal = getAgentById("legal-rgpd")!;

  it("prompt dice que no envía documentación final", () => {
    expect(legal.systemPrompt.toLowerCase()).toContain("no envias documentacion final");
  });

  it("prompt dice que no habla con cliente", () => {
    expect(legal.systemPrompt.toLowerCase()).toContain("no hablas directamente con cliente");
  });

  it("prompt exige paquete interno estructurado", () => {
    expect(legal.systemPrompt.toLowerCase()).toContain("paquete interno");
  });
});

// ─── E6: Fiscal prepara borradores, no envía ─────────────────────────────

describe("E6 — Fiscal: prepara borradores, no envía", () => {
  const fiscal = getAgentById("fiscal")!;

  it("prompt dice que no habla con cliente", () => {
    expect(fiscal.systemPrompt.toLowerCase()).toContain("no hablar con cliente");
  });

  it("prompt dice que no reclama cobros directamente", () => {
    expect(fiscal.systemPrompt.toLowerCase()).toContain("no reclamar cobros directamente");
  });

  it("prompt dice que es soporte interno", () => {
    expect(fiscal.systemPrompt.toLowerCase()).toContain("soporte interno");
  });

  it("prompt dice que debe dejar borrador y elevar", () => {
    expect(fiscal.systemPrompt.toLowerCase()).toContain("borrador");
    expect(fiscal.systemPrompt.toLowerCase()).toContain("eleva");
  });
});
