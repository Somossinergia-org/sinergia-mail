import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { createDraft as createGmailDraft } from "@/lib/gmail";

/**
 * POST /api/agent/draft — DEPRECATED: redirects to /api/drafts
 *
 * All draft generation logic has been consolidated into /api/drafts.
 * This endpoint now proxies to the canonical endpoint for backwards compatibility.
 */
export async function POST(req: Request) {
  // Forward to canonical /api/drafts endpoint
  const url = new URL("/api/drafts", req.url);
  const body = await req.text();
  const headers = new Headers(req.headers);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    body,
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
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
