# Runbook: Importador MVP — Staging & Producción

## Resumen

Importador de datos CSV/XLSX para 3 entidades del CRM:

| Entidad | Dedup key | Campos requeridos |
|---------|-----------|-------------------|
| Empresas (`companies`) | NIF | `name` |
| Contactos (`contacts`) | email | `name`, `email` |
| Puntos de suministro (`supplyPoints`) | CUPS + companyId | `cups`, `_companyLookup` (NIF o nombre empresa) |

Orden de importación obligatorio: **Empresas → Contactos → Puntos de suministro** (integridad referencial).

---

## Arquitectura

```
ImportPanel.tsx (UI)
  ↓ POST /api/import (FormData: file + entity + dryRun)
    ↓ parser.ts     → parseFile(buffer, filename, entity)
    ↓ aliases.ts    → detectHeaderMapping + transforms + validations
    ↓ importer.ts   → importFile(rows, entity, options)
      ↓ dedup (findCompany/Contact/SupplyPoint)
      ↓ upsert (insert or merge)
      ↓ auditEvents log
```

### Archivos del módulo

| Archivo | Función |
|---------|---------|
| `src/lib/import/types.ts` | Tipos compartidos |
| `src/lib/import/aliases.ts` | Alias de cabeceras, transforms, validaciones |
| `src/lib/import/parser.ts` | Parseo de XLSX/CSV con ExcelJS |
| `src/lib/import/importer.ts` | Dedup + upsert + audit |
| `src/lib/import/index.ts` | Barrel export |
| `src/app/api/import/route.ts` | API Route (POST/GET) |
| `src/components/ImportPanel.tsx` | UI React |

---

## Migración de base de datos

### Migración pendiente: `drizzle/0008_import_client_type.sql`

```sql
ALTER TABLE companies ADD COLUMN IF NOT EXISTS client_type VARCHAR(20);
```

Ejecutar en staging antes del deploy:

```bash
# Opción 1: Drizzle push
npx drizzle-kit push

# Opción 2: SQL directo
psql $DATABASE_URL -f drizzle/0008_import_client_type.sql
```

Verificar:

```sql
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'companies' AND column_name = 'client_type';
```

---

## Límites y seguridad

| Parámetro | Valor |
|-----------|-------|
| Tamaño máximo de archivo | 10 MB |
| Filas máximas por import | 5.000 |
| Concurrencia | 1 import simultáneo por usuario |
| Extensiones permitidas | `.xlsx`, `.xls`, `.csv` |
| Autenticación | NextAuth (session requerida) |

---

## Validaciones por entidad

### Empresas

- `name`: obligatorio, no vacío
- `nif`: formato español (8 dígitos + letra, o letra + 7 dígitos + letra)
- `email`: formato email válido
- `postalCode`: 5 dígitos
- `phone` / `mobile`: normalización a dígitos
- `clientType`: normaliza a `particular` / `autonomo` / `empresa`

### Contactos

- `name`: obligatorio
- `email`: obligatorio, formato válido
- `_companyLookup`: NIF o nombre de empresa existente (resuelve FK)

### Puntos de suministro

- `cups`: obligatorio, formato CUPS válido (ES + 16 dígitos + 2 control)
- `_companyLookup`: obligatorio, NIF o nombre de empresa existente
- `tariff`: si presente, formato `X.Y` válido
- `annualConsumption` / `potenciaContratada`: números positivos (formato español OK)

---

## Comportamiento de upsert

| Campo | Insert | Update |
|-------|--------|--------|
| Campos normales | Se escribe | Se sobreescribe |
| `tags` | Se escribe | Merge (union sin duplicados) |
| `notes` | Se escribe | Append con separador `---` |
| `source` | Se escribe | No se sobreescribe |
| `updatedAt` | Timestamp actual | Timestamp actual |

---

## Dry run

El modo "simulación" (`dryRun: true`) ejecuta todo el pipeline (parseo, validación, dedup) pero NO escribe en base de datos. Devuelve el mismo objeto `ImportResult` con contadores y errores.

Flujo recomendado:
1. Subir archivo con dry run activado
2. Revisar errores y mapping de cabeceras
3. Corregir archivo si hay errores
4. Desactivar dry run e importar definitivamente

---

## Acceso en la UI

**Dashboard → Ajustes → Importar**

El panel está en la sección de Ajustes (config), grupo "General", entre "Firma" y "Agente IA".

---

## Testing

```bash
# Tests específicos del importador (45 tests)
npx vitest run tests/import/import-mvp.test.ts

# Suite completa (2275 tests)
npx vitest run

# TypeScript check
npx tsc --noEmit
```

### Cobertura de tests

- Normalización de cabeceras (diacríticos, espacios, case)
- Detección de alias para las 3 entidades
- Transformaciones: NIF, teléfono, CP, email, URL, CUPS, números españoles, Instagram, tags
- Validaciones: email, NIF, CUPS, tarifa, CP, positivos, campos requeridos
- Configs de entidad: dedup keys, required fields, completitud de alias
- API: validación de entidad, extensiones
- CSV: separadores, campos con comillas

---

## Checklist de despliegue

- [ ] Ejecutar migración `0008_import_client_type.sql`
- [ ] Verificar `npx tsc --noEmit` limpio
- [ ] Verificar `npx vitest run` — 2275/2275 green
- [ ] Deploy a staging
- [ ] Test manual: importar CSV de empresas (dry run → real)
- [ ] Test manual: importar contactos con `_companyLookup` por NIF
- [ ] Test manual: importar puntos de suministro
- [ ] Verificar audit trail en tabla `auditEvents`
- [ ] Test de archivo > 10MB (debe rechazar)
- [ ] Test de concurrencia (2 imports simultáneos del mismo usuario → debe rechazar segundo)
- [ ] Deploy a producción

---

## Troubleshooting

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| "Ya hay una importación en curso" | Lock de concurrencia activo | Esperar a que termine o reiniciar servidor |
| Cabeceras no detectadas | Alias no reconocido | Verificar que la fila 1 contiene cabeceras. Consultar alias en `aliases.ts` |
| "Empresa no encontrada" en contactos | La empresa referenciada no existe | Importar empresas primero |
| Números parseados incorrectamente | Formato mixto ES/EN | Usar formato español consistente (1.234,56) o inglés (1234.56) |
| Error CUPS inválido | Formato incorrecto | Verificar: ES + 16 dígitos + 2 caracteres de control |
