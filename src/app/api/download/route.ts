import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import {
  downloadAttachment,
  getGmailClient,
  getGmailClientForAccount,
  type GmailClient,
} from "@/lib/gmail";
import archiver from "archiver";
import { PassThrough } from "stream";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/download" });

export const maxDuration = 120;

/** GET /api/download — Download organized invoices as ZIP */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const userId = session.user.id;

  const category = req.nextUrl.searchParams.get("category");

  const where = category
    ? and(
        eq(schema.invoices.userId, userId),
        eq(schema.invoices.category, category),
      )
    : eq(schema.invoices.userId, userId);

  const invoices = await db.query.invoices.findMany({ where });

  if (invoices.length === 0) {
    return NextResponse.json(
      { error: "No hay facturas para descargar" },
      { status: 404 }
    );
  }

  // Create ZIP in memory
  const passthrough = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 5 } });
  archive.pipe(passthrough);

  let added = 0;
  const gmailClientCache = new Map<number, GmailClient>();
  let primaryGmail: GmailClient | null = null;

  for (const inv of invoices) {
    if (!inv.pdfGmailAttachmentId || !inv.emailId) continue;

    try {
      // Fetch email with userId guard so we never expose another user's data
      const email = await db.query.emails.findFirst({
        where: and(
          eq(schema.emails.id, inv.emailId),
          eq(schema.emails.userId, userId),
        ),
      });
      if (!email) continue;

      // Reuse per-account client (multi-account support)
      let gmail: GmailClient | null = null;
      if (email.accountId) {
        if (!gmailClientCache.has(email.accountId)) {
          try {
            gmailClientCache.set(
              email.accountId,
              await getGmailClientForAccount(email.accountId),
            );
          } catch (err) {
            logError(log, err, { accountId: email.accountId }, "account client failed");
          }
        }
        gmail = gmailClientCache.get(email.accountId) || null;
      }
      if (!gmail) {
        if (!primaryGmail) primaryGmail = await getGmailClient(userId);
        gmail = primaryGmail;
      }

      const pdfBuffer = await downloadAttachment(
        userId,
        email.gmailId,
        inv.pdfGmailAttachmentId,
        gmail,
      );

      // Organize by category/date
      const cat = inv.category || "OTROS";
      const date = inv.invoiceDate
        ? new Date(inv.invoiceDate).toISOString().split("T")[0]
        : "sin_fecha";
      const safeName = (inv.pdfFilename || `factura_${inv.id}.pdf`)
        .replace(/[^a-zA-Z0-9._-]/g, "_");

      archive.append(pdfBuffer, {
        name: `Facturas_Sinergia/${cat}/${date}_${safeName}`,
      });
      added++;
    } catch (err) {
      logError(log, err, { invoiceId: inv.id }, "pdf fetch skipped in ZIP");
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 300));
  }

  archive.finalize();

  // Convert PassThrough stream to ReadableStream for Response
  const readable = new ReadableStream({
    start(controller) {
      passthrough.on("data", (chunk) => controller.enqueue(chunk));
      passthrough.on("end", () => controller.close());
      passthrough.on("error", (err) => controller.error(err));
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="Facturas_Sinergia_${new Date().toISOString().split("T")[0]}.zip"`,
    },
  });
}
