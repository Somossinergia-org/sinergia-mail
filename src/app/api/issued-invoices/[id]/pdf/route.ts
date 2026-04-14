import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/issued-invoices/[id]/pdf" });

export const maxDuration = 30;

/**
 * GET — stream the PDF for an issued invoice.
 * Used for browser download (Content-Disposition: attachment) and Gmail send.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const id = Number(params.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

    const inv = await db.query.issuedInvoices.findFirst({
      where: and(
        eq(schema.issuedInvoices.id, id),
        eq(schema.issuedInvoices.userId, session.user.id),
      ),
    });
    if (!inv) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    const pdf = await generateInvoicePdf({
      number: inv.number,
      issueDate: inv.issueDate.toISOString().slice(0, 10),
      dueDate: inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : null,
      clientName: inv.clientName,
      clientNif: inv.clientNif,
      clientAddress: inv.clientAddress,
      concepts: inv.concepts,
      subtotal: Number(inv.subtotal),
      tax: Number(inv.tax),
      total: Number(inv.total),
      currency: inv.currency || "EUR",
      notes: inv.notes,
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${inv.number}.pdf"`,
        "Content-Length": String(pdf.length),
      },
    });
  } catch (e) {
    logError(log, e, { id: params.id }, "pdf generation failed");
    return NextResponse.json({ error: "Error generando PDF" }, { status: 500 });
  }
}
