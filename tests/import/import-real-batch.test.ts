/**
 * Test de lote real mínimo — Valida que los 3 CSV de David
 * se parsean correctamente: headers, transforms, validaciones.
 * NO requiere base de datos — solo parser + aliases.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseFile } from "../../src/lib/import/parser";

const fixturesDir = resolve(import.meta.dirname!, "./fixtures");

function loadCSV(name: string): Buffer {
  return readFileSync(resolve(fixturesDir, name));
}

// ─── 1. EMPRESAS ─────────────────────────────────────────────────────────────

describe("Lote real — empresas.csv", () => {
  let result: Awaited<ReturnType<typeof parseFile>>;

  test("parse sin errores", async () => {
    result = await parseFile(loadCSV("empresas.csv"), "companies", {
      fileName: "empresas.csv",
    });
    // Log unmapped for debugging
    if (result.unmappedHeaders.length > 0) {
      console.log("Unmapped headers (empresas):", result.unmappedHeaders);
    }
    if (result.errors.length > 0) {
      console.log("Errors (empresas):", result.errors);
    }
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(3);
  });

  test("headers mapeados correctamente", () => {
    expect(result.headerMapping).toMatchObject({
      Nombre: "name",
      "NIF/CIF": "nif",
      "Tipo cliente": "clientType",
      Sector: "sector",
      Direccion: "address",
      Ciudad: "city",
      Provincia: "province",
      "Codigo postal": "postalCode",
      Telefono: "phone",
      Email: "email",
      Etiquetas: "tags",
      Notas: "notes",
    });
  });

  test("Origen es unmapped (no es campo del importador)", () => {
    expect(result.unmappedHeaders).toContain("Origen");
  });

  test("Panadería López — transforms correctos", () => {
    const row = result.rows[0].data;
    expect(row.name).toBe("Panadería lópez"); // capitalize
    expect(row.nif).toBe("12345678Z");
    expect(row.clientType).toBe("particular");
    expect(row.sector).toBe("Alimentación");
    expect(row.address).toBe("Calle Mayor 5");
    expect(row.city).toBe("Orihuela");
    expect(row.province).toBe("Alicante");
    expect(row.postalCode).toBe("03300");
    expect(row.phone).toBe("+34966112233");
    expect(row.email).toBe("panaderia@test.com");
    expect(row.tags).toEqual(["pan", "horeca"]);
    expect(row.notes).toBe("Cliente frecuente");
  });

  test("Energía Sur SL — NIF CIF formato B + empresa", () => {
    const row = result.rows[1].data;
    expect(row.name).toBe("Energía sur sl"); // capitalize
    expect(row.nif).toBe("B12345678");
    expect(row.clientType).toBe("empresa");
    expect(row.phone).toBe("+34965887744");
    expect(row.postalCode).toBe("03007");
  });

  test("Juan García Autónomo — clientType autonomo", () => {
    const row = result.rows[2].data;
    expect(row.nif).toBe("44556677R");
    expect(row.clientType).toBe("autonomo");
    expect(row.phone).toBe("+34600112233");
    expect(row.postalCode).toBe("03201");
    // sector vacío → no presente
    expect(row.sector).toBeUndefined();
  });
});

// ─── 2. CONTACTOS ────────────────────────────────────────────────────────────

describe("Lote real — contactos.csv", () => {
  let result: Awaited<ReturnType<typeof parseFile>>;

  test("parse sin errores", async () => {
    result = await parseFile(loadCSV("contactos.csv"), "contacts", {
      fileName: "contactos.csv",
    });
    if (result.unmappedHeaders.length > 0) {
      console.log("Unmapped headers (contactos):", result.unmappedHeaders);
    }
    if (result.errors.length > 0) {
      console.log("Errors (contactos):", result.errors);
    }
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(3);
  });

  test("headers mapeados", () => {
    expect(result.headerMapping).toMatchObject({
      Nombre: "name",
      Email: "email",
      Telefono: "phone",
      Empresa: "_companyLookup",
      Categoria: "category",
      Temperatura: "temperature",
      Prioridad: "priority",
      Ciudad: "city",
      Provincia: "province",
      Notas: "notes",
    });
  });

  test("María López — vinculación por NIF", () => {
    const row = result.rows[0].data;
    expect(row.name).toBe("María lópez"); // capitalize
    expect(row.email).toBe("maria@panaderia.com");
    expect(row.phone).toBe("+34600223344");
    expect(row._companyLookup).toBe("12345678Z"); // NIF directo
    expect(row.category).toBe("A");
    expect(row.temperature).toBe("hot");
    expect(row.priority).toBe("alta");
  });

  test("Pedro Martín — vinculación por nombre empresa", () => {
    const row = result.rows[1].data;
    expect(row._companyLookup).toBe("Energía Sur SL"); // nombre directo
    expect(row.category).toBe("B");
    expect(row.temperature).toBe("warm");
  });

  test("Ana Sin Empresa — sin _companyLookup", () => {
    const row = result.rows[2].data;
    expect(row.email).toBe("ana@libre.com");
    expect(row._companyLookup).toBeUndefined(); // vacío en CSV
    expect(row.category).toBe("C");
    expect(row.temperature).toBe("cold");
    expect(row.priority).toBe("baja");
  });
});

// ─── 3. PUNTOS DE SUMINISTRO ─────────────────────────────────────────────────

describe("Lote real — puntos_suministro.csv", () => {
  let result: Awaited<ReturnType<typeof parseFile>>;

  test("parse sin errores", async () => {
    result = await parseFile(loadCSV("puntos_suministro.csv"), "supplyPoints", {
      fileName: "puntos_suministro.csv",
    });
    if (result.unmappedHeaders.length > 0) {
      console.log("Unmapped headers (suministros):", result.unmappedHeaders);
    }
    if (result.errors.length > 0) {
      console.log("Errors (suministros):", result.errors);
    }
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
  });

  test("headers mapeados", () => {
    expect(result.headerMapping).toMatchObject({
      CUPS: "cups",
      Empresa: "_companyLookup",
      Tarifa: "tariff",
      "Potencia P1 kW": "powerP1Kw",
      "Potencia P2 kW": "powerP2Kw",
      "Consumo anual kWh": "annualConsumptionKwh",
      "Gasto mensual EUR": "monthlySpendEur",
      "Comercializadora actual": "currentRetailer",
      "Fin contrato": "contractExpiryDate",
      Notas: "notes",
    });
  });

  test("CUPS 1 — datos energéticos con formato español", () => {
    const row = result.rows[0].data;
    expect(row.cups).toBe("ES0021000000000001AA");
    expect(row._companyLookup).toBe("12345678Z");
    expect(row.tariff).toBe("2.0TD");
    expect(row.powerP1Kw).toBe(3.45);
    expect(row.powerP2Kw).toBe(3.45);
    expect(row.annualConsumptionKwh).toBe(4500);
    expect(row.monthlySpendEur).toBe(85.3);
    expect(row.currentRetailer).toBe("Iberdrola");
    expect(row.contractExpiryDate).toBeInstanceOf(Date);
    expect((row.contractExpiryDate as Date).getFullYear()).toBe(2026);
    expect((row.contractExpiryDate as Date).getMonth()).toBe(11); // December = 11
    expect((row.contractExpiryDate as Date).getDate()).toBe(31);
  });

  test("CUPS 2 — empresa por nombre, formato numérico mixto", () => {
    const row = result.rows[1].data;
    expect(row.cups).toBe("ES0021000000000002BB");
    expect(row._companyLookup).toBe("Energía Sur SL");
    expect(row.tariff).toBe("3.0TD");
    expect(row.powerP1Kw).toBe(15);
    expect(row.powerP2Kw).toBe(15);
    expect(row.annualConsumptionKwh).toBe(45000);
    expect(row.monthlySpendEur).toBe(1200.5);
    expect(row.currentRetailer).toBe("Endesa");
    expect((row.contractExpiryDate as Date).getFullYear()).toBe(2025);
    expect((row.contractExpiryDate as Date).getMonth()).toBe(5); // June = 5
  });
});
