/**
 * Phase 2 Pipeline & Types Tests
 * Validates pipeline statuses, service types, and CRM type constants.
 */
import { describe, it, expect } from "vitest";
import {
  PIPELINE_STATUSES,
  SERVICE_TYPES,
  SERVICE_STATUSES,
  DOCUMENT_TYPES,
} from "../../src/lib/crm/types";

describe("Pipeline Status Flow", () => {
  const PIPELINE_ORDER = [
    "pendiente", "contactado", "interesado", "visita_programada", "visitado",
    "oferta_enviada", "negociacion", "contrato_firmado", "cliente_activo", "perdido",
  ] as const;

  it("has exactly 10 statuses in correct order", () => {
    expect(PIPELINE_STATUSES).toHaveLength(10);
    for (let i = 0; i < PIPELINE_ORDER.length; i++) {
      expect(PIPELINE_STATUSES[i]).toBe(PIPELINE_ORDER[i]);
    }
  });

  it("terminal states are cliente_activo and perdido", () => {
    const terminalStates = ["cliente_activo", "perdido"];
    for (const s of terminalStates) {
      expect(PIPELINE_STATUSES).toContain(s);
    }
  });

  it("first status is pendiente (entry point)", () => {
    expect(PIPELINE_STATUSES[0]).toBe("pendiente");
  });

  it("can compute previous/next status for pipeline navigation", () => {
    const indexOf = (s: string) => PIPELINE_STATUSES.indexOf(s as typeof PIPELINE_STATUSES[number]);
    // contactado (index 1) → prev is pendiente (0), next is interesado (2)
    expect(indexOf("contactado")).toBe(1);
    expect(PIPELINE_STATUSES[indexOf("contactado") - 1]).toBe("pendiente");
    expect(PIPELINE_STATUSES[indexOf("contactado") + 1]).toBe("interesado");
  });
});

describe("Service Types — Sinergia Catalog", () => {
  it("has all 8 Sinergia products", () => {
    expect(SERVICE_TYPES).toHaveLength(8);
    const expected = [
      "energia", "telecomunicaciones", "alarmas", "seguros",
      "agentes_ia", "web", "crm", "aplicaciones",
    ];
    for (const p of expected) {
      expect(SERVICE_TYPES).toContain(p);
    }
  });
});

describe("Service Statuses — Lifecycle", () => {
  it("has 4 lifecycle statuses", () => {
    expect(SERVICE_STATUSES).toHaveLength(4);
    const expected = ["prospecting", "offered", "contracted", "cancelled"];
    for (const s of expected) {
      expect(SERVICE_STATUSES).toContain(s);
    }
  });
});

describe("Document Types", () => {
  it("has 6 types including contrato and factura", () => {
    expect(DOCUMENT_TYPES).toHaveLength(6);
    expect(DOCUMENT_TYPES).toContain("contrato");
    expect(DOCUMENT_TYPES).toContain("factura");
    expect(DOCUMENT_TYPES).toContain("oferta");
    expect(DOCUMENT_TYPES).toContain("propuesta");
    expect(DOCUMENT_TYPES).toContain("dni");
    expect(DOCUMENT_TYPES).toContain("otro");
  });
});
