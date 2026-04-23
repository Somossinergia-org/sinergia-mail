# Importador MVP — Documento de Implementación Real

## 1. Inventario exacto de archivos

### Archivos creados (8)

| Archivo | Líneas | Función |
|---------|--------|---------|
| `src/lib/import/types.ts` | 81 | Tipos TypeScript compartidos: `ImportEntity`, `ImportResult`, `ImportRowResult`, `ImportOptions`, `ParsedRow`, `RowValidationError`, `ImportFieldMapping`, `ImportEntityConfig`, `ClientType` |
| `src/lib/import/aliases.ts` | 550 | Diccionarios de alias de cabeceras, funciones de transformación (11), validadores (7), configuración de 3 entidades (`COMPANY_CONFIG`, `CONTACT_CONFIG`, `SUPPLY_POINT_CONFIG`), `normalizeHeader()`, `detectHeaderMapping()` |
| `src/lib/import/parser.ts` | 234 | Parser de XLSX/CSV con ExcelJS. Autodetección de separador CSV (`;` vs `,`). Parseo de celdas (string, number, Date, richText, formula). Límites: 10MB, 5000 filas |
| `src/lib/import/importer.ts` | 486 | Motor de dedup + upsert. Funciones: `findCompany` (NIF → nombre), `findContact` (email), `findSupplyPoint` (CUPS+companyId), `resolveCompanyId`, `upsertCompany`, `upsertContact`, `upsertSupplyPoint`, `logImportAudit`, `importFile` |
| `src/lib/import/index.ts` | 19 | Barrel export público del módulo |
| `src/app/api/import/route.ts` | 173 | API Route con POST (importar) y GET (info entidades). Auth, lock concurrencia, validación archivo |
| `src/components/ImportPanel.tsx` | 322 | UI React: selector de entidad, upload, dry run, resultados, mapping, errores |
| `tests/import/import-mvp.test.ts` | 389 | 45 tests: normalización, alias, transforms, validaciones, configs, API, CSV |

### Archivos modificados (3)

| Archivo | Cambio exacto |
|---------|---------------|
| `src/db/schema.ts` (~línea 672) | Añadido `clientType: varchar("client_type", { length: 20 })` a tabla `companies` |
| `src/app/dashboard/page.tsx` (líneas 62, 502, 522) | Import de `ImportPanel` + `Upload` icon. Sub-tab `{ id: "importar", label: "Importar" }` en sección config (grupo General, entre Firma y Agente IA). Render: `{sub === "importar" && <ImportPanel />}` |
| `tests/crm/phase12b-cleanup.test.ts` | Assertion 12→13 sub-tabs. Añadido check `<ImportPanel`. Slice 2000→2500 |
| `tests/crm/phase12-consolidation.test.ts` | Slice 2000→2500 en test de FineTuningPanel |

### Migración creada (1)

| Archivo | SQL |
|---------|-----|
| `drizzle/0008_import_client_type.sql` | `ALTER TABLE companies ADD COLUMN IF NOT EXISTS client_type VARCHAR(20);` |

---

## 2. Endpoints creados

### `POST /api/import`

**Input:** FormData con 3 campos:
- `file` — archivo `.xlsx`, `.xls` o `.csv` (max 10MB)
- `entity` — `"companies"` | `"contacts"` | `"supplyPoints"`
- `dryRun` — `"true"` | `"false"` (opcional, default `"false"`)

**Auth:** NextAuth session obligatoria. Devuelve 401 sin sesión.

**Concurrencia:** Lock por `userId` en memoria (`Set<string>`). Devuelve 429 si ya hay import activo del mismo usuario.

**Validaciones previas al procesamiento:**
1. Sesión activa (401)
2. Lock de concurrencia (429)
3. File presente (400)
4. Entity válida (400)
5. Tamaño ≤ 10MB (400)
6. Extensión `.xlsx`/`.xls`/`.csv` (400)

**Output (200):** JSON con estructura exacta:

```typescript
{
  success: true,
  dryRun: boolean,
  entity: "companies" | "contacts" | "supplyPoints",
  totalRows: number,
  inserted: number,
  updated: number,
  skipped: number,
  errors: number,
  headerMapping: { [headerOriginal: string]: campoDestino },
  unmappedHeaders: string[],
  durationMs: number,
  rows: [
    {
      rowIndex: number,        // 1-based (excluyendo header)
      action: "inserted" | "updated" | "skipped" | "error",
      entityId?: number,       // ID del registro insertado/actualizado
      errors?: [
        {
          rowIndex: number,
          field: string,
          value: unknown,
          message: string
        }
      ],
      rawPreview?: { ... }    // Solo para filas con error (max 5 campos, 100 chars cada uno)
    }
  ]
}
```

**Output (error):** `{ error: string }` con status 400/401/429/500.

### `GET /api/import`

**Auth:** NextAuth session obligatoria.

**Output:** Info estática sobre entidades disponibles, labels, descripciones, orden de importación, límites.

---

## 3. Componente UI

**Archivo:** `src/components/ImportPanel.tsx`  
**Ruta en la app:** Dashboard → Ajustes → Importar  
**Ruta técnica:** `page.tsx` línea 502, sub-tab `"importar"` dentro de `activeTab === "config"`

**Flujo UI:**
1. Seleccionar entidad (3 botones card: Empresas, Contactos, Puntos de suministro)
2. Subir archivo (drag & drop o click, acepta `.xlsx`, `.xls`, `.csv`)
3. Checkbox "Modo simulación (dry run)" — activado por defecto
4. Botón "Importar" / "Simular importación"
5. Resultados: contadores (total/insertados/actualizados/errores), mapping expandible, tabla de errores (max 50)

---

## 4. Arquitectura del importador

```
Usuario
  │
  ▼
ImportPanel.tsx ──POST──▶ /api/import/route.ts
                            │
                            ├─ 1. Auth check (NextAuth)
                            ├─ 2. Concurrency lock (Set<userId>)
                            ├─ 3. File validation (size, extension)
                            │
                            ▼
                         importFile(buffer, entity, options)
                            │
                            ├─ 4. parseFile() [parser.ts]
                            │     ├─ ExcelJS.load() o CSV manual
                            │     ├─ Leer headers fila 1
                            │     ├─ detectHeaderMapping() [aliases.ts]
                            │     │     └─ normalizeHeader() por cada header
                            │     │     └─ Match contra aliases del EntityConfig
                            │     ├─ Verificar campos required en mapping
                            │     ├─ Por cada fila:
                            │     │     ├─ Leer celdas raw
                            │     │     ├─ Mapear a campos destino
                            │     │     ├─ Aplicar transform()
                            │     │     └─ Aplicar validate()
                            │     └─ Return { rows, headerMapping, unmappedHeaders, errors }
                            │
                            ├─ 5. Si errores críticos (missing required headers) → return
                            │
                            ├─ 6. Por cada fila válida:
                            │     ├─ Si tiene errores de validación → action:"error"
                            │     ├─ Si está vacía → action:"skipped"
                            │     └─ upsertEntity() [importer.ts]
                            │           ├─ Buscar duplicado (dedup)
                            │           ├─ Si dryRun → return action sin escribir
                            │           ├─ Si existe → update (merge tags, append notes)
                            │           └─ Si no existe → insert
                            │
                            ├─ 7. logImportAudit() → auditEvents (fire & forget)
                            │
                            └─ 8. Return ImportResult
```

---

## 5. Reglas de deduplicación implementadas (código real)

### Empresas (`findCompany` — importer.ts:23-45)

1. **Primario: NIF** — `WHERE userId = ? AND nif = ?` (exact match, case-sensitive después de normalización a uppercase)
2. **Fallback: nombre** — `WHERE userId = ? AND name ILIKE ?` (case-insensitive)
3. Si encuentra por NIF, no busca por nombre
4. Si no tiene NIF, busca solo por nombre
5. Scope: siempre filtrado por `userId` (multitenant)

### Contactos (`findContact` — importer.ts:50-59)

1. **Único: email** — `WHERE userId = ? AND email = ?` (exact match, ya lowercase por transform)
2. No hay fallback
3. Scope: filtrado por `userId`

### Puntos de suministro (`findSupplyPoint` — importer.ts:65-80)

1. **Compuesto: CUPS + companyId** — `WHERE cups = ? AND companyId = ?`
2. El `companyId` se resuelve previamente con `resolveCompanyId()`
3. **No filtrado por userId** — un CUPS + empresa es único globalmente

### Resolución de FK (`resolveCompanyId` — importer.ts:85-98)

1. El campo `_companyLookup` del CSV puede contener NIF o nombre de empresa
2. Se intenta primero como NIF: si pasa regex `/^[A-Z0-9]{8,10}$/i` → busca por NIF
3. Si no encuentra por NIF (o no parece NIF) → busca por nombre (ilike)
4. Si no encuentra empresa → error con mensaje explícito

---

## 6. Validaciones implementadas (código real en aliases.ts)

### Por campo

| Validador | Función | Lógica exacta |
|-----------|---------|----------------|
| `validateNotEmpty` | Campos required | `null`, `undefined`, o string vacío/solo espacios → error |
| `validateEmail` | email | Regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` |
| `validateNif` | nif | Regex: `/^[A-Z0-9]{8,10}$/i` (después de normalizar: quitar espacios, guiones, puntos) |
| `validatePostalCode` | postalCode | Regex: `/^\d{5}$/` + prefijo provincial 01-52 |
| `validatePositive` | potencias, consumos, gastos | `typeof number && < 0` → error |
| `validateCups` | cups | Longitud 20-22 chars + debe empezar por `"ES"` |
| `validateTariff` | tariff | Whitelist exacta: `2.0TD, 3.0TD, 6.1TD, 6.2TD, 6.3TD, 6.4TD` |

### Por transformación

| Transform | Función | Lógica exacta |
|-----------|---------|----------------|
| `normalizeNif` | nif | Quita `[\s\-\.]`, uppercase |
| `normalizePhone` | phone, phone2 | Quita `[\s\-\.\(\)]`. Si 9 dígitos → prepend `+34`. Si empieza `34` sin `+` → prepend `+` |
| `normalizePostalCode` | postalCode | Quita no-dígitos, padStart 5 con `0`, corta a 5 |
| `parseNumber` | potencias, consumo, gasto | Quita `€$%\s`. Si tiene `,` → quita `.` (miles) y reemplaza `,` por `.` (decimal). Formato español: `1.234,56€` → `1234.56` |
| `parseDate` | contractExpiryDate | Acepta: `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`, `YYYY-MM-DD`. Años de 2 dígitos → +2000 |
| `splitTags` | tags | Split por `,`, `;` o `|`. Trim cada uno. Filtra vacíos |
| `normalizeUrl` | website | Si no tiene `http://` ni `https://` → prepend `https://` |
| `normalizeInstagram` | instagram | Quita `@` inicial. Quita `https://instagram.com/` prefijo |
| `normalizeClientType` | clientType | Mapa: `particular→particular`, `autónomo/autonomo→autonomo`, `empresa/pyme/sociedad/sl/sa→empresa` |
| `capitalize` | name, city, province | Primera letra uppercase, resto lowercase |
| `trimLower` | email | trim + lowercase |
| `trimUpper` | cups, category | trim + uppercase |

---

## 7. Comportamiento de upsert (código real en importer.ts)

### Insert (registro nuevo)

| Campo | Valor |
|-------|-------|
| Todos los campos mapeados | Valor transformado del CSV |
| `userId` | ID del usuario que importa |
| `source` | Valor del CSV, o `"csv_import"` si no viene |
| `createdBy` | userId (solo companies) |
| `_companyLookup` | Se elimina (campo virtual, no va a DB) |

### Update (registro existente)

| Campo | Comportamiento |
|-------|---------------|
| Campos normales | Sobreescribe con nuevo valor |
| `source` | **No se toca** (`delete updateData.source`) |
| `tags` | **Merge**: `Array.from(new Set([...existingTags, ...newTags]))` — unión sin duplicados |
| `notes` | **Append**: `existingNotes + "\n---\n" + newNotes` |
| `updatedAt` | `new Date()` |

**Nota importante**: El merge de tags solo se ejecuta si `updateData.tags` es un array. Si la fila del CSV no trae tags, los tags existentes se preservan intactos.

---

## 8. Limitaciones reales del MVP

1. **Sin transacción global** — Cada fila se procesa independientemente. Si la fila 50 falla, las 49 anteriores ya están en DB. Decisión deliberada para maximizar filas importadas.

2. **Lock de concurrencia en memoria** — El `Set<string>` se pierde si el servidor se reinicia o hay múltiples instancias. En un deploy serverless, cada cold start tiene su propio Set vacío.

3. **Sin rollback** — No hay forma de deshacer una importación. El audit trail registra qué se hizo, pero no hay botón "deshacer".

4. **Dedup de empresas por nombre es ilike** — Si tienes "ACME SL" y "Acme SL" las considera la misma. Pero "ACME" y "ACME SL" serían diferentes.

5. **Resolución de empresa en contactos/supplyPoints es best-effort** — Si el `_companyLookup` no coincide exactamente con NIF ni con nombre (ilike), la fila da error. No hay fuzzy matching.

6. **CUPS validation es básica** — Solo verifica longitud (20-22) y prefijo `ES`. No valida dígitos de control.

7. **NIF validation es básica** — Solo verifica formato `/^[A-Z0-9]{8,10}$/i`. No valida la letra de control del DNI ni el dígito de control del CIF.

8. **Sin preview del archivo antes de importar** — El dry run parsea, valida y simula dedup, pero no muestra un preview tabular de los datos antes de procesar.

9. **CSV separator autodetect limitado** — Solo detecta `;` vs `,` basándose en la primera línea. Si la primera línea tiene ambos, gana `;`.

10. **ExcelJS formula values** — Si una celda tiene fórmula, se toma el `result` cacheado. Si el archivo se guardó sin recalcular, el valor puede estar desactualizado.

11. **Max 5000 filas** — Hardcoded en `DEFAULT_MAX_ROWS`. Las filas más allá se ignoran silenciosamente.

12. **Tarifas hardcoded** — Solo acepta `2.0TD, 3.0TD, 6.1TD, 6.2TD, 6.3TD, 6.4TD`. Si hay otras tarifas válidas en el negocio, habrá que ampliar la whitelist.

13. **Sin progreso en tiempo real** — El POST bloquea hasta terminar. En 5000 filas con queries de dedup, puede tardar. No hay SSE ni polling de progreso.

---

## 9. Supuestos tomados en la implementación

1. **Orden de importación es responsabilidad del usuario** — El sistema no lo impone. Si intentas importar contactos con `_companyLookup` apuntando a empresas que no existen, cada fila dará error con mensaje claro, pero el sistema no bloquea la acción.

2. **Un NIF identifica unívocamente a una empresa dentro de un tenant** — No se contempla que dos empresas del mismo usuario tengan el mismo NIF.

3. **Un email identifica unívocamente a un contacto dentro de un tenant** — No se contempla que dos personas compartan email en los datos del mismo usuario.

4. **El campo `_companyLookup` puede ser NIF o nombre indistintamente** — El sistema intenta primero como NIF (si pasa el regex), luego como nombre. No hay forma de forzar uno u otro.

5. **`source` solo se escribe en insert, nunca en update** — Si una empresa fue creada manualmente y luego aparece en un CSV, su source original se preserva.

6. **El import siempre pertenece al userId de la sesión** — No hay posibilidad de importar para otro usuario.

7. **Formato numérico español es el default** — Si el CSV tiene `1.234,56`, se interpreta como 1234.56. Si tiene `1234.56` (sin coma), se interpreta correctamente como 1234.56. La heurística es: "si hay coma, los puntos son miles".

8. **Headers en fila 1, datos desde fila 2** — No se buscan headers en otras filas. Si la fila 1 no tiene headers reconocibles, la importación falla.

9. **Solo primera hoja del Excel** — `workbook.worksheets[0]`. Hojas adicionales se ignoran.

10. **Audit trail no bloquea** — Si falla la escritura en `auditEvents`, el import se completa igual. El error se loguea por console.error y se traga.
