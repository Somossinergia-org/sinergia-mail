import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { createDraft } from "@/lib/gmail";
import { generateAutoResponse, EmailCategory } from "@/lib/gemini";

/** POST /api/drafts — Create auto-response draft */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { emailId, customBody } = await req.json();

  if (!emailId) {
    return NextResponse.json(
      { error: "emailId requerido" },
      { status: 400 }
    );
  }

  // Get the email from DB
  const email = await db.query.emails.findFirst({
    where: eq(schema.emails.id, emailId),
  });

  if (!email || email.userId !== session.user.id) {
    return NextResponse.json(
      { error: "Email no encontrado" },
      { status: 404 }
    );
  }

  try {
    // Generate body: use custom or AI-generated
    let body = customBody;
    if (!body) {
      body = await generateAutoResponse(
        email.fromName || "Unknown",
        email.subject || "",
        email.body || "",
        (email.category as EmailCategory) || "OTRO"
      );
    }

    if (!body) {
      return NextResponse.json(
        { error: "No se pudo generar respuesta automática para esta categoría" },
        { status: 422 }
      );
    }

    // Create Gmail draft
    const draft = await createDraft(
      session.user.id,
      email.fromEmail || "",
      email.subject || "",
      body
    );

    // Mark email as having a draft
    await db
      .update(schema.emails)
      .set({ draftCreated: true })
      .where(eq(schema.emails.id, emailId));

    return NextResponse.json({
      success: true,
      draftId: draft.id,
      body,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error creando borrador" },
      { status: 500 }
    );
  }
}
