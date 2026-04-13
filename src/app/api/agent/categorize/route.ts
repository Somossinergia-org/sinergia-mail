import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, isNull, or } from "drizzle-orm";
import { categorizeEmail, type CategorizeResult } from "@/lib/gemini";

export const maxDuration = 300;

/** POST /api/agent/categorize — Batch categorize emails with Gemini */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const { emailIds } = await req.json().catch(() => ({ emailIds: undefined }));
  const startTime = Date.now();

  try {
    // Get emails to categorize
    let emailsToProcess;
    if (emailIds && Array.isArray(emailIds) && emailIds.length > 0) {
      // Specific emails
      emailsToProcess = await db.query.emails.findMany({
        where: and(
          eq(schema.emails.userId, userId),
          // Filter by provided IDs — using inArray would be better but let's keep it simple
        ),
      });
      emailsToProcess = emailsToProcess.filter((e) =>
        emailIds.includes(e.id)
      );
    } else {
      // All uncategorized (category is null or "OTRO")
      emailsToProcess = await db.query.emails.findMany({
        where: and(
          eq(schema.emails.userId, userId),
          or(
            isNull(schema.emails.category),
            eq(schema.emails.category, "OTRO")
          )
        ),
        limit: 50,
      });
    }

    if (emailsToProcess.length === 0) {
      return NextResponse.json({
        processed: 0,
        categorized: 0,
        message: "No hay emails pendientes de categorizar",
      });
    }

    let categorized = 0;
    let errors = 0;
    const results: Array<{
      emailId: number;
      subject: string;
      category: string;
      priority: string;
      confidence: number;
    }> = [];

    // Process in batches of 5 with delay
    for (let i = 0; i < emailsToProcess.length; i += 5) {
      const batch = emailsToProcess.slice(i, i + 5);

      const batchPromises = batch.map(async (email) => {
        const batchStart = Date.now();
        try {
          const result: CategorizeResult = await categorizeEmail(
            email.fromName || "Desconocido",
            email.fromEmail || "",
            email.subject || "(sin asunto)",
            email.snippet || "",
            email.body || undefined
          );

          // Update email with AI category
          await db
            .update(schema.emails)
            .set({
              category: result.category,
              priority: result.priority,
            })
            .where(eq(schema.emails.id, email.id));

          // Save summary entry
          await db.insert(schema.emailSummaries).values({
            emailId: email.id,
            userId,
            summary: result.reason,
            keyPoints: [],
            sentiment: "neutro",
            actionRequired: false,
            categoryByAi: result.category,
            categoryConfidence: result.confidence,
            priorityByAi: result.priority,
          });

          // Log agent action
          await db.insert(schema.agentLogs).values({
            userId,
            action: "categorize",
            inputSummary: `${email.fromEmail}: ${(email.subject || "").slice(0, 80)}`,
            outputSummary: `${result.category} (${result.priority}) — ${result.confidence}%`,
            durationMs: Date.now() - batchStart,
            success: true,
          });

          results.push({
            emailId: email.id,
            subject: email.subject || "(sin asunto)",
            category: result.category,
            priority: result.priority,
            confidence: result.confidence,
          });

          categorized++;
        } catch (err) {
          errors++;
          await db.insert(schema.agentLogs).values({
            userId,
            action: "categorize",
            inputSummary: `${email.fromEmail}: ${(email.subject || "").slice(0, 80)}`,
            durationMs: Date.now() - batchStart,
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      });

      await Promise.all(batchPromises);

      // Pause between batches
      if (i + 5 < emailsToProcess.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return NextResponse.json({
      processed: emailsToProcess.length,
      categorized,
      errors,
      durationMs: Date.now() - startTime,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error de categorización" },
      { status: 500 }
    );
  }
}
