/**
 * Import Module — Header Alias Dictionaries
 * Maps human-readable Spanish/English headers to DB fields.
 * Based on MATRIZ_IMPORTACION_ENTIDADES.md
 */

import type { ImportEntityConfig, ClientType } from "./types";

// ─── Helpers de transformación ────────────────────────────────────────────────

function trim(v: string): string {
  return v.trim();
}

function trimLower(v: string): string {
  return v.trim().toLowerCase();
}

function trimUpper(v: string): string {
  return v.trim().toUpperCase();
}

function capitalize(v: string): string {
  const s = v.trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function normalizeNif(v: string): string {
  return v.replace(/[\s\-\.]/g, "").toUpperCase();
}

function normalizePhone(v: string): string {
  let p = v.replace(/[\s\-\.()]/g, "");
  // Si empieza por 34 sin +, añadir +
  if (p.startsWith("34") && p.length > 9) p = "+" + p;
  // Si no tiene prefijo y son 9 dígitos, añadir +34
  if (/^\d{9}$/.test(p)) p = "+34" + p;
  return p;
}

function normalizePostalCode(v: string): string {
  const digits = v.replace(/\D/g, "");
  return digits.padStart(5, "0").slice(0, 5);
}

function parseNumber(v: string): number | null {
  let clean = v.replace(/[€$%\s]/g, "");
  // Formato español: 1.234,56 → 1234.56
  if (clean.includes(",")) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function parseDate(v: string): Date | null {
  // Formatos: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD.MM.YYYY
  let d: Date | null = null;
  // ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    d = new Date(v);
  } else {
    const match = v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (match) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      let year = parseInt(match[3]);
      if (year < 100) year += 2000;
      d = new Date(year, month, day);
    }
  }
  return d && !isNaN(d.getTime()) ? d : null;
}

function splitTags(v: string): string[] {
  return v
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalizeUrl(v: string): string {
  const s = v.trim();
  if (!s) return s;
  if (!/^https?:\/\//i.test(s)) return "https://" + s;
  return s;
}

function normalizeInstagram(v: string): string {
  return v.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
}

function normalizeClientType(v: string): ClientType | null {
  const map: Record<string, ClientType> = {
    particular: "particular",
    autonomo: "autonomo",
    autónomo: "autonomo",
    empresa: "empresa",
    pyme: "empresa",
    sociedad: "empresa",
    sl: "empresa",
    sa: "empresa",
  };
  return map[v.trim().toLowerCase()] ?? null;
}

// ─── Validadores ──────────────────────────────────────────────────────────────

function validateNotEmpty(v: unknown): string | null {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) {
    return "Campo obligatorio vacío";
  }
  return null;
}

function validateEmail(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Formato de email inválido";
  return null;
}

function validateNif(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  // Formato básico NIF/CIF español: 1 letra + 8 dígitos | 8 dígitos + 1 letra
  if (!/^[A-Z0-9]{8,10}$/i.test(v)) return "Formato NIF/CIF inválido";
  return null;
}

function validatePostalCode(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  if (!/^\d{5}$/.test(v)) return "Código postal: debe tener 5 dígitos";
  const prefix = parseInt(v.slice(0, 2));
  if (prefix < 1 || prefix > 52) return "Código postal: prefijo provincial inválido";
  return null;
}

function validatePositive(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && v < 0) return "Debe ser mayor o igual a 0";
  return null;
}

function validateCups(v: unknown): string | null {
  if (!v || typeof v !== "string") return "CUPS es obligatorio";
  if (v.length < 20 || v.length > 22) return "CUPS debe tener 20-22 caracteres";
  if (!v.startsWith("ES")) return "CUPS debe empezar por ES";
  return null;
}

function validateTariff(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  const valid = ["2.0TD", "3.0TD", "6.1TD", "6.2TD", "6.3TD", "6.4TD"];
  if (!valid.includes(v)) return `Tarifa inválida. Válidas: ${valid.join(", ")}`;
  return null;
}

// ─── Configuración por entidad ────────────────────────────────────────────────

export const COMPANY_CONFIG: ImportEntityConfig = {
  entity: "companies",
  dedupKeys: ["nif"],
  autoFields: ["id", "userId", "createdAt", "updatedAt", "createdBy", "lat", "lng", "zoneId"],
  fields: [
    {
      aliases: ["nombre", "empresa", "razon_social", "company", "name", "razón social", "razon social"],
      dbField: "name",
      required: true,
      transform: capitalize,
      validate: validateNotEmpty,
    },
    {
      aliases: ["razon_social", "legal_name", "razón social legal", "nombre legal"],
      dbField: "legalName",
      required: false,
      transform: trim,
    },
    {
      aliases: ["nif", "cif", "nif_cif", "tax_id", "nif/cif", "dni"],
      dbField: "nif",
      required: false,
      transform: normalizeNif,
      validate: validateNif,
    },
    {
      aliases: ["sector", "actividad", "industry", "industria"],
      dbField: "sector",
      required: false,
      transform: trim,
    },
    {
      aliases: ["cnae", "codigo_cnae", "código cnae"],
      dbField: "cnae",
      required: false,
      transform: (v) => v.replace(/\D/g, ""),
    },
    {
      aliases: ["direccion", "address", "domicilio", "dirección"],
      dbField: "address",
      required: false,
      transform: trim,
    },
    {
      aliases: ["ciudad", "city", "poblacion", "localidad", "población"],
      dbField: "city",
      required: false,
      transform: capitalize,
    },
    {
      aliases: ["provincia", "province", "estado"],
      dbField: "province",
      required: false,
      transform: capitalize,
    },
    {
      aliases: ["cp", "codigo_postal", "postal_code", "código postal", "codigo postal"],
      dbField: "postalCode",
      required: false,
      transform: normalizePostalCode,
      validate: validatePostalCode,
    },
    {
      aliases: ["telefono", "phone", "tlf", "tel", "teléfono", "móvil", "movil"],
      dbField: "phone",
      required: false,
      transform: normalizePhone,
    },
    {
      aliases: ["email", "correo", "mail", "e-mail"],
      dbField: "email",
      required: false,
      transform: trimLower,
      validate: validateEmail,
    },
    {
      aliases: ["web", "website", "url", "pagina_web", "página web"],
      dbField: "website",
      required: false,
      transform: normalizeUrl,
    },
    {
      aliases: ["instagram", "ig"],
      dbField: "instagram",
      required: false,
      transform: normalizeInstagram,
    },
    {
      aliases: ["facebook", "fb"],
      dbField: "facebook",
      required: false,
      transform: trim,
    },
    {
      aliases: ["tipo", "tipo_cliente", "client_type", "tipo cliente", "segmento"],
      dbField: "clientType",
      required: false,
      transform: (v) => normalizeClientType(v) ?? v.trim().toLowerCase(),
    },
    {
      aliases: ["etiquetas", "tags", "categorias", "categorías"],
      dbField: "tags",
      required: false,
      transform: splitTags as unknown as (v: string) => unknown,
    },
    {
      aliases: ["notas", "notes", "observaciones", "comentarios"],
      dbField: "notes",
      required: false,
      transform: trim,
    },
  ],
};

export const CONTACT_CONFIG: ImportEntityConfig = {
  entity: "contacts",
  dedupKeys: ["email"],
  autoFields: [
    "id", "userId", "score", "scoreEmail", "scoreInvoice", "scoreActivity",
    "emailsSent", "emailsReceived", "emailsOpened", "emailCount",
    "lastEmailDate", "lastContactedAt", "totalInvoiced", "createdAt", "updatedAt",
  ],
  fields: [
    {
      aliases: ["nombre", "name", "contacto", "nombre completo"],
      dbField: "name",
      required: false,
      transform: capitalize,
    },
    {
      aliases: ["email", "correo", "mail", "e-mail"],
      dbField: "email",
      required: true,
      transform: trimLower,
      validate: (v) => {
        const empty = validateNotEmpty(v);
        if (empty) return empty;
        return validateEmail(v);
      },
    },
    {
      aliases: ["nif", "dni", "nif_cif"],
      dbField: "nif",
      required: false,
      transform: normalizeNif,
    },
    {
      aliases: ["telefono", "phone", "tlf", "movil", "teléfono", "móvil"],
      dbField: "phone",
      required: false,
      transform: normalizePhone,
    },
    {
      aliases: ["telefono2", "phone2", "fijo", "teléfono 2"],
      dbField: "phone2",
      required: false,
      transform: normalizePhone,
    },
    {
      aliases: ["direccion", "address", "dirección"],
      dbField: "address",
      required: false,
      transform: trim,
    },
    {
      aliases: ["ciudad", "city", "poblacion", "población"],
      dbField: "city",
      required: false,
      transform: capitalize,
    },
    {
      aliases: ["provincia", "province"],
      dbField: "province",
      required: false,
      transform: capitalize,
    },
    {
      aliases: ["cp", "codigo_postal", "postal_code", "código postal"],
      dbField: "postalCode",
      required: false,
      transform: normalizePostalCode,
      validate: validatePostalCode,
    },
    {
      aliases: ["web", "website", "url"],
      dbField: "website",
      required: false,
      transform: normalizeUrl,
    },
    {
      aliases: ["categoria", "category", "tipo", "categoría"],
      dbField: "category",
      required: false,
      transform: trimUpper,
    },
    {
      aliases: ["temperatura", "temperature", "temp"],
      dbField: "temperature",
      required: false,
      transform: trimLower,
    },
    {
      aliases: ["prioridad", "priority"],
      dbField: "priority",
      required: false,
      transform: trimLower,
    },
    {
      aliases: ["empresa", "company", "compañia", "compañía", "nif_empresa"],
      dbField: "_companyLookup",
      required: false,
      transform: trim,
    },
    {
      aliases: ["etiquetas", "tags"],
      dbField: "tags",
      required: false,
      transform: splitTags as unknown as (v: string) => unknown,
    },
    {
      aliases: ["notas", "notes", "observaciones"],
      dbField: "notes",
      required: false,
      transform: trim,
    },
  ],
};

export const SUPPLY_POINT_CONFIG: ImportEntityConfig = {
  entity: "supplyPoints",
  dedupKeys: ["cups", "_companyLookup"],
  autoFields: ["id", "createdAt", "updatedAt"],
  fields: [
    {
      aliases: ["cups", "codigo_cups", "código cups"],
      dbField: "cups",
      required: true,
      transform: trimUpper,
      validate: validateCups,
    },
    {
      aliases: ["empresa", "company", "nif_empresa", "compañia", "compañía"],
      dbField: "_companyLookup",
      required: true,
      transform: trim,
      validate: validateNotEmpty,
    },
    {
      aliases: ["direccion", "address", "ubicacion", "dirección", "ubicación"],
      dbField: "address",
      required: false,
      transform: trim,
    },
    {
      aliases: ["tarifa", "tariff", "tipo_tarifa"],
      dbField: "tariff",
      required: false,
      transform: trimUpper,
      validate: validateTariff,
    },
    {
      aliases: ["potencia_p1", "p1_kw", "pot_p1", "potencia p1", "potencia_p1_kw", "potencia p1 kw"],
      dbField: "powerP1Kw",
      required: false,
      transform: parseNumber as (v: string) => unknown,
      validate: validatePositive,
    },
    {
      aliases: ["potencia_p2", "p2_kw", "pot_p2", "potencia p2", "potencia_p2_kw", "potencia p2 kw"],
      dbField: "powerP2Kw",
      required: false,
      transform: parseNumber as (v: string) => unknown,
      validate: validatePositive,
    },
    {
      aliases: ["potencia_p3", "p3_kw", "pot_p3", "potencia p3", "potencia_p3_kw", "potencia p3 kw"],
      dbField: "powerP3Kw",
      required: false,
      transform: parseNumber as (v: string) => unknown,
      validate: validatePositive,
    },
    {
      aliases: ["potencia_p4", "p4_kw", "pot_p4", "potencia p4", "potencia_p4_kw", "potencia p4 kw"],
      dbField: "powerP4Kw",
      required: false,
      transform: parseNumber as (v: string) => unknown,
      validate: validatePositive,
    },
    {
      aliases: ["potencia_p5", "p5_kw", "pot_p5", "potencia p5", "potencia_p5_kw", "potencia p5 kw"],
      dbField: "powerP5Kw",
      required: false,
      transform: parseNumber as (v: string) => unknown,
      validate: validatePositive,
    },
    {
      aliases: ["potencia_p6", "p6_kw", "pot_p6", "potencia p6", "potencia_p6_kw", "potencia p6 kw"],
      dbField: "powerP6Kw",
      required: false,
      transform: parseNumber as (v: string) => unknown,
      validate: validatePositive,
    },
    {
      aliases: ["consumo_anual", "kwh_anual", "annual_kwh", "consumo anual", "consumo_anual_kwh", "consumo anual kwh"],
      dbField: "annualConsumptionKwh",
      required: false,
      transform: parseNumber as (v: string) => unknown,
      validate: validatePositive,
    },
    {
      aliases: ["gasto_mensual", "eur_mes", "gasto mensual", "coste mensual", "gasto_mensual_eur", "gasto mensual eur", "gasto mensual euros"],
      dbField: "monthlySpendEur",
      required: false,
      transform: parseNumber as (v: string) => unknown,
      validate: validatePositive,
    },
    {
      aliases: ["comercializadora", "retailer", "compañia_electrica", "compañía eléctrica", "comercializadora_actual", "comercializadora actual"],
      dbField: "currentRetailer",
      required: false,
      transform: trim,
    },
    {
      aliases: ["distribuidora", "distributor"],
      dbField: "distributor",
      required: false,
      transform: trim,
    },
    {
      aliases: ["fin_contrato", "contract_end", "vencimiento", "fin contrato"],
      dbField: "contractExpiryDate",
      required: false,
      transform: parseDate as (v: string) => unknown,
    },
    {
      aliases: ["notas", "notes", "observaciones"],
      dbField: "notes",
      required: false,
      transform: trim,
    },
  ],
};

/** Mapa rápido entity → config */
export const ENTITY_CONFIGS: Record<string, ImportEntityConfig> = {
  companies: COMPANY_CONFIG,
  contacts: CONTACT_CONFIG,
  supplyPoints: SUPPLY_POINT_CONFIG,
};

// ─── Utilidades de alias ──────────────────────────────────────────────────────

/** Normaliza un header a formato comparable: lowercase, sin tildes, sin espacios extra */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // elimina diacríticos
    .replace(/[^a-z0-9_\s]/g, "")   // solo alfanuméricos y espacios
    .replace(/\s+/g, "_")           // espacios a guiones bajos
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Dado un array de headers del archivo y un EntityConfig,
 * devuelve el mapeo headerIndex → dbField
 */
export function detectHeaderMapping(
  headers: string[],
  config: ImportEntityConfig
): { mapping: Record<number, string>; unmapped: string[] } {
  const mapping: Record<number, string> = {};
  const mapped = new Set<number>();

  for (const field of config.fields) {
    const normalizedAliases = field.aliases.map(normalizeHeader);
    for (let i = 0; i < headers.length; i++) {
      if (mapped.has(i)) continue;
      const nh = normalizeHeader(headers[i]);
      if (normalizedAliases.includes(nh)) {
        mapping[i] = field.dbField;
        mapped.add(i);
        break;
      }
    }
  }

  const unmapped = headers.filter((_, i) => !mapped.has(i));
  return { mapping, unmapped };
}
