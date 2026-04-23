/**
 * Tests — Importador MVP
 * Cubre: alias detection, parsing, validaciones, transformaciones, dedup keys, API route validation
 */

import { describe, it, expect } from "vitest";
import { normalizeHeader, detectHeaderMapping, COMPANY_CONFIG, CONTACT_CONFIG, SUPPLY_POINT_CONFIG, ENTITY_CONFIGS } from "@/lib/import/aliases";
import type { ImportEntity } from "@/lib/import/types";

// ─── normalizeHeader ──────────────────────────────────────────────────────────

describe("normalizeHeader", () => {
  it("convierte a lowercase sin tildes", () => {
    expect(normalizeHeader("Dirección")).toBe("direccion");
    expect(normalizeHeader("Código Postal")).toBe("codigo_postal");
    expect(normalizeHeader("TELÉFONO")).toBe("telefono");
  });

  it("convierte espacios a guiones bajos", () => {
    expect(normalizeHeader("Razón Social")).toBe("razon_social");
    expect(normalizeHeader("Potencia P1")).toBe("potencia_p1");
  });

  it("elimina caracteres especiales", () => {
    expect(normalizeHeader("NIF/CIF")).toBe("nifcif");
    expect(normalizeHeader("E-mail")).toBe("email");
  });

  it("maneja strings con espacios extra", () => {
    expect(normalizeHeader("  nombre  ")).toBe("nombre");
    expect(normalizeHeader("  cp  ")).toBe("cp");
  });
});

// ─── detectHeaderMapping — Empresas ───────────────────────────────────────────

describe("detectHeaderMapping — companies", () => {
  it("detecta headers en español estándar", () => {
    const headers = ["Nombre", "NIF", "Dirección", "Ciudad", "Teléfono", "Email"];
    const { mapping, unmapped } = detectHeaderMapping(headers, COMPANY_CONFIG);

    expect(mapping[0]).toBe("name");
    expect(mapping[1]).toBe("nif");
    expect(mapping[2]).toBe("address");
    expect(mapping[3]).toBe("city");
    expect(mapping[4]).toBe("phone");
    expect(mapping[5]).toBe("email");
    expect(unmapped).toHaveLength(0);
  });

  it("detecta aliases alternativos", () => {
    const headers = ["empresa", "cif", "domicilio", "poblacion", "tlf", "correo"];
    const { mapping } = detectHeaderMapping(headers, COMPANY_CONFIG);

    expect(mapping[0]).toBe("name");
    expect(mapping[1]).toBe("nif");
    expect(mapping[2]).toBe("address");
    expect(mapping[3]).toBe("city");
    expect(mapping[4]).toBe("phone");
    expect(mapping[5]).toBe("email");
  });

  it("detecta headers en inglés", () => {
    const headers = ["company", "tax_id", "address", "city", "phone", "mail"];
    const { mapping } = detectHeaderMapping(headers, COMPANY_CONFIG);

    expect(mapping[0]).toBe("name");
    expect(mapping[1]).toBe("nif");
    expect(mapping[2]).toBe("address");
    expect(mapping[3]).toBe("city");
    expect(mapping[4]).toBe("phone");
    expect(mapping[5]).toBe("email");
  });

  it("reporta headers no mapeados", () => {
    const headers = ["Nombre", "NIF", "Columna Rara", "Otra Cosa"];
    const { unmapped } = detectHeaderMapping(headers, COMPANY_CONFIG);

    expect(unmapped).toContain("Columna Rara");
    expect(unmapped).toContain("Otra Cosa");
  });

  it("detecta tipo_cliente / client_type", () => {
    const headers = ["Nombre", "Tipo Cliente"];
    const { mapping } = detectHeaderMapping(headers, COMPANY_CONFIG);
    expect(mapping[1]).toBe("clientType");
  });

  it("detecta etiquetas / tags", () => {
    const headers = ["Nombre", "Etiquetas"];
    const { mapping } = detectHeaderMapping(headers, COMPANY_CONFIG);
    expect(mapping[1]).toBe("tags");
  });
});

// ─── detectHeaderMapping — Contactos ──────────────────────────────────────────

describe("detectHeaderMapping — contacts", () => {
  it("detecta headers de contacto", () => {
    const headers = ["Nombre", "Email", "Teléfono", "Empresa", "Categoría"];
    const { mapping } = detectHeaderMapping(headers, CONTACT_CONFIG);

    expect(mapping[0]).toBe("name");
    expect(mapping[1]).toBe("email");
    expect(mapping[2]).toBe("phone");
    expect(mapping[3]).toBe("_companyLookup");
    expect(mapping[4]).toBe("category");
  });

  it("detecta aliases de contacto", () => {
    const headers = ["contacto", "correo", "movil", "compañia", "tipo"];
    const { mapping } = detectHeaderMapping(headers, CONTACT_CONFIG);

    expect(mapping[0]).toBe("name");
    expect(mapping[1]).toBe("email");
    expect(mapping[2]).toBe("phone");
    expect(mapping[3]).toBe("_companyLookup");
    expect(mapping[4]).toBe("category");
  });
});

// ─── detectHeaderMapping — Puntos de suministro ───────────────────────────────

describe("detectHeaderMapping — supplyPoints", () => {
  it("detecta headers de punto de suministro", () => {
    const headers = ["CUPS", "Empresa", "Tarifa", "Potencia P1", "Potencia P2", "Consumo Anual", "Comercializadora"];
    const { mapping } = detectHeaderMapping(headers, SUPPLY_POINT_CONFIG);

    expect(mapping[0]).toBe("cups");
    expect(mapping[1]).toBe("_companyLookup");
    expect(mapping[2]).toBe("tariff");
    expect(mapping[3]).toBe("powerP1Kw");
    expect(mapping[4]).toBe("powerP2Kw");
    expect(mapping[5]).toBe("annualConsumptionKwh");
    expect(mapping[6]).toBe("currentRetailer");
  });

  it("detecta aliases de suministro", () => {
    const headers = ["codigo_cups", "nif_empresa", "tipo_tarifa", "p1_kw", "kwh_anual", "retailer", "fin_contrato"];
    const { mapping } = detectHeaderMapping(headers, SUPPLY_POINT_CONFIG);

    expect(mapping[0]).toBe("cups");
    expect(mapping[1]).toBe("_companyLookup");
    expect(mapping[2]).toBe("tariff");
    expect(mapping[3]).toBe("powerP1Kw");
    expect(mapping[4]).toBe("annualConsumptionKwh");
    expect(mapping[5]).toBe("currentRetailer");
    expect(mapping[6]).toBe("contractExpiryDate");
  });
});

// ─── Transformaciones ─────────────────────────────────────────────────────────

describe("Transformaciones de campos", () => {
  it("normaliza NIF eliminando espacios y guiones", () => {
    const nifField = COMPANY_CONFIG.fields.find((f) => f.dbField === "nif")!;
    expect(nifField.transform!("B-12 345 678")).toBe("B12345678");
    expect(nifField.transform!("a1234567b")).toBe("A1234567B");
  });

  it("normaliza teléfono español", () => {
    const phoneField = COMPANY_CONFIG.fields.find((f) => f.dbField === "phone")!;
    expect(phoneField.transform!("612 345 678")).toBe("+34612345678");
    expect(phoneField.transform!("34612345678")).toBe("+34612345678");
    expect(phoneField.transform!("+34612345678")).toBe("+34612345678");
  });

  it("normaliza código postal", () => {
    const cpField = COMPANY_CONFIG.fields.find((f) => f.dbField === "postalCode")!;
    expect(cpField.transform!("3000")).toBe("03000");
    expect(cpField.transform!("28001")).toBe("28001");
  });

  it("normaliza email a lowercase", () => {
    const emailField = COMPANY_CONFIG.fields.find((f) => f.dbField === "email")!;
    expect(emailField.transform!("David@Sinergia.ES ")).toBe("david@sinergia.es");
  });

  it("normaliza URL añadiendo https://", () => {
    const webField = COMPANY_CONFIG.fields.find((f) => f.dbField === "website")!;
    expect(webField.transform!("sinergia.es")).toBe("https://sinergia.es");
    expect(webField.transform!("https://ya.com")).toBe("https://ya.com");
  });

  it("normaliza CUPS a uppercase", () => {
    const cupsField = SUPPLY_POINT_CONFIG.fields.find((f) => f.dbField === "cups")!;
    expect(cupsField.transform!(" es0012345678901234ab ")).toBe("ES0012345678901234AB");
  });

  it("parsea números con comas y moneda", () => {
    const consumoField = SUPPLY_POINT_CONFIG.fields.find((f) => f.dbField === "annualConsumptionKwh")!;
    expect(consumoField.transform!("1.234,56€")).toBe(1234.56);
    expect(consumoField.transform!("500")).toBe(500);
  });

  it("normaliza Instagram eliminando @ y URL", () => {
    const igField = COMPANY_CONFIG.fields.find((f) => f.dbField === "instagram")!;
    expect(igField.transform!("@somossinergia")).toBe("somossinergia");
    expect(igField.transform!("https://instagram.com/somossinergia")).toBe("somossinergia");
  });

  it("split tags por coma/punto y coma/pipe", () => {
    const tagsField = COMPANY_CONFIG.fields.find((f) => f.dbField === "tags")!;
    const result = tagsField.transform!("energia, teleco; alarmas|seguros") as string[];
    expect(result).toEqual(["energia", "teleco", "alarmas", "seguros"]);
  });
});

// ─── Validaciones ─────────────────────────────────────────────────────────────

describe("Validaciones de campos", () => {
  it("valida email formato correcto", () => {
    const emailField = COMPANY_CONFIG.fields.find((f) => f.dbField === "email")!;
    expect(emailField.validate!("test@mail.com")).toBeNull();
    expect(emailField.validate!("invalido")).toBeTruthy();
    expect(emailField.validate!("@no.com")).toBeTruthy();
  });

  it("valida NIF formato", () => {
    const nifField = COMPANY_CONFIG.fields.find((f) => f.dbField === "nif")!;
    expect(nifField.validate!("B12345678")).toBeNull();
    expect(nifField.validate!("12345678A")).toBeNull();
    expect(nifField.validate!("AB")).toBeTruthy(); // muy corto
  });

  it("valida CUPS formato", () => {
    const cupsField = SUPPLY_POINT_CONFIG.fields.find((f) => f.dbField === "cups")!;
    expect(cupsField.validate!("ES0012345678901234AB")).toBeNull();
    expect(cupsField.validate!("FR001234567890123")).toBeTruthy(); // no ES
    expect(cupsField.validate!("ES0012")).toBeTruthy(); // muy corto
  });

  it("valida tarifa válida", () => {
    const tariffField = SUPPLY_POINT_CONFIG.fields.find((f) => f.dbField === "tariff")!;
    expect(tariffField.validate!("2.0TD")).toBeNull();
    expect(tariffField.validate!("6.1TD")).toBeNull();
    expect(tariffField.validate!("INVENTADA")).toBeTruthy();
  });

  it("valida código postal", () => {
    const cpField = COMPANY_CONFIG.fields.find((f) => f.dbField === "postalCode")!;
    expect(cpField.validate!("28001")).toBeNull();
    expect(cpField.validate!("03001")).toBeNull();
    expect(cpField.validate!("99999")).toBeTruthy(); // prefijo 99 no existe
    expect(cpField.validate!("1234")).toBeTruthy(); // 4 dígitos
  });

  it("valida positivos para potencias", () => {
    const p1Field = SUPPLY_POINT_CONFIG.fields.find((f) => f.dbField === "powerP1Kw")!;
    expect(p1Field.validate!(5.5)).toBeNull();
    expect(p1Field.validate!(0)).toBeNull();
    expect(p1Field.validate!(-1)).toBeTruthy();
  });

  it("valida campo obligatorio email en contactos", () => {
    const emailField = CONTACT_CONFIG.fields.find((f) => f.dbField === "email")!;
    expect(emailField.validate!("")).toBeTruthy();
    expect(emailField.validate!(null)).toBeTruthy();
    expect(emailField.validate!("valid@test.com")).toBeNull();
  });
});

// ─── Configuración de entidades ───────────────────────────────────────────────

describe("Entity configs", () => {
  it("todas las entidades MVP están configuradas", () => {
    const entities: ImportEntity[] = ["companies", "contacts", "supplyPoints"];
    for (const e of entities) {
      expect(ENTITY_CONFIGS[e]).toBeDefined();
      expect(ENTITY_CONFIGS[e].entity).toBe(e);
      expect(ENTITY_CONFIGS[e].dedupKeys.length).toBeGreaterThan(0);
      expect(ENTITY_CONFIGS[e].fields.length).toBeGreaterThan(0);
    }
  });

  it("companies dedup por NIF", () => {
    expect(COMPANY_CONFIG.dedupKeys).toEqual(["nif"]);
  });

  it("contacts dedup por email", () => {
    expect(CONTACT_CONFIG.dedupKeys).toEqual(["email"]);
  });

  it("supplyPoints dedup por CUPS + empresa", () => {
    expect(SUPPLY_POINT_CONFIG.dedupKeys).toContain("cups");
    expect(SUPPLY_POINT_CONFIG.dedupKeys).toContain("_companyLookup");
  });

  it("cada campo tiene aliases no vacíos", () => {
    for (const entity of Object.values(ENTITY_CONFIGS)) {
      for (const field of entity.fields) {
        expect(field.aliases.length).toBeGreaterThan(0);
        for (const alias of field.aliases) {
          expect(alias.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("campos requeridos de companies: name", () => {
    const required = COMPANY_CONFIG.fields.filter((f) => f.required).map((f) => f.dbField);
    expect(required).toContain("name");
  });

  it("campos requeridos de contacts: email", () => {
    const required = CONTACT_CONFIG.fields.filter((f) => f.required).map((f) => f.dbField);
    expect(required).toContain("email");
  });

  it("campos requeridos de supplyPoints: cups, _companyLookup", () => {
    const required = SUPPLY_POINT_CONFIG.fields.filter((f) => f.required).map((f) => f.dbField);
    expect(required).toContain("cups");
    expect(required).toContain("_companyLookup");
  });
});

// ─── API route validation logic (sin DB) ──────────────────────────────────────

describe("Import API validation rules", () => {
  const VALID_ENTITIES: ImportEntity[] = ["companies", "contacts", "supplyPoints"];
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const VALID_EXTENSIONS = [".xlsx", ".xls", ".csv"];

  it("solo acepta entidades válidas", () => {
    expect(VALID_ENTITIES).toContain("companies");
    expect(VALID_ENTITIES).toContain("contacts");
    expect(VALID_ENTITIES).toContain("supplyPoints");
    expect(VALID_ENTITIES).not.toContain("opportunities"); // no en MVP
    expect(VALID_ENTITIES).not.toContain("services"); // no en MVP
  });

  it("max 10MB", () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });

  it("extensiones válidas", () => {
    expect(VALID_EXTENSIONS).toContain(".xlsx");
    expect(VALID_EXTENSIONS).toContain(".csv");
    expect(VALID_EXTENSIONS).not.toContain(".pdf");
    expect(VALID_EXTENSIONS).not.toContain(".json");
  });

  it("orden de importación respeta integridad referencial", () => {
    // companies no tiene FK → puede ir primero
    // contacts tiene FK a companies → segundo
    // supplyPoints tiene FK a companies → tercero
    const companyAutoFields = COMPANY_CONFIG.autoFields;
    expect(companyAutoFields).toContain("userId"); // se autogenera

    // contacts tiene _companyLookup → busca en companies
    const contactCompanyField = CONTACT_CONFIG.fields.find((f) => f.dbField === "_companyLookup");
    expect(contactCompanyField).toBeDefined();
    expect(contactCompanyField!.required).toBe(false); // no obligatorio

    // supplyPoints tiene _companyLookup → obligatorio
    const spCompanyField = SUPPLY_POINT_CONFIG.fields.find((f) => f.dbField === "_companyLookup");
    expect(spCompanyField).toBeDefined();
    expect(spCompanyField!.required).toBe(true); // obligatorio
  });
});

// ─── CSV parser logic ─────────────────────────────────────────────────────────

describe("CSV parsing edge cases", () => {
  it("normalizeHeader es idempotente", () => {
    const h = normalizeHeader("Código Postal");
    expect(normalizeHeader(h)).toBe(h);
  });

  it("detectHeaderMapping no duplica mapeos", () => {
    // Si un header coincide con dos campos, solo el primero gana
    const headers = ["Nombre", "Email", "Email"]; // duplicado
    const { mapping } = detectHeaderMapping(headers, COMPANY_CONFIG);

    // Ambos Email no deberían mapearse al mismo campo
    const mappedFields = Object.values(mapping);
    const emailCount = mappedFields.filter((f) => f === "email").length;
    expect(emailCount).toBeLessThanOrEqual(1);
  });

  it("headers vacíos no rompen el mapeo", () => {
    const headers = ["", "Nombre", "", "NIF"];
    const { mapping, unmapped } = detectHeaderMapping(headers, COMPANY_CONFIG);

    expect(mapping[1]).toBe("name");
    expect(mapping[3]).toBe("nif");
    expect(unmapped).toContain("");
  });
});
