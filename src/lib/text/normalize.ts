/**
 * Text normalization helpers for invoice search & dedup.
 *
 * Goal: any human-typed variation of an issuer name or NIF should map to
 * the same normalized form for reliable lookup.
 *
 * All functions are pure (no IO, deterministic).
 */

/**
 * Normalize a Spanish NIF / CIF / DNI / NIE to a comparable form.
 *
 * Rules:
 *  - Uppercase
 *  - Strip every char that's not [A-Z0-9]
 *  - Strip leading "ES" (used in EU VAT format ESB10730505)
 *  - Empty → empty string
 *
 * Examples:
 *   "B-10730505"         → "B10730505"
 *   "b 10 730 505"       → "B10730505"
 *   "ESB10730505"        → "B10730505"
 *   "  B10730505  "      → "B10730505"
 *   "12345678-X"         → "12345678X"
 */
export function normalizeNif(input: string | null | undefined): string {
  if (!input) return "";
  let s = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.startsWith("ES") && s.length > 8) s = s.slice(2);
  return s;
}

/**
 * Strip Spanish accents and diacritics, lowercase, collapse whitespace,
 * remove punctuation.
 *
 *   "Telefónica"         → "telefonica"
 *   "  Endesa,  S.A.  "  → "endesa sa"
 */
function baseNormalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Common Spanish corporate suffixes — stripped to compare names by their
 * meaningful core. We strip BOTH whole-word and abbreviated forms.
 */
const CORPORATE_SUFFIXES = new Set([
  "sl",
  "slu",
  "sa",
  "sau",
  "sl labor",
  "slne",
  "sc",
  "scp",
  "soc coop",
  "cb",
  "cooperativa",
  "asociacion",
  "fundacion",
  "limited",
  "ltd",
  "inc",
  "llc",
  "gmbh",
  "ag",
]);

/**
 * Collapse trailing single-character tokens into a single abbreviation token.
 * "buen fin de mes s l" → "buen fin de mes sl"
 * "iberdrola clientes s a u" → "iberdrola clientes sau"
 *
 * Required because `baseNormalize` turns "S.L." into "s l" (separate tokens).
 */
function collapseTrailingAbbreviations(tokens: string[]): string[] {
  const result = [...tokens];
  let abbrev = "";
  while (result.length > 0 && result[result.length - 1].length === 1) {
    abbrev = result.pop()! + abbrev;
  }
  if (abbrev) result.push(abbrev);
  return result;
}

/**
 * Normalize an issuer / company name for fuzzy comparison.
 *
 * Pipeline:
 *  1. baseNormalize (lowercase, strip accents, strip punctuation)
 *  2. collapse trailing single-letter abbreviation tokens ("s l" → "sl")
 *  3. drop trailing corporate suffixes (sl/sa/slu/sau/...)
 *  4. collapse whitespace
 *
 * Examples:
 *   "Buen Fin de Mes, S.L."        → "buen fin de mes"
 *   "BUEN FIN DE MES SL"           → "buen fin de mes"
 *   "BUEN-FIN-DE-MES,SLU"          → "buen fin de mes"
 *   "Telefónica Móviles España SA" → "telefonica moviles espana"
 *   "Iberdrola Clientes, S.A.U."   → "iberdrola clientes"
 *   "Orihuela Gas S.L."            → "orihuela gas"
 */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return "";
  const base = baseNormalize(input);
  if (!base) return "";
  let tokens = base.split(" ");

  tokens = collapseTrailingAbbreviations(tokens);

  // Strip trailing single-token suffixes (sl, sa, slu, ...)
  while (tokens.length > 1 && CORPORATE_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  // Also try 2-word suffixes from the tail ("soc coop")
  if (tokens.length > 2) {
    const tail2 = `${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`;
    if (CORPORATE_SUFFIXES.has(tail2)) {
      tokens.pop();
      tokens.pop();
    }
  }

  return tokens.join(" ").trim();
}

/**
 * Looser normalization: like normalizeName but also strips very common
 * Spanish stopwords ("de", "del", "la", "el", "y") for stricter matching.
 */
export function normalizeNameStrict(input: string | null | undefined): string {
  const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "o", "u"]);
  return normalizeName(input)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t))
    .join(" ");
}

/**
 * Compute both normalized fields for an invoice row.
 * Use as: `await db.insert(...).values({ ...data, ...invoiceNormalizedFields(data.issuerName, data.issuerNif) })`
 */
export function invoiceNormalizedFields(
  issuerName: string | null | undefined,
  issuerNif: string | null | undefined,
): { issuerNormalized: string | null; nifNormalized: string | null } {
  const i = normalizeName(issuerName);
  const n = normalizeNif(issuerNif);
  return {
    issuerNormalized: i || null,
    nifNormalized: n || null,
  };
}

/**
 * Quick equality check after normalization.
 */
export function nifEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeNif(a);
  const nb = normalizeNif(b);
  return na !== "" && na === nb;
}

/**
 * Return true if `query` is a substring of `target` after normalization.
 */
export function containsNormalized(target: string | null | undefined, query: string): boolean {
  const t = normalizeName(target);
  const q = normalizeName(query);
  return q !== "" && t.includes(q);
}

// ─── Spanish date/period parsing ─────────────────────────────────────────

const SPANISH_MONTHS: Record<string, number> = {
  enero: 1, ene: 1,
  febrero: 2, feb: 2,
  marzo: 3, mar: 3,
  abril: 4, abr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6,
  julio: 7, jul: 7,
  agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9,
  octubre: 10, oct: 10,
  noviembre: 11, nov: 11,
  diciembre: 12, dic: 12,
};

/**
 * Parse a flexible Spanish period expression into [from, to] dates (inclusive).
 *
 * Accepts:
 *  - "marzo"            → current year March
 *  - "marzo 2026"       → 2026-03-01 .. 2026-03-31
 *  - "Q1" / "1T"        → current year Q1
 *  - "Q2 2025"          → 2025-04-01 .. 2025-06-30
 *  - "2026"             → whole year
 *  - "ultimo mes" / "ultimos 30 dias" → relative
 *  - YYYY-MM-DD passes through directly
 *
 * Returns null if can't parse.
 */
export function parseSpanishPeriod(input: string): { from: Date; to: Date } | null {
  if (!input) return null;
  const s = baseNormalize(input);
  const now = new Date();

  // ISO date
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const d = new Date(s);
    return { from: d, to: d };
  }

  // YYYY (full year)
  const year = /^(\d{4})$/.exec(s);
  if (year) {
    const y = Number(year[1]);
    return { from: new Date(y, 0, 1), to: new Date(y, 11, 31, 23, 59, 59) };
  }

  // YYYY-MM
  const ym = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (ym) {
    const y = Number(ym[1]);
    const m = Number(ym[2]) - 1;
    return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0, 23, 59, 59) };
  }

  // Quarter: q1 / q1 2026 / 1t / 1t 2026
  const qm = /^q?([1-4])t?\s*(\d{4})?$/.exec(s) || /^([1-4])t\s*(\d{4})?$/.exec(s);
  if (qm) {
    const q = Number(qm[1]);
    const y = Number(qm[2]) || now.getFullYear();
    const startMonth = (q - 1) * 3;
    return {
      from: new Date(y, startMonth, 1),
      to: new Date(y, startMonth + 3, 0, 23, 59, 59),
    };
  }

  // Spanish month with optional year
  const monthMatch = /^([a-z]+)\s*(\d{4})?$/.exec(s);
  if (monthMatch) {
    const monthNum = SPANISH_MONTHS[monthMatch[1]];
    if (monthNum) {
      const y = Number(monthMatch[2]) || now.getFullYear();
      return {
        from: new Date(y, monthNum - 1, 1),
        to: new Date(y, monthNum, 0, 23, 59, 59),
      };
    }
  }

  // Relative: "ultimo mes" / "ultimos 30 dias" / "ultima semana"
  if (s.includes("hoy")) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start, to: now };
  }
  if (s.includes("ayer")) {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    yest.setHours(0, 0, 0, 0);
    const end = new Date(yest);
    end.setHours(23, 59, 59);
    return { from: yest, to: end };
  }
  const lastDays = /ultim[oa]s?\s*(\d+)\s*d[ií]as?/.exec(s);
  if (lastDays) {
    const days = Number(lastDays[1]);
    return { from: new Date(now.getTime() - days * 86_400_000), to: now };
  }
  if (s.includes("ultim") && s.includes("semana")) {
    return { from: new Date(now.getTime() - 7 * 86_400_000), to: now };
  }
  if (s.includes("ultim") && s.includes("mes")) {
    return { from: new Date(now.getTime() - 30 * 86_400_000), to: now };
  }
  if (s.includes("este") && s.includes("mes")) {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
    };
  }
  if (s.includes("este") && (s.includes("ano") || s.includes("año"))) {
    return {
      from: new Date(now.getFullYear(), 0, 1),
      to: new Date(now.getFullYear(), 11, 31, 23, 59, 59),
    };
  }

  return null;
}
