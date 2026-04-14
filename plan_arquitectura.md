# Paquete J — Smart invoice search & extraction

**Fecha**: 2026-04-14
**Scope**: hacer que el agente encuentre y extraiga facturas con cualquier
variación de input (mayúsculas, guiones, espacios, prefijos ES, CIF
deformado, fuzzy match en nombres).

---

## Problemas reales identificados

| Problema | Ejemplo |
|---|---|
| Mayúsculas/minúsculas | "buen fin de mes" vs "BUEN FIN DE MES, S.L." |
| Guiones en CIF | "B10730505" vs "B-10730505" vs "B 10730505" |
| Prefijos ES en VAT | "ESB10730505" |
| Acentos | "Telefónica" vs "Telefonica" |
| Sufijos sociales | ", S.L." vs "SL" vs "S.L.U." |
| Nombre comercial vs razón social | "Iberdrola" vs "Iberdrola Clientes SAU" |
| Búsqueda parcial | "buen fin" debería encontrar "buen fin de mes sl" |

---

## Arquitectura

### 1. Capa de normalización

Helpers puros en `src/lib/text/normalize.ts`:

- `normalizeNif(s)` → uppercase, strip non-alphanumeric, strip leading "ES"
  - "B-10730505" → `B10730505`
  - "ESB10730505" → `B10730505`
  - "b 10 730 505" → `B10730505`

- `normalizeName(s)` → lowercase, strip accents (NFD), collapse whitespace,
  strip common suffixes (sl, sa, slu, sc, scp), strip punctuation
  - "Buen Fin de Mes, S.L." → `buen fin de mes`
  - "BUEN FIN DE MES SL" → `buen fin de mes`
  - "Telefónica Móviles España S.A." → `telefonica moviles espana`

### 2. Columnas normalizadas en DB

`invoices`:
- `issuer_normalized` TEXT (índice trigram)
- `nif_normalized` TEXT (índice btree)

Backfill: actualiza todas las filas existentes con los normalizados.
Trigger / app-level upsert: cada INSERT/UPDATE recalcula.

### 3. Trigram fuzzy search (PostgreSQL)

Extensión `pg_trgm` + índice GIN sobre `issuer_normalized`. Permite:
- `similarity('buen fin de mes', issuer_normalized) > 0.3` → match parcial difuso
- ORDER BY similarity DESC → ranking

### 4. Nueva tool agéntica `find_invoices_smart`

Acepta cualquier combinación:

```ts
{
  text?: string,           // free-text fuzzy en nombre + concepto + nº
  nif?: string,            // normalizado y comparado exacto
  date_from?: string,      // YYYY-MM-DD o "marzo 2026" o "Q2 2026"
  date_to?: string,
  amount_min?: number,
  amount_max?: number,
  category?: string,
  status?: 'overdue'|'pending'|'paid'|'all',
  limit?: number
}
```

Devuelve facturas rankeadas por similaridad + fecha desc.

### 5. Mejoras en extracción

`SYSTEM_PROMPT_INVOICE` y `VISION_PROMPTS.invoice` se actualizan para:
- Reconocer NIF español sin importar formato
- Distinguir nombre comercial vs razón social
- Devolver siempre `nif_normalized` también
- Detectar fechas en cualquier formato (DD/MM/YYYY, MM/DD, YYYY-MM-DD,
  "10 de abril de 2026", etc.)

### 6. Actualización del MCP `query_invoices`

Mismo patrón normalizado — Claude Desktop tendrá búsqueda fuzzy también.

---

## Orden de commits

1. **feat: text normalization helpers + DB columns + trigram index + backfill**
2. **feat: find_invoices_smart agentic tool with fuzzy matching**
3. **chore: update extract prompts + MCP query_invoices to use normalized cols**

Cada commit con `tsc` + `lint` + `build` + push.

---

## Criterios de éxito

- Decir *"facturas de buen fin de mes"* encuentra "BUEN FIN DE MES, S.L."
- Decir *"factura del cif b10730505"* encuentra la misma sin importar
  formato del CIF en DB
- *"facturas de marzo"* funciona (parsea mes ES → rango)
- *"facturas de Iberdrola del Q2"* combina nombre + período
- DB actualizada tras backfill: SELECT * WHERE issuer_normalized = 'buen fin de mes'

---

**Procedo.**
