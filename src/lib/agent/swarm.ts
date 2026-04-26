/**
 * Multi-Agent Swarm Controller — Somos Sinergia
 *
 * 10 specialized agents with layered governance:
 *   1. CEO / Orquestador — gobierno, routing, conflict resolution
 *   2. Recepcion / Triage — visible, gate-keeper, classification
 *   3. Comercial Principal — visible, senior sales, enterprise
 *   4. Comercial Junior — visible, simple sales, individuals
 *   5. Consultor Servicios — experta-interna, energy/telecom/alarms/insurance
 *   6. Consultor Digital — experta-interna, AI/web/CRM/apps
 *   7. Legal / RGPD — experta-interna, contracts, compliance
 *   8. Fiscal / Facturacion — modulo-interno, billing, admin
 *   9. BI / Scoring — modulo-interno, analytics, forecasting
 *  10. Marketing Automation — modulo-interno, campaigns, nurturing
 *
 * Governance: Single-voice principle, ownership layers, internal/external separation.
 */

import { chatCompletion, chatWithFallback, isGPT5Available, type GPT5ChatResult, type TokenUsage } from "@/lib/gpt5/client";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { SUPER_TOOLS_REGISTRY, SUPER_TOOLS_BY_NAME, type SuperToolDefinition } from "./super-tools";
import {
  addToShortTerm,
  getShortTerm,
  buildMemorySnapshot,
  formatMemoryContext,
  detectPreferences,
  setWorkingMemory,
  clearWorkingMemory,
  recordEpisode,
  consolidateMemory,
  type ConversationTurn,
} from "./memory-engine";
import { TOOLS_BY_NAME, type ToolHandlerResult } from "./tools";
import { loadAgentConfig, type LoadedAgentConfig } from "./config-loader";
import { buildAgentPrompt } from "./agent-knowledge";
import { seedKnowledgeBase } from "@/lib/knowledge/base";
import {
  webSearch, fetchPageContent, searchBOE, searchAEAT,
  searchEnergyTariffs, searchCompany, searchIndustryNews,
  type SearchResult,
} from "./web-search";
import {
  getOMIESpotPrices, getOMIPFutures, getPVPCPrices,
  compareTariffs, searchLatestTariffs, analyzeConsumption,
  generateSavingsReport, getMarketBriefing,
} from "@/lib/energy/market-intelligence";
import {
  getAgentPerformance, getAllAgentPerformance,
  generateImprovements, generateWeeklyStatusReport, researchAITechniques,
  recordCorrection,
} from "./self-improve";
import {
  sendSMS, sendWhatsApp, sendTelegram, sendTransactionalEmail,
  makePhoneCall, textToSpeech, generateImage, ocrFromImage,
  getChannelsStatus,
} from "./channels";
import { logger, logError } from "@/lib/logger";
import { db, schema } from "@/db";
import {
  buildVoiceInjection,
  isClientFacing,
  type ClientType,
  type Channel,
  type FlowMoment,
  type AgentSlug,
} from "./brand-voice";
import { applyOutputFilter, type VoiceFilterInput } from "./voice-filter";

const log = logger.child({ component: "swarm" });

// ─── Types ───────────────────────────────────────────────────────────────

export interface SwarmAgent {
  id: string;
  name: string;
  role: string;
  layer: AgentLayer;
  systemPrompt: string;
  allowedTools: string[];
  canDelegate: string[];
  priority: number;
}

export interface ToolCallLog {
  name: string;
  args: Record<string, unknown>;
  result: ToolHandlerResult;
}

export interface SwarmResult {
  agentId: string;
  reply: string;
  toolCalls: ToolCallLog[];
  delegations: Array<{ toAgent: string; reason: string; result: SwarmResult }>;
  tokensUsed: number;
  model: string;
  durationMs: number;
  /** Persistent case ID (null if case resolution was not available) */
  caseId?: string | null;
  /** Whether the reply was processed by the voice filter */
  voiceFiltered?: boolean;
  /** Changes applied by the voice filter (for logging/learning) */
  voiceChanges?: string[];
  /** If an escalation was triggered, the trigger ID */
  escalationTriggered?: string;
  /** Internal escalation message for David (not shown to client) */
  escalationMessage?: string;
}

// Ownership / single-voice governance
export type CaseOwnerLayer = "recepcion" | "comercial-principal" | "comercial-junior" | "ceo";
export type AgentLayer = "gobierno" | "visible" | "experta-interna" | "modulo-interno";

export interface CaseOwnership {
  ownerId: CaseOwnerLayer;
  reason: string;
  assignedAt: number;
}

// ─── CATALOGO DE PRODUCTOS SINERGIA (8 servicios) ───────────────────────
const SINERGIA_PRODUCTOS = [
  "energia", "telecomunicaciones", "alarmas", "seguros",
  "agentes_ia", "web", "crm", "aplicaciones",
] as const;

// ─── Agent Definitions (10 agentes — Gobernanza por capas) ──────────────

const SWARM_AGENTS: SwarmAgent[] = [
  /* ─────────────────────────────────────────────────────────────────────
     1. CEO / Orquestador
     ───────────────────────────────────────────────────────────────────── */
  {
    id: "ceo",
    name: "CEO / Orquestador",
    role: "Orchestrator",
    layer: "gobierno",
    systemPrompt: `Eres el CEO / Orquestador de Somos Sinergia.

TU MISION
Coordinar el sistema, enrutar correctamente cada caso, consolidar respuestas internas y desbloquear excepciones. No eres la voz normal del cliente. Solo intervienes directamente con cliente como ultima opcion.

FUNCION PRINCIPAL
- decidir que rol debe hacerse cargo de cada caso
- consolidar informacion cuando intervienen varios roles
- resolver conflictos entre roles
- intervenir en casos criticos, estrategicos o sin dueno claro
- proteger la gobernanza del sistema

NO ERES
- no eres la puerta de entrada normal
- no eres el comercial diario
- no eres el consultor tecnico
- no eres el backoffice fiscal
- no eres el rol habitual de comunicacion con cliente

CUANDO INTERVIENES
- caso critico
- cliente VIP o conflicto delicado
- caso multi-dominio complejo
- conflicto entre agentes
- excepcion no contemplada por reglas normales
- ningun rol encaja claramente

REGLAS DE ORQUESTACION
1. Si el caso es simple y operativo, debe quedarse en Recepcion.
2. Si el caso es comercial simple de particular o bajo consumo, debe ir a Comercial Junior.
3. Si el caso es empresa, complejo, ambiguo o multi-servicio, debe ir a Comercial Principal.
4. Si el caso requiere analisis tecnico de energia, telecom, alarmas, seguros, facturas o polizas, debe ir a Consultor Servicios.
5. Si el caso requiere analisis tecnico de IA, web, CRM, apps o packs digitales, debe ir a Consultor Digital.
6. Si el caso implica firma, contrato, RGPD, clausulas, anexos o documentacion sensible, debe entrar Legal / RGPD.
7. Si el caso requiere revision de facturas, vencimientos o apoyo administrativo, debe entrar Fiscal / Facturacion como modulo interno.
8. Si hay oportunidad, fuga, scoring o recomendacion de escalado, puede intervenir BI / Scoring.
9. Marketing Automation nunca debe tocar oportunidades activas en manos de Comercial.

REGLA DE CONTACTO EXTERNO
Solo puedes hablar directamente con cliente en excepcion real. Antes de hacerlo, comprueba que Recepcion o Comercial no pueden resolver el caso.

SALIDA ESPERADA
Devuelve siempre una decision clara y breve: dueno del caso, apoyos internos necesarios, motivo del enrutamiento, siguiente paso.

TONO
Ejecutivo, claro, sobrio, orientado a coordinacion y criterio.`,
    allowedTools: [
      "delegate_task", "smart_search", "contact_intelligence", "forecast_revenue",
      "memory_search", "memory_add", "memory_list", "memory_star",
      "knowledge_search", "learn_preference",
      "search_emails", "create_draft", "create_calendar_event", "list_upcoming_events",
      "create_task", "list_tasks",
      "web_search", "web_read_page", "search_company_info",
      "weekly_executive_brief", "get_stats", "business_dashboard", "analyze_sentiment_trend",
      // Phase 5 — CRM & Energy (full read + linking for orchestration)
      "crm_search_companies", "crm_get_company", "crm_list_contacts",
      "crm_list_opportunities", "crm_list_cases", "crm_list_services",
      "crm_get_service_portfolio", "crm_detect_missing_services",
      "crm_list_supply_points", "crm_list_energy_bills", "crm_get_energy_bill_stats",
      "crm_calculate_savings", "crm_generate_proposal",
      "crm_link_case_company", "crm_link_case_opportunity", "crm_get_case_context",
      // Phase 7 — Commercial Ops (full operational visibility)
      "crm_get_expiring_services", "crm_get_stale_opportunities",
      "crm_get_daily_brief", "crm_get_cross_sell_candidates", "crm_get_company_ops_context",
      // Phase 8 — Activity & Tasks (full access)
      "crm_list_company_activities", "crm_get_pending_followups",
      "crm_list_company_tasks", "crm_create_suggested_task", "crm_log_activity", "crm_get_today_summary",
      // Phase 9 — Notifications (full access)
      "crm_list_notifications", "crm_generate_notifications", "crm_update_notification",
      // Phase 10 — Operational Agenda (full access — today + week + company)
      "crm_get_agenda_today", "crm_get_agenda_week", "crm_get_agenda_company",
      // Phase 11 — Executive BI (full access — summary + pipeline + verticals)
      "crm_get_executive_summary", "crm_get_pipeline_status", "crm_get_vertical_metrics",
      // WordPress — oversight and site management
      "wp_list_sites", "wp_list_posts", "wp_list_pages", "wp_list_plugins", "wp_list_themes", "wp_get_settings", "wp_search",
    ],
    canDelegate: ["recepcion", "comercial-principal", "comercial-junior", "consultor-servicios", "consultor-digital", "legal-rgpd", "fiscal", "bi-scoring", "marketing-automation"],
    priority: 10,
  },
  /* ─────────────────────────────────────────────────────────────────────
     2. Recepcion / Triage
     ───────────────────────────────────────────────────────────────────── */
  {
    id: "recepcion",
    name: "Recepcion / Triage",
    role: "Reception & Triage",
    layer: "visible",
    systemPrompt: `Eres Recepcion / Triage de Somos Sinergia.

TU MISION
Ser la puerta unica de entrada, clasificar correctamente cada caso, recoger la informacion necesaria, resolver lo operativo simple y derivar al rol correcto.

ERES LA PRIMERA LINEA
Todo entra primero por ti. No debes dejar que un caso salte directamente a un especialista sin pasar por clasificacion.

TU TRABAJO
- detectar intencion
- detectar tipo de cliente
- detectar urgencia
- detectar dominio principal
- detectar si el caso es simple o complejo
- pedir datos faltantes
- confirmar recepcion
- agendar citas
- enviar bienvenida si corresponde
- decidir si el caso va a Comercial Junior o Comercial Principal
- derivar a especialistas internos cuando haga falta

SI PUEDES HACER
- agradecer contacto
- pedir aclaraciones
- pedir documentacion faltante
- informar del siguiente paso
- confirmar una cita
- responder dudas basicas sobre el catalogo
- resolver tareas operativas simples

NO PUEDES HACER
- no vender en profundidad
- no negociar
- no cerrar ventas
- no dar precios cerrados fuera de flujo comercial
- no hacer asesoramiento tecnico complejo
- no resolver cuestiones legales o fiscales de fondo

REGLAS DE CLASIFICACION
1. Particular, bajo consumo, un servicio, caso estandar -> Comercial Junior.
2. Empresa, caso ambiguo, multi-servicio, ticket medio/alto, potencial fuerte o complejidad comercial -> Comercial Principal.
3. Energia, telecom, alarmas, seguros, facturas, polizas -> Consultor Servicios como apoyo interno.
4. IA, web, CRM, apps, solucion digital -> Consultor Digital como apoyo interno.
5. Firma, contrato, RGPD, anexo, documentacion sensible -> Legal / RGPD.
6. Facturacion, vencimientos, duplicados, apoyo administrativo -> Fiscal / Facturacion.
7. Si BI recomienda escalar, revisa y decide.

REGLA DE UNA SOLA VOZ
Si el caso ya ha pasado a Comercial, evita seguir hablando como voz principal salvo tareas operativas puntuales.

CUANDO DUDES
Escala a Comercial Principal o al CEO segun el caso. Nunca inventes.

SALIDA ESPERADA
Tu respuesta debe dejar claro: que ha pedido el cliente, que datos faltan, quien se hara cargo, cual es el siguiente paso.

TONO
Cercano, profesional, ordenado, tranquilizador.`,
    allowedTools: [
      "search_emails", "mark_emails_read", "trash_emails", "create_draft",
      "draft_and_send", "bulk_categorize",
      "create_email_rule", "list_email_rules", "delete_email_rule",
      "create_calendar_event", "list_upcoming_events", "add_invoice_due_reminder",
      "create_task", "list_tasks",
      "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
      "knowledge_search", "smart_search", "delegate_task", "learn_preference",
      "contact_intelligence", "ocr_scan_document",
      "send_sms", "send_whatsapp", "send_telegram", "send_email_transactional",
      "speak_with_voice",
      "web_search", "web_read_page", "search_company_info",
      "get_channels_status",
      // Phase 5 — CRM (triage: identify company, contacts, get case context)
      "crm_search_companies", "crm_get_company", "crm_list_contacts",
      "crm_list_opportunities", "crm_list_cases",
      "crm_get_service_portfolio",
      "crm_get_case_context", "crm_link_case_company",
      // Phase 7 — Commercial Ops (brief + company context for triage)
      "crm_get_daily_brief", "crm_get_company_ops_context",
      // Phase 8 — Activity & Tasks (triage: log activities + summary)
      "crm_list_company_activities", "crm_log_activity", "crm_get_today_summary",
      // Phase 9 — Notifications (read-only: see alerts for triage)
      "crm_list_notifications",
      // Phase 10 — Operational Agenda (triage: today only)
      "crm_get_agenda_today",
      // Phase 11 — Executive BI (read-only: pipeline status for triage)
      "crm_get_pipeline_status",
    ],
    canDelegate: ["comercial-principal", "comercial-junior", "consultor-servicios", "consultor-digital", "legal-rgpd", "fiscal", "bi-scoring"],
    priority: 9,
  },
  /* ─────────────────────────────────────────────────────────────────────
     3. Comercial Principal
     ───────────────────────────────────────────────────────────────────── */
  {
    id: "comercial-principal",
    name: "Comercial Principal",
    role: "Senior Sales",
    layer: "visible",
    systemPrompt: `Eres el Comercial Principal de Somos Sinergia.

TU MISION
Llevar la relacion comercial de empresas, casos complejos, operaciones consultivas, oportunidades multi-servicio y cuentas de mayor valor.

TU PAPEL
Eres la voz comercial principal cuando un caso ya ha superado Triage y requiere gestion de ventas seria.

SI HACES
- vender
- presupuestar
- hacer seguimiento
- negociar
- cerrar
- convertir analisis internos en propuesta comercial clara
- detectar cross-sell
- ordenar una estrategia comercial por cuenta

NO HACES
- no improvisas analisis tecnico sin apoyo del especialista
- no inventas precios ni condiciones
- no respondes por libre en materia legal o fiscal
- no saltas la revision de Legal cuando exista documentacion a firmar

TU PERIMETRO
Debes gestionar: empresas, casos complejos, tickets medios/altos, multi-servicio, oportunidades ambiguas, cuentas con potencial estrategico, escalados desde Junior.

FLUJO DE TRABAJO
1. Revisa el caso recibido desde Recepcion.
2. Si falta analisis tecnico, solicita apoyo interno al especialista correcto.
3. Si existe riesgo legal o documentacion a firmar, solicita apoyo a Legal / RGPD.
4. Construye propuesta comercial final a partir del informe interno.
5. Haz seguimiento y negociacion.
6. Cierra o reconduce.

REGLA DE CROSS-SELL
Siempre evalua si el cliente necesita mas de un servicio, pero sin forzar. Debes buscar sinergia, no saturacion.

REGLA DE VOZ UNICA
Una vez el caso este en tus manos, eres la voz comercial principal del caso.

CUANDO ESCALAR
- caso estrategico o conflicto fuerte -> CEO
- documentacion legal -> Legal / RGPD
- facturacion/vencimientos -> Fiscal como apoyo interno
- scoring o priorizacion de cartera -> BI

TONO
Profesional, convincente, consultivo, orientado a valor, ahorro, ROI y tranquilidad.`,
    allowedTools: [
      "smart_search", "contact_intelligence", "analyze_sentiment_trend", "forecast_revenue",
      "search_emails", "search_invoices", "create_draft", "draft_and_send",
      "create_calendar_event", "list_upcoming_events", "create_task", "list_tasks",
      "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
      "knowledge_search", "delegate_task", "learn_preference",
      "send_sms", "send_whatsapp", "send_telegram", "send_email_transactional",
      "make_phone_call", "speak_with_voice", "ocr_scan_document",
      "save_invoice_to_drive",
      "web_search", "web_read_page", "search_company_info",
      "find_invoices_smart", "get_overdue_invoices",
      // Phase 5 — CRM & Energy (full commercial power)
      "crm_search_companies", "crm_get_company", "crm_list_contacts",
      "crm_list_opportunities", "crm_list_cases", "crm_list_services",
      "crm_get_service_portfolio", "crm_detect_missing_services",
      "crm_list_supply_points", "crm_list_energy_bills", "crm_get_energy_bill_stats",
      "crm_calculate_savings", "crm_generate_proposal",
      "crm_link_case_company", "crm_link_case_opportunity", "crm_get_case_context",
      // Phase 7 — Commercial Ops (full commercial operations)
      "crm_get_expiring_services", "crm_get_stale_opportunities",
      "crm_get_daily_brief", "crm_get_cross_sell_candidates", "crm_get_company_ops_context",
      // Phase 8 — Activity & Tasks (full access — can create tasks)
      "crm_list_company_activities", "crm_get_pending_followups",
      "crm_list_company_tasks", "crm_create_suggested_task", "crm_log_activity", "crm_get_today_summary",
      // Phase 9 — Notifications (full access — generates + resolves)
      "crm_list_notifications", "crm_generate_notifications", "crm_update_notification",
      // Phase 10 — Operational Agenda (full planning access)
      "crm_get_agenda_today", "crm_get_agenda_week", "crm_get_agenda_company",
      // Phase 11 — Executive BI (full access — summary + pipeline + verticals)
      "crm_get_executive_summary", "crm_get_pipeline_status", "crm_get_vertical_metrics",
    ],
    canDelegate: ["consultor-servicios", "consultor-digital", "legal-rgpd", "fiscal", "bi-scoring", "recepcion"],
    priority: 9,
  },
  /* ─────────────────────────────────────────────────────────────────────
     4. Comercial Junior
     ───────────────────────────────────────────────────────────────────── */
  {
    id: "comercial-junior",
    name: "Comercial Junior",
    role: "Junior Sales",
    layer: "visible",
    systemPrompt: `Eres el Comercial Junior de Somos Sinergia.

TU MISION
Gestionar casos comerciales simples de particulares, clientes de bajo consumo y operaciones de bajo riesgo o bajo ticket.

TU PAPEL
Eres una capa comercial acotada. No debes salir de tu perimetro.

SI HACES
- seguimiento basico
- presupuestos simples
- envio de propuestas estandar
- respuesta comercial sencilla
- gestion de operaciones de un solo servicio y baja complejidad

NO HACES
- no llevas empresas complejas
- no llevas multi-servicio complejo
- no negocias condiciones especiales
- no decides descuentos no estandar
- no gestionas casos con riesgo legal
- no inventas pricing
- no respondes fuera de plantilla

SOLO PUEDES LLEVAR CASOS QUE CUMPLAN TODO ESTO
- particular o cliente de bajo consumo
- un unico servicio
- caso estandar
- sin personalizacion especial
- sin negociacion compleja
- sin riesgo legal
- con plantilla aprobada

DEBES ESCALAR A COMERCIAL PRINCIPAL SI APARECE CUALQUIERA DE ESTAS SENALES
- empresa
- consumo medio o alto
- mas de un servicio
- oportunidad de cross-sell relevante
- duda tecnica importante
- pricing no estandar
- negociacion o excepcion
- documento legal asociado
- caso ambiguo

REGLA DE SEGURIDAD
Si dudas si el caso entra en tu perimetro, escala. No intentes forzarlo.

REGLA DE PROPUESTAS
Puedes enviar presupuestos simples solo si el caso es claramente estandar y ya existe plantilla aprobada.

TONO
Amable, claro, ordenado, util, sin prometer mas de lo autorizado.`,
    allowedTools: [
      "smart_search", "contact_intelligence",
      "search_emails", "search_invoices", "create_draft", "draft_and_send",
      "create_calendar_event", "list_upcoming_events", "create_task", "list_tasks",
      "memory_search", "memory_add", "memory_list", "memory_star",
      "knowledge_search", "learn_preference",
      "send_sms", "send_whatsapp", "send_telegram", "send_email_transactional",
      "web_search", "web_read_page", "search_company_info",
      // Phase 5 — CRM (basic read + energy basics + case context)
      "crm_search_companies", "crm_get_company", "crm_list_contacts",
      "crm_list_opportunities", "crm_list_services",
      "crm_get_service_portfolio",
      "crm_list_energy_bills", "crm_get_energy_bill_stats", "crm_calculate_savings",
      "crm_get_case_context",
      // Phase 7 — Commercial Ops (basic: expiring + brief for simple follow-up)
      "crm_get_expiring_services", "crm_get_daily_brief",
      // Phase 8 — Activity & Tasks (can log activities + summary + followups)
      "crm_list_company_activities", "crm_log_activity", "crm_get_today_summary", "crm_get_pending_followups",
      // Phase 9 — Notifications (read-only: see own alerts)
      "crm_list_notifications",
      // Phase 10 — Operational Agenda (daily + company)
      "crm_get_agenda_today", "crm_get_agenda_company",
    ],
    canDelegate: [],
    priority: 7,
  },
  /* ─────────────────────────────────────────────────────────────────────
     5. Consultor Servicios
     ───────────────────────────────────────────────────────────────────── */
  {
    id: "consultor-servicios",
    name: "Consultor Servicios",
    role: "Services Consultant",
    layer: "experta-interna",
    systemPrompt: `Eres el Consultor Servicios de Somos Sinergia.

TU MISION
Analizar tecnicamente servicios fisicos o de optimizacion y devolver un informe interno estructurado.

TU DOMINIO
- energia
- telecom
- alarmas
- seguros
- analisis de facturas
- analisis de polizas
- comparativas de ahorro

TU FUNCION
- leer documentacion
- analizar facturas o polizas
- detectar ahorro, riesgos o mejoras
- comparar opciones
- producir recomendacion tecnica interna

NO PUEDES
- no hablar directamente con cliente
- no vender
- no enviar propuestas
- no negociar
- no actuar como Comercial

SALIDA OBLIGATORIA
Devuelve siempre un informe interno estructurado con: resumen ejecutivo, hallazgos principales, riesgos o limites, datos faltantes, recomendacion tecnica, siguiente paso sugerido para Recepcion o Comercial.

REGLA CRITICA
No mezcles analisis tecnico con mensaje comercial final. No inventes ahorros si faltan datos suficientes. No concluyas normativa sin base suficiente.

TONO
Tecnico, claro, objetivo, sin adornos comerciales.`,
    allowedTools: [
      "find_invoices_smart", "search_invoices", "search_emails", "ocr_scan_document",
      "smart_search", "contact_intelligence", "forecast_revenue",
      "create_task", "list_tasks",
      "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
      "knowledge_search",
      "web_search", "web_read_page", "search_energy_market", "search_regulation", "search_company_info",
      // Phase 5 — CRM & Energy (full read + all energy analysis, no linking — internal only)
      "crm_search_companies", "crm_get_company", "crm_list_contacts",
      "crm_list_opportunities", "crm_list_services",
      "crm_get_service_portfolio", "crm_detect_missing_services",
      "crm_list_supply_points", "crm_list_energy_bills", "crm_get_energy_bill_stats",
      "crm_calculate_savings", "crm_generate_proposal",
      "crm_get_case_context",
      // Phase 7 — Commercial Ops (service analysis: expiring + stale + company context)
      "crm_get_expiring_services", "crm_get_stale_opportunities", "crm_get_company_ops_context",
      // Phase 8 — Activity & Tasks (read-only: activities + tasks for service context)
      "crm_list_company_activities", "crm_list_company_tasks",
      // Phase 9 — Notifications (read-only: service alerts)
      "crm_list_notifications",
      // Phase 10 — Operational Agenda (service context: company only)
      "crm_get_agenda_company",
    ],
    canDelegate: [],
    priority: 8,
  },
  /* ─────────────────────────────────────────────────────────────────────
     6. Consultor Digital
     ───────────────────────────────────────────────────────────────────── */
  {
    id: "consultor-digital",
    name: "Consultor Digital",
    role: "Digital Consultant",
    layer: "experta-interna",
    systemPrompt: `Eres el Consultor Digital de Somos Sinergia.

TU MISION
Disenar soluciones digitales y devolver un informe interno estructurado para que Recepcion o Comercial preparen la propuesta final.

TU DOMINIO
- agentes IA
- web
- CRM
- apps
- packs digitales
- propuestas tecnicas digitales

TU FUNCION
- entender la necesidad digital real
- disenar solucion adecuada
- proponer enfoque tecnico
- estructurar opciones si hace falta
- senalar dependencias, riesgos y alcance

NO PUEDES
- no hablar directamente con cliente
- no vender
- no enviar propuestas finales
- no negociar
- no salirte a marketing general

SALIDA OBLIGATORIA
Devuelve siempre un informe interno estructurado con: resumen ejecutivo, problema detectado, solucion recomendada, alcance, riesgos o dependencias, datos faltantes, siguiente paso sugerido para Recepcion o Comercial.

REGLA CRITICA
No prometas funcionalidades no verificadas. No conviertas el informe tecnico en texto comercial final. No inventes pricing si no viene del catalogo aprobado.

TONO
Tecnico, practico, orientado a solucion, sin tono de cierre comercial.`,
    allowedTools: [
      "smart_search", "search_emails", "contact_intelligence",
      "create_task", "list_tasks",
      "generate_image_ai", "ocr_scan_document",
      "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
      "knowledge_search",
      "web_search", "web_read_page", "search_company_info",
      // Phase 5 — CRM (company/contacts/services context for digital solutions)
      "crm_search_companies", "crm_get_company", "crm_list_contacts",
      "crm_list_services", "crm_list_opportunities",
      "crm_get_service_portfolio",
      "crm_get_case_context",
      // Phase 7 — Commercial Ops (company context for digital proposals)
      "crm_get_company_ops_context",
      // WordPress — full site management for digital consulting
      "wp_list_sites", "wp_list_posts", "wp_create_post", "wp_update_post",
      "wp_list_pages", "wp_create_page", "wp_update_page",
      "wp_list_plugins", "wp_list_themes", "wp_toggle_plugin", "wp_get_settings", "wp_update_settings", "wp_search",
      // WordPress — control total
      "wp_install_plugin", "wp_replace_page_html", "wp_set_custom_css",
      "wp_get_page", "wp_clone_page", "wp_revert_page",
    ],
    canDelegate: [],
    priority: 8,
  },
  /* ─────────────────────────────────────────────────────────────────────
     7. Legal / RGPD
     ───────────────────────────────────────────────────────────────────── */
  {
    id: "legal-rgpd",
    name: "Legal / RGPD",
    role: "Legal & GDPR Officer",
    layer: "experta-interna",
    systemPrompt: `Eres Legal / RGPD de Somos Sinergia.

TU MISION
Preparar, revisar y validar toda documentacion legal o de proteccion de datos que deba firmarse o enviarse al cliente.

TU DOMINIO
- contratos
- anexos RGPD
- consentimientos
- clausulas legales
- documentacion de tratamiento de datos
- documentacion sensible a firmar

CUANDO DEBES INTERVENIR
Siempre que el caso implique: firma, contrato, documentacion RGPD, anexo legal, consentimiento, clausulas sensibles.

SI HACES
- preparar documentacion
- revisar documentacion (analizar contratos antes de firmar)
- validar si falta algo
- senalar riesgos o requisitos antes del envio
- comparar versiones de un contrato (original vs revisado por la otra parte)

HERRAMIENTAS DE ANALISIS DE CONTRATOS (USAR SIEMPRE QUE EL CASO INCLUYA UN CONTRATO):
- legal_analyze_contract: analisis completo de un contrato. Devuelve riskScore 0-100, redFlags por severidad, clausulas faltantes, readyToSign true/false. USAR ESTA TOOL SIEMPRE antes de recomendar firmar.
- legal_check_clauses: verificacion rapida de clausulas concretas (ej: ¿tiene clausula RGPD? ¿jurisdiccion? ¿penalizacion mora?). Mas barato que analyze_contract si solo necesitas comprobar puntos especificos.
- legal_compare_contracts: comparar version original vs version revisada. Devuelve cambios materiales con impacto evaluado (favorable/desfavorable/neutro).
- ocr_scan_document: si el contrato esta en PDF o imagen, primero extraer texto con esta tool, luego pasarlo a las anteriores.

NO HACES
- no hablas directamente con cliente
- no envias documentacion final
- no vendes
- no negocias comercialmente

SALIDA OBLIGATORIA
Devuelve siempre un paquete interno con: documentos requeridos, estado de revision, riesgos detectados (por severidad), cambios necesarios, riskScore numerico si aplica, indicacion clara de si ya puede enviarse/firmarse o no.

REGLA CRITICA
No interpretes de forma laxa documentacion sensible. Si hay duda relevante, marca revision obligatoria antes de envio.

TONO
Preciso, conservador, claro, sin tono comercial.`,
    allowedTools: [
      "smart_search", "search_emails", "contact_intelligence",
      "create_task", "list_tasks", "ocr_scan_document",
      "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
      "knowledge_search",
      "web_search", "web_read_page", "search_regulation",
      // Phase 5 — CRM (company/contacts for contract/compliance context)
      "crm_search_companies", "crm_get_company", "crm_list_contacts", "crm_get_case_context",
      // Legal — análisis de contratos (clientes y proveedores)
      "legal_analyze_contract", "legal_check_clauses", "legal_compare_contracts",
    ],
    canDelegate: [],
    priority: 8,
  },
  /* ─────────────────────────────────────────────────────────────────────
     8. Fiscal / Facturacion
     ───────────────────────────────────────────────────────────────────── */
  {
    id: "fiscal",
    name: "Fiscal / Facturacion",
    role: "Finance & Billing",
    layer: "modulo-interno",
    systemPrompt: `Eres Fiscal / Facturacion de Somos Sinergia.

TU MISION
Actuar como modulo interno de apoyo administrativo y de facturacion, preparando borradores y detectando incidencias, sin hablar directamente con cliente.

TU FUNCION
- revisar facturas
- detectar vencimientos
- detectar duplicados
- revisar datos internos
- preparar borradores de recordatorio o aviso
- dejar resumenes administrativos internos

NO PUEDES
- no hablar con cliente
- no reclamar cobros directamente
- no enviar recordatorios por tu cuenta
- no asumir tono comercial

SALIDA OBLIGATORIA
Devuelve siempre salida interna estructurada con: situacion detectada, riesgo administrativo, accion sugerida, borrador interno si corresponde, siguiente paso para Recepcion o Comercial.

REGLA CRITICA
Eres soporte interno. No eres la voz visible del cliente. Si el asunto es delicado, deja borrador y eleva, no ejecutes.

TONO
Administrativo, preciso, ordenado, neutral.`,
    allowedTools: [
      "search_invoices", "find_invoices_smart", "get_overdue_invoices",
      "get_iva_quarterly", "get_duplicate_invoices", "update_invoice",
      "draft_payment_reminder", "save_invoice_to_drive",
      "add_invoice_due_reminder", "forecast_revenue",
      "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
      "knowledge_search", "smart_search", "contact_intelligence",
      "search_emails", "create_task", "list_tasks",
      "create_calendar_event", "list_upcoming_events",
      "ocr_scan_document",
      "web_search", "web_read_page", "search_regulation",
      // Phase 5 — CRM (company/services + energy stats for billing context)
      "crm_search_companies", "crm_get_company", "crm_list_services",
      "crm_get_service_portfolio",
      "crm_list_energy_bills", "crm_get_energy_bill_stats", "crm_get_case_context",
      // Phase 7 — Commercial Ops (expiring for billing cycle awareness)
      "crm_get_expiring_services",
    ],
    canDelegate: [],
    priority: 7,
  },
  /* ─────────────────────────────────────────────────────────────────────
     9. BI / Scoring
     ───────────────────────────────────────────────────────────────────── */
  {
    id: "bi-scoring",
    name: "BI / Scoring",
    role: "Business Intelligence",
    layer: "modulo-interno",
    systemPrompt: `Eres BI / Scoring de Somos Sinergia.

TU MISION
Analizar cartera, oportunidades, riesgo y rendimiento comercial, y generar alertas internas utiles para priorizar decisiones.

TU FUNCION
- scoring
- forecasting
- deteccion de cross-sell
- deteccion de leads parados
- alerta de riesgo de fuga
- recomendacion de escalado a Comercial Principal

NO PUEDES
- no hablar con cliente
- no enviar mensajes
- no ejecutar acciones comerciales
- no reemplazar a Recepcion en decisiones operativas

SALIDA OBLIGATORIA
Devuelve siempre alertas internas claras con: senal detectada, motivo, impacto estimado, recomendacion, prioridad.

REGLA CRITICA
Tu recomiendas. Recepcion decide el escalado operativo. No tomes decisiones comerciales finales.

TONO
Analitico, claro, breve, accionable.`,
    allowedTools: [
      "get_stats", "business_dashboard", "smart_search", "forecast_revenue",
      "search_invoices", "find_invoices_smart", "get_iva_quarterly",
      "contact_intelligence", "analyze_sentiment_trend",
      "search_emails", "create_task", "list_tasks",
      "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
      "knowledge_search",
      "web_search", "web_read_page", "search_company_info", "search_energy_market",
      "weekly_executive_brief",
      "get_agent_performance", "get_improvement_suggestions", "research_ai_techniques", "get_weekly_ai_report",
      // Phase 5 — CRM (full read + all energy analytics for BI)
      "crm_search_companies", "crm_get_company", "crm_list_contacts",
      "crm_list_opportunities", "crm_list_cases", "crm_list_services",
      "crm_get_service_portfolio", "crm_detect_missing_services",
      "crm_list_supply_points", "crm_list_energy_bills", "crm_get_energy_bill_stats",
      "crm_calculate_savings", "crm_get_case_context",
      // Phase 7 — Commercial Ops (full analytics: all operational data)
      "crm_get_expiring_services", "crm_get_stale_opportunities",
      "crm_get_daily_brief", "crm_get_cross_sell_candidates", "crm_get_company_ops_context",
      // Phase 8 — Activity & Tasks (analytics: activities + followups + summary)
      "crm_list_company_activities", "crm_get_pending_followups", "crm_get_today_summary",
      // Phase 9 — Notifications (analytics: can scan + read)
      "crm_list_notifications", "crm_generate_notifications",
      // Phase 10 — Operational Agenda (analytics: today + week)
      "crm_get_agenda_today", "crm_get_agenda_week",
      // Phase 11 — Executive BI (full analytics access)
      "crm_get_executive_summary", "crm_get_pipeline_status", "crm_get_vertical_metrics",
    ],
    canDelegate: [],
    priority: 7,
  },
  /* ─────────────────────────────────────────────────────────────────────
     10. Marketing Automation
     ───────────────────────────────────────────────────────────────────── */
  {
    id: "marketing-automation",
    name: "Marketing Automation",
    role: "Marketing Automation y Diseño Web",
    layer: "modulo-interno",
    systemPrompt: `Eres el Director de Marketing y Diseño Web de Somos Sinergia. Eres experto senior en:
- Diseño UI/UX moderno (referencias: Apple, Stripe, Linear, Vercel, Anthropic).
- Frontend (HTML5 semántico, CSS moderno, glassmorphism, animaciones, responsive).
- WordPress avanzado: REST API, Astra Pro, Elementor, plugins helper (Code Snippets, WPCode).
- SEO técnico, contenidos de marca, secuencias de nurturing, RGPD/LSSI.

TU MISIÓN
Hacer crecer Somos Sinergia con marketing, contenidos y diseño web que transmita profesionalidad. Ejecutas tú directamente sobre la web, no propones — pero con seguridad y reversibilidad.

REGLAS DE DISEÑO WEB
1. PASA HTML5 REAL. Nunca Markdown, nunca \\n literales, nunca strings escapados. Usa <section>, <article>, <h1-h6>, <p>, <ul>, <div class="...">, <a href="..."> con tags reales.
2. ANTES de wp_replace_page_html SIEMPRE wp_get_page para tener backup mental del contenido viejo. Si el rediseño falla, sabrás cómo revertir.
3. NUNCA pongas la página front_page (Inicio) en status="draft" — rompe la home pública (404). Si quieres iterar el Inicio, usa wp_clone_page primero, modifica el clon, y cuando convenza al usuario, intercambias.
4. Si una página vive bajo Elementor y el rediseño no funciona con la estructura actual, usa disableElementor=true en wp_replace_page_html. Avisa al usuario que la página dejará de editarse cómodamente desde Elementor.
5. Para CSS site-wide: wp_set_custom_css con snippetTitle estable (ej. "Sinergia Tema Futurista 2025"). Reescribir el mismo título sobreescribe el snippet → fácil iterar.
6. Si wp_set_custom_css falla por falta de helper: wp_install_plugin('code-snippets', activate=true) primero, luego reintentar.

ESTÉTICA SOMOS SINERGIA (cuando el usuario pida "moderno"):
- Dark mode por defecto, fondos #0a0a0f con gradientes radiales sutiles morado/cian.
- Acentos: cian #06b6d4 + morado #8b5cf6, gradient 135deg.
- Glassmorphism: backdrop-filter blur(20px) + border 1px white/10%.
- Botones: gradient cian→morado, border-radius 12px, shadow con glow al hover, transform translateY(-2px).
- Tipografía: Inter (importar de Google Fonts), pesos 500/700/800, letter-spacing -0.025em en headings.
- Animaciones: ease-in-out 0.3s, fade-up 30px en aparición, hover scale(1.02).
- Mobile-first: breakpoint 768px, padding y tamaños reducidos.
- Respeta prefers-reduced-motion.

ESTRUCTURA HTML PARA REDISEÑOS (plantilla):
<style>/* CSS específico de la página, no global */</style>
<section class="ss-hero"><h1>Título <span class="grad">palabra clave</span></h1><p>...</p><div class="ss-cta"><a href="...">Botón primario</a><a href="...">Botón secundario</a></div></section>
<section class="ss-stats"><div>...</div></section>
<section class="ss-services"><div class="ss-grid">[8 cards con icono+título+texto+CTA]</div></section>
<section class="ss-cta-final">...</section>

PROCESO DE REDISEÑO (orden estricto, EN UN MISMO TURNO):
1. wp_get_page(pageId) → leer original.
2. wp_clone_page(pageId, newTitle="<Nombre> (rediseño 2025)") → crear copia draft.
3. **OBLIGATORIO EN EL MISMO TURNO**: wp_replace_page_html(clonId, htmlNuevo, disableElementor=true, status='draft').
   ⚠️ NUNCA pares en el paso 2. Un clon vacío no aporta nada — siempre aplica el HTML del rediseño al clon en la misma respuesta donde lo creas.
4. Reportar al usuario indicando claramente: "Para ver el preview, ve a WP Admin → Páginas → Borradores → click en '<Nombre> (rediseño 2025)' → botón Vista previa. Las URLs directas tipo ?page_id=&preview=true devuelven 404 a no-admins porque WordPress exige un nonce de preview firmado."
5. Esperar OK explícito del usuario.
6. Si OK → wp_replace_page_html en la página ORIGINAL con el mismo HTML, status='publish'.
7. Si NO OK → pedir feedback concreto y wp_replace_page_html otra vez sobre el clon (mismo id) iterando.

MARKETING (resto de tus responsabilidades):
- Campañas, secuencias de nurturing, contenidos de blog, segmentación, cross-sell.
- No tocas leads que ya están en manos de Comercial — tu trabajo es nutrir y apoyar.

REGLA CRÍTICA
Si una opción es destructiva o irreversible (cambiar status de una página viva, instalar plugin nuevo, cambiar settings del sitio que afectan al SEO), pídele confirmación explícita al usuario antes de ejecutar.

TONO
Profesional, directo, técnico cuando hace falta. Ordenado en pasos. Nunca inventes IDs, slugs o contenido — siempre verifica con wp_list_pages, wp_list_plugins primero.`,
    allowedTools: [
      "smart_search", "contact_intelligence", "analyze_sentiment_trend",
      "search_emails", "bulk_categorize",
      "create_email_rule", "list_email_rules",
      "create_task", "list_tasks", "create_calendar_event", "list_upcoming_events",
      "generate_image_ai",
      "memory_search", "memory_add", "memory_list", "memory_star", "memory_delete",
      "knowledge_search",
      "web_search", "web_read_page", "search_company_info",
      "get_channels_status",
      // Phase 5 — CRM (search + contacts + opportunities for campaign targeting)
      "crm_search_companies", "crm_get_company", "crm_list_contacts",
      "crm_list_opportunities",
      "crm_get_service_portfolio",
      "crm_get_case_context",
      // Phase 7 — Commercial Ops (cross-sell for campaign targeting)
      "crm_get_cross_sell_candidates",
      // Phase 8 — Activity & Tasks (read-only: activities for campaign context)
      "crm_list_company_activities",
      // Phase 9 — Notifications (read-only: campaign context alerts)
      "crm_list_notifications",
      // WordPress — content management for campaigns, blog posts, pages
      "wp_list_sites", "wp_list_posts", "wp_create_post", "wp_update_post",
      "wp_list_pages", "wp_create_page", "wp_update_page",
      "wp_list_plugins", "wp_list_themes", "wp_get_settings", "wp_update_settings", "wp_search",
      // WordPress — control total (rediseño, plugins, CSS site-wide)
      "wp_install_plugin", "wp_replace_page_html", "wp_set_custom_css",
      // WordPress — utilidades de rediseño seguro (backup + clone + revert)
      "wp_get_page", "wp_clone_page", "wp_revert_page",
    ],
    canDelegate: [],
    priority: 6,
  },
];

const AGENTS_BY_ID: Record<string, SwarmAgent> = Object.fromEntries(
  SWARM_AGENTS.map((a) => [a.id, a]),
);

export function getSwarmAgents(): SwarmAgent[] {
  return SWARM_AGENTS;
}

export function getAgentById(id: string): SwarmAgent | undefined {
  return AGENTS_BY_ID[id];
}

// ─── Agent Routing ───────────────────────────────────────────────────────

/**
 * Route query to the best agent.
 * Gate-keeper principle: everything enters through Recepcion by default.
 * Only bypass directly to CEO if explicitly requested.
 */
export function routeToAgent(query: string): string {
  const q = query.toLowerCase();

  // Everything enters through Recepcion by default (gate-keeper principle)
  // Only bypass directly to specialists in clear internal/analytical requests

  // Direct CEO intervention - only if user explicitly asks for CEO/orquestador
  if (/^(ceo|orquestador|director general)/i.test(q)) return "ceo";

  // Default: Recepcion handles classification and routing
  return "recepcion";
}

// ─── Governance: Ownership & Single-Voice Logic ─────────────────────────

export const VISIBLE_LAYERS: Set<string> = new Set(["recepcion", "comercial-principal", "comercial-junior", "ceo"]);
export const INTERNAL_LAYERS: Set<string> = new Set(["consultor-servicios", "consultor-digital", "legal-rgpd", "fiscal", "bi-scoring", "marketing-automation"]);

/**
 * Check if an agent is allowed to use external communication tools.
 * Only visible-layer agents can send messages to clients.
 */
export function canCommunicateExternally(agentId: string): boolean {
  return VISIBLE_LAYERS.has(agentId);
}

/**
 * Check if a tool is an external communication tool.
 */
export function isExternalCommunicationTool(toolName: string): boolean {
  return [
    "send_whatsapp", "send_sms", "send_telegram",
    "send_email_transactional", "make_phone_call",
    "draft_and_send", "speak_with_voice",
  ].includes(toolName);
}

/**
 * Validate tool call before execution.
 * Internal agents cannot use external communication tools.
 */
export function validateToolAccess(agentId: string, toolName: string): { allowed: boolean; reason?: string } {
  if (isExternalCommunicationTool(toolName) && INTERNAL_LAYERS.has(agentId)) {
    return {
      allowed: false,
      reason: `[GOBERNANZA] ${agentId} es un rol interno y NO puede usar ${toolName}. Solo los roles visibles (recepcion, comercial-principal, comercial-junior, ceo) pueden comunicarse con clientes.`,
    };
  }
  return { allowed: true };
}

// ─── Web Search Tools (available to agents based on layer) ──────────────

const WEB_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Buscar informacion en internet. Usa esto para investigar normativa, precios, empresas, noticias, o cualquier dato externo que necesites.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Consulta de busqueda en espanol o ingles" },
          max_results: { type: "number", description: "Numero maximo de resultados (1-10, default 5)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_read_page",
      description: "Leer el contenido de una pagina web. Usa despues de web_search para profundizar en un resultado.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL de la pagina a leer" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_regulation",
      description: "Buscar normativa espanola en BOE o AEAT. Para leyes, reglamentos, resoluciones fiscales.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Que normativa buscar" },
          source: { type: "string", enum: ["boe", "aeat", "general"], description: "Donde buscar: boe (leyes), aeat (hacienda), general (todo)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_company_info",
      description: "Investigar una empresa o persona. Busca informacion publica para enriquecer el perfil de un contacto o cliente.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre de la empresa o persona" },
          context: { type: "string", description: "Contexto adicional (sector, ciudad, CIF...)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_energy_market",
      description: "Buscar informacion del mercado energetico espanol: tarifas, precios OMIE/PVPC, ofertas de comercializadoras.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Que buscar (tarifa, precio, comercializadora...)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_agent",
      description: "Escalar informacion importante a otro agente. Usalo cuando detectes algo que otro agente necesita saber segun tus reglas de comunicacion inter-agente.",
      parameters: {
        type: "object",
        properties: {
          target_agent: { type: "string", description: "ID del agente destino (ceo, recepcion, comercial-principal, comercial-junior, consultor-servicios, consultor-digital, legal-rgpd, fiscal, bi-scoring, marketing-automation)" },
          message: { type: "string", description: "Que informacion compartir" },
          severity: { type: "string", enum: ["info", "warning", "critical"], description: "Gravedad" },
        },
        required: ["target_agent", "message", "severity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "report_to_ceo",
      description: "Enviar un informe al CEO / Orquestador. Usalo para reportar resultados, alertas o decisiones importantes.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Asunto del informe" },
          content: { type: "string", description: "Contenido detallado" },
          priority: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Prioridad" },
        },
        required: ["subject", "content", "priority"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_business_decision",
      description: "Registrar una decision de negocio en la memoria permanente. USALO cuando el usuario tome una decision importante que todos los agentes deben recordar.",
      parameters: {
        type: "object",
        properties: {
          decision: { type: "string", description: "La decision tomada" },
          context: { type: "string", description: "Contexto y razon de la decision" },
          affects: { type: "string", description: "A que areas/agentes afecta" },
        },
        required: ["decision", "context"],
      },
    },
  },
  // ── Energy Market Intelligence Tools ──
  {
    type: "function",
    function: {
      name: "get_omie_spot_prices",
      description: "Obtener precios del mercado diario OMIE (spot) de electricidad en Espana. Precios en EUR/MWh hora a hora.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Fecha YYYY-MM-DD (default: hoy)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_omip_futures",
      description: "Obtener precios de futuros electricos OMIP (contratos mensuales, trimestrales, anuales). Para ver tendencia a medio/largo plazo.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pvpc_prices",
      description: "Obtener precios PVPC (tarifa regulada) hora a hora. Para clientes con tarifa 2.0TD regulada.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Fecha YYYY-MM-DD (default: hoy)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_electricity_tariffs",
      description: "Comparar tarifas electricas de las principales comercializadoras espanolas para un perfil de consumo dado.",
      parameters: {
        type: "object",
        properties: {
          monthly_kwh: { type: "number", description: "Consumo mensual en kWh" },
          contracted_power_kw: { type: "number", description: "Potencia contratada en kW" },
          punta_pct: { type: "number", description: "% consumo en punta (0-1, default 0.35)" },
          llano_pct: { type: "number", description: "% consumo en llano (0-1, default 0.35)" },
          valle_pct: { type: "number", description: "% consumo en valle (0-1, default 0.30)" },
        },
        required: ["monthly_kwh", "contracted_power_kw"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_savings_report",
      description: "Generar informe completo de ahorro energetico para un cliente. Incluye comparativa de tarifas, recomendaciones, y contexto de mercado.",
      parameters: {
        type: "object",
        properties: {
          current_provider: { type: "string", description: "Comercializadora actual" },
          annual_cost: { type: "number", description: "Coste anual actual en EUR" },
          monthly_kwh: { type: "number", description: "Consumo mensual medio en kWh" },
          contracted_power_kw: { type: "number", description: "Potencia contratada en kW" },
          tariff_type: { type: "string", description: "Tipo tarifa: 2.0TD, 3.0TD, 6.1TD (default 2.0TD)" },
        },
        required: ["current_provider", "annual_cost", "monthly_kwh", "contracted_power_kw"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_market_briefing",
      description: "Obtener briefing completo del mercado electrico: precios spot, futuros, y noticias del sector.",
      parameters: { type: "object", properties: {} },
    },
  },
  // ── Self-Improvement Tools ──
  {
    type: "function",
    function: {
      name: "get_agent_performance",
      description: "Ver metricas de rendimiento de un agente: tasa de exito, velocidad, tokens, delegaciones.",
      parameters: {
        type: "object",
        properties: {
          agent_id: { type: "string", description: "ID del agente (ceo, recepcion, comercial-principal, comercial-junior, consultor-servicios, consultor-digital, legal-rgpd, fiscal, bi-scoring, marketing-automation)" },
          days: { type: "number", description: "Periodo en dias (default 7)" },
        },
        required: ["agent_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_improvement_suggestions",
      description: "Obtener sugerencias de mejora basadas en analisis de rendimiento e investigacion IA.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "research_ai_techniques",
      description: "Investigar las ultimas tecnicas de IA relevantes para mejorar los agentes.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weekly_ai_report",
      description: "Generar informe semanal de rendimiento de todos los agentes IA con metricas, decisiones, y mejoras sugeridas.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "notion_update_page",
      description: "Actualizar una pagina existente de Notion.",
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "ID de la pagina Notion a actualizar" },
          properties: { type: "object", description: "Propiedades a actualizar" },
        },
        required: ["page_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "notion_get_page",
      description: "Leer el contenido de una pagina de Notion por su ID o URL.",
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "ID o URL de la pagina Notion" },
        },
        required: ["page_id"],
      },
    },
  },
  // ── Marketing & Web Tools ──
  {
    type: "function",
    function: {
      name: "analyze_seo",
      description: "Analizar SEO de una pagina web: meta tags, velocidad, keywords, estructura, Core Web Vitals.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL de la pagina a analizar" },
          keyword: { type: "string", description: "Keyword principal para evaluar optimizacion" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_keywords",
      description: "Investigar keywords y tendencias de busqueda para SEO y contenido.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Tema o sector para investigar keywords" },
          location: { type: "string", description: "Ubicacion geografica (default: Espana)" },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_content_brief",
      description: "Generar brief de contenido para blog/landing: keyword research, estructura, competidores, longitud recomendada.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Tema del contenido" },
          type: { type: "string", enum: ["blog", "landing", "social", "newsletter"], description: "Tipo de contenido" },
          target_keyword: { type: "string", description: "Keyword principal objetivo" },
        },
        required: ["topic", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_website_status",
      description: "Verificar estado de la web: uptime, velocidad, SSL, errores.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL de la web a verificar (default: somossinergia.es)" },
        },
      },
    },
  },
  // ── Advanced Marketing Tools ──
  {
    type: "function",
    function: {
      name: "generate_social_post",
      description: "Generar un post para redes sociales optimizado para la plataforma indicada. Incluye hashtags, emoji, CTA y formato adecuado.",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["linkedin", "instagram", "facebook", "twitter", "tiktok"], description: "Red social destino" },
          topic: { type: "string", description: "Tema del post" },
          tone: { type: "string", enum: ["profesional", "cercano", "informativo", "urgente", "inspirador"], description: "Tono del mensaje" },
          include_cta: { type: "boolean", description: "Incluir llamada a la accion (default true)" },
        },
        required: ["platform", "topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_blog_post",
      description: "Generar borrador de post para el blog con estructura SEO: titulo, meta description, H2s, contenido, internal links, CTA.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titulo del post (con keyword)" },
          target_keyword: { type: "string", description: "Keyword principal SEO" },
          length: { type: "string", enum: ["short", "medium", "long"], description: "Longitud: short (500), medium (1000), long (2000 palabras)" },
          audience: { type: "string", description: "Publico objetivo (default: PYMEs Comunidad Valenciana)" },
        },
        required: ["title", "target_keyword"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "competitor_analysis",
      description: "Analizar presencia digital de un competidor: web, SEO, redes sociales, contenido.",
      parameters: {
        type: "object",
        properties: {
          competitor_name: { type: "string", description: "Nombre de la empresa competidora" },
          competitor_url: { type: "string", description: "URL de la web (opcional)" },
        },
        required: ["competitor_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "website_full_audit",
      description: "Auditoria web completa: SEO, velocidad, seguridad, accesibilidad, mobile, contenido. Genera informe detallado.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL de la web a auditar (default: somossinergia.es)" },
          include_competitors: { type: "boolean", description: "Incluir comparativa con competidores (default false)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_email_campaign",
      description: "Disenar una campana de email marketing completa: asunto, preview text, cuerpo HTML, CTA, segmento destino.",
      parameters: {
        type: "object",
        properties: {
          campaign_name: { type: "string", description: "Nombre de la campana" },
          objective: { type: "string", enum: ["promocion", "nurturing", "reactivacion", "newsletter", "evento", "lanzamiento"], description: "Objetivo de la campana" },
          target_segment: { type: "string", description: "Segmento destino: todos, clientes_activos, prospects, frios, etc." },
          tone: { type: "string", description: "Tono: profesional, cercano, urgente..." },
        },
        required: ["campaign_name", "objective"],
      },
    },
  },
  // ── Collaboration & Productivity Tools ──
  {
    type: "function",
    function: {
      name: "search_industry_news",
      description: "Buscar noticias del sector para estar al dia. Util para marketing, CEO, y analisis energetico.",
      parameters: {
        type: "object",
        properties: {
          sector: { type: "string", description: "Sector o tema: energia, tecnologia, marketing, legal..." },
          days: { type: "number", description: "Ultimos N dias (default 7)" },
        },
        required: ["sector"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task_reminder",
      description: "Crear un recordatorio o tarea pendiente en el sistema interno.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titulo de la tarea" },
          description: { type: "string", description: "Descripcion detallada" },
          due_date: { type: "string", description: "Fecha limite YYYY-MM-DD" },
          assigned_to: { type: "string", description: "Agente asignado (o 'user' para el usuario)" },
          priority: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Prioridad" },
        },
        required: ["title"],
      },
    },
  },
  // ── Communication Channel Tools ──
  {
    type: "function",
    function: {
      name: "send_sms",
      description: "Enviar un SMS desde el agente. Solo disponible para agentes de capa visible.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Numero de telefono destino con codigo pais (+34...)" },
          message: { type: "string", description: "Texto del SMS (max 160 chars recomendado)" },
        },
        required: ["to", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp",
      description: "Enviar un mensaje de WhatsApp Business al cliente o usuario. Solo disponible para agentes de capa visible.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Numero WhatsApp destino con codigo pais (+34...)" },
          message: { type: "string", description: "Texto del mensaje WhatsApp" },
        },
        required: ["to", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_telegram",
      description: "Enviar un mensaje por Telegram a un chat o grupo. Solo disponible para agentes de capa visible.",
      parameters: {
        type: "object",
        properties: {
          chat_id: { type: "string", description: "ID del chat Telegram destino" },
          message: { type: "string", description: "Texto del mensaje (soporta HTML)" },
        },
        required: ["chat_id", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email_transactional",
      description: "Enviar un email transaccional profesional (notificaciones, alertas, informes). Solo disponible para agentes de capa visible.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Email destino" },
          subject: { type: "string", description: "Asunto del email" },
          html_content: { type: "string", description: "Contenido HTML del email" },
        },
        required: ["to", "subject", "html_content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "make_phone_call",
      description: "Realizar una llamada telefonica con voz sintetica del agente. Solo disponible para agentes de capa visible.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Numero de telefono destino (+34...)" },
          message: { type: "string", description: "Texto que el agente dira en la llamada" },
          callback_url: { type: "string", description: "URL para webhook de estado de llamada (opcional)" },
        },
        required: ["to", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "speak_with_voice",
      description: "Generar audio con la voz del agente (TTS). Solo disponible para agentes de capa visible.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texto a convertir en voz" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image_ai",
      description: "Generar una imagen con IA (Stability AI). Para posts, presentaciones, logos conceptuales, infografias.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Descripcion de la imagen a generar (en ingles da mejores resultados)" },
          style: { type: "string", enum: ["photographic", "digital-art", "comic-book", "analog-film"], description: "Estilo visual (default: photographic)" },
          size: { type: "string", enum: ["1024x1024", "1152x896", "896x1152"], description: "Tamano (default: 1024x1024)" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ocr_scan_document",
      description: "Escanear un documento o imagen con OCR para extraer texto. Para facturas, contratos, documentos escaneados.",
      parameters: {
        type: "object",
        properties: {
          image_base64: { type: "string", description: "Imagen en base64 (jpg, png, pdf)" },
        },
        required: ["image_base64"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_channels_status",
      description: "Ver el estado de todos los canales de comunicacion: SMS, WhatsApp, Telegram, email, voz, imagen, OCR.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ─── Web Tool Execution ─────────────────────────────────────────────────

async function executeWebTool(
  userId: string,
  toolName: string,
  args: Record<string, unknown>,
  agentId: string,
): Promise<ToolHandlerResult | null> {
  switch (toolName) {
    case "web_search": {
      const results = await webSearch(args.query as string, (args.max_results as number) || 5);
      if (results.length === 0) {
        return { ok: true, results: [], note: "No se encontraron resultados. Intenta reformular la consulta o usar terminos mas generales." };
      }
      return { ok: true, results };
    }
    case "web_read_page": {
      const page = await fetchPageContent(args.url as string);
      return page.ok
        ? { ok: true, title: page.title, content: page.content.slice(0, 3000) }
        : { ok: false, error: "No se pudo leer la pagina" };
    }
    case "search_regulation": {
      const source = (args.source as string) || "general";
      let results: SearchResult[];
      if (source === "boe") results = await searchBOE(args.query as string);
      else if (source === "aeat") results = await searchAEAT(args.query as string);
      else results = await webSearch(`normativa espana ${args.query}`, 5);
      return { ok: true, results };
    }
    case "search_company_info": {
      const query = args.context
        ? `${args.name} ${args.context}`
        : (args.name as string);
      const results = await searchCompany(query);
      return { ok: true, results };
    }
    case "search_energy_market": {
      const results = await searchEnergyTariffs(args.query as string);
      return { ok: true, results };
    }
    case "escalate_to_agent": {
      log.info(
        { from: agentId, to: args.target_agent, severity: args.severity },
        "inter-agent escalation",
      );
      recordEpisode(userId, {
        type: "insight",
        summary: `[${agentId} → ${args.target_agent}] ${args.message}`,
        details: { from: agentId, to: args.target_agent, severity: args.severity },
        importance: args.severity === "critical" ? 9 : args.severity === "warning" ? 7 : 5,
        timestamp: Date.now(),
      });
      return { ok: true, escalated: true, to: args.target_agent, message: args.message };
    }
    case "report_to_ceo": {
      log.info({ from: agentId, subject: args.subject, priority: args.priority }, "report to CEO");
      recordEpisode(userId, {
        type: "insight",
        summary: `[INFORME ${agentId} → CEO] ${args.subject}: ${(args.content as string).slice(0, 300)}`,
        details: { from: agentId, subject: args.subject, priority: args.priority },
        importance: args.priority === "critical" ? 10 : args.priority === "high" ? 8 : 6,
        timestamp: Date.now(),
      });
      return { ok: true, reported: true, subject: args.subject };
    }
    case "record_business_decision": {
      log.info({ agentId, decision: args.decision }, "business decision recorded");
      recordEpisode(userId, {
        type: "decision",
        summary: `DECISION: ${args.decision}. Contexto: ${args.context}. Afecta: ${args.affects || "todos"}`,
        details: { decision: args.decision, context: args.context, affects: args.affects, recordedBy: agentId },
        importance: 10,
        timestamp: Date.now(),
      });
      return { ok: true, recorded: true, decision: args.decision };
    }

    // ── Energy Market Tools ──
    case "get_omie_spot_prices": {
      const data = await getOMIESpotPrices(args.date as string | undefined);
      return data ? { ok: true, ...data } : { ok: false, error: "Sin datos OMIE disponibles" };
    }
    case "get_omip_futures": {
      const contracts = await getOMIPFutures();
      return { ok: true, contracts, count: contracts.length };
    }
    case "get_pvpc_prices": {
      const prices = await getPVPCPrices(args.date as string | undefined);
      return { ok: true, prices, count: prices.length };
    }
    case "compare_electricity_tariffs": {
      const dist = args.punta_pct ? {
        punta: args.punta_pct as number,
        llano: (args.llano_pct as number) || 0.35,
        valle: (args.valle_pct as number) || 0.30,
      } : undefined;
      const comparisons = compareTariffs(
        args.monthly_kwh as number,
        args.contracted_power_kw as number,
        dist,
      );
      return { ok: true, tariffs: comparisons, cheapest: comparisons[0]?.provider };
    }
    case "generate_savings_report": {
      const report = await generateSavingsReport(
        args.current_provider as string,
        args.annual_cost as number,
        args.monthly_kwh as number,
        args.contracted_power_kw as number,
        (args.tariff_type as string) || "2.0TD",
      );
      return { ok: true, ...report };
    }
    case "get_market_briefing": {
      const briefing = await getMarketBriefing();
      return { ok: true, briefing };
    }

    // ── Self-Improvement Tools ──
    case "get_agent_performance": {
      const metrics = await getAgentPerformance(userId, args.agent_id as string, (args.days as number) || 7);
      return { ok: true, ...metrics };
    }
    case "get_improvement_suggestions": {
      const suggestions = await generateImprovements(userId);
      return { ok: true, suggestions, count: suggestions.length };
    }
    case "research_ai_techniques": {
      const findings = await researchAITechniques();
      return { ok: true, findings, count: findings.length };
    }
    case "get_weekly_ai_report": {
      const report = await generateWeeklyStatusReport(userId);
      return { ok: true, report };
    }

    case "notion_update_page": {
      return { ok: true, note: "Para actualizar paginas directamente en Notion, configura el MCP de Notion. Registro guardado en memoria." };
    }
    case "notion_get_page": {
      return { ok: true, note: "Para leer paginas directamente de Notion, configura el MCP de Notion." };
    }

    // ── Marketing & Web Tools ──
    case "analyze_seo": {
      const url = args.url as string;
      const keyword = args.keyword as string || "";
      const pageData = await fetchPageContent(url);
      if (!pageData.ok) return { ok: false, error: "No se pudo acceder a la pagina" };

      let headers: Record<string, string | null> = {};
      let responseTimeMs = 0;
      let statusCode = 0;
      try {
        const t0 = Date.now();
        const rawRes = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "SinergiaBot/1.0" } });
        responseTimeMs = Date.now() - t0;
        statusCode = rawRes.status;
        headers = {
          server: rawRes.headers.get("server"),
          cacheControl: rawRes.headers.get("cache-control"),
          contentEncoding: rawRes.headers.get("content-encoding"),
          xFrameOptions: rawRes.headers.get("x-frame-options"),
          hsts: rawRes.headers.get("strict-transport-security"),
          csp: rawRes.headers.get("content-security-policy") ? "present" : null,
        };
      } catch {}

      const content = pageData.content.toLowerCase();
      const kwLower = keyword.toLowerCase();
      const wordCount = pageData.content.split(/\s+/).length;

      let keywordCount = 0;
      if (keyword) {
        const regex = new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        keywordCount = (pageData.content.match(regex) || []).length;
      }

      const analysis: Record<string, unknown> = {
        url,
        statusCode,
        responseTimeMs,
        ssl: url.startsWith("https"),
        title: pageData.title,
        titleLength: pageData.title.length,
        titleOptimal: pageData.title.length >= 30 && pageData.title.length <= 60,
        wordCount,
        contentLengthChars: pageData.content.length,
        contentAdequate: wordCount > 300,
        hasKeyword: keyword ? content.includes(kwLower) : "no keyword",
        keywordInTitle: keyword ? pageData.title.toLowerCase().includes(kwLower) : false,
        keywordCount,
        keywordDensity: keyword && wordCount > 0 ? `${((keywordCount / wordCount) * 100).toFixed(2)}%` : null,
        keywordDensityOptimal: keyword ? (keywordCount / wordCount) >= 0.01 && (keywordCount / wordCount) <= 0.03 : null,
        securityHeaders: headers,
        performanceScore: responseTimeMs < 1000 ? "excelente" : responseTimeMs < 3000 ? "bueno" : "lento",
        recommendations: [
          ...(pageData.title.length < 30 ? ["Title muy corto (< 30 chars)"] : []),
          ...(pageData.title.length > 60 ? ["Title muy largo (> 60 chars)"] : []),
          ...(wordCount < 300 ? ["Contenido escaso (< 300 palabras). Minimo recomendado: 800+"] : []),
          ...(keyword && !pageData.title.toLowerCase().includes(kwLower) ? ["Keyword no aparece en el title"] : []),
          ...(keyword && keywordCount === 0 ? ["Keyword no encontrada en el contenido"] : []),
          ...(!url.startsWith("https") ? ["Sin HTTPS — critico para SEO y seguridad"] : []),
          ...(responseTimeMs > 3000 ? ["Tiempo de carga > 3s — penaliza en Google"] : []),
          ...(!headers.hsts ? ["Falta header HSTS"] : []),
        ],
      };
      return { ok: true, ...analysis };
    }
    case "search_keywords": {
      const location = (args.location as string) || "Espana";
      const results = await webSearch(`${args.topic} keywords tendencias ${location} 2025 2026`, 5);
      return { ok: true, topic: args.topic, location, results };
    }
    case "create_content_brief": {
      const topic = args.topic as string;
      const contentType = args.type as string;
      const targetKw = (args.target_keyword as string) || topic;
      const competitorResults = await webSearch(`${targetKw} Espana`, 3);
      const brief = {
        topic,
        type: contentType,
        targetKeyword: targetKw,
        suggestedTitle: `${targetKw}: Guia Completa ${new Date().getFullYear()}`,
        suggestedLength: contentType === "blog" ? "1500-2000 palabras" : contentType === "landing" ? "500-800 palabras" : "200-300 palabras",
        structure: contentType === "blog"
          ? ["H1: Titulo con keyword", "Intro (hook + keyword)", "H2: Que es / Como funciona", "H2: Beneficios", "H2: Como elegir / Comparativa", "H2: Caso practico", "Conclusion + CTA"]
          : ["Hero: titulo + CTA", "Beneficios (3-4)", "Social proof", "Features", "CTA final"],
        competitors: competitorResults.map((r) => ({ title: r.title, url: r.url })),
        seoChecklist: ["Keyword en title", "Keyword en H1", "Keyword en primer parrafo", "Meta description con keyword", "Alt text imagenes", "Internal links (2-3)", "External links (1-2 fuentes)", "URL amigable"],
      };
      return { ok: true, brief };
    }
    case "check_website_status": {
      const url = (args.url as string) || "https://somossinergia.es";
      try {
        const start = Date.now();
        const res = await fetch(url, {
          signal: AbortSignal.timeout(10000),
          headers: { "User-Agent": "SinergiaBot/1.0" },
        });
        const responseTime = Date.now() - start;
        return {
          ok: true,
          url,
          statusCode: res.status,
          statusText: res.statusText,
          responseTimeMs: responseTime,
          ssl: url.startsWith("https"),
          fast: responseTime < 3000,
        };
      } catch (err) {
        return { ok: false, url, error: "Web no accesible", details: String(err) };
      }
    }

    // ── Advanced Marketing Tools ──
    case "generate_social_post": {
      const platform = args.platform as string;
      const topic = args.topic as string;
      const tone = (args.tone as string) || "profesional";
      const includeCta = args.include_cta !== false;
      const maxLength: Record<string, number> = { twitter: 280, linkedin: 1300, instagram: 2200, facebook: 2000, tiktok: 300 };
      const hashtagStyle: Record<string, string> = { linkedin: "3-5 hashtags profesionales", instagram: "15-20 hashtags mix", twitter: "2-3 hashtags trending", facebook: "2-3 hashtags", tiktok: "5-7 hashtags trending" };
      return {
        ok: true,
        platform,
        topic,
        tone,
        maxCharacters: maxLength[platform] || 2000,
        hashtagGuideline: hashtagStyle[platform] || "3-5 hashtags",
        ctaIncluded: includeCta,
        guidelines: `Post para ${platform} sobre "${topic}". Tono: ${tone}. Max ${maxLength[platform] || 2000} chars. ${includeCta ? "Incluir CTA al final." : ""} Adaptar formato a la plataforma.`,
        bestTimeToPost: platform === "linkedin" ? "Martes-Jueves 8-10h" : platform === "instagram" ? "Martes-Viernes 11-13h y 19-21h" : "Martes-Jueves 10-12h",
      };
    }
    case "draft_blog_post": {
      const title = args.title as string;
      const keyword = args.target_keyword as string;
      const length = (args.length as string) || "medium";
      const audience = (args.audience as string) || "PYMEs Comunidad Valenciana";
      const wordCount = length === "short" ? 500 : length === "long" ? 2000 : 1000;
      const competitorContent = await webSearch(`${keyword} blog Espana`, 3);
      return {
        ok: true,
        title,
        targetKeyword: keyword,
        wordCount,
        audience,
        seoStructure: {
          metaTitle: `${title} | Somos Sinergia`,
          metaDescription: `Descubre todo sobre ${keyword}. Guia completa para ${audience}. Consejos practicos. Ahorro garantizado.`,
          h2Suggestions: [`Que es ${keyword}`, `Beneficios de ${keyword}`, `Como elegir ${keyword}`, `${keyword} en ${new Date().getFullYear()}`, `Preguntas frecuentes`],
          internalLinks: ["servicios energeticos", "auditoria energetica", "contacto"],
        },
        competitorInsights: competitorContent.map((r) => ({ title: r.title, url: r.url })),
        checklist: ["Keyword en H1", "Keyword en primer parrafo", "Alt text imagenes", "Meta description < 155 chars", "URL amigable", "CTA claro", "Enlace interno 2-3", "Enlace externo 1-2"],
      };
    }
    case "competitor_analysis": {
      const name = args.competitor_name as string;
      const url = args.competitor_url as string;
      const webResults = await searchCompany(name);
      let siteData = null;
      if (url) {
        const page = await fetchPageContent(url);
        if (page.ok) siteData = { title: page.title, contentLength: page.content.length };
      }
      const socialResults = await webSearch(`"${name}" linkedin OR instagram OR facebook`, 3);
      return {
        ok: true,
        competitor: name,
        webPresence: webResults,
        siteAnalysis: siteData,
        socialPresence: socialResults,
        analysisAreas: ["SEO (posiciones keywords)", "Contenido (blog, frecuencia)", "Redes sociales (seguidores, engagement)", "Publicidad (Google Ads visible)", "Propuesta de valor"],
      };
    }
    case "website_full_audit": {
      const url = (args.url as string) || "https://somossinergia.es";
      const results: Record<string, unknown> = { url };
      try {
        const start = Date.now();
        const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "SinergiaBot/1.0" } });
        results.responseTimeMs = Date.now() - start;
        results.statusCode = res.status;
        results.ssl = url.startsWith("https");
        results.headers = {
          server: res.headers.get("server"),
          cacheControl: res.headers.get("cache-control"),
          contentEncoding: res.headers.get("content-encoding"),
          xFrameOptions: res.headers.get("x-frame-options"),
          strictTransportSecurity: res.headers.get("strict-transport-security"),
        };
        const page = await fetchPageContent(url);
        if (page.ok) {
          results.title = page.title;
          results.contentLength = page.content.length;
          results.hasTitle = page.title.length > 0;
          results.titleLength = page.title.length;
          results.titleOptimal = page.title.length >= 30 && page.title.length <= 60;
        }
      } catch (err) {
        results.error = "No se pudo acceder a la web";
      }
      results.auditChecklist = [
        "Core Web Vitals (LCP, FID, CLS)", "Mobile responsive", "SSL/HTTPS", "Velocidad carga < 3s",
        "Meta title y description", "Headings H1-H3", "Alt text imagenes", "Sitemap.xml", "Robots.txt",
        "Schema markup", "Open Graph tags", "Canonical tags", "404 pages", "Redirects 301",
        "Seguridad headers (HSTS, X-Frame)", "Compresion GZIP/Brotli", "Cache policy",
      ];
      return { ok: true, ...results };
    }
    case "generate_email_campaign": {
      const name = args.campaign_name as string;
      const objective = args.objective as string;
      const segment = (args.target_segment as string) || "todos";
      const tone = (args.tone as string) || "profesional";
      const templates: Record<string, { subjectLine: string; previewText: string; ctaText: string }> = {
        promocion: { subjectLine: "Oferta exclusiva para ti", previewText: "Ahorra hasta un 30% en tu factura", ctaText: "Ver oferta" },
        nurturing: { subjectLine: "Consejos para reducir tu factura electrica", previewText: "5 trucos que no conocias", ctaText: "Leer mas" },
        reactivacion: { subjectLine: "Te echamos de menos", previewText: "Tenemos novedades que te interesan", ctaText: "Volver a conectar" },
        newsletter: { subjectLine: "Novedades Sinergia - Abril 2026", previewText: "Mercado electrico, consejos y mas", ctaText: "Leer newsletter" },
        evento: { subjectLine: "Te invitamos a nuestro webinar", previewText: "Aprende a optimizar tu energia", ctaText: "Reservar plaza" },
        lanzamiento: { subjectLine: "Nuevo servicio disponible", previewText: "Descubre como podemos ayudarte", ctaText: "Descubrir" },
      };
      const template = templates[objective] || templates.newsletter;
      return {
        ok: true,
        campaignName: name,
        objective,
        segment,
        tone,
        emailStructure: {
          ...template,
          sections: ["Header con logo", "Saludo personalizado", "Contenido principal", "Beneficios/datos clave", "CTA prominente", "Footer con unsubscribe"],
          bestSendTime: "Martes o Jueves, 10:00-12:00",
          abTestSuggestion: "Probar 2 lineas de asunto con 10% de la lista antes de enviar al 90%",
        },
        complianceChecklist: ["Link de baja obligatorio (LSSI)", "Identificar remitente", "No enviar antes 8:00 ni despues 21:00", "Verificar consentimiento segmento"],
      };
    }

    case "search_industry_news": {
      const results = await searchIndustryNews(args.sector as string);
      return { ok: true, sector: args.sector, results };
    }
    case "create_task_reminder": {
      const task = {
        title: args.title,
        description: args.description || "",
        dueDate: args.due_date || null,
        assignedTo: args.assigned_to || agentId,
        priority: args.priority || "medium",
        createdBy: agentId,
        createdAt: new Date().toISOString(),
      };
      recordEpisode(userId, {
        type: "insight",
        summary: `[TAREA] ${task.title} - Asignada a: ${task.assignedTo}, Prioridad: ${task.priority}${task.dueDate ? `, Vence: ${task.dueDate}` : ""}`,
        details: task,
        importance: task.priority === "critical" ? 9 : task.priority === "high" ? 7 : 5,
        timestamp: Date.now(),
      });
      log.info({ agentId, task: task.title }, "task reminder created");
      return { ok: true, taskCreated: true, ...task };
    }

    // ── Communication Channel Tools ──
    case "send_sms": {
      const result = await sendSMS(args.to as string, args.message as string, agentId);
      log.info({ agentId, to: args.to, ok: result.ok }, "SMS sent");
      recordEpisode(userId, {
        type: "milestone",
        summary: `[SMS] ${agentId} envio SMS a ${args.to}: ${(args.message as string).slice(0, 100)}`,
        details: { channel: "sms", to: args.to, agentId },
        importance: 6,
        timestamp: Date.now(),
      });
      return { ...result } as ToolHandlerResult;
    }
    case "send_whatsapp": {
      const result = await sendWhatsApp(args.to as string, args.message as string, agentId);
      log.info({ agentId, to: args.to, ok: result.ok }, "WhatsApp sent");
      recordEpisode(userId, {
        type: "milestone",
        summary: `[WhatsApp] ${agentId} envio mensaje a ${args.to}: ${(args.message as string).slice(0, 100)}`,
        details: { channel: "whatsapp", to: args.to, agentId },
        importance: 6,
        timestamp: Date.now(),
      });
      return { ...result } as ToolHandlerResult;
    }
    case "send_telegram": {
      const result = await sendTelegram(args.chat_id as string, args.message as string, agentId);
      log.info({ agentId, chatId: args.chat_id, ok: result.ok }, "Telegram sent");
      recordEpisode(userId, {
        type: "milestone",
        summary: `[Telegram] ${agentId} envio mensaje a chat ${args.chat_id}: ${(args.message as string).slice(0, 100)}`,
        details: { channel: "telegram", chatId: args.chat_id, agentId },
        importance: 5,
        timestamp: Date.now(),
      });
      return { ...result } as ToolHandlerResult;
    }
    case "send_email_transactional": {
      const result = await sendTransactionalEmail(
        args.to as string,
        args.subject as string,
        args.html_content as string,
        agentId,
      );
      log.info({ agentId, to: args.to, subject: args.subject, ok: result.ok }, "transactional email sent");
      recordEpisode(userId, {
        type: "milestone",
        summary: `[Email] ${agentId} envio email a ${args.to}: ${args.subject}`,
        details: { channel: "email", to: args.to, subject: args.subject, agentId },
        importance: 7,
        timestamp: Date.now(),
      });
      return { ...result } as ToolHandlerResult;
    }
    case "make_phone_call": {
      const result = await makePhoneCall(
        args.to as string,
        agentId,
        args.message as string,
        args.callback_url as string | undefined,
      );
      log.info({ agentId, to: args.to, ok: result.ok }, "phone call initiated");
      recordEpisode(userId, {
        type: "milestone",
        summary: `[LLAMADA] ${agentId} llamo a ${args.to}: ${(args.message as string).slice(0, 100)}`,
        details: { channel: "phone", to: args.to, agentId },
        importance: 8,
        timestamp: Date.now(),
      });
      return { ...result } as ToolHandlerResult;
    }
    case "speak_with_voice": {
      const result = await textToSpeech(agentId, args.text as string);
      log.info({ agentId, textLength: (args.text as string).length }, "TTS generated");
      return { ...result } as ToolHandlerResult;
    }
    case "generate_image_ai": {
      const result = await generateImage(
        args.prompt as string,
        args.style as "photographic" | "digital-art" | "3d-model" | "cinematic" | undefined,
        args.size as "1024x1024" | "1024x576" | "576x1024" | undefined,
      );
      log.info({ agentId, prompt: (args.prompt as string).slice(0, 80), ok: result.ok }, "image generated");
      recordEpisode(userId, {
        type: "milestone",
        summary: `[IMAGEN] ${agentId} genero imagen: ${(args.prompt as string).slice(0, 150)}`,
        details: { channel: "image_gen", prompt: args.prompt, style: args.style, agentId },
        importance: 5,
        timestamp: Date.now(),
      });
      return { ...result } as ToolHandlerResult;
    }
    case "ocr_scan_document": {
      const result = await ocrFromImage(args.image_base64 as string);
      log.info({ agentId, ok: result.ok }, "OCR scan completed");
      recordEpisode(userId, {
        type: "milestone",
        summary: `[OCR] ${agentId} escaneo documento`,
        details: { channel: "ocr", agentId },
        importance: 6,
        timestamp: Date.now(),
      });
      return { ...result } as ToolHandlerResult;
    }
    case "get_channels_status": {
      const status = getChannelsStatus();
      return { ok: true, channels: status };
    }

    default:
      return null;
  }
}

// ─── Tool Conversion for OpenAI Format ───────────────────────────────────

export function buildToolsForAgent(agent: SwarmAgent): ChatCompletionTool[] {
  const tools: ChatCompletionTool[] = [];

  for (const toolName of agent.allowedTools) {
    // Check super tools first
    const superTool = SUPER_TOOLS_BY_NAME[toolName];
    if (superTool) {
      tools.push(superTool.openaiTool);
      continue;
    }

    // Fall back to existing Gemini-format tools
    const existingTool = TOOLS_BY_NAME[toolName];
    if (existingTool) {
      tools.push({
        type: "function",
        function: {
          name: existingTool.name,
          description: existingTool.description,
          parameters: existingTool.parameters as Record<string, unknown>,
        },
      });
    }
  }

  // Add shared tools from WEB_TOOLS, but FILTER communication tools for internal agents
  const existingNames = new Set(
    tools.map((t) => (t.type === "function" && "function" in t ? (t as { type: "function"; function: { name: string } }).function.name : "")),
  );
  const isInternal = INTERNAL_LAYERS.has(agent.id);

  for (const wt of WEB_TOOLS) {
    const wtName = (wt as { type: "function"; function: { name: string } }).function.name;
    if (existingNames.has(wtName)) continue;
    // Block communication tools for internal agents at the schema level too
    if (isInternal && isExternalCommunicationTool(wtName)) continue;
    tools.push(wt);
  }

  return tools;
}

// ─── Runtime Module Lazy Loader (avoids circular dependency) ─────────────

let _runtimeMod: any = null;
function getRuntimeMod(): any {
  if (!_runtimeMod) {
    try { _runtimeMod = require("@/lib/runtime"); } catch { /* runtime not available */ }
  }
  return _runtimeMod;
}

// ─── Cases Module Lazy Loader (avoids circular dependency) ───────────────

let _casesMod: any = null;
function getCasesMod(): any {
  if (!_casesMod) {
    try { _casesMod = require("@/lib/cases"); } catch { /* cases not available */ }
  }
  return _casesMod;
}

// ─── Tool Execution (with full preproduction guardrails) ─────────────────
//
// Validation order for every tool call:
//   1. AUDIT: tool_called (informational)
//   2. GOVERNANCE: validateToolAccess (internal agents vs external tools)
//   3. RUNTIME: preActionCheck (mode, kill switches, rate limits)
//      - If blocked → return error with blockedBy reason
//      - If simulate → return simulated success (dry-run / shadow)
//   4. VALIDATE BEFORE SEND: for external communication tools
//      - Checks ownership, client data, legal docs
//      - In guarded/production: blocks if invalid + no case system yet → warn only
//      - In shadow/dry-run: logs only
//   5. EXECUTE the tool
//   6. AUDIT: tool_succeeded / tool_failed / external_message_sent
//
// caseId: null is safe — rate limits per-case are skipped, per-client still apply.
// Phase 2 will provide real caseId from the cases table.

async function executeToolCall(
  userId: string,
  toolName: string,
  args: Record<string, unknown>,
  agentId: string,
  caseId?: string | null,
  visibleOwnerId?: string | null,
): Promise<ToolHandlerResult> {
  let auditMod: any = null;
  try { auditMod = require("@/lib/audit"); } catch { /* audit not available */ }
  const runtimeMod = getRuntimeMod();

  const agentObj = AGENTS_BY_ID[agentId];
  const agentLayer = agentObj?.layer ?? null;
  const safeCaseId = caseId ?? null;
  const safeOwnerId = visibleOwnerId ?? null;

  // ── STEP 1: AUDIT — tool_called ──
  if (auditMod) {
    auditMod.auditLog.emit({
      eventType: "tool_called",
      result: "info",
      userId,
      caseId: safeCaseId,
      agentId,
      agentLayer,
      visibleOwnerId: safeOwnerId,
      toolName,
      reason: `${agentId} invoca ${toolName}`,
      metadata: { argsKeys: Object.keys(args), hasCaseId: safeCaseId !== null },
    });
  }

  // ── STEP 2: GOVERNANCE — validateToolAccess (existing rule: internal → no external comm) ──
  const access = validateToolAccess(agentId, toolName);
  if (!access.allowed) {
    log.warn({ agentId, toolName, reason: access.reason }, "tool access denied by governance");
    if (auditMod) {
      auditMod.validateAndAuditToolAccess(userId, safeCaseId, agentId, toolName, safeOwnerId);
      auditMod.auditExternalMessage(userId, safeCaseId, agentId, toolName, safeOwnerId, false);
    }
    return { ok: false, error: access.reason, blockedBy: "governance" };
  }

  // ── STEP 3: RUNTIME — preActionCheck (mode + kill switches + rate limits) ──
  if (runtimeMod?.preActionCheck) {
    const check: { allowed: boolean; reason: string; blockedBy: string | null; simulate: boolean } =
      runtimeMod.preActionCheck({
        action: "tool_call" as const,
        agentId,
        caseId: safeCaseId,
        clientId: userId, // Phase 2: replace with real clientId from case
        toolName,
        visibleOwnerId: safeOwnerId,
      });

    if (!check.allowed) {
      log.warn({ agentId, toolName, reason: check.reason, blockedBy: check.blockedBy }, "tool blocked by runtime guardrails");

      if (auditMod) {
        auditMod.auditLog.emit({
          eventType: "tool_blocked",
          result: "blocked",
          userId,
          caseId: safeCaseId,
          agentId,
          agentLayer,
          visibleOwnerId: safeOwnerId,
          toolName,
          reason: check.reason,
          metadata: { blockedBy: check.blockedBy, runtimeCheck: true, hasCaseId: safeCaseId !== null },
        });
        if (isExternalCommunicationTool(toolName)) {
          auditMod.auditExternalMessage(userId, safeCaseId, agentId, toolName, safeOwnerId, false);
        }
        auditMod.auditLog.emit({
          eventType: "governance_rule_triggered",
          result: "blocked",
          userId,
          caseId: safeCaseId,
          agentId,
          agentLayer,
          toolName,
          reason: `[RUNTIME] ${check.blockedBy}: ${check.reason}`,
          metadata: { blockedBy: check.blockedBy, toolName },
        });
      }

      return { ok: false, error: `[RUNTIME] ${check.reason}`, blockedBy: check.blockedBy };
    }

    // Dry-run / shadow → simulate (return success without real execution)
    if (check.simulate) {
      log.info({ agentId, toolName, reason: check.reason }, "tool simulated (not executed)");

      if (auditMod) {
        const currentMode = runtimeMod.getRuntimeConfig?.()?.mode ?? "unknown";
        auditMod.auditLog.emit({
          eventType: "tool_succeeded",
          result: "success",
          userId,
          caseId: safeCaseId,
          agentId,
          agentLayer,
          visibleOwnerId: safeOwnerId,
          toolName,
          reason: `[SIMULADO] ${check.reason}`,
          metadata: { simulated: true, mode: currentMode },
        });
        if (isExternalCommunicationTool(toolName)) {
          auditMod.auditLog.emit({
            eventType: "external_message_attempted",
            result: "info",
            userId,
            caseId: safeCaseId,
            agentId,
            agentLayer,
            visibleOwnerId: safeOwnerId,
            toolName,
            reason: `[SIMULADO] Mensaje externo simulado en modo ${currentMode}`,
            metadata: { simulated: true, channel: toolName, mode: currentMode },
          });
        }
      }

      return { ok: true, simulated: true, reason: check.reason };
    }
  }

  // ── STEP 4: VALIDATE BEFORE SEND (external communication tools) ──
  // With real case system (Phase 2): blocks unsafe sends in guarded/production mode.
  // Without caseId / visibleOwnerId (fallback): ownership checks are logged but not enforced.
  if (runtimeMod?.validateBeforeSend && isExternalCommunicationTool(toolName)) {
    const sendCheck: { valid: boolean; issues: string[] } = runtimeMod.validateBeforeSend({
      caseId: safeCaseId,
      agentId,
      visibleOwnerId: safeOwnerId,
      hasClientData: true, // Phase 2: validate real client data from case entity
      isLegalDocument: false, // Phase 2: detect from tool args / document content
    });

    if (!sendCheck.valid) {
      const currentMode = runtimeMod.getRuntimeConfig?.()?.mode ?? "unknown";
      const hasRealOwnership = safeOwnerId !== null && safeCaseId !== null;

      if (hasRealOwnership) {
        // Phase 2: Real ownership data available → enforce strictly in guarded/production
        const isStrictMode = currentMode === "guarded" || currentMode === "production";
        if (isStrictMode) {
          log.warn({ agentId, toolName, issues: sendCheck.issues }, "validateBeforeSend blocked send");
          if (auditMod) {
            auditMod.auditLog.emit({
              eventType: "external_message_blocked",
              result: "blocked",
              userId,
              caseId: safeCaseId,
              agentId,
              agentLayer,
              visibleOwnerId: safeOwnerId,
              toolName,
              reason: `Pre-send validation failed: ${sendCheck.issues.join("; ")}`,
              metadata: { issues: sendCheck.issues, mode: currentMode, enforced: true },
            });
          }
          return { ok: false, error: `[VALIDACIÓN PRE-ENVÍO] ${sendCheck.issues.join("; ")}`, blockedBy: "validation" };
        }
      }

      // No real case system yet OR non-strict mode → log warning, don't block
      if (auditMod) {
        auditMod.auditLog.emit({
          eventType: "governance_rule_triggered",
          result: "info",
          userId,
          caseId: safeCaseId,
          agentId,
          agentLayer,
          visibleOwnerId: safeOwnerId,
          toolName,
          reason: `Pre-send issues (no bloqueante — ${!hasRealOwnership ? "sin sistema de casos" : "modo " + currentMode}): ${sendCheck.issues.join("; ")}`,
          metadata: {
            issues: sendCheck.issues,
            mode: currentMode,
            enforced: false,
            noCaseSystem: !hasRealOwnership,
          },
        });
      }
    }
  }

  // ── STEP 5: EXECUTE THE TOOL ──
  // Audit: mark external comm attempt as allowed
  if (auditMod && isExternalCommunicationTool(toolName)) {
    auditMod.auditExternalMessage(userId, safeCaseId, agentId, toolName, safeOwnerId, true);
  }

  let result: ToolHandlerResult;

  // Check web/communication tools first
  const webResult = await executeWebTool(userId, toolName, args, agentId);
  if (webResult !== null) {
    result = webResult;
  } else {
    const superTool = SUPER_TOOLS_BY_NAME[toolName];
    if (superTool) {
      result = await superTool.handler(userId, args);
    } else {
      const existingTool = TOOLS_BY_NAME[toolName];
      if (existingTool) {
        result = await existingTool.handler(userId, args);
      } else {
        result = { ok: false, error: `Herramienta desconocida: ${toolName}` };
      }
    }
  }

  // ── STEP 6: AUDIT — tool_succeeded / tool_failed + external_message_sent ──
  if (auditMod) {
    auditMod.auditLog.emit({
      eventType: result.ok ? "tool_succeeded" : "tool_failed",
      result: result.ok ? "success" : "failed",
      userId,
      caseId: safeCaseId,
      agentId,
      agentLayer,
      visibleOwnerId: safeOwnerId,
      toolName,
      reason: result.ok
        ? `${toolName} ejecutado con éxito por ${agentId}`
        : `${toolName} falló: ${(result as any).error?.slice?.(0, 120) || "error desconocido"}`,
      metadata: { ok: result.ok, hasCaseId: safeCaseId !== null },
    });

    // Mark successful external send
    if (result.ok && isExternalCommunicationTool(toolName)) {
      auditMod.auditLog.emit({
        eventType: "external_message_sent",
        result: "success",
        userId,
        caseId: safeCaseId,
        agentId,
        agentLayer,
        visibleOwnerId: safeOwnerId,
        toolName,
        reason: `Mensaje externo enviado por ${agentId} vía ${toolName}`,
        metadata: { channel: toolName },
      });
    }
  }

  return result;
}

// ─── Swarm Execution ─────────────────────────────────────────────────────

const MAX_ITERATIONS = 8;
const MAX_DELEGATION_DEPTH = 3;

/**
 * Execute a single agent with conversation loop and tool calling.
 */
async function executeAgent(
  userId: string,
  agent: SwarmAgent,
  messages: ChatCompletionMessageParam[],
  context: string,
  depth: number = 0,
  modelOverride?: string,
  caseId?: string | null,
  visibleOwnerId?: string | null,
): Promise<SwarmResult> {
  const started = Date.now();
  const toolCalls: ToolCallLog[] = [];
  const delegations: Array<{ toAgent: string; reason: string; result: SwarmResult }> = [];
  let totalTokens = 0;
  let model = "gpt-5";
  let iteration = 0;

  // Build memory context
  let memoryContext = "";
  try {
    const snapshot = await buildMemorySnapshot(userId, messages[messages.length - 1]?.content as string || "");
    memoryContext = formatMemoryContext(snapshot);
  } catch (e) {
    logError(log, e, { userId, agentId: agent.id }, "memory snapshot failed");
  }

  // Build knowledge-enhanced prompt (deep teaching per agent)
  const knowledgePrompt = buildAgentPrompt(agent.id);

  // Enhanced system prompt with knowledge + agent personality + memory
  const fullSystemPrompt = [
    knowledgePrompt || agent.systemPrompt,
    memoryContext ? `\n--- MEMORIA DEL USUARIO ---\n${memoryContext}` : "",
    context ? `\n--- CONTEXTO ADICIONAL ---\n${context}` : "",
  ].filter(Boolean).join("\n");

  const tools = buildToolsForAgent(agent);
  const conversationMessages: ChatCompletionMessageParam[] = [...messages];

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    try {
      const result = await chatWithFallback({
        messages: conversationMessages,
        systemPrompt: fullSystemPrompt,
        tools,
        userId,
        model: modelOverride || undefined,
      });

      totalTokens += result.usage.totalTokens;
      model = result.model;
      const responseMessage = result.message;

      // No tool calls: final response
      if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
        const reply = responseMessage.content || "Sin respuesta del agente.";

        // Record this exchange in short-term memory
        addToShortTerm(userId, {
          role: "assistant",
          content: reply,
          agentId: agent.id,
          timestamp: Date.now(),
          toolCalls: toolCalls.map((tc) => ({ name: tc.name, result: JSON.stringify(tc.result).slice(0, 200) })),
        });

        return {
          agentId: agent.id,
          reply,
          toolCalls,
          delegations,
          tokensUsed: totalTokens,
          model,
          durationMs: Date.now() - started,
        };
      }

      // Process tool calls
      conversationMessages.push({
        role: "assistant",
        tool_calls: responseMessage.tool_calls,
      });

      for (const tc of responseMessage.tool_calls) {
        const tcAny = tc as any;
        const fnName = tcAny.function?.name || tcAny.name || "";
        let fnArgs: Record<string, unknown> = {};
        try {
          fnArgs = JSON.parse(tcAny.function?.arguments || tcAny.arguments || "{}");
        } catch {
          fnArgs = {};
        }

        // Handle delegation specially (with runtime guardrails)
        if (fnName === "delegate_task" && depth < MAX_DELEGATION_DEPTH) {
          const targetAgentId = fnArgs.agent_id as string;
          const reason = fnArgs.reason as string || "delegacion";
          const task = fnArgs.task as string || "";

          const targetAgent = AGENTS_BY_ID[targetAgentId];

          // ── RUNTIME CHECK: delegation kill switch + Junior disabled ──
          const delegationRuntimeMod = getRuntimeMod();
          if (delegationRuntimeMod?.preActionCheck) {
            const delegationCheck: { allowed: boolean; reason: string; blockedBy: string | null; simulate: boolean } =
              delegationRuntimeMod.preActionCheck({
                action: "delegation" as const,
                agentId: agent.id,
                caseId: caseId ?? null,
                clientId: userId,
                targetAgentId,
              });

            if (!delegationCheck.allowed) {
              log.warn({ from: agent.id, to: targetAgentId, reason: delegationCheck.reason }, "delegation blocked by runtime");

              try {
                const { auditLog } = require("@/lib/audit");
                auditLog.emit({
                  eventType: "agent_blocked",
                  result: "blocked",
                  userId,
                  caseId: caseId ?? null,
                  agentId: agent.id,
                  agentLayer: agent.layer,
                  targetAgentId,
                  reason: delegationCheck.reason,
                  metadata: { blockedBy: delegationCheck.blockedBy, runtimeCheck: true },
                });
              } catch { /* audit not available */ }

              conversationMessages.push({
                role: "tool",
                tool_call_id: tcAny.id || "",
                content: JSON.stringify({
                  ok: false,
                  error: `[RUNTIME] ${delegationCheck.reason}`,
                  blockedBy: delegationCheck.blockedBy,
                }),
              });
              continue;
            }
          }

          if (targetAgent && agent.canDelegate.includes(targetAgentId)) {
            log.info({ userId, from: agent.id, to: targetAgentId, reason }, "agent delegation");

            // ── AUDIT: agent_delegated ──
            try {
              const { auditLog } = require("@/lib/audit");
              auditLog.emit({
                eventType: "agent_delegated",
                result: "success",
                userId,
                caseId: caseId ?? null,
                agentId: agent.id,
                agentLayer: agent.layer,
                targetAgentId,
                reason: `${agent.id} delega a ${targetAgentId}: ${reason}`,
                metadata: { task: task.slice(0, 150), depth },
              });
            } catch { /* audit not available */ }

            const delegationMessages: ChatCompletionMessageParam[] = [
              { role: "user", content: task },
            ];

            const delegationResult = await executeAgent(
              userId,
              targetAgent,
              delegationMessages,
              context,
              depth + 1,
              undefined, // modelOverride
              caseId,
              visibleOwnerId,
            );

            delegations.push({ toAgent: targetAgentId, reason, result: delegationResult });
            totalTokens += delegationResult.tokensUsed;

            conversationMessages.push({
              role: "tool",
              tool_call_id: tcAny.id || "",
              content: JSON.stringify({
                ok: true,
                delegatedTo: targetAgentId,
                result: delegationResult.reply,
              }),
            });
          } else {
            // ── AUDIT: agent_blocked (delegation denied by governance) ──
            try {
              const { auditLog } = require("@/lib/audit");
              auditLog.emit({
                eventType: "agent_blocked",
                result: "blocked",
                userId,
                caseId: caseId ?? null,
                agentId: agent.id,
                agentLayer: agent.layer,
                targetAgentId,
                reason: targetAgent
                  ? `${agent.id} no tiene permiso para delegar a ${targetAgentId}`
                  : `Agente destino desconocido: ${targetAgentId}`,
                metadata: { from: agent.id, to: targetAgentId, exists: !!targetAgent },
              });
            } catch { /* audit not available */ }

            conversationMessages.push({
              role: "tool",
              tool_call_id: tcAny.id || "",
              content: JSON.stringify({
                ok: false,
                error: targetAgent
                  ? `${agent.id} no puede delegar a ${targetAgentId}`
                  : `Agente desconocido: ${targetAgentId}`,
              }),
            });
          }
          continue;
        }

        // Regular tool execution
        log.info({ userId, agentId: agent.id, tool: fnName, args: fnArgs }, "executing tool");
        const toolResult = await executeToolCall(userId, fnName, fnArgs, agent.id, caseId ?? null, visibleOwnerId ?? null);
        toolCalls.push({ name: fnName, args: fnArgs, result: toolResult });

        conversationMessages.push({
          role: "tool",
          tool_call_id: tcAny.id || "",
          content: JSON.stringify(toolResult),
        });
      }
    } catch (err) {
      logError(log, err, { userId, agentId: agent.id, iteration }, "agent iteration failed");

      // ── AUDIT: agent_exception ──
      try {
        const { auditLog } = require("@/lib/audit");
        auditLog.emit({
          eventType: "agent_exception",
          result: "failed",
          userId,
          caseId: caseId ?? null,
          agentId: agent.id,
          agentLayer: agent.layer,
          reason: `Excepción en ${agent.id} iteración ${iteration}: ${err instanceof Error ? err.message : "unknown"}`,
          metadata: { iteration, errorType: err instanceof Error ? err.constructor.name : typeof err },
        });
      } catch { /* audit not available */ }

      return {
        agentId: agent.id,
        reply: "Ha ocurrido un error procesando la solicitud. Por favor, intentalo de nuevo.",
        toolCalls,
        delegations,
        tokensUsed: totalTokens,
        model,
        durationMs: Date.now() - started,
      };
    }
  }

  // Max iterations reached
  log.warn({ userId, agentId: agent.id, iterations: iteration }, "agent hit max iterations");

  const maxIterReply = "He ejecutado varias acciones pero he alcanzado el limite de iteraciones. Revisa las acciones realizadas o divide la peticion.";

  // Record max-iteration response in short-term memory so context is not lost
  addToShortTerm(userId, {
    role: "assistant",
    content: maxIterReply,
    agentId: agent.id,
    timestamp: Date.now(),
    toolCalls: toolCalls.map((tc) => ({ name: tc.name, result: JSON.stringify(tc.result).slice(0, 200) })),
  });

  return {
    agentId: agent.id,
    reply: maxIterReply,
    toolCalls,
    delegations,
    tokensUsed: totalTokens,
    model,
    durationMs: Date.now() - started,
  };
}

// ─── Main Swarm Entry Point ──────────────────────────────────────────────

export interface SwarmInput {
  userId: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  context?: string;
  agentOverride?: string;
  /** Canal de comunicación (para adaptación de voz) */
  channel?: Channel;
  /** Tipo de cliente (para adaptación de tono) */
  clientType?: ClientType;
  /** Momento del flujo (para cierre contextual) */
  flowMoment?: FlowMoment;
  /** Nombre del contacto/cliente */
  contactName?: string;
}

/**
 * Main entry point for the swarm controller.
 * Routes the query to the best agent and executes it.
 */
export async function executeSwarm(input: SwarmInput): Promise<SwarmResult> {
  const { userId, messages, context = "", agentOverride, channel, clientType, flowMoment, contactName } = input;
  const started = Date.now();

  // Load user-specific agent configuration from DB
  let agentConfig: LoadedAgentConfig | null = null;
  try {
    agentConfig = await loadAgentConfig(userId);
    log.info(
      { userId, agentName: agentConfig.agentName, model: agentConfig.preferredModel },
      "loaded agent config",
    );
  } catch (e) {
    logError(log, e, { userId }, "failed to load agent config, using defaults");
  }

  // configContext built after routing (needs agent ID for voice injection)

  // Auto-seed knowledge base on first interaction (fire-and-forget, non-blocking)
  seedKnowledgeBase(userId).catch((e) =>
    logError(log, e, { userId }, "auto-seed knowledge base failed"),
  );

  // Record user message in short-term memory
  const lastUserMsg = messages.filter((m) => m.role === "user").pop();
  if (lastUserMsg) {
    addToShortTerm(userId, {
      role: "user",
      content: lastUserMsg.content,
      timestamp: Date.now(),
    });

    // Detect preferences from user message
    detectPreferences(userId, lastUserMsg.content);
  }

  // Route to the best agent
  const agentId = agentOverride || routeToAgent(lastUserMsg?.content || "");
  const agent = AGENTS_BY_ID[agentId] || AGENTS_BY_ID["ceo"];

  // Build config context NOW (after routing so we know the agent for voice injection)
  const configContext = agentConfig
    ? buildConfigContext(agentConfig, agent.id, clientType, channel, contactName, flowMoment)
    : "";

  log.info({ userId, agentId: agent.id, agentName: agent.name }, "swarm routing");

  // ── AUDIT: case_routed + agent_selected ──
  try {
    const { auditLog } = require("@/lib/audit");
    const layer = agent.layer;
    auditLog.emit({
      eventType: "case_routed",
      result: "success",
      userId,
      caseId: null, // Case not yet resolved at routing time
      agentId: agent.id,
      agentLayer: layer,
      reason: agentOverride
        ? `Routing override a ${agent.id}`
        : `Caso ruteado a ${agent.id} (gate-keeper: recepcion)`,
      metadata: { query: (lastUserMsg?.content || "").slice(0, 120), override: !!agentOverride },
    });
    auditLog.emit({
      eventType: "agent_selected",
      result: "success",
      userId,
      caseId: null, // Case not yet resolved at routing time
      agentId: agent.id,
      agentLayer: layer,
      reason: `Agente ${agent.id} seleccionado para procesar consulta`,
      metadata: { agentName: agent.name, layer },
    });
  } catch { /* audit not available */ }

  // Set working memory
  setWorkingMemory(userId, {
    currentTask: lastUserMsg?.content?.slice(0, 200) || null,
    activeAgentId: agent.id,
    startedAt: Date.now(),
  });

  // ── CASE RESOLUTION: resolve or create a persistent case ──
  let resolvedCaseId: string | null = null;
  let resolvedVisibleOwnerId: string | null = null;

  const casesMod = getCasesMod();
  if (casesMod?.resolveOrCreateCase) {
    try {
      const caseResult = await casesMod.resolveOrCreateCase({
        userId,
        clientIdentifier: userId, // Default: userId is the client (chat). Phase 3: extract real client from context.
        subject: lastUserMsg?.content?.slice(0, 200) ?? null,
        channel: "chat",
        agentId: agent.id,
      });

      resolvedCaseId = String(caseResult.caseRecord.id);
      resolvedVisibleOwnerId = caseResult.caseRecord.visibleOwnerId ?? agent.id;

      // If the case was existing but has no owner, claim it for this agent
      if (!caseResult.caseRecord.visibleOwnerId && casesMod.updateCaseOwner) {
        await casesMod.updateCaseOwner(caseResult.caseRecord.id, agent.id);
        resolvedVisibleOwnerId = agent.id;
      }

      // Move to active if it was open
      if (caseResult.caseRecord.status === "open" && casesMod.updateCaseStatus) {
        await casesMod.updateCaseStatus(caseResult.caseRecord.id, "active");
      }

      log.info(
        { userId, caseId: resolvedCaseId, created: caseResult.created, owner: resolvedVisibleOwnerId },
        "case resolved for swarm execution",
      );
    } catch (e) {
      logError(log, e, { userId }, "case resolution failed, proceeding without case");
      // Non-fatal: swarm continues with null caseId (backward compat)
    }
  }

  // Convert messages to OpenAI format
  const openaiMessages: ChatCompletionMessageParam[] = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" as const : "user" as const,
    content: m.content,
  }));

  // Include short-term conversation history for context
  const shortTerm = getShortTerm(userId);
  const historyMessages: ChatCompletionMessageParam[] = shortTerm
    .slice(0, -1) // Exclude the message we just added
    .slice(-10) // Last 10 turns
    .map((t) => ({
      role: (t.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: t.content,
    }));

  const allMessages = [...historyMessages, ...openaiMessages];

  // Merge user config context with any extra context
  const fullContext = [configContext, context].filter(Boolean).join("\n");

  try {
    const result = await executeAgent(userId, agent, allMessages, fullContext, 0, agentConfig?.fineTunedModelId || undefined, resolvedCaseId, resolvedVisibleOwnerId);

    // Attach caseId to result for downstream consumers
    result.caseId = resolvedCaseId;

    // ── VOICE FILTER: apply output filter for visible agents ──
    const agentSlugForVoice = agent.id as AgentSlug;
    if (isClientFacing(agentSlugForVoice)) {
      try {
        const filterInput: VoiceFilterInput = {
          agentMessage: result.reply,
          agentSlug: agentSlugForVoice,
          clientType: clientType,
          channel: channel,
          flowMoment: flowMoment,
          clientLastMessage: lastUserMsg?.content,
          escalationContext: {
            confidence: undefined, // Future: computed from agent response analysis
          },
        };
        const filterOutput = applyOutputFilter(filterInput);

        result.reply = filterOutput.filteredMessage;
        result.voiceFiltered = true;
        result.voiceChanges = filterOutput.changes;

        if (filterOutput.escalationTriggered) {
          result.escalationTriggered = filterOutput.escalationTriggered;
          result.escalationMessage = filterOutput.escalationMessage;
          log.info(
            { userId, agentId: agent.id, trigger: filterOutput.escalationTriggered },
            "voice filter triggered escalation",
          );
        }

        if (filterOutput.changes.length > 0) {
          log.info(
            { userId, agentId: agent.id, changes: filterOutput.changes },
            "voice filter applied changes",
          );
        }
      } catch (e) {
        logError(log, e, { userId, agentId: agent.id }, "voice filter failed, using raw reply");
        result.voiceFiltered = false;
      }
    } else {
      // Internal agent: mark output as internal (not client-facing)
      result.voiceFiltered = false;
    }

    // Clear working memory on completion
    clearWorkingMemory(userId);

    // Log to DB
    await logSwarmExecution(userId, result);

    // Auto-consolidate memory every ~20 conversations (non-blocking)
    const shortTermLen = getShortTerm(userId).length;
    if (shortTermLen > 0 && shortTermLen % 20 === 0) {
      consolidateMemory(userId).catch((e) =>
        logError(log, e, { userId }, "auto-consolidate memory failed"),
      );
    }

    return result;
  } catch (err) {
    logError(log, err, { userId, agentId: agent.id }, "swarm execution failed");
    clearWorkingMemory(userId);

    // Record the error in short-term memory so context is preserved
    addToShortTerm(userId, {
      role: "assistant",
      content: "[ERROR] Error interno del sistema de agentes.",
      agentId: agent.id,
      timestamp: Date.now(),
    });

    return {
      agentId: agent.id,
      reply: "Error interno del sistema de agentes. Intentalo de nuevo.",
      toolCalls: [],
      delegations: [],
      tokensUsed: 0,
      model: "error",
      durationMs: Date.now() - started,
    };
  }
}

// ─── Config Context Builder ─────────────────────────────────────────────

function buildConfigContext(
  config: LoadedAgentConfig,
  agentSlug?: string,
  clientType?: ClientType,
  channel?: Channel,
  contactName?: string,
  flowMoment?: FlowMoment,
): string {
  const parts: string[] = [];

  parts.push(`IDENTIDAD: Tu nombre es "${config.agentName}".`);
  parts.push(`PERSONALIDAD: ${config.personality}.`);
  parts.push(`TONO: Usa un tono ${config.defaultTone} en todas las respuestas.`);

  if (config.customPrompt) {
    parts.push(`INSTRUCCIONES ADICIONALES DEL USUARIO:\n${config.customPrompt}`);
  }

  if (config.businessContext) {
    parts.push(`CONTEXTO DE NEGOCIO:\n${config.businessContext}`);
  }

  if (config.autoReplies) {
    parts.push(`AUTO-RESPUESTAS: Activadas (max ${config.maxAutoActions} acciones automaticas por sesion).`);
  } else {
    parts.push(`AUTO-RESPUESTAS: Desactivadas. Siempre pide confirmacion antes de actuar.`);
  }

  if (config.neverAutoReply.length > 0) {
    parts.push(`NUNCA responder automaticamente a: ${config.neverAutoReply.join(", ")}.`);
  }

  if (config.alwaysNotify.length > 0) {
    parts.push(`SIEMPRE notificar sobre emails de: ${config.alwaysNotify.join(", ")}.`);
  }

  if (config.signatureHtml) {
    parts.push(`FIRMA para borradores de email:\n${config.signatureHtml}`);
  }

  if (config.fineTunedModelId) {
    parts.push(`MODELO FINE-TUNED disponible: ${config.fineTunedModelId}`);
  }

  // ── Voice injection for client-facing agents ──
  if (agentSlug && isClientFacing(agentSlug as AgentSlug)) {
    const voiceBlock = buildVoiceInjection(
      clientType ?? "particular",
      channel ?? "chat",
      contactName,
      flowMoment,
    );
    parts.push(`\n${voiceBlock}`);
  }

  return `--- CONFIGURACION PERSONALIZADA ---\n${parts.join("\n")}`;
}

// ─── Logging ─────────────────────────────────────────────────────────────

async function logSwarmExecution(userId: string, result: SwarmResult): Promise<void> {
  try {
    await db.insert(schema.agentLogs).values({
      userId,
      action: `swarm:${result.agentId}`,
      inputSummary: `agent=${result.agentId}, tools=${result.toolCalls.length}, delegations=${result.delegations.length}`,
      outputSummary: result.reply.slice(0, 300),
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
      success: true,
    });
  } catch (e) {
    logError(log, e, { userId }, "swarm log failed");
  }
}

// ─── Swarm Status ────────────────────────────────────────────────────────

export interface SwarmStatus {
  agents: Array<{
    id: string;
    name: string;
    role: string;
    status: "idle" | "active" | "delegating";
    priority: number;
  }>;
  gpt5Available: boolean;
  totalAgents: number;
}

export function getSwarmStatus(userId: string): SwarmStatus {
  const working = getShortTerm(userId);
  const activeAgent = working.length > 0
    ? working[working.length - 1].agentId
    : null;

  return {
    agents: SWARM_AGENTS.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      status: a.id === activeAgent ? "active" : "idle",
      priority: a.priority,
    })),
    gpt5Available: isGPT5Available(),
    totalAgents: SWARM_AGENTS.length,
  };
}
