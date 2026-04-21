/**
 * E2E BUSINESS FLOWS — Escenarios de negocio completos sobre Arquitectura v2.
 *
 * Cada escenario simula un flujo real de Somos Sinergia de principio a fin:
 * routing → ownership → tools → internos → observabilidad.
 *
 * No requiere LLM. Ejercita las funciones reales de gobernanza, routing,
 * validación de permisos y auditoría.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  SimulatedCase,
  expectCaseOwnerPath,
  expectNoInternalExternalMessages,
  expectGovernanceViolation,
  expectNoGovernanceViolations,
  expectToolBlocked,
  expectSingleVisibleVoice,
  expectAgentsInTimeline,
  expectAgentsNotInTimeline,
  expectTimelineContainsSequence,
  expectAgentOnlyInternal,
  expectFirstAgent,
  expectViolationCount,
} from "./helpers";

// ═══════════════════════════════════════════════════════════════════════════
// ESCENARIO 1 — Lead simple particular
// ═══════════���═══════════════════════════════════════════════════════════════

describe("E2E-1: Lead simple particular", () => {
  let c: SimulatedCase;

  beforeEach(() => {
    c = new SimulatedCase("e2e-lead-simple-001");
  });

  it("flujo completo: recepcion → junior → resolución sin internos", () => {
    // 1. Entra el caso
    const routed = c.route("Hola, me gustaría cambiar de compañía de luz, soy particular");
    expect(routed).toBe("recepcion");

    // 2. Recepción clasifica y asigna ownership
    c.assignOwner("recepcion");
    c.speakToClient("recepcion", "confirmar recepción y pedir datos");

    // 3. Recepción detecta caso simple → Junior
    c.assignOwner("comercial-junior");

    // 4. Junior gestiona
    c.speakToClient("comercial-junior", "enviar propuesta estándar");
    c.useTool("comercial-junior", "send_whatsapp"); // Puede enviar
    c.useTool("comercial-junior", "smart_search"); // Tool interna OK

    // 5. Verificaciones
    expectFirstAgent(c, "recepcion");
    expectCaseOwnerPath(c, ["recepcion", "comercial-junior"]);
    expectSingleVisibleVoice(c); // Solo junior habla tras el traspaso
    expectNoInternalExternalMessages(c);
    expectNoGovernanceViolations(c);
    expectAgentsNotInTimeline(c, ["consultor-servicios", "consultor-digital", "legal-rgpd", "fiscal", "bi-scoring", "marketing-automation"]);
  });

  it("timeline registra case_routed → agent_selected → case_owner_changed", () => {
    c.route("Quiero contratar alarma para mi piso");
    c.assignOwner("recepcion");
    c.assignOwner("comercial-junior");

    expectTimelineContainsSequence(c, ["case_routed", "agent_selected", "case_owner_changed", "case_owner_changed"]);
  });

  it("Junior puede usar tools de comunicación (es visible)", () => {
    c.route("Necesito presupuesto de fibra");
    c.assignOwner("comercial-junior");

    const whatsapp = c.useTool("comercial-junior", "send_whatsapp");
    const sms = c.useTool("comercial-junior", "send_sms");
    const email = c.useTool("comercial-junior", "send_email_transactional");

    expect(whatsapp).toBe(true);
    expect(sms).toBe(true);
    expect(email).toBe(true);
    expect(c.getBlockedTools()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ESCENARIO 2 — Particular bajo consumo con análisis de factura
// ═══════════════════════════════════════════════════════════════════════════

describe("E2E-2: Particular bajo consumo con análisis de factura", () => {
  let c: SimulatedCase;

  beforeEach(() => {
    c = new SimulatedCase("e2e-factura-particular-002");
  });

  it("flujo: recepcion → junior + consultor servicios interno → resolución simple", () => {
    // 1. Entrada
    c.route("Quiero que revisen mi factura de luz, soy particular con tarifa regulada");

    // 2. Recepción clasifica
    c.assignOwner("recepcion");
    c.speakToClient("recepcion", "confirmo recepción, pido datos de factura");

    // 3. Como es particular, va a Junior
    c.assignOwner("comercial-junior");

    // 4. Junior detecta que necesita análisis técnico → pide a Consultor Servicios (delegación desde recepcion)
    c.delegate("recepcion", "consultor-servicios", "analizar factura eléctrica");

    // 5. Consultor Servicios trabaja internamente (no habla con cliente)
    c.internalWork("consultor-servicios", "Análisis PVPC vs tarifa actual, ahorro estimado 15%");

    // 6. Junior comunica resultado al cliente
    c.speakToClient("comercial-junior", "presentar resultado del análisis");
    c.useTool("comercial-junior", "send_whatsapp");

    // 7. Verificaciones
    expectCaseOwnerPath(c, ["recepcion", "comercial-junior"]);
    expectAgentOnlyInternal(c, "consultor-servicios");
    expectSingleVisibleVoice(c);
    expectNoInternalExternalMessages(c);
    expectAgentsInTimeline(c, ["recepcion", "comercial-junior", "consultor-servicios"]);
  });

  it("si el caso se vuelve complejo, escala a Principal", () => {
    c.route("Revísame la factura, pero también quiero cambiar telecom y alarma");
    c.assignOwner("recepcion");
    c.assignOwner("comercial-junior");

    // Junior detecta multi-servicio → escala
    // Recepción (que tiene canDelegate) escala a Principal
    c.escalate("recepcion", "comercial-principal", "multi-servicio detectado, excede perímetro Junior");

    // Principal toma el caso
    c.speakToClient("comercial-principal", "asumo tu caso con propuesta integral");

    expectCaseOwnerPath(c, ["recepcion", "comercial-junior", "comercial-principal"]);
    expectSingleVisibleVoice(c);
  });

  it("Consultor Servicios no puede enviar mensaje externo", () => {
    c.route("Factura para revisar");
    c.assignOwner("comercial-junior");
    c.delegate("recepcion", "consultor-servicios", "revisar factura");

    // Consultor intenta enviar WhatsApp directamente (debe bloquearse)
    const result = c.useTool("consultor-servicios", "send_whatsapp");
    expect(result).toBe(false);
    expectToolBlocked(c, "send_whatsapp", "consultor-servicios");
    expectGovernanceViolation(c);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ESCENARIO 3 — Pyme multi-servicio
// ═══════════════════════════════════════════════════════════════════════════

describe("E2E-3: Pyme multi-servicio", () => {
  let c: SimulatedCase;

  beforeEach(() => {
    c = new SimulatedCase("e2e-pyme-multi-003");
  });

  it("flujo: recepcion → principal + consultores internos → propuesta unificada", () => {
    // 1. Entrada (caso empresa multi-servicio)
    c.route("Somos una empresa de 20 empleados, necesitamos energía, fibra, alarma y quizá un CRM");

    // 2. Recepción clasifica → empresa + multi-servicio → Principal
    c.assignOwner("recepcion");
    c.speakToClient("recepcion", "Bienvenido, paso su caso a nuestro especialista empresarial");
    c.assignOwner("comercial-principal");

    // 3. Principal toma liderazgo visible
    c.speakToClient("comercial-principal", "Encantado, le preparo propuesta integral");

    // 4. Principal pide apoyo a Consultor Servicios (energía + telecom + alarma)
    c.delegate("comercial-principal", "consultor-servicios", "comparativa energía + telecom + alarma para pyme 20 empleados");
    c.internalWork("consultor-servicios", "Pack empresa: ahorro 22% energía, fibra simétrica 600Mb, alarma Ajax");

    // 5. Principal pide apoyo a Consultor Digital (CRM)
    c.delegate("comercial-principal", "consultor-digital", "opciones CRM para pyme 20 empleados");
    c.internalWork("consultor-digital", "Recomendación: CRM básico + automatizaciones, pack IA starter");

    // 6. Principal consolida y comunica
    c.speakToClient("comercial-principal", "Aquí tiene su propuesta integral con todos los servicios");
    c.useTool("comercial-principal", "send_email_transactional");

    // 7. Verificaciones
    expectFirstAgent(c, "recepcion");
    expectCaseOwnerPath(c, ["recepcion", "comercial-principal"]);
    expectSingleVisibleVoice(c); // Solo principal tras asumir
    expectAgentOnlyInternal(c, "consultor-servicios");
    expectAgentOnlyInternal(c, "consultor-digital");
    expectNoInternalExternalMessages(c);
    expectNoGovernanceViolations(c);
    expectAgentsInTimeline(c, ["recepcion", "comercial-principal", "consultor-servicios", "consultor-digital"]);
    expectAgentsNotInTimeline(c, ["fiscal", "bi-scoring", "marketing-automation"]);
  });

  it("consultores internos no pueden ser owners", () => {
    c.route("Empresa 50 empleados quiere pack completo");
    c.assignOwner("recepcion");

    // Intento de asignar consultor como owner
    const allowed = c.assignOwner("consultor-servicios");
    expect(allowed).toBe(false);
    expectGovernanceViolation(c);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ESCENARIO 4 — Proyecto digital complejo
// ═══════════════════════════════════════════════════════════════════════════

describe("E2E-4: Proyecto digital complejo (CRM + web + IA)", () => {
  let c: SimulatedCase;

  beforeEach(() => {
    c = new SimulatedCase("e2e-digital-complejo-004");
  });

  it("flujo: recepcion → principal → digital interno + legal → entrega", () => {
    // 1. Entrada
    c.route("Necesitamos un CRM personalizado, web corporativa nueva y chatbot IA para atención");

    // 2. Recepción → Principal (empresa + digital complejo)
    c.assignOwner("recepcion");
    c.speakToClient("recepcion", "Caso recibido, lo paso a nuestro equipo comercial empresa");
    c.assignOwner("comercial-principal");

    // 3. Principal lidera
    c.speakToClient("comercial-principal", "Perfecto, le diseñamos solución a medida");

    // 4. Consultor Digital genera análisis técnico interno
    c.delegate("comercial-principal", "consultor-digital", "diseñar arquitectura CRM + web + chatbot");
    c.internalWork("consultor-digital", "Propuesta: Next.js + Supabase + chatbot GPT-5, timeline 8 semanas");

    // 5. Legal entra porque hay documentación contractual
    c.delegate("comercial-principal", "legal-rgpd", "preparar contrato marco + cláusula RGPD procesamiento datos");
    c.internalWork("legal-rgpd", "Contrato marco redactado, cláusula RGPD art.28 incluida, DPA anexo");

    // 6. Principal consolida y envía
    c.speakToClient("comercial-principal", "Propuesta técnica + contrato listos para su revisión");
    c.useTool("comercial-principal", "send_email_transactional");
    c.useTool("comercial-principal", "draft_and_send");

    // 7. Verificaciones
    expectCaseOwnerPath(c, ["recepcion", "comercial-principal"]);
    expectAgentOnlyInternal(c, "consultor-digital");
    expectAgentOnlyInternal(c, "legal-rgpd");
    expectNoInternalExternalMessages(c);
    expectSingleVisibleVoice(c);
    expectNoGovernanceViolations(c);
    expectAgentsInTimeline(c, ["recepcion", "comercial-principal", "consultor-digital", "legal-rgpd"]);
  });

  it("legal no puede enviar email directamente al cliente", () => {
    c.route("Proyecto digital empresa");
    c.assignOwner("comercial-principal");
    c.delegate("comercial-principal", "legal-rgpd", "preparar contrato");
    c.internalWork("legal-rgpd", "Contrato listo");

    // Legal intenta enviar directamente
    const sent = c.useTool("legal-rgpd", "send_email_transactional");
    expect(sent).toBe(false);
    expectToolBlocked(c, "send_email_transactional", "legal-rgpd");
  });

  it("consultor digital no puede llamar al cliente", () => {
    c.route("Proyecto IA");
    c.assignOwner("comercial-principal");
    c.delegate("comercial-principal", "consultor-digital", "análisis técnico");

    const called = c.useTool("consultor-digital", "make_phone_call");
    expect(called).toBe(false);
    expectToolBlocked(c, "make_phone_call", "consultor-digital");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ESCENARIO 5 — Contrato + RGPD
// ═══════════════════════════════════════════════════════════════════════════

describe("E2E-5: Contrato + RGPD", () => {
  let c: SimulatedCase;

  beforeEach(() => {
    c = new SimulatedCase("e2e-contrato-rgpd-005");
  });

  it("Legal prepara, Comercial envía — Legal nunca habla con cliente", () => {
    // 1. Caso ya en manos de Principal
    c.route("Necesito firmar contrato de servicios energéticos para mi empresa");
    c.assignOwner("recepcion");
    c.speakToClient("recepcion", "Caso recibido");
    c.assignOwner("comercial-principal");
    c.speakToClient("comercial-principal", "Preparo documentación contractual");

    // 2. Principal delega a Legal
    c.delegate("comercial-principal", "legal-rgpd", "redactar contrato + clausulas RGPD");

    // 3. Legal trabaja internamente
    c.internalWork("legal-rgpd", "Contrato de suministro redactado con cláusulas RGPD art.6 y art.28");
    c.internalWork("legal-rgpd", "Revisión de condiciones generales completada");

    // 4. Legal intenta hablar con cliente → BLOQUEADO
    const canSpeak = c.speakToClient("legal-rgpd", "enviar contrato");
    expect(canSpeak).toBe(false);

    // 5. Comercial Principal envía el contrato
    c.speakToClient("comercial-principal", "Aquí tiene el contrato para revisión y firma");
    c.useTool("comercial-principal", "send_email_transactional");

    // 6. Verificaciones
    expectCaseOwnerPath(c, ["recepcion", "comercial-principal"]);
    expectAgentOnlyInternal(c, "legal-rgpd");
    expectSingleVisibleVoice(c);
    expectNoInternalExternalMessages(c);
    expectAgentsInTimeline(c, ["recepcion", "comercial-principal", "legal-rgpd"]);

    // La violación de voz de legal-rgpd se registra
    const violations = c.getViolations();
    expect(violations.some((v) => v.agentId === "legal-rgpd" || v.reason.includes("legal-rgpd"))).toBe(true);
  });

  it("Legal bloqueado en todas las tools de comunicación", () => {
    c.route("Contrato empresarial");
    c.assignOwner("comercial-principal");
    c.delegate("comercial-principal", "legal-rgpd", "contrato");

    const tools = ["send_whatsapp", "send_sms", "send_telegram", "send_email_transactional", "make_phone_call", "draft_and_send", "speak_with_voice"];
    for (const tool of tools) {
      const allowed = c.useTool("legal-rgpd", tool);
      expect(allowed).toBe(false);
    }
    expect(c.getBlockedTools().length).toBe(tools.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ESCENARIO 6 — Factura vencida / administrativo
// ═══════════════════════════════════════════════════════════════════════════

describe("E2E-6: Factura vencida / administrativo", () => {
  let c: SimulatedCase;

  beforeEach(() => {
    c = new SimulatedCase("e2e-factura-vencida-006");
  });

  it("Fiscal prepara borrador, Recepción comunica — Fiscal nunca contacta", () => {
    // 1. Entra caso administrativo
    c.route("Tengo una factura duplicada del mes pasado, necesito aclaración");
    c.assignOwner("recepcion");
    c.speakToClient("recepcion", "Recibido, verifico el estado de su facturación");

    // 2. Recepción delega análisis a Fiscal
    c.delegate("recepcion", "fiscal", "verificar factura duplicada y generar borrador de respuesta");

    // 3. Fiscal trabaja internamente
    c.internalWork("fiscal", "Factura FV-2024-0847 duplicada detectada, generar nota de crédito");
    c.internalWork("fiscal", "Borrador de comunicación: explicar duplicado + adjuntar nota crédito");

    // 4. Fiscal NO puede contactar al cliente
    const blocked = c.useTool("fiscal", "send_email_transactional");
    expect(blocked).toBe(false);

    // 5. Recepción toma el borrador y comunica
    c.speakToClient("recepcion", "Le confirmo: detectamos el duplicado, adjunto nota de crédito");
    c.useTool("recepcion", "send_email_transactional");

    // 6. Verificaciones
    expectCaseOwnerPath(c, ["recepcion"]);
    expectAgentOnlyInternal(c, "fiscal");
    expectSingleVisibleVoice(c);
    expectToolBlocked(c, "send_email_transactional", "fiscal");
    expectAgentsInTimeline(c, ["recepcion", "fiscal"]);
    expectAgentsNotInTimeline(c, ["comercial-principal", "comercial-junior", "consultor-digital"]);
  });

  it("timeline deja claro que Fiscal fue soporte interno", () => {
    c.route("Vencimiento factura");
    c.assignOwner("recepcion");
    c.delegate("recepcion", "fiscal", "revisar vencimiento");
    c.internalWork("fiscal", "Análisis completado");

    const timeline = c.getTimeline();
    const fiscalEvents = timeline.filter((e) => e.agentId === "fiscal");
    // Fiscal solo tiene eventos internos (tool_called, tool_succeeded, delegated-to)
    for (const evt of fiscalEvents) {
      expect(evt.eventType).not.toBe("external_message_attempted");
      expect(evt.eventType).not.toBe("external_message_sent");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ESCENARIO 7 — Recomendación BI
// ════════════���══════════════════════════════════════════════════════════════

describe("E2E-7: Recomendación BI", () => {
  let c: SimulatedCase;

  beforeEach(() => {
    c = new SimulatedCase("e2e-bi-recomendacion-007");
  });

  it("BI recomienda, Recepción decide, BI no ejecuta", () => {
    // 1. Caso existente
    c.route("Consulta sobre mis servicios contratados");
    c.assignOwner("recepcion");
    c.speakToClient("recepcion", "Consulto su expediente");

    // 2. Recepción delega análisis a BI
    c.delegate("recepcion", "bi-scoring", "analizar scoring del cliente y detectar oportunidades");

    // 3. BI genera recomendación interna
    c.internalWork("bi-scoring", "Scoring: 78/100, potencial cross-sell alto, riesgo fuga bajo");
    c.recommend("bi-scoring", "Recomendar upgrade a pack empresa por scoring alto y antigüedad 3 años");

    // 4. BI NO puede ejecutar nada directamente
    const canSend = c.useTool("bi-scoring", "send_whatsapp");
    expect(canSend).toBe(false);

    const canSpeak = c.speakToClient("bi-scoring", "informar de oportunidad");
    expect(canSpeak).toBe(false);

    // 5. Recepción toma la decisión basada en recomendación
    c.speakToClient("recepcion", "Veo que tiene potencial para mejorar su plan, ¿le interesa?");

    // 6. Verificaciones
    expectCaseOwnerPath(c, ["recepcion"]);
    expectAgentOnlyInternal(c, "bi-scoring");
    expectSingleVisibleVoice(c);
    expectToolBlocked(c, "send_whatsapp", "bi-scoring");
    expectAgentsInTimeline(c, ["recepcion", "bi-scoring"]);
  });

  it("BI bloqueado en TODA comunicación externa", () => {
    c.route("Check scoring");
    c.assignOwner("recepcion");
    c.delegate("recepcion", "bi-scoring", "scoring");

    const tools = ["send_whatsapp", "send_sms", "send_telegram", "send_email_transactional", "make_phone_call"];
    for (const tool of tools) {
      expect(c.useTool("bi-scoring", tool)).toBe(false);
    }
    expect(c.getBlockedTools().length).toBe(tools.length);
  });

  it("BI no puede ser owner visible", () => {
    c.route("Analítica");
    c.assignOwner("recepcion");

    const allowed = c.assignOwner("bi-scoring");
    expect(allowed).toBe(false);
    expectGovernanceViolation(c);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ESCENARIO 8 — Intentos de violación (stress test de gobernanza)
// ═══════════════════════════════════════════════════════════════════════════

describe("E2E-8: Intentos de violación de gobernanza", () => {
  let c: SimulatedCase;

  beforeEach(() => {
    c = new SimulatedCase("e2e-violaciones-008");
  });

  describe("8a — Interno intenta usar tool externa", () => {
    it("todos los internos bloqueados en todas las tools de comunicación", () => {
      c.route("Caso de prueba");
      c.assignOwner("recepcion");

      const internos = ["consultor-servicios", "consultor-digital", "legal-rgpd", "fiscal", "bi-scoring", "marketing-automation"];
      const commTools = ["send_whatsapp", "send_sms", "send_telegram", "send_email_transactional", "make_phone_call", "draft_and_send", "speak_with_voice"];

      let totalBlocked = 0;
      for (const agent of internos) {
        for (const tool of commTools) {
          const result = c.useTool(agent, tool);
          expect(result).toBe(false);
          totalBlocked++;
        }
      }

      expect(c.getBlockedTools().length).toBe(totalBlocked);
      expect(c.getViolations().length).toBeGreaterThan(0);
    });
  });

  describe("8b — Agente distinto al owner intenta contactar", () => {
    it("recepcion no puede hablar si owner es comercial-principal", () => {
      c.route("Caso empresa");
      c.assignOwner("comercial-principal");

      const canSpeak = c.speakToClient("recepcion", "intentar hablar");
      expect(canSpeak).toBe(false);

      const violations = c.getViolations();
      expect(violations.some((v) => v.eventType === "ownership_conflict_detected")).toBe(true);
    });

    it("comercial-junior no puede hablar si owner es comercial-principal", () => {
      c.route("Caso empresa");
      c.assignOwner("comercial-principal");

      const canSpeak = c.speakToClient("comercial-junior", "intentar hablar");
      expect(canSpeak).toBe(false);
    });

    it("CEO sí puede hablar aunque no sea owner (excepción gobierno)", () => {
      c.route("Caso empresa");
      c.assignOwner("comercial-principal");

      const canSpeak = c.speakToClient("ceo", "intervención ejecutiva");
      expect(canSpeak).toBe(true);
    });
  });

  describe("8c — Junior intenta quedarse con caso fuera de perímetro", () => {
    it("Junior no puede delegar (canDelegate vacío)", () => {
      c.route("Caso que debería escalar");
      c.assignOwner("comercial-junior");

      // Junior intenta delegar → no puede (canDelegate = [])
      const delegated = c.delegate("comercial-junior", "consultor-servicios", "pedir ayuda");
      expect(delegated).toBe(false);

      const blocked = c.getEvents({ eventType: "agent_blocked" });
      expect(blocked.length).toBeGreaterThan(0);
    });

    it("escalación debe venir de recepcion o principal, no de junior", () => {
      c.route("Caso multi-servicio");
      c.assignOwner("comercial-junior");

      // Junior no puede escalar por sí mismo
      const escalated = c.escalate("comercial-junior", "comercial-principal", "caso complejo");
      expect(escalated).toBe(false);
    });
  });

  describe("8d — Interno intenta ser owner", () => {
    it("ningún interno puede ser asignado como owner visible", () => {
      c.route("Caso interno");
      c.assignOwner("recepcion");

      const internos = ["consultor-servicios", "consultor-digital", "legal-rgpd", "fiscal", "bi-scoring", "marketing-automation"];
      for (const interno of internos) {
        // Reset violations counter tracking by using fresh case per internal
        const ci = new SimulatedCase(`e2e-viol-owner-${interno}`);
        ci.route("Test");
        ci.assignOwner("recepcion");

        const allowed = ci.assignOwner(interno);
        expect(allowed).toBe(false);
        expectGovernanceViolation(ci);
      }
    });
  });

  describe("8e — Violaciones quedan visibles en timeline", () => {
    it("cada violación genera evento auditable con detalles", () => {
      c.route("Caso conflictivo");
      c.assignOwner("comercial-principal");

      // Violación 1: interno intenta comm
      c.useTool("fiscal", "send_whatsapp");
      // Violación 2: no-owner intenta hablar
      c.speakToClient("comercial-junior", "hablar sin ser owner");
      // Violación 3: interno intenta ser owner
      c.assignOwner("bi-scoring");

      const violations = c.getViolations();
      expect(violations.length).toBeGreaterThanOrEqual(3);

      // Cada violación tiene datos útiles
      for (const v of violations) {
        expect(v.agentId).toBeTruthy();
        expect(v.reason).toBeTruthy();
        expect(v.timestamp).toBeTruthy();
        expect(v.caseId).toBe(c.caseId);
      }

      // Timeline contiene los eventos de violación en orden
      const timeline = c.getTimeline();
      const violationTypes = timeline
        .filter((e) => e.result === "blocked")
        .map((e) => e.eventType);
      expect(violationTypes.length).toBeGreaterThanOrEqual(3);
    });

    it("auditoría distingue tipo de violación", () => {
      c.route("Stress test");
      c.assignOwner("comercial-principal");

      // Tool blocked
      c.useTool("fiscal", "send_whatsapp");
      // Ownership conflict
      c.speakToClient("recepcion", "doble voz");
      // Visibility violation
      c.assignOwner("marketing-automation");

      const violations = c.getViolations();
      const types = violations.map((v) => v.eventType);

      expect(types).toContain("tool_blocked");
      expect(types).toContain("ownership_conflict_detected");
      expect(types).toContain("visibility_violation_detected");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ESCENARIO 9 (BONUS) — Marketing Automation respeta límites
// ═══════════════════════════════════════════════════════════════════════════

describe("E2E-9: Marketing Automation respeta límites", () => {
  let c: SimulatedCase;

  beforeEach(() => {
    c = new SimulatedCase("e2e-marketing-009");
  });

  it("Marketing no puede contactar cliente ni ser owner", () => {
    c.route("Lead inactivo que podría reactivarse");
    c.assignOwner("recepcion");
    c.delegate("recepcion", "marketing-automation", "preparar campaña nurturing");

    // Marketing trabaja internamente
    c.internalWork("marketing-automation", "Secuencia nurturing 3 emails, segmento: inactivos >90d");

    // Marketing NO puede enviar directamente
    expect(c.useTool("marketing-automation", "send_email_transactional")).toBe(false);
    expect(c.useTool("marketing-automation", "send_whatsapp")).toBe(false);

    // Marketing NO puede ser owner
    expect(c.assignOwner("marketing-automation")).toBe(false);

    // Marketing NO puede hablar con cliente
    expect(c.speakToClient("marketing-automation", "enviar campaña")).toBe(false);

    expectAgentOnlyInternal(c, "marketing-automation");
    expect(c.getBlockedTools().length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ESCENARIO 10 (BONUS) — Flujo completo con timeline coherente
// ═══════════════════════════════════════════════════════════════════════════

describe("E2E-10: Timeline completa de caso enterprise", () => {
  it("timeline refleja todo el flujo de un caso complejo", () => {
    const c = new SimulatedCase("e2e-timeline-full-010");

    // Flujo completo
    c.route("Empresa 200 empleados, pack energía + digital + legal completo");
    c.assignOwner("recepcion");
    c.speakToClient("recepcion", "Bienvenido, derivamos a su asesor especializado");
    c.assignOwner("comercial-principal");
    c.speakToClient("comercial-principal", "Diseño propuesta integral");
    c.delegate("comercial-principal", "consultor-servicios", "análisis energético");
    c.internalWork("consultor-servicios", "Pack energía empresa: ahorro €12k/año");
    c.delegate("comercial-principal", "consultor-digital", "pack digital");
    c.internalWork("consultor-digital", "CRM + web + chatbot: €15k setup");
    c.delegate("comercial-principal", "legal-rgpd", "contrato marco");
    c.internalWork("legal-rgpd", "Contrato redactado, RGPD OK");
    c.delegate("comercial-principal", "fiscal", "presupuesto formal");
    c.internalWork("fiscal", "Presupuesto generado con desglose IVA");
    c.speakToClient("comercial-principal", "Propuesta completa lista");
    c.useTool("comercial-principal", "send_email_transactional");

    // Timeline assertions
    const timeline = c.getTimeline();
    expect(timeline.length).toBeGreaterThan(15);

    // Owner path
    expectCaseOwnerPath(c, ["recepcion", "comercial-principal"]);

    // All expected agents present
    expectAgentsInTimeline(c, [
      "recepcion", "comercial-principal",
      "consultor-servicios", "consultor-digital",
      "legal-rgpd", "fiscal",
    ]);

    // None of the internals spoke externally
    expectAgentOnlyInternal(c, "consultor-servicios");
    expectAgentOnlyInternal(c, "consultor-digital");
    expectAgentOnlyInternal(c, "legal-rgpd");
    expectAgentOnlyInternal(c, "fiscal");

    // Single visible voice
    expectSingleVisibleVoice(c);

    // No violations in clean flow
    expectNoGovernanceViolations(c);

    // Event sequence is logical
    expectTimelineContainsSequence(c, [
      "case_routed",
      "agent_selected",
      "case_owner_changed",  // recepcion
      "case_owner_changed",  // comercial-principal
      "agent_delegated",     // → consultor-servicios
      "agent_delegated",     // → consultor-digital
      "agent_delegated",     // → legal-rgpd
      "agent_delegated",     // → fiscal
      "tool_succeeded",      // email sent
    ]);
  });
});
