/**
 * Admin Agent Bridge — invocar el swarm desde fuera del dashboard.
 *
 * Pensado para que Claude Code (u otros sistemas autorizados) puedan
 * ejecutar agentes con sus tools reales sin tener que iniciar sesión
 * NextAuth. Auth: Bearer AGENT_API_KEY (env var, único, generado a mano).
 *
 * POST /api/admin/agent
 *   Headers:
 *     Authorization: Bearer <AGENT_API_KEY>
 *   Body:
 *     {
 *       messages: [{ role: 'user' | 'assistant', content: string }],
 *       agentOverride?: string,    // ej. 'marketing-automation'
 *       context?: string
 *     }
 *   Response: { reply, agentId, toolCalls[], delegations[], tokensUsed, model, durationMs }
 *
 * El swarm se ejecuta como el usuario admin (ADMIN_EMAIL). Las acciones
 * destructivas (toggle plugins, replace page html, etc.) tienen sus
 * propias confirmaciones internas. Aún así: ESTE ENDPOINT ES UNA
 * SUPERPOSICIÓN AL CONTROL DEL DASHBOARD. Cualquier filtración del
 * AGENT_API_KEY equivale a control total. Rota la clave si dudas.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeSwarm } from "@/lib/agent/swarm";
import { logger, logError } from "@/lib/logger";
import { db } from "@/db";

const log = logger.child({ route: "/api/admin/agent" });

const ADMIN_EMAIL = "orihuela@somossinergia.es";

export async function POST(req: NextRequest) {
  const started = Date.now();

  // ── Auth ──
  const authHeader = req.headers.get("Authorization");
  const expected = process.env.AGENT_API_KEY;
  if (!expected) {
    log.error("AGENT_API_KEY not configured in environment");
    return NextResponse.json(
      { error: "AGENT_API_KEY not configured" },
      { status: 503 },
    );
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Body ──
  let body: {
    messages?: Array<{ role: "user" | "assistant"; content: string }>;
    agentOverride?: string;
    context?: string;
    asUserEmail?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messages, agentOverride, context, asUserEmail } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "messages requerido (array de {role, content})" },
      { status: 400 },
    );
  }
  for (const m of messages) {
    if (!m.role || !m.content) {
      return NextResponse.json(
        { error: "Cada mensaje debe tener role y content" },
        { status: 400 },
      );
    }
  }

  // ── Resolver usuario admin ──
  const targetEmail = (asUserEmail || ADMIN_EMAIL).toLowerCase();
  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, targetEmail),
    columns: { id: true, email: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: `Usuario ${targetEmail} no encontrado en la DB` },
      { status: 404 },
    );
  }

  log.info(
    {
      userId: user.id,
      email: user.email,
      messageCount: messages.length,
      agentOverride,
    },
    "admin agent bridge invoked",
  );

  // ── Ejecutar swarm ──
  try {
    const result = await executeSwarm({
      userId: user.id,
      messages,
      context: context || "",
      agentOverride,
    });

    const durationMs = Date.now() - started;
    log.info(
      {
        userId: user.id,
        agentId: result.agentId,
        toolCalls: result.toolCalls.length,
        tokensUsed: result.tokensUsed,
        durationMs,
      },
      "admin agent bridge response",
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
    logError(log, err, { userId: user.id }, "admin agent bridge error");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
