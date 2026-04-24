# Radiografía Técnica — Sinergia v2

**Fecha:** 20 abril 2026  
**Autor:** Claude (CTO técnico IA)  
**Destinatario:** David Miquel Jorda, Gerente de Somos Sinergia  
**Propósito:** Mapa técnico fiel del sistema tal como existe hoy, para planificar reestructuración sin romper nada.

---

## 1. Visión General del Sistema

Sinergia es una aplicación Next.js 14 desplegada en Vercel que implementa un sistema multi-agente de IA para gestionar las operaciones de una consultoría multiservicio (energía, telecomunicaciones, alarmas, seguros, agentes IA, web, CRM, aplicaciones).

**Stack principal:**

- **Framework:** Next.js 14 App Router, React 18, TypeScript
- **Base de datos:** PostgreSQL + pgvector (Drizzle ORM)
- **Modelos IA:** OpenAI GPT-5 (primario) + Google Gemini 2.5 Flash (fallback)
- **Embeddings:** Gemini Embedding 001 (768 dimensiones)
- **Autenticación:** NextAuth 5.0.0-beta con Drizzle adapter
- **Canales externos:** ElevenLabs (voz), Deepgram (STT), Twilio (SMS/teléfono), Meta API (WhatsApp), Telegram Bot API, Resend (email transaccional), Stability AI (imágenes), Google Vision (OCR)
- **Despliegue:** Vercel, PostgreSQL cloud vía `CLOUDSQL_URL`

**Magnitud del código:**

- ~120 ficheros fuente en `src/`
- ~62 rutas API en `src/app/api/`
- ~12 ficheros de test en `tests/`
- ~460 tests passing (gobernanza + observabilidad + E2E + preproducción)
- `swarm.ts` es el fichero más grande: 2.647 líneas
- `AgentOfficeMap.tsx` le sigue: 2.966 líneas (pura visualización)

---

## 2. Árbol de Ficheros (Estructura Real)

```
sinergia-build/
├── src/
│   ├── app/
│   │   ├── layout.tsx              ← Root layout: providers, service worker, metadata
│   │   ├── page.tsx                ← Landing / redirect según auth
│   │   ├── chat/
│   │   │   └── page.tsx            ← Chat móvil PWA (880 líneas, 10 agentes)
│   │   ├── dashboard/
│   │   │   └── page.tsx            ← Dashboard principal con tabs
│   │   └── api/
│   │       ├── agent-gpt5/
│   │       │   └── route.ts        ← ★ ENTRADA PRINCIPAL al swarm (301 líneas)
│   │       ├── agent/
│   │       │   ├── route.ts        ← Endpoint legacy (usa mismo swarm)
│   │       │   ├── draft/          ← Generación de borradores
│   │       │   ├── summarize/      ← Resúmenes IA de emails
│   │       │   ├── categorize/     ← Auto-categorización
│   │       │   ├── invoice-extract/← Extracción de facturas
│   │       │   ├── invoice-pdf-extract/
│   │       │   ├── photo-extract/  ← OCR desde fotos
│   │       │   ├── payment-reminder/
│   │       │   ├── invoice-alerts/
│   │       │   ├── iva-quarterly/  ← Cálculo IVA trimestral
│   │       │   ├── duplicates/     ← Detección duplicados
│   │       │   ├── anomalies/      ← Detección anomalías
│   │       │   ├── expense-forecast/
│   │       │   ├── contacts/       ← Inteligencia de contactos
│   │       │   ├── briefing/       ← Briefing ejecutivo
│   │       │   ├── report/         ← Informes semanales
│   │       │   ├── report-excel/   ← Export Excel
│   │       │   ├── cleanup/        ← Limpieza datos
│   │       │   ├── auto-drafts/
│   │       │   └── templates/
│   │       ├── emails/             ← CRUD emails
│   │       ├── email-accounts/     ← Multi-cuenta Gmail OAuth
│   │       ├── invoices/           ← CRUD facturas recibidas
│   │       ├── issued-invoices/    ← CRUD facturas emitidas
│   │       ├── contacts/           ← CRM (nota: sin route propia, usa /api/scoring)
│   │       ├── scoring/            ← Scoring predictivo contactos
│   │       ├── forecasting/        ← Previsión tesorería
│   │       ├── sequences/          ← Secuencias drip email
│   │       ├── outbound/           ← Cola mensajes omnicanal
│   │       ├── memory/             ← Operaciones memoria vectorial
│   │       ├── knowledge/          ← Base conocimiento
│   │       ├── search/             ← Búsqueda smart unificada
│   │       ├── calendar/           ← Google Calendar
│   │       ├── tasks/              ← Google Tasks
│   │       ├── rules/              ← Reglas automáticas email
│   │       ├── visits/             ← Visitas comerciales geolocalizadas
│   │       ├── voice/              ← TTS/STT (ElevenLabs + Deepgram)
│   │       ├── channels/           ← Estado canales
│   │       ├── send-email/         ← Envío email directo
│   │       ├── telegram/           ← Webhook Telegram
│   │       ├── whatsapp/           ← Webhook WhatsApp
│   │       ├── mcp/                ← Endpoint MCP (Claude Desktop)
│   │       ├── mcp-tokens/         ← Gestión tokens MCP
│   │       ├── sync/               ← Sync Gmail
│   │       ├── drafts/             ← Gestión borradores
│   │       ├── templates/          ← Plantillas respuesta
│   │       ├── incoming/           ← Webhook entrante genérico
│   │       ├── bill-parser/        ← Parser facturas energía
│   │       ├── download/           ← Descarga ficheros
│   │       ├── fine-tuning/        ← Fine-tuning OpenAI
│   │       ├── agent-config/       ← Config agente por usuario
│   │       ├── rgpd/               ← GDPR export/erasure
│   │       ├── webhooks/stripe/    ← Stripe billing webhook
│   │       ├── admin/
│   │       │   ├── migrate/        ← Migraciones DB
│   │       │   └── api-status/     ← Health check APIs
│   │       ├── cron/
│   │       │   ├── daily-agents/   ← Rutinas diarias
│   │       │   ├── weekly-report/  ← Informe semanal
│   │       │   ├── recalculate-scores/ ← Recálculo scoring
│   │       │   ├── rgpd-retention/ ← Retención GDPR
│   │       │   ├── process-sequences/ ← Procesar secuencias drip
│   │       │   └── process-outbound/  ← Enviar cola mensajes
│   │       └── auth/[...nextauth]/ ← NextAuth
│   │
│   ├── components/
│   │   ├── AgentOfficeMap.tsx       ← Oficina virtual 3D/2D (2.966 líneas)
│   │   ├── AgentSuperPanel.tsx      ← Panel experto swarm con SSE (658 líneas)
│   │   └── [otros componentes UI...]
│   │
│   ├── lib/
│   │   ├── agent/
│   │   │   ├── swarm.ts            ← ★ NÚCLEO: 10 agentes, gobernanza, routing (2.647 líneas)
│   │   │   ├── execute.ts          ← Loop agéntico Gemini con function calling (201 líneas)
│   │   │   ├── tools.ts            ← ~40 herramientas registradas (1.701 líneas)
│   │   │   ├── channels.ts         ← 7 canales de comunicación (707 líneas)
│   │   │   ├── agent-knowledge.ts  ← Base conocimiento por agente
│   │   │   ├── personalities.ts    ← Perfiles de personalidad
│   │   │   ├── super-tools.ts      ← Herramientas avanzadas (multi-step)
│   │   │   ├── self-improve.ts     ← Auto-mejora IA
│   │   │   └── context-packs.ts    ← Paquetes de contexto por situación
│   │   │
│   │   ├── audit/
│   │   │   ├── types.ts            ← 21 tipos de evento en 5 familias
│   │   │   ├── store.ts            ← MemoryAuditStore (in-memory, adapter pattern)
│   │   │   ├── logger.ts           ← AuditLogger singleton + query helpers
│   │   │   ├── governance.ts       ← Validadores runtime: tool access, single-voice, ownership
│   │   │   └── index.ts            ← Barrel export
│   │   │
│   │   ├── runtime/
│   │   │   ├── config.ts           ← Modos operación, kill switches, rate limits
│   │   │   ├── guardrails.ts       ← Pre-action validation layer
│   │   │   ├── index.ts            ← Barrel export
│   │   │   └── PREPRODUCTION.md    ← Documentación operativa go-live
│   │   │
│   │   ├── memory.ts               ← Motor memoria vectorial pgvector (251 líneas)
│   │   ├── auth.ts                 ← Configuración NextAuth
│   │   └── db/
│   │       └── [conexión Drizzle]
│   │
│   ├── db/
│   │   ├── schema.ts               ← 27 tablas principales Drizzle (540 líneas)
│   │   └── schema-rgpd.ts          ← 5 tablas GDPR adicionales
│   │
│   └── middleware.ts               ← Auth guard, x-request-id, route protection
│
├── tests/
│   ├── governance/
│   │   ├── swarm-governance.test.ts     ← Tests gobernanza swarm
│   │   ├── permissions-matrix.test.ts   ← Matriz permisos 10 roles
│   │   └── observability.test.ts        ← 42 tests observabilidad/audit
│   ├── e2e/
│   │   ├── helpers.ts                   ← SimulatedCase builder + 12 assertions
│   │   └── business-flows.test.ts       ← 10 escenarios, 29 tests
│   └── preproduction/
│       ├── runtime-config.test.ts       ← 25 tests (modos, kill switches, rate limits)
│       └── guardrails.test.ts           ← 36 tests (pre-action, health check, transitions)
│
├── drizzle.config.ts                    ← Config Drizzle → CLOUDSQL_URL
├── package.json                         ← Next 14, Drizzle, OpenAI, Gemini, Vitest
└── vitest.config.ts
```

---

## 3. Flujo de Ejecución de un Mensaje

### Camino feliz: usuario escribe en el chat → respuesta del agente

```
[1] Usuario escribe en chat/page.tsx
         │
         ▼
[2] POST /api/agent-gpt5  (route.ts, 301 líneas)
    ├── auth() → valida sesión NextAuth
    ├── DB lookup → userId desde email
    ├── rateLimit(userId, "agent") → 30 req/min compartido
    ├── Body: { messages, context?, agentOverride?, stream? }
    │
    ▼
[3] executeSwarm({ userId, messages, context, agentOverride })
    │   (swarm.ts, línea 2394)
    │
    ├── loadAgentConfig(userId) → personalidad, prompt custom, contexto negocio
    ├── seedKnowledgeBase(userId) → fire-and-forget, no bloquea
    ├── addToShortTerm(userId, msg) → memoria conversacional in-memory
    ├── detectPreferences(userId, msg) → detección preferencias
    │
    ├── routeToAgent(query)  ← ★ MUY SIMPLE: todo va a "recepcion"
    │   │                       excepto si empieza por "ceo"/"orquestador"
    │   │
    │   ▼
    ├── AUDIT: case_routed + agent_selected (emit al auditLog)
    │
    ├── Construye mensajes OpenAI (últimos 10 turnos + mensaje actual)
    │
    ▼
[4] executeAgent(userId, agent, messages, context, depth=0)
    │   (swarm.ts, línea 2139)
    │
    ├── buildToolsForAgent(agent) → filtra tools permitidas por rol
    │   ├── Capa 1: solo tools en agent.allowedTools
    │   ├── Capa 2: agentes internos → se eliminan tools de comunicación
    │   └── Añade WEB_TOOLS si procede
    │
    ├── Construye system prompt → agent.systemPrompt + configContext
    │
    ├── Llama a OpenAI GPT-5 (o Gemini fallback) con function calling
    │   ├── Si GPT-5 → openai.chat.completions.create()
    │   └── Si Gemini → generativeai.generateContent()
    │
    ├── LOOP (max 8 iteraciones):
    │   ├── Si respuesta tiene tool_calls:
    │   │   ├── executeToolCall(userId, toolName, args, agentId)
    │   │   │   ├── AUDIT: tool_called
    │   │   │   ├── validateToolAccess() → ¿agente interno + tool externa? BLOQUEAR
    │   │   │   ├── AUDIT: tool_blocked (si bloqueada) o external_comm
    │   │   │   ├── Ejecuta: webTool → superTool → existingTool → error
    │   │   │   └── AUDIT: tool_succeeded / tool_failed
    │   │   └── Reinyecta resultado como tool_response, sigue loop
    │   │
    │   ├── Si respuesta tiene delegación (delegate_to_agent tool):
    │   │   ├── AUDIT: agent_delegated
    │   │   ├── executeAgent(userId, targetAgent, ..., depth+1)
    │   │   │   └── MAX_DELEGATION_DEPTH = 3
    │   │   └── AUDIT: delegation result
    │   │
    │   └── Si respuesta es texto → FIN DEL LOOP
    │
    ▼
[5] Retorno a route.ts:
    │
    ├── logSwarmExecution(userId, result) → INSERT en agentLogs
    ├── Auto-consolidate memory cada ~20 conversaciones
    │
    ├── Si stream=true → SSE con eventos agent_start, tool_call, delegation, text, done
    └── Si stream=false → JSON { reply, agentId, toolCalls, delegations, model, tokensUsed, durationMs }
```

### Puntos críticos del flujo:

1. **routeToAgent()** es una función de 10 líneas (línea 792). Todo va a `recepcion` excepto si el mensaje empieza literalmente por "ceo" u "orquestador". No hay clasificación por intención, no hay NLP, no hay análisis semántico. El routing inteligente ocurre DENTRO del agente recepcion, que decide si delegar.

2. **executeToolCall()** (línea 2038) hace validación de gobernanza (agentes internos no pueden usar tools externas) pero **NO llama a `preActionCheck()`** del módulo runtime/guardrails. La validación de kill switches, rate limits y modos de operación NO está conectada al flujo real.

3. **Streaming**: El Super Panel (AgentSuperPanel.tsx) parsea SSE correctamente. El chat móvil (chat/page.tsx) envía `stream: true` pero NO parsea SSE — espera JSON. Esto puede causar respuestas vacías o errores silenciosos en mobile.

4. **Fallback**: Si GPT-5 falla, route.ts intenta `plainChat()` vía Gemini sin herramientas.

---

## 4. Oficina Virtual — Qué Es Realmente

**Fichero:** `AgentOfficeMap.tsx` — 2.966 líneas de código cliente React.

**Realidad:** La oficina virtual es una **simulación visual pura**. Es un componente de frontend que:

- Renderiza un plano 2D/canvas con los 10 agentes como personajes SVG
- Muestra animaciones de movimiento, diálogos entre agentes, actividades (reuniones, teléfono, celebraciones)
- Tiene interacción usuario-mueble (click en objetos de la oficina)
- Incluye reloj, partículas, sombras, efectos premium

**Lo que NO hace:**

- NO se conecta al swarm real. Los agentes no se mueven porque estén procesando un caso real.
- NO refleja el estado actual de ejecución. Si un agente está delegando a otro en el swarm, la oficina no lo muestra.
- NO consume datos de `/api/agent-gpt5` GET (status del swarm).
- Los diálogos ping-pong entre agentes son generados localmente, no son conversaciones reales del swarm.

**En resumen:** Es un escaparate visual para el usuario. Bonito, complejo, pero completamente desacoplado del motor de ejecución. Si mañana desactivases la oficina, no se rompería absolutamente nada del sistema real.

---

## 5. Casos y Ownership — La Realidad

### ¿Existe un "caso" en el sistema?

**No.** No hay tabla `cases` en la base de datos. No hay entidad "caso" persistida en ningún sitio.

- `CaseOwnership` es un **interface TypeScript** en swarm.ts (línea 96): `{ ownerId, reason, assignedAt }`. Es una definición de tipo, no una estructura que se instancie ni se guarde.
- En la base de datos (schema.ts, 27 tablas), no existe ninguna tabla que represente un caso, un expediente, un ticket ni nada similar.
- El `caseId` que aparece en los eventos de auditoría es siempre **`null`** en el flujo de producción. Mira la línea 2445 de swarm.ts: `caseId: null`.

### ¿Cómo funciona el "ownership" hoy?

**No funciona en producción.** El concepto de ownership (un solo agente visible es dueño de la relación con un cliente) está:

- **Definido** como tipos e interfaces en swarm.ts
- **Validado** en los tests (E2E y gobernanza) mediante el SimulatedCase builder
- **Implementado** en `audit/governance.ts` (validateSingleVoice, validateOwnerAssignment) 
- **NO conectado** al flujo real de executeSwarm(). No hay ningún paso que asigne ownership, lo persista ni lo consulte antes de permitir una acción.

El parámetro `visibleOwnerId` en `executeToolCall()` existe (línea 2044) pero siempre se pasa como `undefined` o `null` desde el flujo real porque nadie lo establece.

### ¿Qué significa esto?

El sistema actual es **stateless respecto a casos**. Cada mensaje del usuario es independiente. No hay continuidad entre mensajes más allá de:

1. La memoria conversacional in-memory (short-term, últimos 10 turnos)
2. La memoria semántica vectorial (pgvector, persistente)
3. El historial de `agentConversations` en DB (registra pero no condiciona el routing)

---

## 6. Ejecución de Tools — La Realidad

### Doble capa de protección (parcialmente activa)

**Capa 1 — Schema filtering (ACTIVA):**
`buildToolsForAgent(agent)` (swarm.ts) solo entrega al modelo las herramientas que el agente tiene en su `allowedTools`. Si un agente no tiene `send_whatsapp` en su lista, el modelo ni siquiera la ve como opción. Además, los agentes internos tienen bloqueadas las tools de comunicación a nivel de schema.

**Capa 2 — Runtime validation (ACTIVA pero limitada):**
`validateToolAccess(agentId, toolName)` (swarm.ts, línea 833) se ejecuta dentro de `executeToolCall()` ANTES de ejecutar la herramienta. Valida que agentes internos no usen tools externas. Si falla, devuelve `{ ok: false, error: reason }` y emite eventos de auditoría.

**Capa 3 — Pre-action guardrails (EXISTE PERO NO CONECTADA):**
`preActionCheck()` en `runtime/guardrails.ts` implementa validación completa de:
- Modo de operación (dry-run bloquea todo, shadow simula, etc.)
- Kill switches (7 interruptores de emergencia)
- Rate limits (8 límites numéricos)
- Cooldown entre contactos
- Gobernanza adicional (agentes internos)

**PERO esta función nunca se llama desde el código de producción.** Grep confirma que `preActionCheck` solo aparece en `guardrails.ts` (definición) y `runtime/index.ts` (export). No aparece en swarm.ts, ni en route.ts, ni en ningún otro fichero de producción.

Lo mismo ocurre con `validateBeforeSend()` — existe, está testeada, pero no se invoca.

### Las ~40 herramientas

Las herramientas en `tools.ts` (1.701 líneas) son **reales y funcionales**:

- **Email** (Gmail API): search_emails, create_draft, bulk_categorize — funcionan contra la API real con OAuth tokens
- **Calendario** (Google Calendar API): list_upcoming_events, create_calendar_event — real
- **Facturas**: list_invoices, find_invoices_smart, get_overdue_invoices — queries reales a PostgreSQL
- **Memoria vectorial**: memory_search, memory_add — embeddings reales con pgvector
- **Web**: web_search, web_read_page — búsqueda web real
- **Contactos**: contact_intelligence — scoring real desde DB

Cada tool está wrapped con try/catch, timing, y logging a `agentLogs`.

### Super Tools (herramientas avanzadas)

`super-tools.ts` contiene herramientas multi-paso que combinan varias operaciones. Están registradas en el swarm y se ejecutan a través de `SUPER_TOOLS_BY_NAME` (swarm.ts, línea 2096).

---

## 7. Estado de Integración del Módulo Preproducción

### Lo que EXISTE y está TESTEADO:

| Componente | Fichero | Tests | Estado |
|---|---|---|---|
| Operation Modes (4 modos) | runtime/config.ts | 25 pass | Implementado, testeado |
| Kill Switches (7 switches) | runtime/config.ts | incluidos | Implementado, testeado |
| Rate Limits (8 límites) | runtime/config.ts | incluidos | Implementado, testeado |
| preActionCheck() | runtime/guardrails.ts | 36 pass | Implementado, testeado |
| validateBeforeSend() | runtime/guardrails.ts | incluidos | Implementado, testeado |
| runHealthCheck() | runtime/guardrails.ts | incluidos | Implementado, testeado |
| In-memory counters | runtime/guardrails.ts | incluidos | Implementado, testeado |
| PREPRODUCTION.md | runtime/PREPRODUCTION.md | N/A | Documentación completa |

### Lo que NO ESTÁ CONECTADO:

| Integración pendiente | Dónde debería ir | Impacto |
|---|---|---|
| preActionCheck() en executeToolCall() | swarm.ts línea ~2068 | Sin esto, los modos y kill switches no bloquean nada real |
| preActionCheck() en delegación | swarm.ts sección delegación | Sin esto, KILL_BLOCK_DELEGATION no tiene efecto |
| preActionCheck() en speak_to_client | swarm.ts (no existe esta abstracción) | Sin esto, rate limits por cliente no funcionan |
| validateBeforeSend() antes de envíos | swarm.ts o channels.ts | Sin esto, no hay validación pre-envío |
| Lectura de SINERGIA_MODE desde env | swarm.ts o route.ts init | Sin esto, siempre está en dry-run (el default) |
| Contadores persistentes | Actualmente in-memory | Se pierden en cada deploy de Vercel |

### Resumen brutal:

El módulo preproducción es un **sistema de seguridad completo pero desenchufado**. Como tener un sistema de alarma profesional instalado en tu casa, con sensores y sirenas, pero sin conectar a la corriente. Todo funciona en los tests porque los tests ejercitan las funciones directamente. En producción, nada de esto se ejecuta.

---

## 8. Fuentes de Verdad

### Base de datos PostgreSQL (27 + 5 tablas GDPR)

**Tablas de negocio activas:**

| Tabla | Qué guarda | Conectada a |
|---|---|---|
| users | Cuentas usuario | NextAuth, todo el sistema |
| accounts | OAuth providers | NextAuth |
| sessions | Sesiones activas | NextAuth |
| emails | Emails sincronizados Gmail | Tools, API, dashboard |
| emailAccounts | Multi-cuenta OAuth tokens | Sync Gmail |
| emailSummaries | Resúmenes IA | Tools, dashboard |
| draftResponses | Borradores email | Tools, UI |
| invoices | Facturas recibidas | Tools, dashboard, fiscal |
| issuedInvoices | Facturas emitidas | Tools, dashboard |
| contacts | CRM contactos + scoring | Tools, scoring, marketing |
| contactInteractions | Log interacciones | Scoring, analytics |
| memorySources | Memoria vectorial pgvector | Búsqueda semántica, tools |
| memoryRules | Reglas automatización | Categorización automática |
| agentLogs | Audit trail ejecución | Observabilidad |
| agentConfig | Config agente por usuario | Personalización swarm |
| agentConversations | Historial conversaciones | Contexto conversacional |
| emailSequences | Campañas drip | Marketing automation |
| sequenceSteps | Pasos de secuencia | Marketing automation |
| sequenceEnrollments | Contactos en secuencias | Marketing automation |
| outboundMessages | Cola mensajes omnicanal | Envíos programados |
| subscriptions | Suscripciones Stripe | Billing |
| billingEvents | Webhooks Stripe | Billing |
| visits | Visitas comerciales | CRM geolocalizadas |
| syncState | Estado sync Gmail | Sincronización |
| mcpTokens | Tokens MCP Claude Desktop | Integración Claude |
| gdprConsents | Consentimientos GDPR | Compliance |
| gdprRetentionPolicies | Políticas retención | Compliance |

### Fuentes de verdad IN-MEMORY (se pierden en deploy):

| Dato | Dónde vive | Problema |
|---|---|---|
| Short-term memory | swarm.ts (Map en memoria) | Se pierde en cada deploy/cold start |
| Working memory | swarm.ts (Map en memoria) | Se pierde |
| User preferences | swarm.ts (Map en memoria) | Se pierde |
| Audit events | audit/store.ts (MemoryAuditStore) | Se pierde — solo para tests hoy |
| Rate limit counters | runtime/guardrails.ts (Maps) | Se pierde — además no está conectado |
| Swarm agent status | swarm.ts (in-memory) | Se pierde |

### APIs externas (estado de conexión):

| Servicio | Tipo de integración | Requiere |
|---|---|---|
| Gmail/Google Workspace | OAuth + REST API | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET |
| OpenAI GPT-5 | SDK oficial (openai@6.34.0) | OPENAI_API_KEY |
| Google Gemini | SDK (@google/generative-ai) | GEMINI_API_KEY (o GOOGLE_API_KEY) |
| ElevenLabs | REST API directa (fetch) | ELEVENLABS_API_KEY |
| Deepgram | REST API directa (fetch) | DEEPGRAM_API_KEY |
| Twilio SMS/Phone | REST API directa (fetch, auth básica) | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE |
| WhatsApp (Meta) | REST API v19.0 | WHATSAPP_TOKEN, WHATSAPP_PHONE_ID |
| Telegram | Bot API | TELEGRAM_BOT_TOKEN |
| Resend | REST API | RESEND_API_KEY |
| Stability AI | REST API | STABILITY_API_KEY |
| Google Vision OCR | REST API | GOOGLE_API_KEY |
| Stripe | Webhook + API | STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET |

Ninguna usa SDK oficial excepto OpenAI y Gemini. Todas las demás usan `fetch()` directo a las APIs REST. Esto es una decisión de diseño (menos dependencias) pero significa menos type-safety y más riesgo de breaking changes en las APIs.

---

## 9. Zonas Frágiles — Lo Que Puede Romperse

### CRÍTICO (riesgo alto):

1. **Módulo preproducción desconectado.** Todo el sistema de seguridad (modos, kill switches, rate limits) existe pero no está enchufado al swarm. Si se despliega en producción sin conectar, los agentes pueden enviar mensajes sin límite. **Acción necesaria: integrar `preActionCheck()` en `executeToolCall()` y en la sección de delegación de swarm.ts.**

2. **No hay entidad "caso".** Sin un concepto de caso persistido, no hay forma de:
   - Rastrear qué agente es el "dueño" de un cliente
   - Aplicar rate limits por caso (los contadores en guardrails.ts esperan un `caseId` que siempre es `null`)
   - Prevenir doble voz (dos agentes hablando al mismo cliente)
   - Medir el scorecard de go-live (que requiere `totalCases >= 10`)

3. **Memoria conversacional in-memory.** La short-term memory, working memory y user preferences se guardan en Maps de JavaScript. En Vercel, cada request puede ir a una función serverless diferente. Esto significa que la memoria conversacional es **no compartida entre requests** en entorno serverless. Funciona en desarrollo local (un proceso) pero es unreliable en producción Vercel.

### IMPORTANTE (riesgo medio):

4. **Streaming roto en mobile.** El chat móvil envía `stream: true` pero no parsea SSE. Puede causar respuestas vacías o errores silenciosos para usuarios en el chat PWA. El Super Panel sí funciona correctamente con streaming.

5. **Inconsistencia de voz en llamadas.** Las llamadas telefónicas por Twilio usan `Polly.Lucia` (Amazon) en vez de los voice profiles de ElevenLabs que se definen para cada agente. Si un agente habla por WhatsApp con voz ElevenLabs y luego llama por teléfono, el cliente oye una voz completamente diferente.

6. **Audit trail dual.** Hay dos sistemas de logging:
   - `agentLogs` (tabla DB) — se escribe en `logSwarmExecution()` después de cada ejecución, con datos básicos (action, input, output, tokens, duration, success)
   - `audit/logger.ts` (MemoryAuditStore in-memory) — se escribe durante la ejecución con eventos granulares (tool_called, tool_blocked, agent_delegated, etc.)
   
   El primero persiste. El segundo se pierde en cada deploy. No están sincronizados. Los eventos granulares de auditoría nunca llegan a la base de datos.

7. **`require("@/lib/audit")` dinámico.** El swarm.ts usa `require()` dinámico con try/catch para importar el módulo de auditoría (para evitar dependencias circulares). Si el path alias `@/` no resuelve en algún entorno (Vercel edge, algún bundler), toda la auditoría se silencia sin error visible.

### MENOR (riesgo bajo pero a tener en cuenta):

8. **Tokens en claro.** Los tokens MCP (`mcpTokens`) y OAuth (`emailAccounts.accessToken`, `emailAccounts.refreshToken`) se almacenan sin cifrar en la base de datos. Un acceso no autorizado a la DB expone todos los tokens.

9. **routeToAgent() trivial.** El router es una función de 10 líneas que envía todo a `recepcion`. Esto funciona porque `recepcion` tiene instrucciones en su system prompt para delegar, pero significa que el routing inteligente depende 100% de la calidad del prompt de GPT-5/Gemini, no de lógica determinista.

10. **MAX_ITERATIONS y MAX_DELEGATION_DEPTH.** Hay límites hardcoded (8 iteraciones, 3 niveles de delegación) pero no hay telemetría sobre cuántas veces se alcanzan en producción. Si un agente se acerca al límite, la respuesta se trunca silenciosamente.

---

## 10. Resumen Ejecutivo

### Lo que está SÓLIDO y funciona:

- La arquitectura del swarm (10 agentes, 4 capas de gobernanza, prompts detallados) está bien diseñada y bien testeada (460 tests passing)
- Las ~40 herramientas son reales y funcionales contra APIs reales (Gmail, Calendar, PostgreSQL, pgvector)
- Los 7 canales de comunicación están implementados con APIs reales (ElevenLabs, Twilio, WhatsApp, Telegram, Resend, Stability AI, Google Vision)
- La memoria vectorial con pgvector funciona (embeddings Gemini, búsqueda semántica, chunking)
- La base de datos es robusta: 27+ tablas normalizadas con multi-cuenta, soft delete, indexación
- La gobernanza nivel schema (filtrado de tools por agente) funciona
- La gobernanza nivel runtime (validateToolAccess) funciona para bloquear agentes internos
- El módulo de auditoría emite eventos granulares correctamente
- El módulo preproducción está completo y bien testeado como unidad

### Lo que está INCOMPLETO o desconectado:

| Gap | Severidad | Esfuerzo estimado |
|---|---|---|
| preActionCheck() no conectado al swarm | CRÍTICA | Media jornada |
| No hay entidad "caso" en DB | CRÍTICA | 1-2 días (diseño + migración + wiring) |
| Audit events se pierden (in-memory) | ALTA | 1 día (adapter DB + flush periódico) |
| Short-term memory in-memory | ALTA | 1 día (migrar a Redis o DB) |
| Streaming roto en mobile | MEDIA | 2-3 horas |
| Inconsistencia voz Twilio/ElevenLabs | BAJA | 1-2 horas |
| Tokens sin cifrar | BAJA* | Medio día |
| validateBeforeSend() no conectado | MEDIA | 2-3 horas |

*Baja prioridad para MVP, alta prioridad para producción con datos reales de clientes.

### Recomendación para la reestructuración:

El sistema tiene una base sólida. Los módulos están bien separados y los tests cubren la lógica de negocio. Las dos acciones de máximo impacto antes de ir a producción son:

1. **Conectar el módulo preproducción** — enchufar `preActionCheck()` al flujo real de swarm.ts para que modos, kill switches y rate limits funcionen de verdad.
2. **Crear la entidad "caso"** — una tabla que vincule cliente + agente owner + estado + timestamp, y que el swarm consulte/actualice en cada ejecución. Sin esto, el single-voice y los rate limits por caso son teóricos.

Todo lo demás (audit persistence, memoria Redis, streaming fix) puede hacerse incrementalmente una vez que el sistema de seguridad esté enchufado.
