# BLUEPRINT TÉCNICO — FASE 1 DE UNIFICACIÓN

**Fecha:** 21 de abril de 2026
**Base aprobada:** Opción A — Sinergia como base + piezas de CRM Energía
**Alcance:** Cimientos: schema, roles, limpieza, CI/CD

---

## 1. RESUMEN EJECUTIVO DE FASE 1

**Objetivo:** Preparar Sinergia para recibir las capacidades comerciales y de energía de CRM Energía, sin romper nada de lo que funciona hoy.

**Qué se hace:**
- Crear 6 tablas nuevas en Drizzle (companies, supply_points, opportunities, services, documents, energy_bills)
- Ampliar `users` con campo `role` (admin/comercial/supervisor)
- Vincular `cases` opcionalmente a companies y opportunities
- Evolucionar `contacts` para que tenga FK a companies
- Crear migraciones formales para TODAS las tablas v2 (incluidas las que faltan)
- Eliminar código muerto (personalities.ts, context-packs.ts, legacy aliases, Notion fake)
- Unificar prompts en knowledge.ts como fuente única
- Implantar CI/CD con GitHub Actions
- Crear service layer básico para las nuevas entidades (CRUD)

**Qué NO se hace en Fase 1:**
- No se porta el bill parser (Fase 3)
- No se porta la calculadora de ahorro (Fase 3)
- No se porta el pipeline Kanban UI (Fase 2)
- No se porta email marketing de CRM Energía (Fase 4)
- No se porta agenda/FullCalendar (Fase 4)
- No se porta propuestas PDF (Fase 3)
- No se reorganiza la navegación/UX (Fase 6)
- No se tocan los 10 agentes ni el swarm
- No se toca el panel de operaciones
- No se toca el chat

**Duración estimada:** 4-5 días de trabajo concentrado.

---

## 2. QUÉ ENTRA Y QUÉ NO ENTRA

### ENTRA en Fase 1

| Entregable | Tipo | Razón |
|-----------|------|-------|
| Tabla `companies` | Schema nuevo | Entidad central del CRM unificado |
| Tabla `supply_points` | Schema nuevo | Suministros energéticos con CUPS |
| Tabla `opportunities` | Schema nuevo | Pipeline de ventas (10 estados) |
| Tabla `services` | Schema nuevo | Servicios multiproducto |
| Tabla `documents` | Schema nuevo | Documentos vinculados a empresa |
| Tabla `energy_bills` | Schema nuevo | Facturas energéticas parseadas (persistencia del bill parser futuro) |
| Campo `role` en `users` | Schema modificado | Roles admin/comercial/supervisor |
| Campo `companyId` en `contacts` | Schema modificado | Vincular contactos a empresas |
| Campos `companyId` + `opportunityId` en `cases` | Schema modificado | Vincular casos al CRM |
| Migración Drizzle formal completa | Infra | Incluye runtime_switches y rate_limit_counters que faltan |
| CI/CD GitHub Actions | Infra | Lint + typecheck + tests en push |
| Eliminar personalities.ts | Limpieza | Código muerto |
| Eliminar context-packs.ts | Limpieza | Código muerto |
| Eliminar executeParallelSwarm() | Limpieza | Deprecated |
| Eliminar LEGACY_AGENT_ID_ALIASES | Limpieza | Obsoleto |
| Eliminar Notion fake tools | Limpieza | Teatro técnico |
| Unificar prompts → knowledge.ts | Limpieza | Triple fuente → una sola |
| Service layer CRUD básico (companies, contacts, opportunities) | Backend | Base para Fase 2 |
| Tests de schema + service layer | Tests | Verificación de las nuevas entidades |

### NO ENTRA en Fase 1

| Componente | Fase prevista | Razón |
|-----------|--------------|-------|
| Pipeline Kanban UI | Fase 2 | Necesita las entidades de Fase 1 |
| Ficha de empresa UI | Fase 2 | Necesita companies + contacts + services |
| Bill parser (portar de CRM Energía) | Fase 3 | Necesita supply_points + energy_bills |
| Calculadora de ahorro | Fase 3 | Necesita datos energéticos |
| Propuestas PDF | Fase 3 | Necesita calculadora + services |
| Email marketing (campaigns, tracking) | Fase 4 | Módulo autocontenido, no bloquea |
| Agenda/FullCalendar | Fase 4 | Módulo autocontenido |
| Reorganización de navegación | Fase 6 | Requiere todas las pantallas nuevas |
| Scoring determinista | Fase 2/3 | Requiere datos de energía + interacciones |
| Modificar swarm/agentes | Fase 5 | Solo cuando el CRM esté operativo |

---

## 3. MODELO DE DATOS FASE 1

### Tablas nuevas (6)

#### `companies` — Empresa/negocio

```
companies
├── id            serial PK
├── userId        text FK→users (owner de la cuenta Sinergia)
├── name          text NOT NULL (nombre comercial)
├── legalName     text (razón social)
├── nif           varchar(20)
├── sector        varchar(50) (energía, telecomunicaciones, hostelería, etc.)
├── cnae          varchar(10)
├── address       text
├── city          text
├── province      varchar(50)
├── postalCode    varchar(10)
├── lat           real
├── lng           real
├── phone         text
├── email         text
├── website       text
├── instagram     text
├── facebook      text
├── source        varchar(30) (manual, csv_import, google_places, referido, email_auto)
├── tags          text[]
├── notes         text
├── zoneId        integer (nullable, para zonas geográficas futuras)
├── createdBy     text FK→users (comercial que la captó)
├── createdAt     timestamp
├── updatedAt     timestamp
```
Indexes: userId, nif, province, source

#### `supply_points` — Puntos de suministro energético

```
supply_points
├── id                    serial PK
├── companyId             integer FK→companies CASCADE
├── cups                  varchar(25) UNIQUE (código universal de suministro)
├── address               text (dirección del suministro, puede diferir de la empresa)
├── tariff                varchar(10) (2.0TD, 3.0TD, 6.1TD)
├── powerP1Kw             real
├── powerP2Kw             real
├── powerP3Kw             real
├── powerP4Kw             real
├── powerP5Kw             real
├── powerP6Kw             real
├── annualConsumptionKwh  real
├── monthlySpendEur       real
├── currentRetailer       varchar(100) (comercializadora actual)
├── distributor           varchar(100)
├── contractExpiryDate    timestamp
├── estimatedSavingsEur   real
├── estimatedSavingsPct   real
├── status                varchar(20) DEFAULT 'active' (active, inactive, pending)
├── notes                 text
├── createdAt             timestamp
├── updatedAt             timestamp
```
Indexes: companyId, cups, currentRetailer, contractExpiryDate

#### `opportunities` — Oportunidades de venta (pipeline)

```
opportunities
├── id                  serial PK
├── userId              text FK→users (comercial asignado)
├── companyId           integer FK→companies CASCADE
├── primaryContactId    integer FK→contacts SET NULL
├── title               text NOT NULL
├── description         text
├── status              varchar(30) NOT NULL DEFAULT 'pendiente'
│   CHECK: pendiente, contactado, interesado, visita_programada,
│          visitado, oferta_enviada, negociacion, contrato_firmado,
│          cliente_activo, perdido
├── temperature         varchar(10) (frio, tibio, caliente)
├── priority            varchar(10) (alta, media, baja)
├── estimatedValueEur   real
├── expectedCloseDate   timestamp
├── lostReason          text
├── source              varchar(30) (manual, email, whatsapp, web, referido)
├── tags                text[]
├── notes               text
├── createdAt           timestamp
├── updatedAt           timestamp
├── closedAt            timestamp
```
Indexes: userId, companyId, status, temperature, priority, expectedCloseDate

#### `services` — Servicios ofertados/contratados

```
services
├── id                serial PK
├── companyId         integer FK→companies CASCADE
├── opportunityId     integer FK→opportunities SET NULL
├── supplyPointId     integer FK→supply_points SET NULL (solo para tipo energía)
├── type              varchar(30) NOT NULL
│   CHECK: energia, telecomunicaciones, alarmas, seguros,
│          agentes_ia, web, crm, aplicaciones
├── status            varchar(20) DEFAULT 'prospecting'
│   CHECK: prospecting, offered, contracted, cancelled
├── currentProvider   text
├── currentSpendEur   real
├── offeredPriceEur   real
├── estimatedSavings  real
├── contractDate      timestamp
├── expiryDate        timestamp
├── data              jsonb (extensiones por tipo de servicio)
├── notes             text
├── createdAt         timestamp
├── updatedAt         timestamp
```
Indexes: companyId, opportunityId, type, status

#### `documents` — Documentos vinculados

```
documents
├── id              serial PK
├── companyId       integer FK→companies CASCADE
├── opportunityId   integer FK→opportunities SET NULL
├── uploadedBy      text FK→users SET NULL
├── name            text NOT NULL
├── type            varchar(30) (contrato, factura, oferta, propuesta, dni, otro)
├── fileUrl         text NOT NULL
├── fileName        text
├── fileSize        integer
├── fileMime        varchar(100)
├── notes           text
├── createdAt       timestamp
├── updatedAt       timestamp
```
Indexes: companyId, opportunityId, type

#### `energy_bills` — Facturas energéticas parseadas

```
energy_bills
├── id                  serial PK
├── supplyPointId       integer FK→supply_points CASCADE
├── documentId          integer FK→documents SET NULL (referencia al PDF original)
├── billingPeriodStart  timestamp
├── billingPeriodEnd    timestamp
├── retailer            varchar(100)
├── totalAmountEur      real
├── energyAmountEur     real
├── powerAmountEur      real
├── taxAmountEur        real
├── electricityTaxEur   real
├── meterRentalEur      real
├── reactiveEur         real
├── consumptionKwh      jsonb (por periodo: {P1: x, P2: y, ...})
├── powerKw             jsonb (por periodo)
├── pricesEurKwh        jsonb (por periodo)
├── confidenceScore     real (0-100, del parser)
├── rawExtraction       jsonb (datos crudos extraídos)
├── parsedAt            timestamp
├── createdAt           timestamp
```
Indexes: supplyPointId, retailer, billingPeriodEnd

### Tablas modificadas (3)

#### `users` — Añadir campo role

```diff
users (existente)
+ role          varchar(20) DEFAULT 'admin'
+               CHECK: admin, comercial, supervisor
+ phone         text
+ firma         text (firma email HTML)
```

Se añade con DEFAULT 'admin' para que los usuarios existentes sigan funcionando sin migración de datos. La lógica de NextAuth no se toca — role es un campo adicional, no un cambio de auth.

#### `contacts` — Añadir FK a companies

```diff
contacts (existente — 27 columnas, se mantienen todas)
+ companyId     integer FK→companies SET NULL
```

El campo `company` (text) actual se mantiene para compatibilidad. `companyId` es la FK real. La migración no fuerza rellenar companyId — los contactos existentes siguen funcionando con company como texto libre. La vinculación se hará progresivamente (manual o script de matching).

#### `cases` — Añadir FK a companies y opportunities

```diff
cases (existente — 11 columnas, se mantienen todas)
+ companyId      integer FK→companies SET NULL
+ opportunityId  integer FK→opportunities SET NULL
```

Ambos nullables. Los casos existentes siguen funcionando sin company/opportunity. Cuando el CRM esté operativo, nuevos casos podrán vincularse automáticamente.

---

## 4. MAPA: TABLAS ACTUALES vs NUEVAS

### Tablas de Sinergia que se MANTIENEN sin cambios

| Tabla | Razón |
|-------|-------|
| `accounts` (NextAuth) | Auth core, no se toca |
| `sessions` (NextAuth) | Auth core |
| `emails` | Canal principal, funciona bien |
| `invoices` | Facturas genéricas, convive con energy_bills |
| `memorySources` | Memoria semántica, funciona bien |
| `emailAccounts` | Multi-cuenta Gmail, funciona bien |
| `emailSummaries` | Resúmenes IA, funciona bien |
| `draftResponses` | Borradores IA |
| `agentLogs` | Logs de agentes |
| `agentConfig` | Config del agente por usuario |
| `memoryRules` | Reglas automáticas |
| `syncState` | Sync Gmail |
| `mcpTokens` | MCP auth |
| `issuedInvoices` | Facturas emitidas |
| `emailSequences` + pasos + enrollments | Drip sequences (se evaluará uso real) |
| `outboundMessages` | Cola omnicanal |
| `subscriptions` + `billingEvents` | Stripe billing |
| `auditEvents` | Auditoría IA — intocable |
| `swarmWorkingMemory` | Estado del swarm — intocable |
| `agentConversations` | Memoria conversacional — intocable |
| `rateLimitCounters` | Rate limits — intocable |
| `runtimeSwitches` | Kill switches — intocable |

### Tablas de Sinergia que se MODIFICAN

| Tabla | Cambio | Impacto |
|-------|--------|---------|
| `users` | +role, +phone, +firma | MÍNIMO — campo nuevo con default, no rompe nada |
| `contacts` | +companyId FK | MÍNIMO — FK nullable, contactos existentes siguen igual |
| `cases` | +companyId, +opportunityId FKs | MÍNIMO — FKs nullables |
| `visits` | +companyId, +contactId FK | MEDIO — visits actual tiene solo texto libre |

### Tablas NUEVAS (inspiradas en CRM Energía)

| Nueva tabla | Inspiración en CRM Energía | Diferencia clave |
|------------|---------------------------|------------------|
| `companies` | `prospects` (40 cols) | Separada de contacto/oportunidad. No es flat |
| `supply_points` | Campo CUPS en `prospects` | Tabla propia: N suministros por empresa |
| `opportunities` | Estado pipeline en `prospects` | Entidad independiente con lifecycle propio |
| `services` | `prospect_servicios` | Prácticamente igual, con FKs a opportunity y supply_point |
| `documents` | `prospect_documents` | Vinculado a company en vez de prospect |
| `energy_bills` | NO EXISTE en CRM Energía | Nueva — persiste datos del bill parser |

### Tablas de CRM Energía que NO se replican

| Tabla de CRM Energía | Razón de no replicar |
|---------------------|---------------------|
| `prospects` | Se descompone en companies + contacts + opportunities |
| `contact_history` | Se usa contactInteractions de Sinergia (+ audit_events para IA) |
| `zones` | Se deja para fase posterior (zoneId nullable en companies) |
| `email_accounts` (SMTP) | Sinergia ya tiene emailAccounts con OAuth |
| `email_campaigns` | Fase 4 |
| `emails_enviados` | Fase 4 |
| `email_tracking` | Fase 4 |
| `email_secuencias` | Sinergia ya tiene emailSequences |
| `prospect_scores` | Se integra en un scoring unificado (Fase 2-3) |
| `prospect_ai_insights` | Se integra en audit/knowledge (Fase 5) |
| `agent_logs` (CRM) | Sinergia tiene auditEvents mucho más rico |
| `email_queue` | Sinergia tiene outboundMessages |

---

## 5. COMPATIBILIDAD CON SINERGIA ACTUAL

### Principio: todo nuevo es nullable/opcional

Ninguna tabla ni campo nuevo es obligatorio para el funcionamiento actual. Todo se añade como nullable o con defaults. Esto significa:

**El swarm sigue funcionando exactamente igual.** `executeSwarm()` busca/crea casos con `clientIdentifier`. Los nuevos campos `companyId` y `opportunityId` en cases son null por defecto. El swarm no los necesita para operar. En fases futuras, se enriquecerán automáticamente.

**El panel de operaciones sigue funcionando.** Consulta `cases` + `auditEvents`. Los nuevos campos no afectan las queries existentes.

**El chat sigue funcionando.** No depende del modelo CRM.

**Email/OCR sigue funcionando.** Son módulos independientes.

**La oficina virtual sigue funcionando.** Depende de office-state-builder que lee audit_events, no tablas CRM.

### Puntos de contacto nuevos (para fases posteriores)

| Punto | Cómo se conectará | Cuándo |
|-------|--------------------|--------|
| Crear caso → vincular a company | `resolveOrCreateCase()` buscará company por clientIdentifier | Fase 2 |
| Agente consulta datos de empresa | Nueva tool `get_company_info` | Fase 5 |
| Pipeline alimenta panel de operaciones | API route nueva | Fase 2 |
| Oportunidad cerrada → crear servicios | Lógica en cases service | Fase 2-3 |

---

## 6. ROLES Y AUTH

### Estado actual de Sinergia

`users` tiene: id, name, email, emailVerified, image. Sin campo role. NextAuth maneja auth vía OAuth (Google). No hay concepto de roles.

### Cambio en Fase 1

Añadir campo `role` a `users`:

```
role: varchar("role", { length: 20 }).default("admin")
```

Valores: `admin`, `comercial`, `supervisor`.

**Por qué default 'admin':** Los usuarios existentes de Sinergia son todos admin (es una app single-tenant de Somos Sinergia). Al añadir el campo con default, no hay migración de datos — todos siguen siendo admin.

### Lo que NO se toca en Fase 1

- **NextAuth sigue siendo el sistema de auth.** No se implementa JWT custom.
- **No se implementa middleware de autorización por roles todavía.** Eso es Fase 2 cuando haya vistas CRM que necesiten filtrado por rol.
- **No se implementa "comercial solo ve sus prospects".** Eso requiere queries filtradas que se añadirán en Fase 2 con las vistas de pipeline.

### Lo que se prepara

- El campo `role` existe y puede leerse desde cualquier server component o API route.
- Se exporta un helper `getUserRole(userId): Promise<"admin" | "comercial" | "supervisor">` en un nuevo `src/lib/auth/roles.ts`.
- En fase 2 se creará middleware `requireRole("admin")` para proteger rutas.

---

## 7. MÓDULOS DE CRM ENERGÍA QUE ENTRAN EN FASE 1

### SÍ entran (como modelo de datos + service layer básico)

| Módulo | Qué se trae | Forma |
|--------|-------------|-------|
| **Modelo empresa/contacto** | Estructura de prospect descompuesta | Tablas nuevas en Drizzle |
| **Pipeline 10 estados** | Los 10 estados como CHECK constraint | Tabla opportunities |
| **Servicios multiproducto** | 8 tipos de servicio | Tabla services |
| **Suministros/CUPS** | Modelo de punto de suministro | Tabla supply_points |
| **Factura energética** | Estructura para persistir datos del parser | Tabla energy_bills |
| **Documentos por empresa** | Modelo de documentos | Tabla documents |

### NO entran todavía

| Módulo | Razón | Fase prevista |
|--------|-------|---------------|
| **Bill parser** (917 líneas) | Necesita supply_points + energy_bills que se crean aquí, pero el parser es Fase 3 | Fase 3 |
| **Calculadora de ahorro** (900 líneas) | Frontend puro, no bloquea | Fase 3 |
| **Propuestas PDF** (Puppeteer) | Necesita calculadora | Fase 3 |
| **Pipeline Kanban UI** | Necesita opportunities + service layer | Fase 2 |
| **Email marketing** (campaigns, tracking) | Módulo autocontenido grande | Fase 4 |
| **Agenda/FullCalendar** | Módulo autocontenido | Fase 4 |
| **Scoring determinista** | Necesita datos de interacciones + energía | Fase 2-3 |
| **Agente IA de ventas** | Necesita CRM funcional | Fase 5 |

---

## 8. LIMPIEZA DE SINERGIA EN FASE 1

### Eliminar (código muerto confirmado)

| Fichero/código | Líneas | Acción |
|---------------|--------|--------|
| `src/lib/agent/personalities.ts` | 156 | DELETE completo |
| `src/lib/agent/context-packs.ts` | 95 | DELETE completo |
| `executeParallelSwarm()` en swarm.ts | ~50 | Eliminar función |
| `LEGACY_AGENT_ID_ALIASES` en swarm.ts | ~20 | Eliminar bloque |
| `getSwarmStatus()` en swarm.ts | ~30 | Eliminar si no tiene imports externos |
| Notion fake tools en swarm.ts WEB_TOOLS | ~40 | Eliminar `notion_search` y `notion_create_page` |
| Imports de personalities.ts en execute.ts | refs | Actualizar o eliminar |
| Imports de context-packs.ts en execute.ts | refs | Actualizar o eliminar |

### Unificar prompts

| Acción | Detalle |
|--------|---------|
| Fuente única: `agent-knowledge.ts` | `buildAgentPrompt()` es la fuente autoritativa |
| Limpiar systemPrompt inline en swarm.ts | Marcarlo como fallback explícito con comentario |
| Corregir bi-scoring knowledge | Su knowledge describe WordPress/web dev — debe describir BI/scoring |
| Añadir consultor-digital | Falta entrada propia en knowledge |

### Congelar (no tocar, no invertir)

| Componente | Razón |
|-----------|-------|
| SMS (channels.ts → sendSMS) | Canal irrelevante |
| Teléfono (channels.ts → makePhoneCall) | Incompleto |
| Telegram (channels.ts → sendTelegram) | Canal irrelevante |
| Tab "outreach" en dashboard | Feature de catálogo |
| Tab "finanzas" en dashboard | Feature de catálogo |
| Forecasting tesorería | Feature de catálogo |
| Fine-tuning pipeline | Sin valor operativo inmediato |

---

## 9. ESTRUCTURA RESULTANTE TRAS FASE 1

```
SINERGIA (post Fase 1)
│
├── NÚCLEO IA (intocado)
│   ├── swarm.ts (10 agentes, gobernanza, delegación)
│   ├── agent-knowledge.ts (fuente única de prompts — LIMPIADO)
│   ├── super-tools.ts (10 tools DB-backed)
│   ├── channels.ts (email, WhatsApp, SMS, Telegram, voz, OCR)
│   ├── memory-engine.ts (4 capas de memoria)
│   └── self-improve.ts (auto-mejora)
│
├── NÚCLEO CRM (NUEVO en Fase 1)
│   ├── src/lib/crm/
│   │   ├── companies.ts      — CRUD empresas
│   │   ├── contacts.ts        — CRUD contactos (evolucionado)
│   │   ├── opportunities.ts   — CRUD oportunidades + pipeline
│   │   ├── services.ts        — CRUD servicios multiproducto
│   │   ├── supply-points.ts   — CRUD suministros/CUPS
│   │   └── types.ts           — Tipos compartidos CRM
│   └── src/db/schema.ts (AMPLIADO con 6 tablas + 3 modificadas)
│
├── NÚCLEO OPERACIONES (intocado)
│   ├── src/lib/cases/ (casos + ownership)
│   ├── src/lib/audit/ (auditoría dual-store)
│   ├── src/lib/office/ (office state builder)
│   ├── src/lib/runtime/ (config, guardrails, switches, rate limits)
│   └── src/lib/crypto/ (cifrado tokens)
│
├── API ROUTES
│   ├── Existentes: /api/agent, /api/office-state, /api/operations, etc. (intocadas)
│   └── Nuevas (Fase 1): /api/crm/companies, /api/crm/contacts (básico)
│
├── UI (intocada en Fase 1)
│   ├── chat/page.tsx
│   ├── dashboard/page.tsx (12 tabs — se reorganizará en Fase 6)
│   ├── AgentOfficeMap.tsx
│   └── operations/
│
├── DOCUMENTOS ENERGÉTICOS (NUEVO en Fase 1 — solo schema)
│   ├── src/db/schema.ts → energy_bills, documents
│   └── (Bill parser se portará en Fase 3)
│
├── AUTH (AMPLIADO)
│   └── src/lib/auth/roles.ts — helper getUserRole()
│
├── INFRA (MEJORADO)
│   ├── .github/workflows/ci.yml (NUEVO — lint, typecheck, test)
│   ├── drizzle/ (migraciones formales completas)
│   └── vitest.config.ts (existente)
│
└── LEGACY ELIMINADO
    ├── ✗ personalities.ts
    ├── ✗ context-packs.ts
    ├── ✗ executeParallelSwarm()
    ├── ✗ LEGACY_AGENT_ID_ALIASES
    └── ✗ Notion fake tools
```

---

## 10. ENTREGABLES CONCRETOS

### Ficheros nuevos

| Fichero | Contenido |
|---------|-----------|
| `drizzle/0002_crm_unification.sql` | Migración: 6 tablas nuevas + ALTER de users, contacts, cases, visits |
| `src/lib/crm/companies.ts` | Service: create, get, list, update, search companies |
| `src/lib/crm/contacts.ts` | Service: create, get, list (con FK a company), link/unlink |
| `src/lib/crm/opportunities.ts` | Service: create, get, list, updateStatus, pipeline stats |
| `src/lib/crm/services.ts` | Service: create, get, list by company/opportunity |
| `src/lib/crm/supply-points.ts` | Service: create, get, list by company |
| `src/lib/crm/types.ts` | Tipos TypeScript compartidos |
| `src/app/api/crm/companies/route.ts` | API: GET (list) + POST (create) |
| `src/app/api/crm/companies/[id]/route.ts` | API: GET (detail) + PATCH (update) |
| `src/app/api/crm/opportunities/route.ts` | API: GET (list + pipeline) + POST |
| `src/app/api/crm/opportunities/[id]/route.ts` | API: GET + PATCH (status change) |
| `src/lib/auth/roles.ts` | Helper: getUserRole(), requireRole() |
| `.github/workflows/ci.yml` | CI: checkout → install → typecheck → lint → test |
| `tests/crm/companies.test.ts` | Tests del service layer CRM |
| `tests/crm/opportunities.test.ts` | Tests del pipeline |
| `tests/crm/schema-integrity.test.ts` | Tests de integridad del schema nuevo |

### Ficheros modificados

| Fichero | Cambio |
|---------|--------|
| `src/db/schema.ts` | +6 tablas nuevas, +campos en users/contacts/cases/visits, +types |
| `src/lib/agent/swarm.ts` | -executeParallelSwarm, -LEGACY_ALIASES, -Notion tools |
| `src/lib/agent/agent-knowledge.ts` | Corregir bi-scoring, añadir consultor-digital |

### Ficheros eliminados

| Fichero | Razón |
|---------|-------|
| `src/lib/agent/personalities.ts` | Código muerto |
| `src/lib/agent/context-packs.ts` | Código muerto |

### Documentación

| Documento | Contenido |
|-----------|-----------|
| `docs/SCHEMA-UNIFICADO.md` | Modelo de datos lógico completo con relaciones |
| Actualizar `docs/GO-LIVE-RUNBOOK.md` | Añadir migración 0002 al runbook |

---

## 11. ORDEN DE EJECUCIÓN

### Paso 1: CI/CD (30 min)

Crear `.github/workflows/ci.yml` copiando estructura de CRM Energía y adaptando paths. Esto protege todo lo que viene después.

```
Trigger: push + PR a main
Jobs: install → tsc --noEmit → vitest run
```

### Paso 2: Limpieza de legacy (1 hora)

1. Eliminar `personalities.ts`
2. Eliminar `context-packs.ts`
3. Eliminar imports rotos en `execute.ts` u otros ficheros
4. Eliminar `executeParallelSwarm()` de swarm.ts
5. Eliminar `LEGACY_AGENT_ID_ALIASES` de swarm.ts
6. Eliminar `notion_search` y `notion_create_page` de WEB_TOOLS en swarm.ts
7. Unificar prompts: marcar systemPrompt inline como fallback, documentar que knowledge.ts manda
8. Corregir bi-scoring knowledge, añadir consultor-digital
9. Ejecutar tests: `npx vitest run` → debe seguir pasando
10. Commit: `refactor: remove legacy code, unify prompt source`

### Paso 3: Schema + migración (2-3 horas)

1. Añadir las 6 tablas nuevas a `src/db/schema.ts`
2. Añadir campos a users, contacts, cases, visits
3. Crear `drizzle/0002_crm_unification.sql` con DDL completo
4. Exportar tipos nuevos (Company, SupplyPoint, Opportunity, Service, Document, EnergyBill)
5. Ejecutar tests: verificar que el schema compila
6. Commit: `feat: add CRM unified schema — companies, supply_points, opportunities, services, documents, energy_bills`

### Paso 4: Service layer CRM (3-4 horas)

1. Crear `src/lib/crm/types.ts`
2. Crear `src/lib/crm/companies.ts` con CRUD
3. Crear `src/lib/crm/contacts.ts` (evolucionar, no reemplazar)
4. Crear `src/lib/crm/opportunities.ts` con pipeline
5. Crear `src/lib/crm/services.ts`
6. Crear `src/lib/crm/supply-points.ts`
7. Commit: `feat: add CRM service layer — companies, opportunities, services, supply-points`

### Paso 5: API routes CRM básicas (2 horas)

1. Crear routes para companies (GET/POST/PATCH)
2. Crear routes para opportunities (GET/POST/PATCH con status)
3. Commit: `feat: add CRM API routes — companies, opportunities`

### Paso 6: Auth roles helper (30 min)

1. Crear `src/lib/auth/roles.ts`
2. Commit: `feat: add role-based auth helper`

### Paso 7: Tests (2 horas)

1. Tests de service layer CRM (companies CRUD, opportunities pipeline)
2. Tests de schema integrity (todas las tablas existen, FKs correctas)
3. Ejecutar suite completa
4. Commit: `test: add CRM schema and service tests`

### Paso 8: Documentación (30 min)

1. Crear `docs/SCHEMA-UNIFICADO.md`
2. Actualizar runbook con migración 0002
3. Commit: `docs: add unified schema documentation`

### Paso 9: Build + push (30 min)

1. `npx tsc --noEmit` → 0 errores
2. `npx vitest run` → todos pasan
3. Commit final si hay ajustes
4. Push → CI corre automáticamente → verify green

---

## 12. RIESGOS Y ERRORES A EVITAR

### Riesgo 1: Romper el swarm al limpiar

**Mitigación:** La limpieza (Paso 2) solo elimina código confirmado como muerto (personalities.ts, context-packs.ts) y funciones marcadas @deprecated. Se ejecutan tests después de cada eliminación. El swarm en sí no se modifica — solo se quitan piezas que no usa.

### Riesgo 2: Migración que rompe datos existentes

**Mitigación:** Todas las tablas nuevas son CREATE TABLE (no modifican datos existentes). Los ALTER TABLE añaden columnas nullable con defaults. No hay DROP ni RENAME. La migración es puramente aditiva.

### Riesgo 3: Sobrecomplicar el service layer

**Error a evitar:** No crear un framework de CRUD genérico. Cada service (companies.ts, opportunities.ts) debe ser un fichero simple con funciones `createCompany()`, `getCompany()`, `listCompanies()`, `updateCompany()`. SQL vía Drizzle, sin abstracciones innecesarias.

### Riesgo 4: Intentar conectar todo de golpe

**Error a evitar:** En Fase 1, las nuevas tablas NO se conectan al swarm, NO se conectan al panel de operaciones, NO se muestran en la UI. Solo existen como schema + service layer + API routes básicas. La conexión viene en fases posteriores.

### Riesgo 5: Copiar SQL directo de CRM Energía

**Error a evitar:** No copiar queries raw de CRM Energía. Todo debe ser Drizzle desde el día uno. El modelo de datos se inspira en CRM Energía pero se implementa nativo en el stack de Sinergia.

### Riesgo 6: No hacer CI primero

**Error a evitar:** El CI (Paso 1) DEBE ser lo primero. Sin CI, cualquier error en pasos posteriores puede llegar a producción sin detectar. Con CI, cada push verifica typecheck + tests automáticamente.

### Riesgo 7: Querer hacer Fase 2 dentro de Fase 1

**Error a evitar:** La tentación de "ya que estamos, añadimos el Kanban" o "portamos el bill parser que son solo 900 líneas". No. Fase 1 es cimientos. El valor de esta fase no es visible para el usuario — es invisible y estructural. La disciplina de respetar el alcance es lo que evita el caos.
