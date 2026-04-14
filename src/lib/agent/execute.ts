import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import { TOOLS, TOOLS_BY_NAME, type ToolHandlerResult } from "./tools";
import { logger, logError } from "@/lib/logger";
import { SYSTEM_PROMPT_AGENT } from "@/lib/prompts";

const log = logger.child({ component: "agent-execute" });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * Gemini-compatible function declarations built from our TOOLS registry.
 * Using a permissive shape: the Gemini SDK tolerates parameters as plain JSON Schema.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const functionDeclarations: any[] = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters,
}));

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export interface ToolCallLog {
  name: string;
  args: Record<string, unknown>;
  result: ToolHandlerResult;
}

export interface AgentExecuteResult {
  reply: string;
  toolCalls: ToolCallLog[];
}

/**
 * Agentic chat loop.
 *
 * Flow:
 *   1. Send conversation + system prompt + tools to Gemini
 *   2. If Gemini returns a functionCall, execute it → append functionResponse
 *   3. Loop up to MAX_ITERATIONS (protect against runaway calls)
 *   4. Return final text response + list of tool calls performed
 */
export async function executeAgent(
  userId: string,
  messages: ChatMessage[],
  context: string = "",
): Promise<AgentExecuteResult> {
  const MAX_ITERATIONS = 5;

  // Model with tools bound
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: {
      role: "system",
      parts: [{ text: SYSTEM_PROMPT_AGENT }],
    },
    tools: [{ functionDeclarations }],
  });

  // Convert history to Gemini format (skip the initial greeting if role=model)
  const conversation: Content[] = messages
    .filter((_, i) => !(i === 0 && messages[0].role === "model"))
    .map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));

  // Inject realtime user context into the LAST user message as a preface
  if (context && conversation.length > 0) {
    const last = conversation[conversation.length - 1];
    if (last.role === "user" && last.parts[0]?.text) {
      last.parts[0].text = `[Contexto del usuario: ${context}]\n\n${last.parts[0].text}`;
    }
  }

  const toolCalls: ToolCallLog[] = [];
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    const result = await model.generateContent({ contents: conversation });
    const response = result.response;
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    // Collect any functionCalls in this turn
    const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);

    if (functionCalls.length === 0) {
      // Final text response
      const text = response.text();
      log.info({ userId, iterations: iteration, toolCallsCount: toolCalls.length }, "agent response");
      return { reply: text, toolCalls };
    }

    // Append model turn (function calls) to conversation
    conversation.push({
      role: "model",
      parts: parts,
    });

    // Execute each function call and append functionResponse
    const functionResponses: Content["parts"] = [];
    for (const fc of functionCalls) {
      const tool = TOOLS_BY_NAME[fc.name];
      if (!tool) {
        functionResponses.push({
          functionResponse: {
            name: fc.name,
            response: { ok: false, error: `Tool desconocida: ${fc.name}` },
          },
        });
        continue;
      }

      log.info({ userId, tool: fc.name, args: fc.args }, "executing tool");
      const toolResult = await tool.handler(userId, (fc.args || {}) as Record<string, unknown>);
      toolCalls.push({ name: fc.name, args: (fc.args || {}) as Record<string, unknown>, result: toolResult });

      functionResponses.push({
        functionResponse: {
          name: fc.name,
          response: toolResult as unknown as Record<string, unknown>,
        },
      });
    }

    conversation.push({
      role: "user", // Gemini expects role "user" for functionResponse turns
      parts: functionResponses,
    });
  }

  // Hit max iterations — return last known text or fallback
  log.warn({ userId, iterations: iteration }, "agent hit max iterations");
  return {
    reply:
      "He ejecutado varias acciones pero he alcanzado el límite de iteraciones. Por favor, divide la petición o revisa las acciones ya realizadas.",
    toolCalls,
  };
}

/** Fallback: plain chat without tools (used on orchestrator failure). */
export async function plainChat(messages: ChatMessage[], context: string = ""): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: {
        role: "system",
        parts: [{ text: SYSTEM_PROMPT_AGENT }],
      },
    });
    const contents: Content[] = messages
      .filter((_, i) => !(i === 0 && messages[0].role === "model"))
      .map((m) => ({ role: m.role, parts: [{ text: m.content }] }));
    if (context && contents.length > 0) {
      const last = contents[contents.length - 1];
      if (last.role === "user" && last.parts[0]?.text) {
        last.parts[0].text = `[Contexto: ${context}]\n\n${last.parts[0].text}`;
      }
    }
    const result = await model.generateContent({ contents });
    return result.response.text();
  } catch (e) {
    logError(log, e, {}, "plain chat failed");
    return "[Error del agente]: no pude procesar la petición.";
  }
}
