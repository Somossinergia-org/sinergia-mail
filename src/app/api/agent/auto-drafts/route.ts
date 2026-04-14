import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, inArray, isNull, or } from "drizzle-orm";
import { generateDraft } from "@/lib/gemini";
import { createDraft as createGmailDraft } from "@/lib/gmail";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";

export const maxDuration = 120;

interface PendingEmailResponse {
  id: number;
  from: string;
  subject: string;
  date: Date | null;
  category: string | null;
  snippet: string | null;
}

interface DraftResponse {
  emailId: number;
  to: string;
  subject: string;
}

interface PostResponse {
  processed: number;
  drafted: number;
  errors: number;
  drafts: DraftResponse[];
}

/** GET /api/agent/auto-drafts — Find emails needing draft responses */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const pendingEmails = await db.query.emails.findMany({
      where: and(
        eq(schema.emails.userId, userId),
        inArray(schema.emails.category, ["CLIENTE", "PROVEEDOR", "FACTURA"]),
        eq(schema.emails.isRead, false),
        or(
          eq(schema.emails.draftCreated, false),
          isNull(schema.emails.draftCreated)
        )
      ),
      orderBy: (emails, { asc }) => [asc(emails.date)],
    });

    const formatted: PendingEmailResponse[] = pendingEmails.map((email) => ({
      id: email.id,
      from: `${email.fromName || ""} <${email.fromEmail || ""}>`.trim(),
      subject: email.subject || "(Sin asunto)",
      date: email.date,
      category: email.category,
      snippet: email.snippet,
    }));

    return NextResponse.json({
      count: formatted.length,
      emails: formatted,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error buscando emails" },
      { status: 500 }
    );
  }
}

/** POST /api/agent/auto-drafts — Generate auto-drafts with rate limiting */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id") || "unknown";

  // Rate limit: 10 Gemini batch calls per minute
  const rl = rateLimit(userId, "gemini");
  if (!rl.success) return rateLimitResponse(rl, requestId);

  let emailIds: number[] | undefined;
  let tone = "profesional";
  try {
    const body = await req.json();
    emailIds = body.emailIds;
    tone = body.tone || "profesional";
  } catch {
    // Empty body is fine — will auto-detect pending emails
  }

  const startTime = Date.now();
  let processed = 0;
  let drafted = 0;
  let errors = 0;
  const drafts: DraftResponse[] = [];

  try {
    // If no emailIds provided, fetch pending emails
    let targetEmailIds = emailIds;
    if (!targetEmailIds || targetEmailIds.length === 0) {
      const pendingEmails = await db.query.emails.findMany({
        where: and(
          eq(schema.emails.userId, userId),
          inArray(schema.emails.category, ["CLIENTE", "PROVEEDOR", "FACTURA"]),
          eq(schema.emails.isRead, false),
          or(
            eq(schema.emails.draftCreated, false),
            isNull(schema.emails.draftCreated)
          )
        ),
      });
      targetEmailIds = pendingEmails.map((e) => e.id);
    }

    // Process in chunks of 3 with 500ms delay
    const chunkSize = 3;
    for (let i = 0; i < targetEmailIds.length; i += chunkSize) {
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const chunk = targetEmailIds.slice(i, i + chunkSize);

      for (const emailId of chunk) {
        processed++;

        try {
          // Get email
          const email = await db.query.emails.findFirst({
            where: and(
              eq(schema.emails.id, emailId),
              eq(schema.emails.userId, userId)
            ),
          });

          if (!email) {
            errors++;
            continue;
          }

          // Generate draft with Gemini
          const result = await generateDraft(
            {
              from: `${email.fromName || ""} <${email.fromEmail || ""}>`,
              subject: email.subject || "",
              body: email.body || email.snippet || "",
              category: email.category || undefined,
            },
            tone,
            "" // No additional instructions
          );

          // Create Gmail draft
          const gmailDraft = await createGmailDraft(
            userId,
            email.fromEmail || "",
            result.subject,
            result.body
          );

          // Update email record
          await db
            .update(schema.emails)
            .set({ draftCreated: true })
            .where(eq(schema.emails.id, emailId));

          drafted++;
          drafts.push({
            emailId,
            to: email.fromEmail || "",
            subject: result.subject,
          });
        } catch (error) {
          errors++;
        }
      }
    }

    // Log action
    await db.insert(schema.agentLogs).values({
      userId,
      action: "auto-draft",
      inputSummary: `${targetEmailIds.length} emails para procesar | tono: ${tone}`,
      outputSummary: `${drafted} borradores generados, ${errors} errores`,
      durationMs: Date.now() - startTime,
      success: errors === 0,
    });

    return NextResponse.json({
      processed,
      drafted,
      errors,
      drafts,
    } as PostResponse);
  } catch (e) {
    await db.insert(schema.agentLogs).values({
      userId,
      action: "auto-draft",
      inputSummary: `emailIds: ${emailIds?.length || 0} | tono: ${tone}`,
      durationMs: Date.now() - startTime,
      success: false,
      error: e instanceof Error ? e.message : "Unknown",
    });

    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error generando borradores" },
      { status: 500 }
    );
  }
}
