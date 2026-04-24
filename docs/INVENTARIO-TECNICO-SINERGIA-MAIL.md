# INVENTARIO TÉCNICO COMPLETO — SINERGIA MAIL

**Fecha:** 21 de abril de 2026
**Versión auditada:** commit `52c7d9f` (main)
**Auditor:** Claude Opus — análisis de código fuente real, no estimaciones

---

## 1. RESUMEN EJECUTIVO

Sinergia Mail es una plataforma Next.js 14 con 213 ficheros fuente (~21.600 líneas), 83 API routes, 24 tablas PostgreSQL, 10 agentes IA (OpenAI GPT + Gemini fallback), y un sistema de gobernanza con auditoría persistente.

**Cifras clave:**

- 10 agentes en 4 capas (gobierno, visible, experta-interna, módulo-interno)
- 83 endpoints API (todos reales, conectados a DB o APIs externas)
- 24 tablas en schema.ts (5 nuevas v2: cases, audit_events, swarm_working_memory, rate_limit_counters, runtime_switches)
- 12 integraciones externas (Google Workspace, OpenAI, Gemini, Twilio, WhatsApp, Telegram, Resend, ElevenLabs, Deepgram, Stability AI, Google Vision, Stripe)
- 8 cron jobs en Vercel
- 4 modos de operación (dry-run, shadow, guarded, production)
- 7 kill switches (DB-backed, hot-swap)
- ~1.000 tests en 20 ficheros (60% comportamentales reales, 40% verificación de strings)

**Veredicto general:** Sistema ambicioso y funcionalmente amplio. El núcleo (swarm + gobernanza + auditoría + runtime) es sólido. Hay deuda técnica por crecimiento rápido: código legacy en paralelo con v2, tests inflados, algunas features "de catálogo" que aportan poco valor real al negocio, y una oficina virtual de 3.000 líneas que es espectacular visualmente pero cuestionable en ROI.

---

## 2. INVENTARIO POR BLOQUES

---

### A. NÚCLEO DE AGENTES

#### A1. Swarm (orquestación principal)

- **Qué es:** Motor central que recibe mensajes del usuario, selecciona agente, ejecuta herramientas, gestiona delegación entre agentes, y produce respuesta
- **Dónde vive:** `src/lib/agent/swarm.ts` (2.937 líneas)
- **Estado real:** SÓLIDO — es el corazón del sistema y funciona end-to-end
- **Valor negocio:** ALTO
- **Riesgo operativo:** MEDIO — fichero monolítico de casi 3.000 líneas, difícil de mantener
- **Duplicidades:** WEB_TOOLS (600 líneas inline) duplica esquemas que ya existen en super-tools. `executeParallelSwarm()` está marcado como @deprecated pero sigue ahí. `LEGACY_AGENT_ID_ALIASES` mapea 5 IDs viejos
- **Problemas:** El routing (`routeToAgent()`) es casi un no-op — todo va a "recepcion" y el routing real depende del LLM via delegate_task. El fichero es demasiado grande para mantenimiento seguro
- **Acción:** MEJORAR — extraer WEB_TOOLS, eliminar dead code, considerar split del fichero
- **Prioridad:** ALTA

#### A2. Routing de agentes

- **Qué es:** Función que decide qué agente atiende cada mensaje
- **Dónde vive:** `routeToAgent()` en swarm.ts (línea 794)
- **Estado real:** DECORATIVO — todo va a "recepcion" excepto si el mensaje empieza literalmente con "ceo". El routing real lo hace el LLM decidiendo cuándo usar `delegate_task`
- **Valor negocio:** BAJO (como código; el routing real lo hace el LLM)
- **Riesgo operativo:** BAJO — al ser un no-op, no puede romper nada
- **Acción:** SIMPLIFICAR — reconocer que el routing es por LLM y documentar, o implementar un router inteligente real basado en keywords/intención
- **Prioridad:** BAJA

#### A3. Prompts del sistema (triple fuente)

- **Qué es:** Los prompts que definen la personalidad y comportamiento de cada agente
- **Dónde vive:** En TRES sitios: (1) `swarm.ts` → cada agente tiene `systemPrompt` inline, (2) `agent-knowledge.ts` → `buildAgentPrompt()` genera prompts enriquecidos, (3) `personalities.ts` → 10 perfiles con tono/vocabulario/prompt
- **Estado real:** DUPLICADO — el swarm usa `knowledgePrompt || agent.systemPrompt` (knowledge.ts gana). personalities.ts solo lo usa el sistema legacy `execute.ts`
- **Valor negocio:** ALTO (los prompts son el alma del producto)
- **Riesgo operativo:** MEDIO — tres fuentes = riesgo de inconsistencia. Si editas un prompt en swarm.ts pensando que es el activo, no notarás que knowledge.ts lo sobreescribe
- **Duplicidades:** personalities.ts es completamente redundante con el sistema activo
- **Problemas:** `bi-scoring` en knowledge.ts describe expertise de "WordPress/web dev" en vez de BI/scoring. Consultor-digital no tiene entrada propia en knowledge
- **Acción:** SIMPLIFICAR — unificar a una sola fuente (knowledge.ts), eliminar personalities.ts, limpiar prompts inline de swarm.ts
- **Prioridad:** ALTA

#### A4. Permisos y gobernanza

- **Qué es:** Capa que controla qué puede hacer cada agente (herramientas, comunicación externa, delegación)
- **Dónde vive:** `validateToolAccess()` en swarm.ts, `governance.ts` en audit/, `tool-classification.ts` en runtime/
- **Estado real:** SÓLIDO — agentes internos bloqueados de herramientas externas, principio de voz única, validación de ownership, todo auditado
- **Valor negocio:** ALTO — es lo que diferencia un chatbot de un sistema empresarial
- **Riesgo operativo:** BAJO — bien testeado (tests de gobernanza reales)
- **Acción:** MANTENER
- **Prioridad:** -

#### A5. Ownership y casos

- **Qué es:** Sistema que asigna un "dueño visible" a cada caso cliente, impidiendo que múltiples agentes hablen al mismo cliente
- **Dónde vive:** `src/lib/cases/index.ts` (238 líneas), tabla `cases` en DB
- **Estado real:** SÓLIDO — lifecycle completo (open→active→waiting→closed), wired al swarm
- **Valor negocio:** ALTO
- **Riesgo operativo:** BAJO
- **Problemas:** Las transiciones de estado (close, status change) solo se pueden hacer desde el swarm; no hay UI para cerrar casos manualmente (el PATCH endpoint existe pero no tiene botón)
- **Acción:** MEJORAR — añadir acciones manuales en panel de operaciones
- **Prioridad:** MEDIA

---

### B. TOOLS Y EJECUCIÓN

#### B1. Super-tools (herramientas potentes)

- **Qué es:** 10 herramientas de alto nivel con lógica real (dashboard, búsqueda, forecast, etc.)
- **Dónde vive:** `src/lib/agent/super-tools.ts` (869 líneas)
- **Estado real:** SÓLIDO — todas tienen handlers async reales con queries a DB. `delegate_task` es un passthrough intencional (el swarm lo intercepta)
- **Valor negocio:** ALTO
- **Riesgo operativo:** BAJO
- **Acción:** MANTENER
- **Prioridad:** -

#### B2. Web Tools (herramientas inline en swarm)

- **Qué es:** ~40 herramientas definidas inline en swarm.ts (web search, SEO, Notion, marketing, etc.)
- **Dónde vive:** `swarm.ts` líneas 847-1453 (~600 líneas)
- **Estado real:** USABLE pero problemático — las herramientas funcionan, pero están definidas inline dentro del fichero más grande del proyecto. Algunas (Notion) son fakes que hacen web search con `site:notion.so`. Las de marketing devuelven metadata/guidelines que el LLM usa para componer, no contenido generado
- **Valor negocio:** MEDIO
- **Riesgo operativo:** MEDIO — código duplicado con super-tools, difícil de mantener
- **Duplicidades:** Esquemas duplicados entre WEB_TOOLS y super-tools
- **Acción:** MEJORAR — extraer a fichero propio, eliminar duplicados, documentar cuáles son "reales" y cuáles "asistidas por LLM"
- **Prioridad:** MEDIA

#### B3. Guardrails y pre-action checks

- **Qué es:** Capa que valida cada acción antes de ejecutarla: kill switches, rate limits, modo operación, reglas de gobernanza
- **Dónde vive:** `src/lib/runtime/guardrails.ts` (580 líneas)
- **Estado real:** SÓLIDO — `preActionCheck()` síncrono en el hot path + `preActionCheckAsync()` con persistencia DB
- **Valor negocio:** ALTO
- **Riesgo operativo:** MEDIO — los contadores del path síncrono son in-memory y se resetean en cada deploy. El async con DB existe pero el swarm usa principalmente el síncrono (por latencia)
- **Problemas:** Rate limits volátiles en el path principal. Si Vercel hace redeploy, los contadores vuelven a cero
- **Acción:** MEJORAR — usar contadores persistentes (async) en el path principal, o implementar un híbrido que escriba a DB de forma fire-and-forget
- **Prioridad:** ALTA

#### B4. Runtime config y kill switches

- **Qué es:** Configuración en caliente: 4 modos, 7 kill switches, 8 rate limits. Switches respaldados por DB con hot-swap
- **Dónde vive:** `src/lib/runtime/config.ts` + `db-switches.ts` + `db-rate-limits.ts` (~690 líneas total)
- **Estado real:** SÓLIDO — persistencia real en DB, caché 30s, fallback a env vars si DB falla
- **Valor negocio:** ALTO — permite operar sin redeploy
- **Riesgo operativo:** BAJO
- **Problemas:** Las tablas `runtime_switches` y `rate_limit_counters` no tienen migración Drizzle versionada (solo SQL inline en el runbook)
- **Acción:** MEJORAR — crear migración formal para estas tablas
- **Prioridad:** MEDIA

---

### C. CANALES

#### C1. Email (Gmail)

- **Qué es:** Integración completa: sync, lectura, borradores, envío, multi-cuenta con OAuth
- **Dónde vive:** `src/lib/gmail.ts` (347 líneas), `src/app/api/email-accounts/`, `src/app/api/sync/`, `src/app/api/send-email/`, `src/app/api/drafts/`
- **Estado real:** SÓLIDO — OAuth por cuenta, refresh de tokens con cifrado, MIME parsing recursivo, sync incremental. Es el canal principal y más maduro
- **Valor negocio:** ALTO — es la funcionalidad core del producto
- **Riesgo operativo:** BAJO
- **Acción:** MANTENER
- **Prioridad:** -

#### C2. WhatsApp (Meta Cloud API)

- **Qué es:** Envío de mensajes WhatsApp vía Meta Cloud API
- **Dónde vive:** `channels.ts` → `sendWhatsApp()`, `/api/whatsapp/route.ts`
- **Estado real:** USABLE — implementación real, pero unidireccional (solo envío). Bloqueado por defecto en staging/guarded. Requiere `META_WHATSAPP_TOKEN` + `META_WHATSAPP_PHONE_ID`
- **Valor negocio:** ALTO (potencial) — canal fundamental para Somos Sinergia
- **Riesgo operativo:** MEDIO — no hay recepción de mensajes entrantes, no hay gestión de templates aprobados por Meta
- **Acción:** MEJORAR — implementar webhook de recepción, gestión de templates
- **Prioridad:** ALTA

#### C3. SMS (Twilio)

- **Qué es:** Envío de SMS vía Twilio
- **Dónde vive:** `channels.ts` → `sendSMS()`
- **Estado real:** USABLE — implementación real, solo envío
- **Valor negocio:** BAJO — SMS tiene poco uso empresarial en España comparado con WhatsApp
- **Riesgo operativo:** BAJO
- **Acción:** CONGELAR — mantener pero no invertir más
- **Prioridad:** BAJA

#### C4. Teléfono (Twilio Voice)

- **Qué es:** Llamadas telefónicas con TwiML
- **Dónde vive:** `channels.ts` → `makePhoneCall()`
- **Estado real:** INCOMPLETO — puede iniciar llamadas, pero no hay IVR, no hay grabación, no hay transcripción automática, no hay flow conversacional
- **Valor negocio:** BAJO actualmente
- **Riesgo operativo:** BAJO — bloqueado por kill switches
- **Acción:** CONGELAR — no aporta valor sin un flujo conversacional completo
- **Prioridad:** BAJA

#### C5. Telegram (Bot API)

- **Qué es:** Envío de mensajes y voz por Telegram
- **Dónde vive:** `channels.ts` → `sendTelegram()`, `sendTelegramVoice()`
- **Estado real:** USABLE — implementación real, solo envío
- **Valor negocio:** BAJO — no es canal habitual para consultoras españolas
- **Riesgo operativo:** BAJO
- **Acción:** CONGELAR
- **Prioridad:** BAJA

#### C6. Voz (TTS/STT)

- **Qué es:** Text-to-Speech (ElevenLabs) y Speech-to-Text (Deepgram)
- **Dónde vive:** `channels.ts` → `textToSpeech()`, `speechToText()`, `/api/voice/route.ts`
- **Estado real:** USABLE — implementaciones reales, usadas en el chat (botón de voz, respuesta por voz)
- **Valor negocio:** MEDIO — diferenciador pero no esencial
- **Riesgo operativo:** BAJO
- **Acción:** MANTENER
- **Prioridad:** -

#### C7. OCR / Vision

- **Qué es:** Extracción de texto de imágenes (Google Cloud Vision) y documentos (Gemini Vision)
- **Dónde vive:** `channels.ts` → `ocrFromImage()`, `/api/agent/photo-extract/`, `/api/agent/pdf-extract/`
- **Estado real:** SÓLIDO — usado para extracción de facturas desde fotos/PDFs
- **Valor negocio:** ALTO — caso de uso real para fiscalistas
- **Riesgo operativo:** BAJO
- **Acción:** MANTENER
- **Prioridad:** -

#### C8. Búsqueda web

- **Qué es:** Google Custom Search API integrada como tool de agentes
- **Dónde vive:** Definida inline en swarm.ts WEB_TOOLS
- **Estado real:** SÓLIDO — búsqueda real con resultados formateados
- **Valor negocio:** MEDIO
- **Riesgo operativo:** BAJO
- **Acción:** MANTENER
- **Prioridad:** -

#### C9. Notion (fake)

- **Qué es:** Supuesta integración con Notion
- **Dónde vive:** WEB_TOOLS en swarm.ts → `notion_search`, `notion_create_page`
- **Estado real:** FAKE — `notion_search` hace un web search con `site:notion.so`, `notion_create_page` solo guarda en memoria episódica. No hay API key de Notion, no hay integración real
- **Valor negocio:** NULO
- **Riesgo operativo:** BAJO — no rompe nada, pero es engañoso
- **Acción:** ELIMINAR o implementar de verdad
- **Prioridad:** BAJA

#### C10. Mercado energético (OMIE/OMIP)

- **Qué es:** Motor de inteligencia de precios eléctricos
- **Dónde vive:** Definido como tools en swarm.ts / knowledge base
- **Estado real:** DECORATIVO — los agentes tienen knowledge sobre mercado eléctrico pero las "tools" devuelven metadata/guidelines. No hay conexión real a APIs de OMIE
- **Valor negocio:** MEDIO (potencial para Sinergia como consultora energética)
- **Riesgo operativo:** BAJO
- **Acción:** DECIDIR — si la energía es core del negocio, implementar conexión real a OMIE. Si no, eliminar
- **Prioridad:** MEDIA

---

### D. MEMORIA Y CONOCIMIENTO

#### D1. Memoria operativa (corto plazo)

- **Qué es:** Últimos 50 turnos de conversación por agente, con caché write-through a DB
- **Dónde vive:** `src/lib/agent/memory-engine.ts` (1.027 líneas), tabla `agent_conversations`
- **Estado real:** SÓLIDO — DB-backed, auto-summarización al llegar a 20 mensajes, warm-up desde DB en cold start
- **Valor negocio:** ALTO — sin esto los agentes no recuerdan nada entre deploys
- **Riesgo operativo:** BAJO
- **Acción:** MANTENER
- **Prioridad:** -

#### D2. Memoria semántica (largo plazo)

- **Qué es:** Búsqueda vectorial sobre documentos/emails ingeridos
- **Dónde vive:** tabla `memorySources` con pgvector, `/api/memory/route.ts`
- **Estado real:** SÓLIDO — embeddings + cosine similarity, backfill desde emails existentes
- **Valor negocio:** ALTO
- **Riesgo operativo:** BAJO
- **Acción:** MANTENER
- **Prioridad:** -

#### D3. Knowledge base por agente

- **Qué es:** Conocimiento especializado inyectado como system prompt (expertise, procedimientos, reglas de escalación, tareas diarias)
- **Dónde vive:** `src/lib/agent/agent-knowledge.ts` (1.015 líneas)
- **Estado real:** USABLE — 9 de 10 agentes con knowledge detallado. `consultor-digital` no tiene entrada propia. `bi-scoring` tiene knowledge de WordPress/web dev (incongruente con su rol)
- **Valor negocio:** ALTO
- **Riesgo operativo:** MEDIO — inconsistencias de contenido
- **Acción:** MEJORAR — corregir bi-scoring, añadir consultor-digital, revisar coherencia
- **Prioridad:** ALTA

#### D4. Context packs

- **Qué es:** Snapshots de datos por agente (emails, facturas, contactos) para enriquecer el contexto
- **Dónde vive:** `src/lib/agent/context-packs.ts` (95 líneas)
- **Estado real:** LEGACY/MUERTO — solo importado por `execute.ts` (sistema pre-swarm/Gemini). El swarm usa `buildMemorySnapshot()` de memory-engine.ts en su lugar
- **Valor negocio:** NULO (código muerto)
- **Riesgo operativo:** NULO
- **Acción:** ELIMINAR
- **Prioridad:** MEDIA

#### D5. Preferencias aprendidas

- **Qué es:** Detección automática de preferencias del usuario (tono, canal, longitud, formalidad, horario)
- **Dónde vive:** `memory-engine.ts` → `detectPreferences()` (5 patrones regex)
- **Estado real:** USABLE — funciona pero los patterns son muy básicos (regex hardcoded)
- **Valor negocio:** MEDIO
- **Riesgo operativo:** BAJO
- **Acción:** MANTENER
- **Prioridad:** -

#### D6. Working memory (estado del agente)

- **Qué es:** Contexto de tarea actual del agente, persistido en DB
- **Dónde vive:** tabla `swarm_working_memory`, memory-engine.ts
- **Estado real:** SÓLIDO — DB-backed, usado por swarm
- **Valor negocio:** MEDIO
- **Riesgo operativo:** BAJO
- **Acción:** MANTENER
- **Prioridad:** -

---

### E. AUDITORÍA Y OPERACIÓN

#### E1. Audit events

- **Qué es:** Trazabilidad completa: 21 tipos de evento, escritura dual (memoria + DB), queries por caso/agente/tipo
- **Dónde vive:** `src/lib/audit/` (7 ficheros, ~700 líneas), tabla `audit_events`
- **Estado real:** SÓLIDO — batched writes (20 eventos o flush cada 2s), fire-and-forget. Modo dual: memoria para lectura rápida, DB para persistencia
- **Valor negocio:** ALTO
- **Riesgo operativo:** MEDIO — fire-and-forget = eventos pueden perderse si DB falla en el batch write
- **Acción:** MANTENER (considerar retry en batch write)
- **Prioridad:** -

#### E2. Panel de operaciones

- **Qué es:** Dashboard interno con health KPIs, lista de casos, actividad reciente, detalle por caso con timeline
- **Dónde vive:** `src/components/operations/` (5 componentes, ~1.200 líneas), `/api/operations/` (6 endpoints)
- **Estado real:** SÓLIDO — todo conectado a datos reales de DB
- **Valor negocio:** ALTO — imprescindible para operar el sistema
- **Riesgo operativo:** BAJO
- **Acción:** MANTENER
- **Prioridad:** -

#### E3. Sanity-check

- **Qué es:** Endpoint que valida 8 subsistemas antes/después de deploy
- **Dónde vive:** `/api/operations/sanity-check/route.ts`
- **Estado real:** SÓLIDO
- **Valor negocio:** ALTO
- **Acción:** MANTENER
- **Prioridad:** -

#### E4. Smoke validation

- **Qué es:** Script bash que valida un deploy contra una URL
- **Dónde vive:** `scripts/smoke-validation.sh`
- **Estado real:** USABLE — 7 bloques de checks, bien estructurado. No testa login ni chat
- **Valor negocio:** MEDIO
- **Acción:** MANTENER
- **Prioridad:** -

---

### F. UI / PRODUCTO

#### F1. Chat web

- **Qué es:** Interfaz de chat con 10 agentes, SSE streaming, voz, cámara OCR
- **Dónde vive:** `src/app/chat/page.tsx` (933 líneas)
- **Estado real:** SÓLIDO — mobile-first, conectado al swarm real vía `/api/agent-gpt5`
- **Valor negocio:** ALTO — es el punto de entrada principal del usuario
- **Riesgo operativo:** BAJO
- **Acción:** MANTENER
- **Prioridad:** -

#### F2. Dashboard

- **Qué es:** Shell principal con 12 tabs (overview, emails, facturas, automatizacion, outreach, CRM, finanzas, workspace, agente-ia, entrenar-ia, operaciones, config)
- **Dónde vive:** `src/app/dashboard/page.tsx` (610 líneas)
- **Estado real:** SÓLIDO pero SOBRECARGADO — 12 tabs top-level, muchos con sub-tabs. El usuario medio probablemente usa 4-5. Varios tabs comparten funcionalidad o son de uso muy esporádico
- **Valor negocio:** ALTO (como shell), BAJO (tabs infrautilizados)
- **Riesgo operativo:** BAJO
- **Duplicidades:** "agente-ia" y el chat son parcialmente redundantes. "entrenar-ia" y "config" se solapan
- **Acción:** SIMPLIFICAR — reducir tabs, fusionar los que se solapan
- **Prioridad:** MEDIA

#### F3. Oficina virtual

- **Qué es:** Visualización animada de los 10 agentes en un entorno de oficina con mobiliario SVG, movimiento, diálogos, delegaciones, actividad en tiempo real
- **Dónde vive:** `src/components/AgentOfficeMap.tsx` (3.032 líneas)
- **Estado real:** HÍBRIDO — conectada a datos reales vía SSE (cuando hay audit events, muestra estados reales). Sin datos reales, muestra animaciones ambient (caminar, café, diálogos scripted). Es el fichero más grande de todo el proyecto
- **Valor negocio:** BAJO-MEDIO — impresiona visualmente, pero el valor operativo real es limitado. Un listado simple de "agente X está haciendo Y" daría la misma información en 100 líneas. 3.032 líneas de SVG inline, CSS animations y scripts de diálogo no escalan
- **Riesgo operativo:** MEDIO — cualquier cambio en el mapa de agentes requiere editar un fichero de 3.000 líneas con SVG artesanal
- **Problemas:** Complejidad desproporcionada respecto al valor. Consume ancho de banda del SSE. Las animaciones ambient son bonitas pero no aportan info útil
- **Acción:** DECIDIR — si el "wow factor" es parte del producto, mantener pero extraer SVGs a componentes separados. Si no, reemplazar por un status board ligero
- **Prioridad:** MEDIA

#### F4. Super Panel

- **Qué es:** Chat avanzado con el swarm GPT-5, mostrando tool calls, delegaciones y metadata
- **Dónde vive:** `src/components/AgentSuperPanel.tsx` (659 líneas)
- **Estado real:** SÓLIDO — conectado al backend real
- **Valor negocio:** MEDIO — útil para debugging/supervisión, no para usuario final
- **Riesgo operativo:** BAJO
- **Duplicidades:** Se solapa con el chat normal (F1)
- **Acción:** MANTENER como herramienta interna / modo admin
- **Prioridad:** BAJA

#### F5. Navegación (Sidebar + Mobile)

- **Qué es:** Sidebar desktop (244 líneas) + Bottom nav mobile (163 líneas)
- **Estado real:** SÓLIDO — responsive, bien estructurado
- **Valor negocio:** MEDIO
- **Acción:** MANTENER
- **Prioridad:** -

---

### G. SEGURIDAD / INFRAESTRUCTURA

#### G1. Cifrado de tokens

- **Qué es:** AES-256-GCM para tokens OAuth almacenados en DB
- **Dónde vive:** `src/lib/crypto/tokens.ts` (117 líneas)
- **Estado real:** SÓLIDO — cifrado real, backwards compatible, graceful degradation
- **Valor negocio:** ALTO (compliance)
- **Acción:** MANTENER
- **Prioridad:** -

#### G2. Base de datos (PostgreSQL)

- **Qué es:** 24 tablas via Drizzle ORM
- **Dónde vive:** `src/db/schema.ts` (655 líneas)
- **Estado real:** SÓLIDO pero con tablas potencialmente infrautilizadas
- **Tablas posiblemente infrautilizadas:** `visits` (solo schema, sin service layer), `emailSequences` grupo (drip campaigns — sin evidencia de uso activo), `outboundMessages` (pipeline de envío no verificado)
- **Problemas:** Driver duplicado — `pg` y `postgres` en package.json (probablemente solo se necesita uno). `drizzle-kit` está en dependencies en vez de devDependencies
- **Acción:** MEJORAR — verificar uso real de tablas, limpiar deps
- **Prioridad:** MEDIA

#### G3. Migraciones

- **Qué es:** Archivos SQL para crear tablas nuevas
- **Dónde vive:** `drizzle/0001_phase3_tables.sql`
- **Estado real:** INCOMPLETO — solo Phase 3 tiene migración formal. Phase 4 (runtime_switches, rate_limit_counters) solo tiene SQL inline en docs/runbook. No hay pipeline de migraciones automatizado
- **Acción:** MEJORAR — crear migraciones para todas las tablas v2
- **Prioridad:** ALTA

#### G4. Cron jobs (8 definidos)

- **Qué es:** Tareas periódicas en Vercel Cron

| Cron | Frecuencia | Estado |
|------|-----------|--------|
| sync (Gmail) | 15 min | SÓLIDO |
| daily-agents | 1h | USABLE — itera todos los usuarios sin límite real |
| process-outbound | 5 min | USABLE |
| process-sequences | 1h | FRÁGIL — N+1 queries |
| recalculate-scores | 3am | USABLE — itera todos los usuarios |
| weekly-report | Lun 8am | SÓLIDO |
| rgpd-retention | 2am | SÓLIDO |
| audit-cleanup | 3am | SÓLIDO |

- **Problemas:** `daily-agents` y `recalculate-scores` no escalan bien con muchos usuarios. `process-sequences` tiene patrón N+1
- **Acción:** MEJORAR daily-agents y process-sequences. REVISAR si todos los crons son necesarios
- **Prioridad:** MEDIA

#### G5. Secretos y env vars

- **Qué es:** Configuración por entorno
- **Estado real:** BIEN ORGANIZADO — `.env.example` documenta ~25 vars, `.env.staging` tiene placeholders seguros, `.env.production` está en .gitignore. Todos los canales degradan gracefully sin API key
- **Acción:** MANTENER
- **Prioridad:** -

#### G6. Tests

- **Qué es:** Suite de ~1.000 tests en 20 ficheros
- **Estado real:** MIXTO
  - **60% tests reales:** Governance (7 ficheros) importan funciones y las ejecutan con inputs/outputs reales. E2E (2 ficheros) simulan flujos de negocio completos. Guardrails y runtime-config testeados con llamadas reales
  - **40% tests "grep":** go-live-readiness, operations-panel, office-10agents-visual, etc. — leen ficheros con `fs.readFileSync` y verifican que strings existen en el código fuente. Son checks estructurales/lint, no tests de comportamiento
- **Valor negocio:** ALTO (los reales), BAJO (los grep)
- **Problemas:** (1) DB mockeada = 0 tests de persistencia real. (2) 0 tests de API routes. (3) 0 tests de componentes React. (4) Tests grep inflan el conteo pero se rompen con refactors cosméticos
- **Acción:** MEJORAR — priorizar tests de DB integration y API routes sobre más tests grep
- **Prioridad:** ALTA

#### G7. CI/CD

- **Qué es:** Pipeline de integración continua
- **Estado real:** NO EXISTE — no hay `.github/workflows/`, no hay pipeline de tests automáticos en push. Vercel deploya directamente desde main sin gate de tests
- **Valor negocio:** ALTO (falta)
- **Riesgo operativo:** ALTO — un push con bug va directo a producción
- **Acción:** IMPLEMENTAR
- **Prioridad:** ALTA

---

## 3. LO QUE SOBRA / DEBERÍA SIMPLIFICARSE

### Código muerto confirmado

1. **`personalities.ts`** — 156 líneas. Solo usado por `execute.ts` (sistema legacy pre-swarm). Completamente redundante con los prompts de swarm.ts + knowledge.ts. **Eliminar.**

2. **`context-packs.ts`** — 95 líneas. Solo importado por `execute.ts`. El swarm tiene su propio sistema de context (memory-engine). **Eliminar.**

3. **`executeParallelSwarm()`** — Función en swarm.ts marcada como @deprecated, nunca llamada. **Eliminar.**

4. **`getSwarmStatus()`** — Export de swarm.ts, uso externo no confirmado. **Verificar y probablemente eliminar.**

5. **`LEGACY_AGENT_ID_ALIASES`** — 5 mappings de IDs viejos. Si ya no hay datos legacy en DB, **eliminar**.

### Cosas que complican demasiado

6. **Triple fuente de prompts** (swarm.ts inline + knowledge.ts + personalities.ts) — Una sola fuente bastaría. La complejidad de "knowledgePrompt || agent.systemPrompt" genera confusión sobre qué prompt está activo.

7. **WEB_TOOLS inline en swarm.ts** (600 líneas) — Debería ser un fichero aparte. Algunos tools duplican lo que ya existe en super-tools.

8. **Oficina virtual de 3.032 líneas** — Fichero más grande del proyecto entero. SVG artesanal, animaciones CSS, scripts de diálogo, todo inline. El ratio complejidad/valor es el peor del proyecto.

9. **40% de tests son grep de strings** — Inflan el conteo de "1.000+ tests" pero no detectan bugs reales. Un refactor cosmético los rompe todos.

### Cosas bonitas pero poco útiles

10. **Animaciones ambient de la oficina** (agentes caminando al café, water cooler, bocadillos de diálogo) — Visualmente impresionante, operativamente inútil. Un status board simple daría la misma información.

11. **Notion integration (fake)** — `notion_search` es un web search disfrazado. `notion_create_page` guarda en memoria local. Es teatro.

12. **Teléfono (Twilio Voice)** — Puede iniciar llamadas pero sin IVR, sin flow conversacional, sin grabación. Es una feature de catálogo.

13. **Telegram** — Canal funcional pero irrelevante para el mercado de Sinergia (consultoras españolas).

### Piezas duplicadas

14. **Chat (page.tsx) vs Super Panel** — Ambos envían al mismo endpoint. El super panel muestra metadata extra pero la UX base es la misma.

15. **Tab "agente-ia" en dashboard vs chat dedicado** — Funcionalidad parcialmente solapada.

16. **Tab "entrenar-ia" vs "config"** — Se pisan conceptualmente.

17. **Driver `pg` + `postgres` en package.json** — Solo se necesita uno.

---

## 4. LO QUE FALTA DE VERDAD

### Huecos críticos para operación

1. **CI/CD pipeline** — No hay gate de tests antes de deploy. Un push a main va directo a producción en Vercel. Esto es el hueco más peligroso.

2. **Tests de integración con DB real** — El mock actual devuelve resultados vacíos. 0 tests verifican que las queries SQL funcionan, que los schemas están sincronizados, que las migraciones aplican correctamente.

3. **Migraciones formales para todas las tablas v2** — Solo Phase 3 tiene migración. Phase 4 (runtime_switches, rate_limit_counters) existe como SQL suelto en un doc.

4. **Error monitoring (Sentry o similar)** — `SENTRY_DSN` aparece vacío en todas las configs. En producción, si un agente falla no hay alerta automática.

### Huecos de producto

5. **WhatsApp bidireccional** — Solo envía; no recibe. Para una consultora que quiere atender clientes por WhatsApp, esto es media feature. Falta webhook de recepción, templates aprobados por Meta, y gestión de sesiones de 24h.

6. **Cierre manual de casos** — El endpoint PATCH existe pero no hay botón en el panel de operaciones. El operador humano no puede cerrar, reasignar, o escalar casos sin tocar código.

7. **Dashboard de métricas de agentes** — No hay vista de "qué agente resuelve más casos", "tiempo medio de resolución", "tasa de bloqueos por agente". Los datos existen en audit_events pero no hay UI que los muestre.

8. **Notificaciones al operador humano** — Si un agente se bloquea o hay una violación de gobernanza, nadie se entera hasta que mire el panel de operaciones. No hay push/email/Slack de alerta.

### Huecos de capacidades de agentes

9. **Acceso real a CRM del cliente** — Los agentes tienen herramientas de búsqueda web y tools genéricas, pero no pueden consultar el CRM real del usuario (contactos, historial de interacciones, pipeline). El módulo de contactos existe en DB pero los agentes no lo tienen como tool directa.

10. **Generación de documentos** — Los agentes pueden analizar PDFs/facturas pero no pueden generar presupuestos, contratos, o propuestas. Para una consultora, esto es fundamental.

11. **Conexión real a OMIE/mercado energético** — Si la energía es core del negocio, los agentes necesitan precios reales, no guidelines genéricas.

12. **Scheduling / agenda** — Los agentes pueden crear eventos en Google Calendar pero no pueden proponer horarios, gestionar disponibilidad, o coordinar reuniones con clientes.

### Huecos de control humano

13. **Aprobación humana en modo guarded** — El modo "guarded" está definido pero no hay UI de cola de aprobación. El operador debería poder ver "el agente X quiere enviar este email a cliente Y — ¿aprobar/rechazar?".

14. **Rollback de acciones** — Si un agente envía un email incorrecto, no hay forma de "deshacer" o al menos marcar la acción como errónea para aprendizaje.

---

## 5. MATRIZ FINAL DE DECISIÓN

| # | Componente | Estado | Valor | Acción | Prioridad |
|---|-----------|--------|-------|--------|-----------|
| 1 | Swarm (orquestación) | Sólido | Alto | Mejorar (split fichero, limpiar dead code) | Alta |
| 2 | Routing de agentes | Decorativo | Bajo | Simplificar (documentar que es LLM-driven) | Baja |
| 3 | Prompts (triple fuente) | Duplicado | Alto | Simplificar (unificar en knowledge.ts) | Alta |
| 4 | Gobernanza/permisos | Sólido | Alto | Mantener | - |
| 5 | Casos/ownership | Sólido | Alto | Mejorar (UI de acciones manuales) | Media |
| 6 | Super-tools | Sólido | Alto | Mantener | - |
| 7 | Web tools (inline) | Usable | Medio | Mejorar (extraer, deduplicar) | Media |
| 8 | Guardrails | Sólido | Alto | Mejorar (contadores persistentes en hot path) | Alta |
| 9 | Runtime config | Sólido | Alto | Mejorar (migración formal de tablas) | Media |
| 10 | Kill switches | Sólido | Alto | Mantener | - |
| 11 | Email (Gmail) | Sólido | Alto | Mantener | - |
| 12 | WhatsApp | Incompleto | Alto (potencial) | Mejorar (bidireccional) | Alta |
| 13 | SMS | Usable | Bajo | Congelar | Baja |
| 14 | Teléfono | Incompleto | Bajo | Congelar | Baja |
| 15 | Telegram | Usable | Bajo | Congelar | Baja |
| 16 | Voz (TTS/STT) | Usable | Medio | Mantener | - |
| 17 | OCR/Vision | Sólido | Alto | Mantener | - |
| 18 | Web search | Sólido | Medio | Mantener | - |
| 19 | Notion (fake) | Fake | Nulo | Eliminar | Baja |
| 20 | OMIE/energía | Decorativo | Medio | Decidir (¿es core?) | Media |
| 21 | Memoria operativa | Sólido | Alto | Mantener | - |
| 22 | Memoria semántica | Sólido | Alto | Mantener | - |
| 23 | Knowledge base | Usable | Alto | Mejorar (corregir inconsistencias) | Alta |
| 24 | Context packs | Muerto | Nulo | Eliminar | Media |
| 25 | Personalities.ts | Muerto | Nulo | Eliminar | Media |
| 26 | Audit events | Sólido | Alto | Mantener | - |
| 27 | Panel operaciones | Sólido | Alto | Mantener | - |
| 28 | Sanity-check | Sólido | Alto | Mantener | - |
| 29 | Chat web | Sólido | Alto | Mantener | - |
| 30 | Dashboard (12 tabs) | Sobrecargado | Alto | Simplificar (reducir tabs) | Media |
| 31 | Oficina virtual | Híbrido | Bajo-Medio | Decidir (wow vs. ROI) | Media |
| 32 | Super Panel | Sólido | Medio | Mantener (como herramienta admin) | Baja |
| 33 | Cifrado tokens | Sólido | Alto | Mantener | - |
| 34 | DB schema | Sólido | Alto | Mejorar (verificar tablas huérfanas) | Media |
| 35 | Migraciones | Incompleto | Alto | Mejorar (formalizar todas) | Alta |
| 36 | Cron jobs | Usable | Medio | Mejorar (N+1, escalabilidad) | Media |
| 37 | Tests (60% reales) | Mixto | Alto | Mejorar (DB tests, API tests, menos grep) | Alta |
| 38 | CI/CD | No existe | Alto (falta) | Implementar | Alta |
| 39 | Error monitoring | No existe | Alto (falta) | Implementar | Alta |
| 40 | Aprobación humana | No existe | Alto (falta) | Implementar | Alta |

---

## 6. TOP 10 DECISIONES ANTES DE SEGUIR AMPLIANDO

**1. Implementar CI/CD (GitHub Actions)** — Tests automáticos en push, gate antes de deploy a producción. Sin esto, cualquier ampliación es una ruleta rusa.

**2. Unificar fuente de prompts** — Eliminar personalities.ts y context-packs.ts. Consolidar en knowledge.ts como fuente única. Limpiar los systemPrompt inline de swarm.ts (que queden como fallback documentado).

**3. Rate limits persistentes en el hot path** — Los contadores in-memory que se resetean en deploy son una bomba. Migrar el path principal a contadores DB (fire-and-forget write, read con cache).

**4. Crear migraciones formales** — runtime_switches y rate_limit_counters necesitan migración versionada. Sin esto, el primer deploy a un entorno nuevo falla.

**5. Implementar error monitoring (Sentry)** — Sin alertas automáticas cuando un agente falla o un guardrail bloquea, el operador está ciego.

**6. WhatsApp bidireccional** — Si Sinergia quiere atender clientes por WhatsApp (caso de uso natural para consultora), implementar recepción vía webhook. Sin esto, WhatsApp es solo envío de notificaciones.

**7. Decidir sobre la oficina virtual** — 3.032 líneas (el fichero más grande del proyecto) para una visualización. Dos opciones: (a) mantener como diferenciador visual pero extraer SVGs a componentes, o (b) reemplazar por un status board ligero de 200 líneas y ganar mantenibilidad.

**8. Cola de aprobación humana para modo guarded** — El modo guarded está diseñado pero sin UI de aprobación, no se puede operar. El humano necesita una cola de "acciones pendientes de aprobación" con accept/reject.

**9. Refactorizar swarm.ts** — 2.937 líneas en un solo fichero. Extraer WEB_TOOLS (~600 líneas), eliminar executeParallelSwarm, eliminar legacy aliases. Objetivo: bajar a ~1.800 líneas con mejor mantenibilidad.

**10. Tests de integración real** — Antes de ampliar features, necesitamos al menos: tests de API routes con request/response mock, y tests de queries críticas contra un DB en memoria (pg-mem o test container). Los tests grep no protegen contra regresiones reales.
