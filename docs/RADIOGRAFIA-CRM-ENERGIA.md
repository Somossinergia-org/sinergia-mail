# RADIOGRAFÍA TÉCNICA Y FUNCIONAL — CRM ENERGÍA

**Fecha:** 21 de abril de 2026
**Repositorio:** Somossinergia-org/crm-energia (commit 931f980)
**Auditor:** Claude Opus — lectura completa de código fuente

---

## 1. QUÉ ES CRM ENERGÍA HOY

**Un CRM comercial especializado en venta de energía y multiservicio para equipos de campo, con IA integrada (Gemini), email marketing completo, y calculadora de ahorro con tarifas reguladas reales.**

No es un dashboard. No es un gestor de emails. Es un CRM operativo diseñado para que comerciales de Somos Sinergia gestionen su día a día: prospects, visitas, llamadas, propuestas, seguimiento, cierre. Todo orientado al ciclo de venta presencial de servicios energéticos y complementarios.

**Cifras clave:**

- Monorepo: backend Express + frontend React/Vite
- 25 tablas PostgreSQL (sin ORM, SQL directo con pg)
- ~29.000 líneas de código fuente en 147 ficheros
- 17 routes de API, 18 controllers, 8 services
- 13 pantallas/páginas funcionales
- Gemini 2.0 Flash como motor IA (agente, scoring, briefings, emails, OCR)
- CI/CD real con GitHub Actions
- Deploy multi-target: Vercel, Railway, Google Cloud Run, Docker
- 14 tests backend + varios frontend

---

## 2. MAPA TÉCNICO DEL REPOSITORIO

### Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite 5 + Tailwind CSS 3 |
| Estado | Zustand (auth) + TanStack React Query (server) |
| Backend | Express 4 + TypeScript |
| DB | PostgreSQL 15 (Supabase) + pgvector |
| ORM | Ninguno — SQL directo con pool `pg` parametrizado |
| Auth | JWT custom (access 15m + refresh 7d) + bcrypt + roles |
| IA | Google Gemini 2.0 Flash (function-calling agent con 19 tools) |
| Email | Nodemailer (SMTP) + Gmail OAuth2 (googleapis) |
| PDF | Puppeteer (propuestas HTML→PDF branded) |
| OCR | pdf-parse + Gemini Vision |
| Cache/Queue | Redis 7 + BullMQ (opcional) |
| CI/CD | GitHub Actions (lint, typecheck, test en push/PR) |
| Deploy | Vercel + Railway + Cloud Run + Docker Compose |

### Estructura de carpetas

```
crm-energia/
├── backend/
│   └── src/
│       ├── config/         # DB pool, environment (Zod-validated)
│       ├── middleware/      # Auth JWT, authorize roles, rate-limit
│       ├── routes/          # 17 route files
│       ├── controllers/     # 18 controllers
│       ├── services/        # 8 service modules
│       ├── models/          # Thin SQL wrappers
│       └── migrations/      # 14 SQL files (001→014)
├── frontend/
│   └── src/
│       ├── pages/           # 13 page components
│       ├── components/      # ~40 components
│       ├── services/        # API client functions
│       ├── stores/          # Zustand stores
│       └── hooks/           # Custom hooks
├── api/                     # Vercel serverless entry
├── .github/workflows/       # CI + deploy pipelines
├── docker-compose.yml       # Local dev stack
└── docs/                    # Architecture, deployment docs
```

---

## 3. CÓMO ESTÁ ESTRUCTURADO EL CRM

### Modelo central: PROSPECT-CENTRIC

Todo gira alrededor de la entidad `prospects` (~40 columnas). Un prospect es simultáneamente: empresa, contacto, oportunidad, suministro, y lead. No hay tabla separada de empresas, contactos, o deals.

### Pipeline de ventas (10 estados)

```
pendiente → contactado → interesado → visita_programada → 
visitado → oferta_enviada → negociacion → contrato_firmado → 
cliente_activo → perdido
```

Cada transición se registra en `contact_history` con estado anterior/nuevo. El pipeline se visualiza como Kanban drag-and-drop, tabla con filtros, tarjetas, o mapa geográfico.

### Entidades CRM

| Entidad | Tabla | Calidad |
|---------|-------|---------|
| Prospects/Leads | `prospects` (40 cols) | **SÓLIDO** — completo con datos de contacto, energía, pipeline, email tracking, scoring |
| Historial de contacto | `contact_history` | **SÓLIDO** — 9 tipos de interacción, resultado, duración, próxima acción |
| Visitas/Agenda | `visits` | **SÓLIDO** — con geolocalización, ruta diaria, FullCalendar |
| Servicios por prospect | `prospect_servicios` | **SÓLIDO** — 8 tipos de servicio, proveedor actual vs ofertado, ahorro |
| Documentos | `prospect_documents` | **USABLE** — upload de ficheros con tipo (contrato/factura/oferta/dni/otro) |
| Scoring IA | `prospect_scores` | **SÓLIDO** — fórmula determinista (email 35 + energía 40 + actividad 25) + Gemini |
| Insights IA | `prospect_ai_insights` | **SÓLIDO** — briefing de llamada, objeciones, mejor hora, sugerencia |
| Zonas geográficas | `zones` | **USABLE** — asignación por zona con colores |
| Usuarios/Roles | `users` | **SÓLIDO** — admin/comercial/supervisor con filtrado por rol |

### Lo que NO tiene como CRM

- **No hay tabla de empresas separada** — prospect = empresa = contacto. Si un negocio tiene 3 personas de contacto, hay que crear 3 prospects o poner todo en uno.
- **No hay tabla de contratos** — el estado "contrato_firmado" marca al prospect, pero no hay entidad con condiciones, fechas, líneas de contrato.
- **No hay tabla de facturas estructurada** — las facturas son documentos adjuntos, no datos parseados con importes/líneas.
- **No hay tabla de CUPS/suministros** — CUPS es un campo VARCHAR en prospects. Un prospect = un suministro máximo.
- **No hay tabla de tareas independiente** — las próximas acciones viven dentro de contact_history.
- **No hay multi-contacto por empresa** — modelo 1:1 plano.

### Veredicto CRM

Es un **CRM serio y bien estructurado para su caso de uso**: equipos comerciales de 3-10 personas vendiendo energía y servicios puerta a puerta. El pipeline es real, el tracking de emails es real, el scoring es real, la agenda con rutas es real. Pero el modelo plano (prospect=todo) no escala a operaciones más complejas donde un cliente tiene múltiples suministros, múltiples contactos, o múltiples contratos.

---

## 4. CÓMO ESTÁ ESTRUCTURADA LA PARTE DE ENERGÍA/SERVICIOS

### Datos energéticos en prospect

Cada prospect tiene campos nativos para energía:
- `comercializadora_actual` — quién les suministra ahora
- `tarifa_actual` — tipo de tarifa (2.0TD, 3.0TD, 6.1TD)
- `potencia_p1_kw`, `potencia_p2_kw`, `potencia_p3_kw` — potencias contratadas
- `consumo_anual_kwh` — consumo anual
- `gasto_mensual_estimado_eur` — gasto actual
- `cups` — código universal de suministro
- `fecha_vencimiento_contrato` — cuándo caduca
- `ahorro_estimado_eur`, `ahorro_porcentaje` — ahorro proyectado

### Bill Parser (917 líneas — el módulo más sofisticado)

Parsea facturas de electricidad españolas con 6 estrategias de extracción por campo:
- Reconoce comercializadoras: Endesa, Iberdrola, Naturgy, Repsol, EDP, Holaluz
- Extrae: CUPS, tarifa, potencias por periodo, consumos por periodo, precios unitarios, importes, reactiva, IVA, impuesto eléctrico, alquiler de contador
- Calcula puntuación de confianza
- Si confianza < 75%: fallback a Gemini Vision
- **Esto es mejor que cualquier cosa que tiene Sinergia para energía.** Es un parser real con regex específicos para cada comercializadora española.

### Calculadora de ahorro (~900 líneas frontend)

Calculadora con datos regulados reales BOE/CNMC 2025:
- Peajes y cargos por periodo para 2.0TD, 3.0TD, 6.1TD
- Cálculo de optimización de potencia
- Compensación de excedentes fotovoltaicos
- Energía reactiva
- También calcula servicios complementarios: telecomunicaciones, alarmas, seguros, agentes IA, web, CRM, apps
- Genera propuesta PDF con Puppeteer (documento A4 branded con tablas comparativas y bloques de ahorro)

### Servicios multiproducto (prospect_servicios)

8 tipos de servicio rastreados por prospect:
- energia, telecomunicaciones, alarmas, seguros, agentes_ia, web, crm, aplicaciones

Cada servicio tiene: estado, proveedor actual, gasto actual, precio ofertado, ahorro estimado, fecha contratación, fecha vencimiento, datos JSONB para extensiones.

### Lo que NO tiene en energía

- **No hay conexión a OMIE/OMIP** — los precios de mercado no se consultan en tiempo real
- **No hay tabla de suministros independiente** — un prospect = un CUPS máximo
- **No hay histórico de facturas parseado** — el parser extrae datos pero no los persiste en una tabla de facturas energéticas estructurada
- **No hay alertas de vencimiento automáticas** — el campo `fecha_vencimiento_contrato` existe pero no hay cron que genere alertas

### Veredicto energía

**Claramente superior a Sinergia en datos energéticos.** El bill parser de 917 líneas con regex por comercializadora y fallback a Gemini es producción real. La calculadora con tarifas BOE/CNMC es una herramienta profesional. Sinergia tiene "knowledge" genérico sobre energía en los prompts de agentes pero 0 lógica real de cálculo, 0 parsing de facturas especializado, y 0 datos regulados.

---

## 5. MODELO DE DATOS PRINCIPAL

### 25 tablas organizadas en 5 bloques

```
CORE CRM (8 tablas)
├── users ────────────────── Auth + roles
├── sessions ─────────────── JWT refresh
├── activity_log ─────────── Auditoría básica
├── zones ────────────────── Zonas geográficas
├── prospects ────────────── ENTIDAD CENTRAL (40 cols)
├── contact_history ──────── Interacciones
├── visits ───────────────── Agenda/visitas
└── prospect_servicios ───── Servicios contratados/ofertados

EMAIL MARKETING (9 tablas)
├── email_accounts ───────── SMTP config por usuario
├── email_accounts_gmail ─── OAuth Gmail
├── email_templates ──────── Plantillas
├── email_campaigns ──────── Campañas masivas
├── emails_enviados ──────── Emails individuales
├── emails_recibidos ─────── Inbox Gmail sync
├── email_tracking ───────── Opens/clicks
├── email_secuencias ─────── Drip sequences
├── email_secuencia_pasos ── Steps
├── email_secuencia_inscritos ── Enrollments
├── email_queue ──────────── Cola de envío
└── email_unsubscribes ───── LOPD opt-out

DOCUMENTOS + IA (4 tablas)
├── prospect_documents ───── Ficheros adjuntos
├── prospect_scores ──────── Scoring IA
├── prospect_ai_insights ─── Briefings IA
└── agent_logs ───────────── Log de acciones IA

MEMORIA (1 tabla)
└── memory_sources ───────── Vector search (pgvector)
```

### Relaciones clave

Todo irradia de `prospects`. Las foreign keys son:
- `prospects.zona_id → zones.id`
- `prospects.asignado_a → users.id`
- `contact_history.prospect_id → prospects.id`
- `visits.prospect_id → prospects.id`
- `prospect_servicios.prospect_id → prospects.id`
- `prospect_documents.prospect_id → prospects.id`
- `prospect_scores.prospect_id → prospects.id` (UNIQUE)
- `prospect_ai_insights.prospect_id → prospects.id` (UNIQUE)
- `emails_enviados.prospect_id → prospects.id`
- `emails_recibidos.prospect_id → prospects.id`

### Comparación de modelo de datos vs Sinergia

| Aspecto | CRM Energía | Sinergia Mail |
|---------|-------------|---------------|
| Entidad central | `prospects` (40 cols, pipeline 10 estados) | `cases` (11 cols, lifecycle 4 estados) |
| Contactos | Campo plano en prospect | `contacts` (27 cols, scoring) |
| Historial interacciones | `contact_history` (9 tipos, resultado, siguiente acción) | `audit_events` (21 tipos, enfocado a gobernanza) |
| Servicios | `prospect_servicios` (8 tipos, ahorro, proveedor) | No existe |
| Facturas | Solo como documento adjunto | `invoices` (18 cols, extracción IA) |
| Email marketing | 9 tablas (templates, campaigns, sequences, tracking) | `emailSequences` grupo (3 tablas, uso incierto) |
| Scoring | Determinista + Gemini (3 dimensiones) | Solo campo en contacts |
| Visitas | Tabla completa con geo + ruta | `visits` (solo schema, sin service layer) |
| Memoria IA | `memory_sources` + `agent_logs` | 4 capas (short/long/episodic/working) |
| Auditoría | `activity_log` (básico: user + action) | `audit_events` (21 tipos, por caso/agente/tool) |
| Gobernanza | No existe | Completa (permisos, single-voice, ownership) |
| Runtime config | No existe | 7 kill switches + 8 rate limits + 4 modos |
| Agentes IA | 1 agente Gemini con 19 tools | 10 agentes GPT con gobernanza multi-capa |

---

## 6. PANTALLAS / UX / FLUJO

### 13 pantallas organizadas por función

| Pantalla | Función | Calidad |
|----------|---------|---------|
| Dashboard | KPIs, briefing IA, funnel, actividad reciente, alertas | **SÓLIDO** — accionable, no solo informativo |
| Pipeline | Kanban + tabla + tarjetas + mapa de prospects | **EXCELENTE** — 4 vistas, filtros completos, CSV import |
| Prospect Detail | Perfil completo: contacto, energía, servicios, docs, historial, IA | **EXCELENTE** — la pantalla más rica, todo en contexto |
| Clientes | Prospects cerrados como clientes con KPIs y servicios | **SÓLIDO** |
| Client Detail | Servicios contratados, facturación, renovaciones | **SÓLIDO** |
| Servicios | Vista global multiservicio con filtros por tipo | **SÓLIDO** |
| Agenda | FullCalendar + ruta del día con Google Maps | **SÓLIDO** |
| Calculadora | Ahorro energético con tarifas reales + propuesta PDF | **EXCELENTE** — herramienta profesional |
| Email | Compose, historial, templates, campaigns, sequences, SMTP | **SÓLIDO** — email marketing completo |
| Inbox | Gmail sync, split-pane, auto-link a prospects | **SÓLIDO** |
| Reportes | Analytics de ventas, rendimiento por comercial, email stats | **SÓLIDO** |
| Agente IA | Chat Gemini con quick actions y panel de contexto | **USABLE** |
| Configuración | Perfil, empresa, usuarios, integraciones | **SÓLIDO** |

### Flujo principal del usuario

```
Comercial abre la app por la mañana
  → Dashboard: ve briefing IA, alertas de seguimiento, visitas del día
    → Pipeline: revisa prospects calientes, hace llamadas
      → Prospect Detail: registra resultado, agenda visita
        → Agenda: planifica ruta del día con Google Maps
          → Visita: usa calculadora de ahorro in situ
            → Genera propuesta PDF y la envía al cliente
              → Seguimiento por email/WhatsApp
                → Cierre: marca contrato_firmado
                  → Pasa a Clientes con servicios contratados
```

Este flujo es **coherente y pensado para un equipo comercial real**. Cada pantalla alimenta la siguiente. No hay piezas sueltas.

---

## 7. INTEGRACIONES EXTERNAS

| Integración | Estado | Detalle |
|-------------|--------|---------|
| Google Gemini 2.0 Flash | **REAL, producción** | Agente con 19 tools, scoring, briefings, emails IA, OCR |
| Gmail OAuth2 | **REAL, producción** | Send/receive/sync vía googleapis |
| SMTP (Nodemailer) | **REAL, producción** | Multi-cuenta, creds cifrados, pool, rate-limited |
| Puppeteer | **REAL** | Generación PDF de propuestas branded |
| pdf-parse | **REAL** | Extracción de texto de facturas |
| WhatsApp | **NO EXISTE** | Solo deep link `wa.me` (abre WhatsApp nativo, no API) |
| OMIE/mercado energético | **NO EXISTE** | |
| Stripe/pagos | **NO EXISTE** | |
| Notion | **NO EXISTE** | |
| Calendar propio | **NO EXISTE** | Solo FullCalendar local, no sync con Google Calendar |
| Google Drive | **NO EXISTE** | |
| Telefonía (Twilio) | **NO EXISTE** | Solo `tel:` links |
| ElevenLabs/Deepgram | **NO EXISTE** | Solo Web Speech API nativa (speech-to-text en chat) |

---

## 8. LO MEJOR DEL REPOSITORIO

1. **Bill parser (917 líneas)** — El módulo más especializado. Regex por comercializadora española, fallback a Gemini, score de confianza. No existe equivalente en Sinergia.

2. **Calculadora de ahorro con tarifas reales BOE/CNMC** — Herramienta profesional para el comercial en campo. Calcula ahorro real con peajes y cargos regulados. Genera propuesta PDF branded.

3. **Pipeline Kanban de 10 estados** — Bien diseñado, con 4 vistas (tabla, kanban, tarjetas, mapa), drag-and-drop, filtros completos.

4. **Prospect Detail como centro de todo** — Toda la información del prospect en una sola pantalla: contacto, energía, servicios, documentos, historial, IA, ventas. Bien organizado con tabs.

5. **Email marketing completo** — Templates con variables, campañas con filtros, secuencias drip, tracking de opens/clicks, cola de envío rate-limited, unsubscribe LOPD.

6. **Agente IA contextual** — 1 agente Gemini con 19 tools que consultan la DB real: pipeline, prospects, emails, visitas, scoring, servicios. System prompt en español con personalidad.

7. **Agenda con rutas Google Maps** — FullCalendar + botón "ruta del día" que abre Google Maps con todas las visitas como waypoints. Útil para comerciales de campo.

8. **CI/CD real** — GitHub Actions con lint, typecheck, tests en push/PR. Algo que Sinergia no tiene.

9. **Deploy multi-target** — Docker, Vercel, Railway, Cloud Run. Bien documentado.

10. **Scoring determinista** — Fórmula transparente (email engagement 35 + energía 40 + actividad 25) vs el scoring opaco de Sinergia.

---

## 9. LO PEOR DEL REPOSITORIO

1. **Sin ORM** — SQL directo con strings. Funciona pero es frágil: no hay validación de tipos en compilación, no hay migraciones automáticas, no hay type-safety en queries. Drizzle o Prisma serían una mejora enorme.

2. **Modelo plano prospect=todo** — Un prospect es empresa + contacto + oportunidad + suministro. No escala a: empresas con múltiples contactos, clientes con múltiples CUPS, operaciones con múltiples oportunidades.

3. **SQL injection potencial** — Al menos 2 parámetros en agent.service.ts se interpolan directamente en SQL sin parametrizar (`${dias}`).

4. **Sin gobernanza IA** — El agente Gemini puede hacer cualquier cosa sin permisos, sin auditoría de gobernanza, sin ownership, sin single-voice. No hay kill switches, no hay rate limits, no hay modos de operación.

5. **Sin sistema de casos** — No hay concepto de "caso" que vincule un flujo de trabajo completo. El prospect es todo, incluyendo el estado. No hay trazabilidad de quién hizo qué en un flujo multiagente.

6. **Sin auditoría seria** — `activity_log` solo registra (user, action, description). No hay trace de herramientas usadas, bloqueos, delegaciones, violaciones.

7. **Validación Zod infrautilizada** — Existe el middleware pero no se aplica a la mayoría de endpoints. Los bodies se confían sin validar.

8. **WhatsApp es solo un deep link** — `wa.me` abre WhatsApp nativo. No hay API, no hay envío programático, no hay tracking.

9. **Facturas no persistidas como datos** — El bill parser extrae datos pero no los guarda en una tabla de facturas energéticas. Se pierden después del parsing.

10. **Sin memoria conversacional entre sesiones** — El agente no recuerda conversaciones anteriores (no tiene el sistema de 4 capas de memoria de Sinergia).

---

## 10. QUÉ SUPERA A SINERGIA

| Área | CRM Energía | Sinergia |
|------|-------------|----------|
| **Pipeline de ventas** | 10 estados, Kanban, 4 vistas, filtros | No existe |
| **Bill parser energético** | 917 líneas, regex por comercializadora, Gemini fallback | OCR genérico sin lógica de energía |
| **Calculadora de ahorro** | Tarifas BOE/CNMC reales, multi-servicio | No existe |
| **Propuestas PDF** | Puppeteer, branded, con tablas comparativas | No existe |
| **Datos de prospect** | 40 columnas: energía, contacto, pipeline, tracking | 27 columnas en contacts (genérico) |
| **Servicios multiproducto** | 8 tipos con tracking de ahorro | No existe |
| **Agenda/visitas** | FullCalendar + rutas Google Maps | Solo schema, sin service layer |
| **Email marketing** | Templates, campaigns, sequences, tracking, unsubscribe | Drip sequences pero uso incierto |
| **CI/CD** | GitHub Actions (lint, typecheck, test) | No existe |
| **UX comercial** | Flujo coherente para equipo de campo | Orientado a operador/supervisor |
| **Scoring transparente** | Fórmula determinista + Gemini explanation | Campo en tabla, sin fórmula visible |
| **Deploy** | Docker + Vercel + Railway + Cloud Run | Solo Vercel |

---

## 11. QUÉ NO SUPERA A SINERGIA

| Área | Sinergia | CRM Energía |
|------|----------|-------------|
| **Multi-agente IA** | 10 agentes especializados con delegación | 1 agente Gemini genérico |
| **Gobernanza** | Permisos por agente/capa, single-voice, ownership | Ninguna |
| **Casos + ownership** | Lifecycle completo, asignación exclusiva | No existe |
| **Auditoría** | 21 tipos de evento, dual-store, timeline por caso | activity_log básico |
| **Kill switches** | 7 switches DB-backed, hot-swap | No existe |
| **Runtime config** | 4 modos (dry-run → production), rate limits | No existe |
| **Guardrails** | Pre-action check, validate-before-send, clasificación de tools | No existe |
| **Memoria IA** | 4 capas (short/long/episodic/working), DB-backed, auto-summarización | Solo vector search básico |
| **Oficina virtual** | Visualización en tiempo real del estado de agentes | No existe |
| **SSE streaming** | Real-time office state + chat streaming | Sin streaming |
| **Canales** | WhatsApp API, SMS, Telegram, voz (ElevenLabs/Deepgram) | Solo SMTP + Gmail |
| **Cifrado** | AES-256-GCM para tokens | Cifrado SMTP básico |
| **Google Workspace** | Calendar, Drive, Tasks integrados | Solo Gmail |

---

## 12. QUÉ PARTES PODRÍAN SERVIR PARA UNA FUTURA UNIFICACIÓN

### De CRM Energía → llevar a Sinergia (o al producto unificado)

| Componente | Valor | Complejidad de migración |
|-----------|-------|--------------------------|
| **Bill parser** (917 líneas) | MUY ALTO — ventaja competitiva real | MEDIA — es un módulo autocontenido |
| **Calculadora de ahorro** (~900 líneas) | MUY ALTO — herramienta de campo imprescindible | MEDIA — frontend puro con datos estáticos |
| **Pipeline 10 estados** | ALTO — Sinergia no tiene pipeline de ventas | ALTA — requiere rediseñar modelo de datos |
| **Prospect Detail** (diseño de pantalla) | ALTO — el mejor diseño de "ficha de cliente" | MEDIA — concepto UX, no código directo |
| **Email marketing** (templates, campaigns, tracking) | MEDIO — Sinergia tiene la base pero incompleta | ALTA — 9 tablas + lógica de tracking |
| **Propuestas PDF** (Puppeteer) | ALTO — cierra el ciclo comercial | BAJA — módulo independiente |
| **Agenda con rutas** | MEDIO — útil para campo | MEDIA |
| **CI/CD** (GitHub Actions) | ALTO — Sinergia necesita esto urgentemente | BAJA — copiar workflows |
| **Scoring determinista** (fórmula transparente) | MEDIO | BAJA |

### De Sinergia → llevar a CRM Energía (o al producto unificado)

| Componente | Valor | Complejidad |
|-----------|-------|-------------|
| **10 agentes especializados + swarm** | MUY ALTO — la IA de Sinergia es otra liga | MUY ALTA — ~3.000 líneas de swarm + dependencias |
| **Gobernanza completa** | MUY ALTO — sin esto no se puede operar IA en producción | ALTA — governance + audit + runtime |
| **Casos + ownership** | ALTO — organización superior del trabajo | MEDIA |
| **Auditoría 21 tipos** | ALTO | MEDIA |
| **Kill switches + runtime config** | ALTO | MEDIA |
| **Memoria 4 capas** | ALTO | ALTA |
| **Guardrails** | ALTO | MEDIA |
| **WhatsApp/SMS/Telegram API** | MEDIO | BAJA |
| **Google Workspace** (Calendar, Drive, Tasks) | MEDIO | MEDIA |

### Lo que NO merece la pena migrar

| Componente | Razón |
|-----------|-------|
| Oficina virtual de Sinergia (3.032 líneas) | Complejidad/valor desproporcional |
| SQL directo de CRM Energía | Mejor rehacer con ORM |
| personalities.ts / context-packs.ts de Sinergia | Código muerto |
| Tab "outreach", "finanzas" de Sinergia | Features de catálogo |
| Deep links wa.me de CRM Energía | No aporta vs WhatsApp API real |

---

## CONCLUSIÓN PARA LA DECISIÓN

**CRM Energía es un producto mejor construido para la operación comercial de Somos Sinergia.** Tiene el modelo de datos correcto (prospect-centric con energía nativa), las herramientas de campo correctas (calculadora, propuestas, agenda con rutas), y el flujo UX correcto (comercial→pipeline→prospect→visita→propuesta→cierre).

**Sinergia tiene la IA muy superior.** 10 agentes con gobernanza, auditoría, memoria, casos, ownership, guardrails, kill switches. Pero está montado sobre un modelo de datos de "email dashboard" que no tiene ni pipeline, ni servicios, ni datos de energía, ni calculadora, ni propuestas.

**La pregunta real no es cuál es "mejor" — es cuál es la base correcta.** Depende de qué es el producto final:

- Si el producto final es **un CRM comercial con IA potente** → la base debería ser el modelo de datos de CRM Energía + la IA de Sinergia
- Si el producto final es **un centro de operaciones IA que también gestiona clientes** → la base debería ser Sinergia + piezas comerciales de CRM Energía
- Si se quiere **lo mejor de ambos sin arrastrar deuda** → nueva base con el schema de CRM Energía, el stack de Sinergia (Next.js + Drizzle), y la IA de Sinergia

Los datos para tomar esta decisión ya están aquí. El siguiente paso es decidir qué es el producto.
