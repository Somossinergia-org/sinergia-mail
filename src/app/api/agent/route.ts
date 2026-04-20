import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, desc, sql } from "drizzle-orm";
import { executeSwarm } from "@/lib/agent/swarm";
import { plainChat } from "@/lib/agent/execute";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { fmtEur } from "@/lib/format";
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

  const top = topSenders
    .filter((t) => t.issuer)
    .map((t) => `${t.issuer} (${fmtEur(t.total)}€, ${t.count} facturas)`)
    .join(", ");

  const recent = recentInvoices
    .filter((r) => r.issuerName)
    .map((r) => `${r.issuerName} - ${fmtEur(r.totalAmount)}€ (${r.invoiceDate || "sin fecha"})`)
    .join("; ");

  return [
    `Total emails: ${Number(e?.total || 0)}.`,
    `Emails sin leer: ${Number(e?.unread || 0)}.`,
    `Emails prioridad ALTA: ${Number(e?.highPriority || 0)}.`,
    `Total facturas: ${Number(i?.count || 0)}.`,
    `Gasto total: ${fmtEur(i?.total)}€.`,
    `IVA soportado acumulado: ${fmtEur(i?.tax)}€.`,
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

/** POST /api/agent — Chat with the AI agent (now uses GPT-5 swarm) */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id") || "unknown";

  // Rate limit
  const rl = rateLimit(userId, "gemini");
  if (!rl.success) return rateLimitResponse(rl, requestId);

  const { messages, context } = await req.json();

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "messages requerido (array de {role, content})" },
      { status: 400 },
    );
  }

  const startTime = Date.now();

  try {
    // Build real-time context from user's data
    const autoContext = await buildUserContext(userId);
    const fullContext = context ? `${autoContext} ${context}` : autoContext;

    // Normalize message roles for swarm (user/assistant)
    const swarmMessages = messages.map(
      (m: { role: string; content: string }) => ({
        role: (m.role === "model" ? "assistant" : m.role) as "user" | "assistant",
        content: m.content,
      }),
    );

    // Execute via GPT-5 swarm; fallback to Gemini plain chat on failure
    let response: string;
    let toolCalls: Array<{ name: string; result: { ok: boolean } }> = [];
    let agentId = "ceo";

    try {
      const result = await executeSwarm({
        userId,
        messages: swarmMessages,
        context: fullContext,
      });
      response = result.reply;
      agentId = result.agentId;
      toolCalls = result.toolCalls.map((tc) => ({
        name: tc.name,
        result: { ok: !!tc.result.ok },
      }));
    } catch (swarmErr) {
      logError(log, swarmErr, { userId }, "swarm execution failed, falling back to Gemini");
      const chatMessages = messages.map(
        (m: { role: string; content: string }) => ({
          role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
          content: m.content,
        }),
      );
      response = await plainChat(chatMessages, fullContext);
    }

    // Log the chat turn
    const lastUserMsg = messages[messages.length - 1]?.content || "";
    await db.insert(schema.agentLogs).values({
      userId,
      action: "chat",
      inputSummary: lastUserMsg.slice(0, 100),
      outputSummary: `[${agentId}/${toolCalls.length} tools] ${response.slice(0, 180)}`,
      durationMs: Date.now() - startTime,
      success: true,
    });

    // Return in the same format consumers expect (response + toolCalls)
    return NextResponse.json({ response, toolCalls, agentId });
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
      { status: 500 },
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
