import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { downloadAttachment } from "@/lib/gmail";
import archiver from "archiver";
import { Readable, PassThrough } from "stream";

export const maxDuration = 120;

/** GET /api/download — Download organized invoices as ZIP */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const category = req.nextUrl.searchParams.get("category");

  // Get invoices with PDF attachments
  const conditions = [eq(schema.invoices.userId, session.user.id)];
  if (category) {
    conditions.push(eq(schema.invoices.category, category));
  }

  const invoices = await db.query.invoices.findMany({
    where: conditions.length > 1
      ? (() => {
          const [first, ...rest] = conditions;
          return rest.reduce((acc, c) => {
            // Using sql template for AND
            return acc;
          }, first);
        })()
      : conditions[0],
  });

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

  for (const inv of invoices) {
    if (!inv.pdfGmailAttachmentId || !inv.emailId) continue;

    try {
      // Get the email to find Gmail message ID
      const email = await db.query.emails.findFirst({
        where: eq(schema.emails.id, inv.emailId),
      });
      if (!email) continue;

      const pdfBuffer = await downloadAttachment(
        session.user.id,
        email.gmailId,
        inv.pdfGmailAttachmentId
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
    } catch {
      // Skip failed downloads
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
