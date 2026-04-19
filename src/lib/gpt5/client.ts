/**
 * GPT-5 Client — OpenAI SDK wrapper for Sinergia Mail AI
 *
 * Features:
 *   - Model: gpt-5 (env override via GPT5_MODEL)
 *   - System prompt injection with business context
 *   - Function calling support (parallel tool use)
 *   - Streaming support for real-time responses
 *   - Rate limiting (60 req/min sliding window)
 *   - Token tracking per call
 *   - Automatic fallback to Gemini executeAgent on failure
 */

import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionChunk,
  ChatCompletion,
} from "openai/resources/chat/completions";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ component: "gpt5-client" });

// ─── Configuration ───────────────────────────────────────────────────────

const MODEL = process.env.GPT5_MODEL || "gpt-5";
const MAX_TOKENS_RESPONSE = Number(process.env.GPT5_MAX_TOKENS) || 4096;
const TEMPERATURE = Number(process.env.GPT5_TEMPERATURE) || 0.7;

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY no configurada. GPT-5 no disponible.");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// ─── Rate Limiter (sliding window, 60 req/min) ──────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const requestTimestamps: number[] = [];

function checkRateLimit(): boolean {
  const now = Date.now();
  // Remove timestamps outside the window
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= RATE_LIMIT_MAX) {
    return false;
  }
  requestTimestamps.push(now);
  return true;
}

// ─── Token Tracking ─────────────────────────────────────────────────────

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

const tokenTracker = {
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalRequests: 0,
  reset() {
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.totalRequests = 0;
  },
  record(usage: TokenUsage) {
    this.totalPromptTokens += usage.promptTokens;
    this.totalCompletionTokens += usage.completionTokens;
    this.totalRequests += 1;
  },
  getStats() {
    return {
      totalPromptTokens: this.totalPromptTokens,
      totalCompletionTokens: this.totalCompletionTokens,
      totalTokens: this.totalPromptTokens + this.totalCompletionTokens,
      totalRequests: this.totalRequests,
    };
  },
};

export function getTokenStats() {
  return tokenTracker.getStats();
}

// ─── Business Context System Prompt ──────────────────────────────────────

const SINERGIA_SYSTEM_CONTEXT = `Eres el agente inteligente GPT-5 de Sinergia Mail, la plataforma de gestión empresarial integral de Somos Sinergia (servicios energeticos y tecnologicos) con sede en Orihuela, Espana. Gerente: David Miquel Jorda (orihuela@somossinergia.es).

CAPACIDADES PRINCIPALES:
- Gestion completa de email (Gmail multi-cuenta)
- Facturacion: facturas recibidas y emitidas, IVA trimestral (modelo 303)
- CRM: contactos, scoring, seguimiento, secuencias drip
- Calendario: Google Calendar, reuniones con Meet
- Memoria semantica: recuerdas conversaciones y decisiones previas
- Analisis energetico: facturas electricas espanolas (2.0TD, 3.0TD, 6.1TD)
- Automatizacion: reglas de email, triggers, flujos

REGLAS OBLIGATORIAS:
1. Responde SIEMPRE en espanol.
2. Distingue HECHO (dato del sistema), INFERENCIA (tu lectura), RECOMENDACION (que harias).
3. Si falta informacion, dilo claramente: "No tengo dato de X".
4. No inventes cifras, emails ni contactos.
5. Se conciso: maximo 5 frases salvo que el usuario pida detalle.
6. Termina con una ACCION SUGERIDA concreta cuando sea util.
7. Usa herramientas para verificar datos antes de afirmar.
8. Prioriza la privacidad (RGPD): no expongas datos sensibles innecesariamente.

CONTEXTO TEMPORAL: Fecha actual = ${new Date().toISOString().slice(0, 10)}.`;

// ─── Core Chat Completion ────────────────────────────────────────────────

export interface GPT5ChatOptions {
  messages: ChatCompletionMessageParam[];
  systemPrompt?: string;
  tools?: ChatCompletionTool[];
  temperature?: number;
  maxTokens?: number;
  userId?: string;
  parallelToolCalls?: boolean;
}

export interface GPT5ChatResult {
  message: OpenAI.Chat.Completions.ChatCompletionMessage;
  usage: TokenUsage;
  model: string;
  finishReason: string | null;
  durationMs: number;
}

/**
 * Single chat completion call to GPT-5.
 * Handles rate limiting, token tracking, and error logging.
 */
export async function chatCompletion(opts: GPT5ChatOptions): Promise<GPT5ChatResult> {
  if (!checkRateLimit()) {
    throw new Error("Rate limit exceeded: 60 req/min. Intenta de nuevo en unos segundos.");
  }

  const client = getClient();
  const systemMessage: ChatCompletionMessageParam = {
    role: "system",
    content: opts.systemPrompt
      ? `${SINERGIA_SYSTEM_CONTEXT}\n\n${opts.systemPrompt}`
      : SINERGIA_SYSTEM_CONTEXT,
  };

  const allMessages: ChatCompletionMessageParam[] = [systemMessage, ...opts.messages];

  const started = Date.now();

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: allMessages,
      tools: opts.tools && opts.tools.length > 0 ? opts.tools : undefined,
      parallel_tool_calls: opts.parallelToolCalls !== false && opts.tools && opts.tools.length > 0
        ? true
        : undefined,
      temperature: opts.temperature ?? TEMPERATURE,
      max_tokens: opts.maxTokens ?? MAX_TOKENS_RESPONSE,
    });

    const durationMs = Date.now() - started;
    const choice = response.choices[0];
    const usage: TokenUsage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    tokenTracker.record(usage);

    log.info(
      {
        model: response.model,
        tokens: usage.totalTokens,
        durationMs,
        finishReason: choice?.finish_reason,
        userId: opts.userId,
      },
      "GPT-5 completion",
    );

    return {
      message: choice.message,
      usage,
      model: response.model,
      finishReason: choice.finish_reason,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - started;
    logError(log, err, { model: MODEL, durationMs, userId: opts.userId }, "GPT-5 call failed");
    throw err;
  }
}

// ─── Streaming Chat Completion ───────────────────────────────────────────

export interface GPT5StreamOptions extends GPT5ChatOptions {
  onChunk?: (chunk: ChatCompletionChunk) => void;
  onToolCall?: (toolCall: {
    index: number;
    id: string;
    name: string;
    arguments: string;
  }) => void;
}

/**
 * Streaming chat completion. Returns a ReadableStream of text deltas
 * and invokes callbacks for tool calls.
 */
export async function chatCompletionStream(
  opts: GPT5StreamOptions,
): Promise<{
  stream: ReadableStream<Uint8Array>;
  getUsage: () => TokenUsage;
}> {
  if (!checkRateLimit()) {
    throw new Error("Rate limit exceeded: 60 req/min.");
  }

  const client = getClient();
  const systemMessage: ChatCompletionMessageParam = {
    role: "system",
    content: opts.systemPrompt
      ? `${SINERGIA_SYSTEM_CONTEXT}\n\n${opts.systemPrompt}`
      : SINERGIA_SYSTEM_CONTEXT,
  };

  const allMessages: ChatCompletionMessageParam[] = [systemMessage, ...opts.messages];
  let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  const openaiStream = await client.chat.completions.create({
    model: MODEL,
    messages: allMessages,
    tools: opts.tools && opts.tools.length > 0 ? opts.tools : undefined,
    parallel_tool_calls: opts.parallelToolCalls !== false && opts.tools && opts.tools.length > 0
      ? true
      : undefined,
    temperature: opts.temperature ?? TEMPERATURE,
    max_tokens: opts.maxTokens ?? MAX_TOKENS_RESPONSE,
    stream: true,
    stream_options: { include_usage: true },
  });

  const encoder = new TextEncoder();
  // Accumulate tool calls across chunks
  const toolCallAccumulators: Map<number, { id: string; name: string; arguments: string }> = new Map();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of openaiStream) {
          // Track usage from final chunk
          if (chunk.usage) {
            usage = {
              promptTokens: chunk.usage.prompt_tokens ?? 0,
              completionTokens: chunk.usage.completion_tokens ?? 0,
              totalTokens: chunk.usage.total_tokens ?? 0,
            };
            tokenTracker.record(usage);
          }

          opts.onChunk?.(chunk);

          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          // Text content
          if (delta.content) {
            controller.enqueue(encoder.encode(delta.content));
          }

          // Tool calls (streamed incrementally)
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const existing = toolCallAccumulators.get(tc.index);
              if (existing) {
                if (tc.function?.arguments) {
                  existing.arguments += tc.function.arguments;
                }
              } else {
                toolCallAccumulators.set(tc.index, {
                  id: tc.id || "",
                  name: tc.function?.name || "",
                  arguments: tc.function?.arguments || "",
                });
              }
            }
          }

          // If finish_reason is "tool_calls", emit accumulated tool calls
          if (chunk.choices[0]?.finish_reason === "tool_calls") {
            for (const [index, acc] of Array.from(toolCallAccumulators.entries())) {
              opts.onToolCall?.({
                index,
                id: acc.id,
                name: acc.name,
                arguments: acc.arguments,
              });
            }
          }
        }
        controller.close();
      } catch (err) {
        logError(log, err, {}, "GPT-5 stream error");
        controller.error(err);
      }
    },
  });

  return { stream: readable, getUsage: () => usage };
}

// ─── GPT-5 Availability Check ────────────────────────────────────────────

export function isGPT5Available(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// ─── Fallback-aware completion ───────────────────────────────────────────

/**
 * Attempt GPT-5 completion. If it fails, fall back to Gemini via executeAgent.
 * This is the recommended entry point for non-swarm use cases.
 */
export async function chatWithFallback(
  opts: GPT5ChatOptions,
): Promise<GPT5ChatResult & { fallback: boolean }> {
  if (!isGPT5Available()) {
    log.warn("GPT-5 unavailable (no API key), falling back to Gemini");
    return await geminiChatFallback(opts);
  }

  try {
    const result = await chatCompletion(opts);
    return { ...result, fallback: false };
  } catch (err) {
    logError(log, err, { userId: opts.userId }, "GPT-5 failed, falling back to Gemini");
    return await geminiChatFallback(opts);
  }
}

/**
 * Gemini fallback: converts GPT-5 message format to Gemini executeAgent format
 * and wraps the result in GPT5ChatResult shape.
 */
async function geminiChatFallback(
  opts: GPT5ChatOptions,
): Promise<GPT5ChatResult & { fallback: boolean }> {
  const started = Date.now();
  try {
    // Dynamic import to avoid circular dependencies
    const { executeAgent } = await import("@/lib/agent/execute");

    // Convert OpenAI messages to Gemini ChatMessage format
    const chatMessages = opts.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      }));

    const result = await executeAgent(opts.userId || "system", chatMessages);
    const durationMs = Date.now() - started;

    return {
      message: {
        role: "assistant",
        content: result.reply,
        refusal: null,
      },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: "gemini-2.5-flash (fallback)",
      finishReason: "stop",
      durationMs,
      fallback: true,
    };
  } catch (fallbackErr) {
    logError(log, fallbackErr, {}, "Gemini fallback also failed");
    const durationMs = Date.now() - started;
    return {
      message: {
        role: "assistant",
        content: "Lo siento, tanto GPT-5 como Gemini estan temporalmente no disponibles. Intentalo de nuevo en unos minutos.",
        refusal: null,
      },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: "none (both failed)",
      finishReason: "error",
      durationMs,
      fallback: true,
    };
  }
}
