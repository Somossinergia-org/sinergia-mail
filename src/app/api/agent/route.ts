import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, desc, sql } from "drizzle-orm";
import { executeAgent, plainChat, type ChatMessage } from "@/lib/agent/execute";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/agent" });

/** Build real-time context about the user's data for the AI chat */
async function buildUserContext(userId: string): Promise<string> {
  const [emailStats, invoiceStats, topSenders, recentInvoices] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)`,
        unread: sql<number>`count(*) filter (where ${schema.emails.isRead} = false)`,
        highPriority: sql<number>`count(*) filter (where ${schema.emails.priority} = 'ALTA')`,
      })
      .from(schema.emails)
      .where(eq(schema.emails.userId, userId)),
    db
      .select({
        count: sql<number>`count(*)`,
        total: sql<number>`COALESCE(SUM(total_amount), 0)`,
        tax: sql<number>`COALESCE(SUM(tax), 0)`,
      })
      .from(schema.invoices)
      .where(eq(schema.invoices.userId, userId)),
    db
      .select({
        issuer: schema.invoices.issuerName,
        total: sql<number>`SUM(total_amount)`,
        count: sql<number>`count(*)`,
      })
      .from(schema.invoices)
      .where(eq(schema.invoices.userId, userId))
      .groupBy(schema.invoices.issuerName)
      .orderBy(sql`SUM(total_amount) DESC`)
      .limit(5),
    db.query.invoices.findMany({
      where: eq(schema.invoices.userId, userId),
      orderBy: [desc(schema.invoices.invoiceDate)],
      limit: 5,
    }),
  ]);

  const e = emailStats[0];
  const i = invoiceStats[0];
  const fmt = (n: number) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const top = topSenders
    .filter((t) => t.issuer)
    .map((t) => `${t.issuer} (${fmt(Number(t.total))}€, ${t.count} facturas)`)
    .join(", ");

  const recent = recentInvoices
    .filter((r) => r.issuerName)
    .map((r) => `${r.issuerName} - ${fmt(Number(r.totalAmount) || 0)}€ (${r.invoiceDate || "sin fecha"})`)
    .join("; ");

  return [
    `Total emails: ${Number(e?.total || 0)}.`,
    `Emails sin leer: ${Number(e?.unread || 0)}.`,
    `Emails prioridad ALTA: ${Number(e?.highPriority || 0)}.`,
    `Total facturas: ${Number(i?.count || 0)}.`,
    `Gasto total: ${fmt(Number(i?.total || 0))}€.`,
    `IVA soportado acumulado: ${fmt(Number(i?.tax || 0))}€.`,
    top ? `Top proveedores: ${top}.` : "",
    recent ? `Facturas recientes: ${recent}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

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
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id") || "unknown";

  // Rate limit: 10 Gemini chat calls per minute per user
  const rl = rateLimit(userId, "gemini");
  if (!rl.success) return rateLimitResponse(rl, requestId);

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

    // Build real-time context from user's data so Gemini has actual facts
    const autoContext = await buildUserContext(userId);
    const fullContext = context ? `${autoContext} ${context}` : autoContext;

    // Try agentic execution with tools first; fallback to plain chat on failure
    let response: string;
    let toolCalls: Array<{ name: string; result: { ok: boolean } }> = [];
    try {
      const agent = await executeAgent(userId, chatMessages, fullContext);
      response = agent.reply;
      toolCalls = agent.toolCalls.map((tc) => ({ name: tc.name, result: { ok: !!tc.result.ok } }));
    } catch (agentErr) {
      logError(log, agentErr, { userId }, "agent execution failed, falling back to plain chat");
      response = await plainChat(chatMessages, fullContext);
    }

    // Log the chat turn (individual tool calls are logged inside tools.ts)
    const lastUserMsg = messages[messages.length - 1]?.content || "";
    await db.insert(schema.agentLogs).values({
      userId,
      action: "chat",
      inputSummary: lastUserMsg.slice(0, 100),
      outputSummary: `[${toolCalls.length} tools] ${response.slice(0, 180)}`,
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({ response, toolCalls });
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
