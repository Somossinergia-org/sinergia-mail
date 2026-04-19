import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/**
 * Agent Config API
 * GET   — return current agent config (create default if none exists)
 * PATCH — update any config fields
 * POST  — { action: "test_prompt", message } — test the custom system prompt
 */

async function getOrCreateConfig(userId: string) {
  const existing = await db
    .select()
    .from(schema.agentConfig)
    .where(eq(schema.agentConfig.userId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(schema.agentConfig)
    .values({ userId })
    .returning();
  return created;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const config = await getOrCreateConfig(session.user.id);
    return NextResponse.json({ config });
  } catch (error) {
    console.error("Error fetching agent config:", error);
    return NextResponse.json(
      { error: "Error al obtener configuración" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Ensure row exists
    await getOrCreateConfig(session.user.id);

    // Allowlisted fields
    const allowedFields = [
      "autoCategorizeOnSync",
      "autoSummarize",
      "defaultDraftTone",
      "weeklyReportEnabled",
      "weeklyReportDay",
      "agentName",
      "agentPersonality",
      "customSystemPrompt",
      "businessContext",
      "autoReplies",
      "autoCategories",
      "escalationEmail",
      "preferredModel",
      "fineTunedModelId",
      "maxAutoActions",
      "neverAutoReply",
      "alwaysNotify",
      "signatureHtml",
      "timezone",
      "language",
    ];

    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No hay campos válidos para actualizar" },
        { status: 400 }
      );
    }

    updates.updatedAt = new Date();

    const [updated] = await db
      .update(schema.agentConfig)
      .set(updates)
      .where(eq(schema.agentConfig.userId, session.user.id))
      .returning();

    return NextResponse.json({ config: updated });
  } catch (error) {
    console.error("Error updating agent config:", error);
    return NextResponse.json(
      { error: "Error al actualizar configuración" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();

    if (body.action !== "test_prompt") {
      return NextResponse.json(
        { error: "Acción no reconocida" },
        { status: 400 }
      );
    }

    const message = body.message;
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Mensaje requerido" },
        { status: 400 }
      );
    }

    // Load the current config to build the test prompt
    const config = await getOrCreateConfig(session.user.id);

    const personalityMap: Record<string, string> = {
      profesional: "profesional, directo y resolutivo",
      casual: "casual, cercano y amigable",
      formal: "formal, cortés y estructurado",
      tecnico: "técnico, preciso y detallado",
    };

    const personality =
      personalityMap[config.agentPersonality ?? "profesional"] ??
      personalityMap.profesional;

    const systemParts: string[] = [
      `Eres ${config.agentName ?? "Sinergia IA"}, el asistente de email de Somos Sinergia.`,
      `Tu personalidad es: ${personality}.`,
      `Idioma: ${config.language ?? "es"}. Zona horaria: ${config.timezone ?? "Europe/Madrid"}.`,
    ];

    if (config.businessContext) {
      systemParts.push(
        `Contexto de negocio que siempre debes considerar:\n${config.businessContext}`
      );
    }
    if (config.customSystemPrompt) {
      systemParts.push(
        `Instrucciones adicionales del usuario:\n${config.customSystemPrompt}`
      );
    }

    const systemPrompt = systemParts.join("\n\n");

    // Determine which model label to show
    const modelLabel =
      config.preferredModel === "fine-tuned" && config.fineTunedModelId
        ? `fine-tuned (${config.fineTunedModelId})`
        : config.preferredModel ?? "auto";

    // For the test we simply return the constructed prompt and a simulated
    // response outline — we don't call an external LLM here to avoid costs
    // during config testing. The user sees what the agent "would" receive.
    return NextResponse.json({
      test: {
        model: modelLabel,
        personality: config.agentPersonality ?? "profesional",
        systemPrompt,
        userMessage: message,
        simulatedResponse: `[Vista previa] Con la configuración actual, el agente "${config.agentName ?? "Sinergia IA"}" (personalidad: ${config.agentPersonality ?? "profesional"}, modelo: ${modelLabel}) recibiría el system prompt mostrado arriba y respondería al mensaje del usuario considerando el contexto de negocio y las instrucciones personalizadas configuradas.`,
      },
    });
  } catch (error) {
    console.error("Error testing prompt:", error);
    return NextResponse.json(
      { error: "Error al probar prompt" },
      { status: 500 }
    );
  }
}
