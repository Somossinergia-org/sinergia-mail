import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { summarizeEmail } from "@/lib/gemini";

/** POST /api/agent/summarize — Generate AI summary for an email */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const { emailId } = await req.json();

  if (!emailId) {
    return NextResponse.json({ error: "emailId requerido" }, { status: 400 });
  }

  const startTime = Date.now();

  try {
    // Get email
    const email = await db.query.emails.findFirst({
      where: and(
        eq(schema.emails.id, emailId),
        eq(schema.emails.userId, userId)
      ),
    });

    if (!email) {
      return NextResponse.json({ error: "Email no encontrado" }, { status: 404 });
    }

    // Check if summary already exists
    const existing = await db.query.emailSummaries.findFirst({
      where: and(
        eq(schema.emailSummaries.emailId, emailId),
        eq(schema.emailSummaries.userId, userId)
      ),
    });

    if (existing?.summary && existing.summary !== existing.categoryByAi) {
      // Already has a full summary (not just from categorization)
      return NextResponse.json({
        cached: true,
        ...existing,
      });
    }

    // Generate summary with Gemini
    const result = await summarizeEmail(
      email.subject || "(sin asunto)",
      `${email.fromName || ""} <${email.fromEmail || ""}>`,
      email.body || email.snippet || ""
    );

    // Upsert summary
    if (existing) {
      await db
        .update(schema.emailSummaries)
        .set({
          summary: result.summary,
          keyPoints: result.keyPoints,
          sentiment: result.sentiment,
          actionRequired: result.actionRequired,
          actionDescription: result.actionDescription,
        })
        .where(eq(schema.emailSummaries.id, existing.id));
    } else {
      await db.insert(schema.emailSummaries).values({
        emailId,
        userId,
        summary: result.summary,
        keyPoints: result.keyPoints,
        sentiment: result.sentiment,
        actionRequired: result.actionRequired,
        actionDescription: result.actionDescription,
        categoryByAi: email.category,
        priorityByAi: email.priority,
      });
    }

    // Log
    await db.insert(schema.agentLogs).values({
      userId,
      action: "summarize",
      inputSummary: `${email.fromEmail}: ${(email.subject || "").slice(0, 80)}`,
      outputSummary: result.summary.slice(0, 200),
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({
      cached: false,
      summary: result.summary,
      keyPoints: result.keyPoints,
      sentiment: result.sentiment,
      actionRequired: result.actionRequired,
      actionDescription: result.actionDescription,
    });
  } catch (e) {
    await db.insert(schema.agentLogs).values({
      userId,
      action: "summarize",
      inputSummary: `emailId: ${emailId}`,
      durationMs: Date.now() - startTime,
      success: false,
      error: e instanceof Error ? e.message : "Unknown",
    });

    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error generando resumen" },
      { status: 500 }
    );
  }
}
