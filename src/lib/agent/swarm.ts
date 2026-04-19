/**
 * Multi-Agent Swarm Controller — The Brain of Sinergia AI
 *
 * 8 specialized agents orchestrated by a CEO agent:
 *   1. CEO (orchestrator) — routes and consolidates
 *   2. Email Manager — inbox operations
 *   3. Fiscal Controller — invoices, IVA, tax
 *   4. Calendar Assistant — events, meetings, reminders
 *   5. CRM Director — contacts, scoring, follow-ups
 *   6. Energy Analyst — electric bills, tariffs, savings
 *   7. Automation Engineer — rules, triggers, sequences
 *   8. Legal/RGPD Officer — compliance, data protection
 *
 * Features:
 *   - Agent-to-agent delegation
 *   - Priority queue for tasks
 *   - Conversation memory via memory-engine
 *   - Context window management
 *   - Parallel execution for multi-domain queries
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
  type ConversationTurn,
} from "./memory-engine";
import { TOOLS_BY_NAME, type ToolHandlerResult } from "./tools";
import { loadAgentConfig, type LoadedAgentConfig } from "./config-loader";
import { logger, logError } from "@/lib/logger";
import { db, schema } from "@/db";

const log = logger.child({ component: "swarm" });

// ─── Types ───────────────────────────────────────────────────────────────

export interface SwarmAgent {
  id: string;
  name: string;
  role: string;
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
}

// ─── Agent Definitions ───────────────────────────────────────────────────

const SWARM_AGENTS: SwarmAgent[] = [
  {
    id: "ceo",
    name: "Director General",
    role: "Orchestrator",
    systemPrompt: `Eres el CEO del equipo de agentes de Sinergia. Tu funcion principal es:
1. Analizar la peticion del usuario y decidir que agente(s) especialista(s) deben responder.
2. Si la consulta cruza multiples dominios, coordinar respuestas de varios agentes.
3. Si es una consulta simple y directa, responder tu mismo.
4. Consolidar respuestas de multiples agentes en una respuesta coherente.
5. Priorizar la eficiencia: no delegues si puedes resolver en 2 frases.

Para delegar, usa la herramienta delegate_task con el agente adecuado.
Agentes disponibles: email-manager, fiscal-controller, calendar-assistant, crm-director, energy-analyst, automation-engineer, legal-rgpd.`,
    allowedTools: [
      "get_stats", "business_dashboard", "smart_search", "delegate_task",
      "weekly_executive_brief", "memory_search", "memory_add",
      "learn_preference", "forecast_revenue",
    ],
    canDelegate: ["email-manager", "fiscal-controller", "calendar-assistant", "crm-director", "energy-analyst", "automation-engineer", "legal-rgpd"],
    priority: 10,
  },
  {
    id: "email-manager",
    name: "Gestor de Email",
    role: "Email Manager",
    systemPrompt: `Eres el gestor de email de Sinergia. Tu dominio es la bandeja de entrada: priorizar, clasificar, buscar, redactar borradores y automatizar reglas.
Conoces los patrones del usuario y sus contactos frecuentes.
Si detectas una factura en un email, sugiere derivar al fiscal-controller.
Si detectas un evento, sugiere derivar al calendar-assistant.`,
    allowedTools: [
      "search_emails", "mark_emails_read", "trash_emails", "create_draft",
      "create_email_rule", "list_email_rules", "delete_email_rule",
      "draft_and_send", "bulk_categorize", "memory_search",
      "smart_search", "delegate_task",
    ],
    canDelegate: ["fiscal-controller", "calendar-assistant"],
    priority: 7,
  },
  {
    id: "fiscal-controller",
    name: "Controller Fiscal",
    role: "Fiscal Controller",
    systemPrompt: `Eres el controller fiscal de Sinergia. Gestionas facturas recibidas y emitidas, calculas IVA trimestral (modelo 303), detectas duplicados y alertas de vencimiento.
NUNCA redondees cifras. Siempre da importes exactos con 2 decimales.
Conoces la fiscalidad espanola: tipos de IVA (21%, 10%, 4%, 0%), IRPF, modelos trimestrales.`,
    allowedTools: [
      "search_invoices", "find_invoices_smart", "get_overdue_invoices",
      "get_iva_quarterly", "get_duplicate_invoices", "update_invoice",
      "draft_payment_reminder", "save_invoice_to_drive",
      "add_invoice_due_reminder", "forecast_revenue",
      "smart_search", "contact_intelligence", "delegate_task",
    ],
    canDelegate: ["email-manager", "calendar-assistant"],
    priority: 8,
  },
  {
    id: "calendar-assistant",
    name: "Asistente de Agenda",
    role: "Calendar Assistant",
    systemPrompt: `Eres el asistente de agenda de Sinergia. Gestionas eventos de Google Calendar, creas reuniones con Google Meet, y alertas de conflictos de horario.
Siempre muestra horas en formato 24h zona Espana (CET/CEST).
Cuando crees un evento, confirma la hora y si necesita Meet.`,
    allowedTools: [
      "create_calendar_event", "list_upcoming_events",
      "add_invoice_due_reminder", "create_task", "list_tasks",
      "smart_search", "delegate_task",
    ],
    canDelegate: ["email-manager"],
    priority: 6,
  },
  {
    id: "crm-director",
    name: "Director CRM",
    role: "CRM Director",
    systemPrompt: `Eres el director de CRM de Sinergia. Conoces el historial de cada contacto: emails enviados/recibidos, facturas, reuniones.
Priorizas relaciones con scoring inteligente y sugieres seguimientos.
Tu objetivo es maximizar las relaciones comerciales y detectar oportunidades.`,
    allowedTools: [
      "smart_search", "contact_intelligence", "analyze_sentiment_trend",
      "search_emails", "search_invoices", "memory_search", "memory_add",
      "delegate_task", "learn_preference",
    ],
    canDelegate: ["email-manager", "fiscal-controller"],
    priority: 7,
  },
  {
    id: "energy-analyst",
    name: "Analista Energetico",
    role: "Energy Analyst",
    systemPrompt: `Eres el analista energetico de Sinergia. Parseas facturas electricas espanolas (20+ comercializadoras), comparas tarifas, detectas anomalias en consumo y propones ahorros.
Dominas tarifas 2.0TD, 3.0TD y 6.1TD. Conoces los periodos de facturacion, potencias contratadas, terminos de energia y potencia, excesos de reactiva.`,
    allowedTools: [
      "find_invoices_smart", "smart_search", "contact_intelligence",
      "forecast_revenue", "memory_search", "memory_add", "delegate_task",
    ],
    canDelegate: ["fiscal-controller"],
    priority: 6,
  },
  {
    id: "automation-engineer",
    name: "Ingeniero de Automatizacion",
    role: "Automation Engineer",
    systemPrompt: `Eres el ingeniero de automatizacion de Sinergia. Creas reglas de email, secuencias drip, triggers y flujos automatizados.
Tu objetivo es eliminar tareas repetitivas del usuario.
Siempre explica que hara la automatizacion antes de crearla y pide confirmacion.`,
    allowedTools: [
      "create_email_rule", "list_email_rules", "delete_email_rule",
      "create_task", "smart_search", "memory_search", "memory_add",
      "learn_preference", "delegate_task",
    ],
    canDelegate: ["email-manager"],
    priority: 5,
  },
  {
    id: "legal-rgpd",
    name: "Oficial RGPD",
    role: "Legal/RGPD Officer",
    systemPrompt: `Eres el oficial de proteccion de datos (RGPD/LOPD) de Sinergia.
Tu funcion es asegurar el cumplimiento normativo en todas las operaciones:
- Verificar que no se expongan datos personales innecesariamente
- Asegurar el derecho al olvido cuando se solicite
- Revisar que las automatizaciones respeten la privacidad
- Asesorar sobre consentimiento, base legal y legitimacion
- Detectar posibles brechas de seguridad en los datos

Cuando detectes un riesgo de privacidad, alerta inmediatamente.
Conoces el RGPD (UE 2016/679), la LOPD-GDD (3/2018) y la LSSI.`,
    allowedTools: [
      "smart_search", "memory_search", "memory_add",
      "search_emails", "delegate_task", "learn_preference",
    ],
    canDelegate: ["email-manager", "automation-engineer"],
    priority: 9,
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
 * Detect the best agent to handle a user query.
 * CEO handles ambiguous or multi-domain queries.
 */
export function routeToAgent(query: string): string {
  const q = query.toLowerCase();

  // RGPD/Legal triggers
  if (/rgpd|lopd|proteccion de datos|privacidad|consentimiento|derecho al olvido|brecha/.test(q)) return "legal-rgpd";

  // Fiscal triggers
  if (/factura|iva|impuesto|vencimiento|nif|gasto|cobr[oa]|pag[oa]|fiscal|modelo\s*303|tributar/.test(q)) return "fiscal-controller";

  // Calendar triggers
  if (/calendario|evento|reunion|meet|agenda|cita|horario|disponib/.test(q)) return "calendar-assistant";

  // CRM triggers
  if (/contacto|cliente|proveedor|scoring|seguimiento|crm|relacion|pipeline/.test(q)) return "crm-director";

  // Energy triggers
  if (/consumo|potencia|cups|tarifa|comercializadora|kw|kwh|energia|electric/.test(q)) return "energy-analyst";

  // Automation triggers
  if (/regla|secuencia|drip|automatiz|trigger|webhook|flujo/.test(q)) return "automation-engineer";

  // Email triggers
  if (/email|correo|bandeja|leer|borrar|draft|enviar|responder|hilo|inbox/.test(q)) return "email-manager";

  // Multi-domain or general: CEO
  return "ceo";
}

// ─── Tool Conversion for OpenAI Format ───────────────────────────────────

function buildToolsForAgent(agent: SwarmAgent): ChatCompletionTool[] {
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

  return tools;
}

// ─── Tool Execution ──────────────────────────────────────────────────────

async function executeToolCall(
  userId: string,
  toolName: string,
  args: Record<string, unknown>,
  agentId: string,
): Promise<ToolHandlerResult> {
  // Check super tools first
  const superTool = SUPER_TOOLS_BY_NAME[toolName];
  if (superTool) {
    return await superTool.handler(userId, args);
  }

  // Fall back to existing tools
  const existingTool = TOOLS_BY_NAME[toolName];
  if (existingTool) {
    return await existingTool.handler(userId, args);
  }

  return { ok: false, error: `Herramienta desconocida: ${toolName}` };
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

  // Enhanced system prompt with agent personality + memory
  const fullSystemPrompt = [
    agent.systemPrompt,
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

        // Handle delegation specially
        if (fnName === "delegate_task" && depth < MAX_DELEGATION_DEPTH) {
          const targetAgentId = fnArgs.agent_id as string;
          const reason = fnArgs.reason as string || "delegacion";
          const task = fnArgs.task as string || "";

          const targetAgent = AGENTS_BY_ID[targetAgentId];
          if (targetAgent && agent.canDelegate.includes(targetAgentId)) {
            log.info({ userId, from: agent.id, to: targetAgentId, reason }, "agent delegation");

            const delegationMessages: ChatCompletionMessageParam[] = [
              { role: "user", content: task },
            ];

            const delegationResult = await executeAgent(
              userId,
              targetAgent,
              delegationMessages,
              context,
              depth + 1,
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
        const toolResult = await executeToolCall(userId, fnName, fnArgs, agent.id);
        toolCalls.push({ name: fnName, args: fnArgs, result: toolResult });

        conversationMessages.push({
          role: "tool",
          tool_call_id: tcAny.id || "",
          content: JSON.stringify(toolResult),
        });
      }
    } catch (err) {
      logError(log, err, { userId, agentId: agent.id, iteration }, "agent iteration failed");
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
  return {
    agentId: agent.id,
    reply: "He ejecutado varias acciones pero he alcanzado el limite de iteraciones. Revisa las acciones realizadas o divide la peticion.",
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
}

/**
 * Main entry point for the swarm controller.
 * Routes the query to the best agent and executes it.
 */
export async function executeSwarm(input: SwarmInput): Promise<SwarmResult> {
  const { userId, messages, context = "", agentOverride } = input;
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

  // Build config context to inject into every agent prompt
  const configContext = agentConfig ? buildConfigContext(agentConfig) : "";

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

  log.info({ userId, agentId: agent.id, agentName: agent.name }, "swarm routing");

  // Set working memory
  setWorkingMemory(userId, {
    currentTask: lastUserMsg?.content?.slice(0, 200) || null,
    activeAgentId: agent.id,
    startedAt: Date.now(),
  });

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
    const result = await executeAgent(userId, agent, allMessages, fullContext);

    // Clear working memory on completion
    clearWorkingMemory(userId);

    // Log to DB
    await logSwarmExecution(userId, result);

    return result;
  } catch (err) {
    logError(log, err, { userId, agentId: agent.id }, "swarm execution failed");
    clearWorkingMemory(userId);

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

function buildConfigContext(config: LoadedAgentConfig): string {
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

  return `--- CONFIGURACION PERSONALIZADA ---\n${parts.join("\n")}`;
}

// ─── Parallel Swarm Execution ────────────────────────────────────────────

/**
 * Execute multiple agents in parallel for multi-domain queries.
 * The CEO can use this to dispatch to several specialists simultaneously.
 */
export async function executeParallelSwarm(
  userId: string,
  agentTasks: Array<{ agentId: string; task: string }>,
  context: string = "",
): Promise<SwarmResult[]> {
  const promises = agentTasks.map(({ agentId, task }) => {
    const agent = AGENTS_BY_ID[agentId] || AGENTS_BY_ID["ceo"];
    const messages: ChatCompletionMessageParam[] = [{ role: "user", content: task }];
    return executeAgent(userId, agent, messages, context);
  });

  return Promise.all(promises);
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
