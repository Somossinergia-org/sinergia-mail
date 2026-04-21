/**
 * ROUTING TESTS — Verificar puerta única y enrutamiento correcto.
 * Categoría B del plan de tests de gobernanza.
 */
import { describe, it, expect } from "vitest";
import { routeToAgent } from "@/lib/agent/swarm";

// ─── B1: Gate-keeper — todo entra por recepcion ───────────────────────────

describe("B1 — Gate-keeper: todo entra por recepcion", () => {
  const generalQueries = [
    "Hola, buenos días",
    "Necesito información sobre servicios",
    "Quiero contratar energía",
    "Tengo una factura que no entiendo",
    "Me interesa un CRM para mi empresa",
    "¿Podéis hacerme una web?",
    "Quiero cambiar de compañía eléctrica",
    "Necesito un presupuesto de alarmas",
    "¿Cuánto cuesta un agente IA?",
    "Tengo un problema con mi contrato",
    "Quiero dar de alta un seguro",
    "¿Trabajáis con empresas grandes?",
  ];

  for (const query of generalQueries) {
    it(`"${query.slice(0, 40)}..." → recepcion`, () => {
      expect(routeToAgent(query)).toBe("recepcion");
    });
  }
});

// ─── B2: Bypass directo al CEO solo si se pide explícitamente ─────────────

describe("B2 — Bypass al CEO solo si explícito", () => {
  it("'CEO necesito hablar contigo' → ceo", () => {
    expect(routeToAgent("CEO necesito hablar contigo")).toBe("ceo");
  });

  it("'orquestador del sistema' → ceo", () => {
    expect(routeToAgent("orquestador del sistema")).toBe("ceo");
  });

  it("'director general, tenemos un problema' → ceo", () => {
    expect(routeToAgent("director general, tenemos un problema")).toBe("ceo");
  });

  it("mención casual de 'ceo' NO redirige (si no empieza por 'ceo')", () => {
    // routeToAgent checks with ^ceo at start
    expect(routeToAgent("quiero hablar con el ceo")).toBe("recepcion");
  });

  it("consultas normales de negocio NO van al CEO", () => {
    expect(routeToAgent("Necesito un presupuesto urgente")).toBe("recepcion");
    expect(routeToAgent("Tenemos un problema con la factura")).toBe("recepcion");
    expect(routeToAgent("La empresa está perdiendo clientes")).toBe("recepcion");
  });
});

// ─── B3: Queries que NO deben bypassear recepción ─────────────────────────

describe("B3 — Ningún caso salta directamente a especialista", () => {
  const specialistQueries = [
    // Comercial
    "Quiero comprar todos los servicios para mi empresa",
    "Presupuesto para 50 empleados",
    // Técnico servicios
    "Mi factura de Endesa tiene un error",
    "Quiero comparar tarifas de luz",
    // Técnico digital
    "Necesito un chatbot con IA",
    "¿Podéis hacer una app móvil?",
    // Legal
    "Necesito firmar un contrato RGPD",
    "Quiero ejercer mi derecho al olvido",
    // Fiscal
    "Tengo una factura vencida de 5000€",
    "¿Cuándo vence el modelo 303?",
    // BI
    "Dame el dashboard de KPIs",
    "¿Cuál es el forecast de este trimestre?",
    // Marketing
    "Quiero hacer una campaña de email",
    "¿Cómo está el SEO de la web?",
  ];

  for (const query of specialistQueries) {
    it(`"${query.slice(0, 45)}..." → recepcion (gate-keeper)`, () => {
      expect(routeToAgent(query)).toBe("recepcion");
    });
  }
});

// ─── B4: Routing preserva gate-keeper con inputs edge-case ────────────────

describe("B4 — Edge cases de routing", () => {
  it("string vacío → recepcion", () => {
    expect(routeToAgent("")).toBe("recepcion");
  });

  it("solo espacios → recepcion", () => {
    expect(routeToAgent("   ")).toBe("recepcion");
  });

  it("string muy largo → recepcion", () => {
    const longQuery = "necesito ayuda con ".repeat(100);
    expect(routeToAgent(longQuery)).toBe("recepcion");
  });

  it("unicode/emojis → recepcion", () => {
    expect(routeToAgent("🔥 urgente factura 🔥")).toBe("recepcion");
  });
});
