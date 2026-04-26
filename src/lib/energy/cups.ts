/**
 * CUPS (Código Universal del Punto de Suministro) — validación + utilidades.
 *
 * Spec: https://www.boe.es/buscar/act.php?id=BOE-A-2008-7137
 *
 * Formato:
 *   ES + 16 dígitos + 2 letras de control + (opcional) 1 dígito tipo + 1 letra frontera
 *   Total: 20 chars (estándar) o 22 chars (con sufijo de frontera)
 *
 * Ejemplo: ES0031408123456789AB     (luz residencial estándar)
 *          ES0021000012345678WS0F   (gas)
 *
 * Algoritmo control (BOE-A-2008-7137):
 *   El módulo del CUPS sin las dos letras de control: 16 dígitos.
 *   Calcular ese número módulo 529 → resto R.
 *   Tabla letras: 0=T, 1=R, 2=W, 3=A, 4=G, 5=M, 6=Y, 7=F, 8=P, 9=D, 10=X,
 *                 11=B, 12=N, 13=J, 14=Z, 15=S, 16=Q, 17=V, 18=H, 19=L,
 *                 20=C, 21=K, 22=E.
 *   Las dos letras = tabla[Math.floor(R/23)] + tabla[R % 23].
 */

const CONTROL_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/** Validar formato + dígito control. Devuelve { valid, distributor?, error? } */
export function validateCups(input: string): {
  valid: boolean;
  normalized?: string;
  distributorCode?: string;
  meterCode?: string;
  controlLetters?: string;
  borderType?: string;
  error?: string;
} {
  if (!input || typeof input !== "string") {
    return { valid: false, error: "CUPS vacío" };
  }
  const cups = input.trim().toUpperCase().replace(/\s+/g, "");

  // Longitud: 20 (estándar) o 22 (con frontera tipo + letra)
  if (cups.length !== 20 && cups.length !== 22) {
    return { valid: false, error: `Longitud incorrecta (${cups.length}). Debe ser 20 o 22 caracteres.` };
  }

  // Prefijo país
  if (!cups.startsWith("ES")) {
    return { valid: false, error: "Debe empezar por ES (España)" };
  }

  // Estructura: ES + 16 dígitos + 2 letras + (opcional 1 dígito + 1 letra)
  const pattern = /^ES(\d{4})(\d{12})([A-Z]{2})(\d[FPRCXYZ])?$/;
  const m = cups.match(pattern);
  if (!m) {
    return { valid: false, error: "Formato no válido. Esperado: ES + 4 dígitos distribuidor + 12 dígitos contador + 2 letras control [+ 1 dígito + 1 letra frontera opcional]" };
  }

  const [, distributorCode, meterCode, controlLetters, borderType] = m;
  const sixteenDigits = distributorCode + meterCode;

  // Cálculo dígito control
  // BigInt para 16 dígitos sin precisión floating
  // (BigInt(529) en lugar de 529n para compatibilidad con tsconfig target < ES2020)
  const num = BigInt(sixteenDigits);
  const remainder = Number(num % BigInt(529));
  const expected = CONTROL_LETTERS[Math.floor(remainder / 23)] + CONTROL_LETTERS[remainder % 23];

  if (controlLetters !== expected) {
    return {
      valid: false,
      normalized: cups,
      distributorCode,
      meterCode,
      controlLetters,
      borderType,
      error: `Letras de control inválidas. Recibidas: ${controlLetters}, esperadas: ${expected}`,
    };
  }

  return {
    valid: true,
    normalized: cups,
    distributorCode,
    meterCode,
    controlLetters,
    borderType,
  };
}

/**
 * Identifica el distribuidor a partir del código de 4 dígitos del CUPS.
 * No es exacto (la AEAT mantiene un registro completo), pero los principales
 * son fijos.
 */
const KNOWN_DISTRIBUTORS: Record<string, string> = {
  "0021": "I-DE Redes Eléctricas Inteligentes (Iberdrola)",
  "0022": "Unión Fenosa Distribución (Naturgy)",
  "0023": "E-distribución Redes Digitales (Endesa)",
  "0024": "Hidrocantábrico (EDP)",
  "0025": "Estabanell Energía",
  "0026": "Bassols Energía",
  "0028": "Electra Caldense",
  "0029": "Electra del Cardener",
  "0030": "ASCEME",
  "0031": "Electra del Maestrazgo",
  "0036": "Eléctrica de Cádiz",
  "0038": "Eléctrica de Guadassuar",
  "0039": "Eléctrica Sollerense",
  "0040": "Eléctricas Pitiusas",
  "0050": "Repsol Butano (gas)",
  "0234": "Naturgy distribución gas",
};

export function identifyDistributor(distributorCode: string): string {
  return KNOWN_DISTRIBUTORS[distributorCode] || `Distribuidor desconocido (código ${distributorCode})`;
}

/**
 * Helper combinado: valida + identifica distribuidor + tipo (gas/luz).
 */
export function parseCups(input: string): ReturnType<typeof validateCups> & {
  distributor?: string;
  fuel?: "electricidad" | "gas" | "desconocido";
} {
  const result = validateCups(input);
  if (!result.valid) return result;
  const distributor = identifyDistributor(result.distributorCode!);
  // Heurística: códigos conocidos de gas vs luz
  const gasCodes = new Set(["0050", "0234"]);
  const fuel = gasCodes.has(result.distributorCode!) ? "gas" : "electricidad";
  return { ...result, distributor, fuel };
}
