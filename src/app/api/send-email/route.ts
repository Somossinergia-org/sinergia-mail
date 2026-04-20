import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { sendEmail, createDraft } from "@/lib/gmail";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ component: "api-send-email" });

/**
 * POST /api/send-email — Send a NEW email (not a reply).
 *
 * Used by ComposePanel for composing fresh emails.
 * For replies to existing emails, use /api/drafts instead.
 *
 * Body: { to, subject, body, send?: boolean }
 *   - send: true → send immediately via Gmail
 *   - send: false (default) → create Gmail draft only
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const { to, subject, body, send } = await req.json();

    if (!to || !subject) {
      return NextResponse.json(
        { error: "to y subject son requeridos" },
        { status: 400 },
      );
    }

    // Load user signature from agentConfig
    let signature = "";
    try {
      const config = await db.query.agentConfig.findFirst({
        where: (c, { eq }) => eq(c.userId, userId),
        columns: { signatureHtml: true },
      });
      if (config?.signatureHtml) {
        signature = config.signatureHtml;
      }
    } catch { /* signature optional */ }

    const htmlBody = signature
      ? `${body || ""}<br/><br/>${signature}`
      : body || "";

    const startTime = Date.now();

    if (send) {
      // Send immediately
      const result = await sendEmail(userId, to, subject, htmlBody, "David Miquel Jordá");

      log.info({ userId, to, subject: subject.slice(0, 50), messageId: result.id }, "email sent");

      // Log the action
      await db.insert(schema.agentLogs).values({
        userId,
        action: "send_email",
        inputSummary: `To: ${to} | ${subject.slice(0, 60)}`,
        outputSummary: `Enviado (${(body || "").length} chars)`,
        durationMs: Date.now() - startTime,
        success: true,
      });

      return NextResponse.json({
        success: true,
        messageId: result.id,
        action: "sent",
      });
    } else {
      // Create draft only
      const draft = await createDraft(userId, to, subject, htmlBody);

      log.info({ userId, to, subject: subject.slice(0, 50), draftId: draft.id }, "draft created");

      await db.insert(schema.agentLogs).values({
        userId,
        action: "create_draft",
        inputSummary: `To: ${to} | ${subject.slice(0, 60)}`,
        outputSummary: `Borrador creado`,
        durationMs: Date.now() - startTime,
        success: true,
      });

      return NextResponse.json({
        success: true,
        draftId: draft.id,
        action: "drafted",
      });
    }
  } catch (err) {
    logError(log, err, { userId }, "send-email failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error enviando email" },
      { status: 500 },
    );
  }
}
