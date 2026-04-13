import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { generateDraft } from "@/lib/gemini";
import { createDraft as createGmailDraft } from "@/lib/gmail";

/** POST /api/agent/draft — Generate a draft response with Gemini */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const { emailId, tone, instructions } = await req.json();

  if (!emailId) {
    return NextResponse.json({ error: "emailId requerido" }, { status: 400 });
  }

  const startTime = Date.now();

  try {
    // Get original email
    const email = await db.query.emails.findFirst({
      where: and(
        eq(schema.emails.id, emailId),
        eq(schema.emails.userId, userId)
      ),
    });

    if (!email) {
      return NextResponse.json({ error: "Email no encontrado" }, { status: 404 });
    }

    // Get user config for default tone
    const config = await db.query.agentConfig.findFirst({
      where: eq(schema.agentConfig.userId, userId),
    });
    const effectiveTone = tone || config?.defaultDraftTone || "profesional";

    // Generate draft with Gemini
    const result = await generateDraft(
      {
        from: `${email.fromName || ""} <${email.fromEmail || ""}>`,
        subject: email.subject || "",
        body: email.body || email.snippet || "",
        category: email.category || undefined,
      },
      effectiveTone,
      instructions || ""
    );

    // Save to draftResponses
    const [saved] = await db
      .insert(schema.draftResponses)
      .values({
        emailId,
        userId,
        subject: result.subject,
        body: result.body,
        tone: effectiveTone,
        status: "draft",
      })
      .returning();

    // Log
    await db.insert(schema.agentLogs).values({
      userId,
      action: "draft",
      inputSummary: `Re: ${(email.subject || "").slice(0, 60)} | tono: ${effectiveTone}`,
      outputSummary: `Borrador generado (${result.body.length} chars)`,
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({
      draftId: saved.id,
      subject: result.subject,
      body: result.body,
      tone: effectiveTone,
    });
  } catch (e) {
    await db.insert(schema.agentLogs).values({
      userId,
      action: "draft",
      inputSummary: `emailId: ${emailId}`,
      durationMs: Date.now() - startTime,
      success: false,
      error: e instanceof Error ? e.message : "Unknown",
    });

    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error generando borrador" },
      { status: 500 }
    );
  }
}

/** PUT /api/agent/draft — Update draft: send, discard, or edit */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const { draftId, action, body } = await req.json();

  if (!draftId || !action) {
    return NextResponse.json(
      { error: "draftId y action requeridos" },
      { status: 400 }
    );
  }

  try {
    // Get draft
    const draft = await db.query.draftResponses.findFirst({
      where: and(
        eq(schema.draftResponses.id, draftId),
        eq(schema.draftResponses.userId, userId)
      ),
    });

    if (!draft) {
      return NextResponse.json({ error: "Borrador no encontrado" }, { status: 404 });
    }

    if (action === "send") {
      // Get original email to find recipient
      const email = await db.query.emails.findFirst({
        where: eq(schema.emails.id, draft.emailId),
      });

      if (!email?.fromEmail) {
        return NextResponse.json(
          { error: "No se puede determinar el destinatario" },
          { status: 422 }
        );
      }

      // Create Gmail draft (sends to Gmail drafts, not auto-sends)
      const gmailDraft = await createGmailDraft(
        userId,
        email.fromEmail,
        draft.subject || email.subject || "",
        body || draft.body
      );

      // Update status
      await db
        .update(schema.draftResponses)
        .set({ status: "sent", body: body || draft.body })
        .where(eq(schema.draftResponses.id, draftId));

      // Mark email as having draft
      await db
        .update(schema.emails)
        .set({ draftCreated: true })
        .where(eq(schema.emails.id, draft.emailId));

      return NextResponse.json({
        success: true,
        gmailDraftId: gmailDraft.id,
        status: "sent",
      });
    }

    if (action === "discard") {
      await db
        .update(schema.draftResponses)
        .set({ status: "discarded" })
        .where(eq(schema.draftResponses.id, draftId));

      return NextResponse.json({ success: true, status: "discarded" });
    }

    if (action === "edit") {
      if (!body) {
        return NextResponse.json(
          { error: "body requerido para editar" },
          { status: 400 }
        );
      }

      await db
        .update(schema.draftResponses)
        .set({ body })
        .where(eq(schema.draftResponses.id, draftId));

      return NextResponse.json({ success: true, status: "draft", body });
    }

    return NextResponse.json(
      { error: "action debe ser: send, discard, o edit" },
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error actualizando borrador" },
      { status: 500 }
    );
  }
}
