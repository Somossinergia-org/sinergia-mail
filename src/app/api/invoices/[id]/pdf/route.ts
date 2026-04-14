import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import {
  downloadAttachment,
  getGmailClient,
  getGmailClientForAccount,
} from "@/lib/gmail";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/invoices/[id]/pdf" });

export const maxDuration = 30;

/**
 * GET /api/invoices/[id]/pdf
 *   ?mode=inline    → preview in browser tab (default)
 *   ?mode=download  → attachment download
 *
 * Fetches the PDF from Gmail on demand. Uses the per-account Gmail client
 * when the email row has an accountId (multi-account), otherwise falls back
 * to the user's primary NextAuth Gmail session.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const mode = req.nextUrl.searchParams.get("mode") === "download" ? "download" : "inline";

  try {
    const inv = await db.query.invoices.findFirst({
      where: and(eq(schema.invoices.id, id), eq(schema.invoices.userId, userId)),
    });
    if (!inv) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
    }
    if (!inv.pdfGmailAttachmentId || !inv.emailId) {
      return NextResponse.json(
        { error: "Esta factura no tiene PDF adjunto (creada manualmente o por foto)" },
        { status: 404 },
      );
    }

    const email = await db.query.emails.findFirst({
      where: eq(schema.emails.id, inv.emailId),
    });
    if (!email) {
      return NextResponse.json({ error: "Email origen no encontrado" }, { status: 404 });
    }

    // Select the right Gmail client: per-account when available.
    const gmail = email.accountId
      ? await getGmailClientForAccount(email.accountId).catch(() => null)
      : null;

    const pdfBuffer = gmail
      ? await downloadAttachment(userId, email.gmailId, inv.pdfGmailAttachmentId, gmail)
      : await downloadAttachment(
          userId,
          email.gmailId,
          inv.pdfGmailAttachmentId,
          await getGmailClient(userId),
        );

    const safeName = (inv.pdfFilename || `factura_${inv.id}.pdf`).replace(
      /[^a-zA-Z0-9._ -]/g,
      "_",
    );
    const disposition = mode === "download" ? "attachment" : "inline";

    const pdfBytes = new Uint8Array(pdfBuffer);
    return new Response(pdfBytes as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${safeName}"`,
        "Content-Length": String(pdfBytes.byteLength),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    logError(log, e, { invoiceId: id }, "invoice pdf fetch failed");
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error descargando PDF" },
      { status: 500 },
    );
  }
}
