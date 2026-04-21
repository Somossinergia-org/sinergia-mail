/**
 * CRM Types Tests — validates enums and constants.
 */
import { describe, it, expect } from "vitest";
import {
  PIPELINE_STATUSES,
  SERVICE_TYPES,
  SERVICE_STATUSES,
  DOCUMENT_TYPES,
} from "../../src/lib/crm/types";

describe("CRM Types — Pipeline Statuses", () => {
  it("has exactly 10 statuses", () => {
    expect(PIPELINE_STATUSES).toHaveLength(10);
  });

  it("starts with pendiente and ends with perdido", () => {
    expect(PIPELINE_STATUSES[0]).toBe("pendiente");
    expect(PIPELINE_STATUSES[PIPELINE_STATUSES.length - 1]).toBe("perdido");
  });

  it("includes all required statuses", () => {
    const required = [
      "pendiente", "contactado", "interesado", "visita_programada",
      "visitado", "oferta_enviada", "negociacion", "contrato_firmado",
      "cliente_activo", "perdido",
    ];
    for (const s of required) {
      expect(PIPELINE_STATUSES).toContain(s);
    }
  });
});

describe("CRM Types — Service Types", () => {
  it("has 8 product types (Sinergia catalog)", () => {
    expect(SERVICE_TYPES).toHaveLength(8);
  });

  it("includes all 8 products", () => {
    const products = [
      "energia", "telecomunicaciones", "alarmas", "seguros",
      "agentes_ia", "web", "crm", "aplicaciones",
    ];
    for (const p of products) {
      expect(SERVICE_TYPES).toContain(p);
    }
  });
});

describe("CRM Types — Service Statuses", () => {
  it("has 4 statuses", () => {
    expect(SERVICE_STATUSES).toHaveLength(4);
  });

  it("includes lifecycle", () => {
    expect(SERVICE_STATUSES).toContain("prospecting");
    expect(SERVICE_STATUSES).toContain("offered");
    expect(SERVICE_STATUSES).toContain("contracted");
    expect(SERVICE_STATUSES).toContain("cancelled");
  });
});

describe("CRM Types — Document Types", () => {
  it("has 6 types", () => {
    expect(DOCUMENT_TYPES).toHaveLength(6);
  });

  it("includes contrato and factura", () => {
    expect(DOCUMENT_TYPES).toContain("contrato");
    expect(DOCUMENT_TYPES).toContain("factura");
  });
});
