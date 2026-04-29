import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { createDraft } from "@/lib/gmail";
import { generateDraft } from "@/lib/gemini";

/**
 * POST /api/drafts — Unified draft generation endpoint.
 *
 * Accepts:
 *   - emailId (required): the email to reply to
 *   - customBody (optional): skip AI generation, use this body directly
 *   - tone (optional): AI tone, defaults to user config or "profesional"
 *   - instructions (optional): extra instructions for AI generation
 *
 * This is the SINGLE canonical endpoint for draft creation.
 * Previously /api/agent/draft duplicated this logic — it now redirects here.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const { emailId, customBody, tone, instructions } = await req.json();

  if (!emailId) {
    return NextResponse.json(
      { error: "emailId requerido" },
      { status: 400 }
    );
  }

  const startTime = Date.now();

  // Get the email from DB
  const email = await db.query.emails.findFirst({
    where: and(
      eq(schema.emails.id, emailId),
      eq(schema.emails.userId, userId)
    ),
  });

  if (!email) {
    return NextResponse.json(
      { error: "Email no encontrado" },
      { status: 404 }
    );
  }

  try {
    let body = customBody;
    let subject = email.subject || "";

    if (!body) {
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

      body = result.body;
      subject = result.subject || subject;
    }

    if (!body) {
      return NextResponse.json(
        { error: "No se pudo generar respuesta automática" },
        { status: 422 }
      );
    }

    // Save to draftResponses table
    const effectiveTone = tone || "profesional";
    const [saved] = await db
      .insert(schema.draftResponses)
      .values({
        emailId,
        userId,
        subject,
        body,
        tone: effectiveTone,
        status: "draft",
      })
      .returning();

    // Create Gmail draft
    const draft = await createDraft(
      userId,
      email.fromEmail || "",
      subject,
      body
    );

    // Mark email as having a draft
    await db
      .update(schema.emails)
      .set({ draftCreated: true })
      .where(eq(schema.emails.id, emailId));

    // Log the action
    await db.insert(schema.agentLogs).values({
      userId,
      action: "draft",
      inputSummary: `Re: ${(email.subject || "").slice(0, 60)} | tono: ${effectiveTone}`,
      outputSummary: `Borrador generado (${body.length} chars)`,
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({
      success: true,
      draftId: saved.id,
      gmailDraftId: draft.id,
      subject,
      body,
      tone: effectiveTone,
    });
  } catch (e) {
    // Log failure
    await db.insert(schema.agentLogs).values({
      userId,
      action: "draft",
      inputSummary: `emailId: ${emailId}`,
      durationMs: Date.now() - startTime,
      success: false,
      error: e instanceof Error ? e.message : "Unknown",
    });

    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error creando borrador" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/drafts — Update draft: send (to Gmail), discard, or edit.
 *
 * Body: { draftId: number, action: "send"|"discard"|"edit", body?: string }
 *
 * Migrado desde /api/agent/draft (deprecated, ya eliminado 2026-04-29).
 */
export async function PUT(req: NextRequest) {
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
      const email = await db.query.emails.findFirst({
        where: eq(schema.emails.id, draft.emailId),
      });
      if (!email?.fromEmail) {
        return NextResponse.json({ error: "No se puede determinar el destinatario" }, { status: 422 });
      }
      const gmailDraft = await createDraft(
        userId,
        email.fromEmail,
        draft.subject || email.subject || "",
        body || draft.body
      );
      await db
        .update(schema.draftResponses)
        .set({ status: "sent", body: body || draft.body })
        .where(eq(schema.draftResponses.id, draftId));
      await db
        .update(schema.emails)
        .set({ draftCreated: true })
        .where(eq(schema.emails.id, draft.emailId));
      return NextResponse.json({ success: true, gmailDraftId: gmailDraft.id, status: "sent" });
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
        return NextResponse.json({ error: "body requerido para editar" }, { status: 400 });
      }
      await db
        .update(schema.draftResponses)
        .set({ body })
        .where(eq(schema.draftResponses.id, draftId));
      return NextResponse.json({ success: true, status: "draft", body });
    }

    return NextResponse.json({ error: "action debe ser: send, discard, o edit" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error actualizando borrador" },
      { status: 500 }
    );
  }
}
