import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { chat, type ChatMessage } from "@/lib/gemini";

/** GET /api/agent — Get agent status and recent activity */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;

  const [config, recentLogs] = await Promise.all([
    // Get or create agent config
    db.query.agentConfig.findFirst({
      where: eq(schema.agentConfig.userId, userId),
    }),

    // Recent agent activity
    db.query.agentLogs.findMany({
      where: eq(schema.agentLogs.userId, userId),
      orderBy: [desc(schema.agentLogs.createdAt)],
      limit: 20,
    }),
  ]);

  // Auto-create config if missing
  if (!config) {
    await db.insert(schema.agentConfig).values({ userId });
  }

  return NextResponse.json({
    config: config || {
      autoCategorizeOnSync: true,
      autoSummarize: true,
      defaultDraftTone: "profesional",
      weeklyReportEnabled: true,
      weeklyReportDay: 1,
    },
    recentActivity: recentLogs,
  });
}

/** POST /api/agent — Chat with the AI agent */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const { messages, context } = await req.json();

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "messages requerido (array de {role, content})" },
      { status: 400 }
    );
  }

  const startTime = Date.now();

  try {
    const chatMessages: ChatMessage[] = messages.map(
      (m: { role: string; content: string }) => ({
        role: m.role === "user" ? "user" : "model",
        content: m.content,
      })
    );

    const response = await chat(chatMessages, context || "");

    // Log
    const lastUserMsg = messages[messages.length - 1]?.content || "";
    await db.insert(schema.agentLogs).values({
      userId,
      action: "chat",
      inputSummary: lastUserMsg.slice(0, 100),
      outputSummary: response.slice(0, 200),
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({ response });
  } catch (e) {
    await db.insert(schema.agentLogs).values({
      userId,
      action: "chat",
      durationMs: Date.now() - startTime,
      success: false,
      error: e instanceof Error ? e.message : "Unknown",
    });

    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error en el chat" },
      { status: 500 }
    );
  }
}

/** PUT /api/agent — Update agent config */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const updates = await req.json();

  const allowedFields = [
    "autoCategorizeOnSync",
    "autoSummarize",
    "defaultDraftTone",
    "weeklyReportEnabled",
    "weeklyReportDay",
  ];

  const sanitized: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in updates) {
      sanitized[key] = updates[key];
    }
  }

  if (Object.keys(sanitized).length === 0) {
    return NextResponse.json(
      { error: "No hay campos válidos para actualizar" },
      { status: 400 }
    );
  }

  sanitized.updatedAt = new Date();

  await db
    .insert(schema.agentConfig)
    .values({ userId, ...sanitized })
    .onConflictDoUpdate({
      target: schema.agentConfig.userId,
      set: sanitized,
    });

  return NextResponse.json({ success: true, config: sanitized });
}
