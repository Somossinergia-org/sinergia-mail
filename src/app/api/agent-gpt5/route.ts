/**
 * GPT-5 Agent API Route — Sinergia AI Swarm Endpoint
 *
 * POST: receives { messages, context, agentOverride? }
 * Uses swarm controller to route to best agent.
 * Streams response back via ReadableStream.
 * Falls back to Gemini executeAgent if GPT-5 unavailable.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { executeSwarm, getSwarmStatus, type SwarmResult } from "@/lib/agent/swarm";
import { isGPT5Available } from "@/lib/gpt5/client";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { logger, logError } from "@/lib/logger";
import { db, schema } from "@/db";

const log = logger.child({ component: "api-agent-gpt5" });

export async function POST(req: NextRequest) {
  const started = Date.now();

  try {
    // Auth check
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Get userId from session
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, session.user!.email!),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const userId = user.id;

    // Rate limit (shared limiter: 30 req/min for agent scope)
    const rl = rateLimit(userId, "agent");
    if (!rl.success) {
      return rateLimitResponse(rl, req.headers.get("x-request-id") || "unknown");
    }

    // Parse body
    const body = await req.json();
    const {
      messages,
      context,
      agentOverride,
      stream: wantStream,
    } = body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      context?: string;
      agentOverride?: string;
      stream?: boolean;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages requerido (array de {role, content})" },
        { status: 400 },
      );
    }

    // Validate messages
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return NextResponse.json(
          { error: "Cada mensaje debe tener role y content" },
          { status: 400 },
        );
      }
    }

    log.info(
      {
        userId,
        messageCount: messages.length,
        agentOverride,
        gpt5Available: isGPT5Available(),
        wantStream,
      },
      "GPT-5 agent request",
    );

    // If streaming is requested, use a ReadableStream response
    if (wantStream) {
      return handleStreamingRequest(userId, messages, context || "", agentOverride);
    }

    // Non-streaming: execute swarm and return full result
    const result = await executeSwarm({
      userId,
      messages,
      context: context || "",
      agentOverride,
    });

    const durationMs = Date.now() - started;
    log.info(
      {
        userId,
        agentId: result.agentId,
        toolCalls: result.toolCalls.length,
        delegations: result.delegations.length,
        tokensUsed: result.tokensUsed,
        model: result.model,
        durationMs,
      },
      "GPT-5 agent response",
    );

    return NextResponse.json({
      reply: result.reply,
      agentId: result.agentId,
      toolCalls: result.toolCalls.map((tc) => ({
        name: tc.name,
        args: tc.args,
        result: tc.result,
      })),
      delegations: result.delegations.map((d) => ({
        toAgent: d.toAgent,
        reason: d.reason,
        reply: d.result.reply,
      })),
      tokensUsed: result.tokensUsed,
      model: result.model,
      durationMs: result.durationMs,
    });
  } catch (err) {
    logError(log, err, {}, "GPT-5 agent route error");

    // Attempt Gemini fallback
    try {
      const { plainChat } = await import("@/lib/agent/execute");
      const body = await req.clone().json().catch(() => ({ messages: [] }));
      const messages = (body.messages || []).map(
        (m: { role: string; content: string }) => ({
          role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
          content: m.content,
        }),
      );
      const fallbackReply = await plainChat(messages);
      return NextResponse.json({
        reply: fallbackReply,
        agentId: "gemini-fallback",
        toolCalls: [],
        delegations: [],
        tokensUsed: 0,
        model: "gemini-2.5-flash (fallback)",
        durationMs: Date.now() - started,
        fallback: true,
      });
    } catch {
      return NextResponse.json(
        { error: "Error del servicio de IA. Intentalo de nuevo." },
        { status: 500 },
      );
    }
  }
}

// ─── Streaming Handler ───────────────────────────────────────────────────

function handleStreamingRequest(
  userId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  context: string,
  agentOverride?: string,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send initial agent routing event
        const lastMsg = messages.filter((m) => m.role === "user").pop();
        const { routeToAgent } = await import("@/lib/agent/swarm");
        const agentId = agentOverride || routeToAgent(lastMsg?.content || "");

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "agent_start", agentId })}\n\n`,
          ),
        );

        // Execute swarm (non-streaming internally, but we stream the result)
        const result = await executeSwarm({
          userId,
          messages,
          context,
          agentOverride,
        });

        // Stream tool calls
        for (const tc of result.toolCalls) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "tool_call",
                name: tc.name,
                args: tc.args,
                success: tc.result.ok,
              })}\n\n`,
            ),
          );
        }

        // Stream delegations
        for (const d of result.delegations) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "delegation",
                toAgent: d.toAgent,
                reason: d.reason,
              })}\n\n`,
            ),
          );
        }

        // Stream the reply in chunks (simulating streaming for better UX)
        const words = result.reply.split(" ");
        const chunkSize = 5;
        for (let i = 0; i < words.length; i += chunkSize) {
          const chunk = words.slice(i, Math.min(i + chunkSize, words.length)).join(" ");
          const suffix = i + chunkSize < words.length ? " " : "";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "text", content: chunk + suffix })}\n\n`,
            ),
          );
        }

        // Send completion event (incluye reply completa como fallback si el cliente perdió chunks)
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              agentId: result.agentId,
              reply: result.reply,
              model: result.model,
              tokensUsed: result.tokensUsed,
              durationMs: result.durationMs,
              toolCalls: result.toolCalls.length,
              delegations: result.delegations.length,
            })}\n\n`,
          ),
        );

        controller.close();
      } catch (err) {
        logError(log, err, { userId }, "streaming handler error");
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: "Error procesando la solicitud" })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ─── GET: Swarm Status ───────────────────────────────────────────────────

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, session.user!.email!),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const status = getSwarmStatus(user.id);
    return NextResponse.json(status);
  } catch (err) {
    logError(log, err, {}, "swarm status error");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
