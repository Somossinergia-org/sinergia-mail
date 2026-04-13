import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { extractInvoiceData } from "@/lib/gemini";

/** POST /api/agent/invoice-extract — Re-extract invoice data with Gemini */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const { emailId, invoiceId } = await req.json();

  if (!emailId && !invoiceId) {
    return NextResponse.json(
      { error: "emailId o invoiceId requerido" },
      { status: 400 }
    );
  }

  const startTime = Date.now();

  try {
    let invoice;
    let email;

    if (invoiceId) {
      invoice = await db.query.invoices.findFirst({
        where: and(
          eq(schema.invoices.id, invoiceId),
          eq(schema.invoices.userId, userId)
        ),
      });
      if (!invoice) {
        return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
      }
      if (invoice.emailId) {
        email = await db.query.emails.findFirst({
          where: eq(schema.emails.id, invoice.emailId),
        });
      }
    } else {
      email = await db.query.emails.findFirst({
        where: and(
          eq(schema.emails.id, emailId),
          eq(schema.emails.userId, userId)
        ),
      });
      if (!email) {
        return NextResponse.json({ error: "Email no encontrado" }, { status: 404 });
      }
    }

    // Use existing raw PDF text if available, otherwise use email body
    const textToProcess =
      invoice?.rawText || email?.body || email?.snippet || "";

    if (!textToProcess) {
      return NextResponse.json(
        { error: "No hay texto disponible para extraer datos" },
        { status: 422 }
      );
    }

    const result = await extractInvoiceData(textToProcess);

    // Update or create invoice
    if (invoice) {
      await db
        .update(schema.invoices)
        .set({
          invoiceNumber: result.invoiceNumber,
          issuerName: result.issuerName,
          issuerNif: result.issuerNif,
          recipientName: result.recipientName,
          recipientNif: result.recipientNif,
          concept: result.concept,
          amount: result.amount,
          tax: result.tax,
          totalAmount: result.totalAmount,
          currency: result.currency,
          invoiceDate: result.invoiceDate ? new Date(result.invoiceDate) : null,
          dueDate: result.dueDate ? new Date(result.dueDate) : null,
          category: result.category,
          processed: true,
          aiResponse: result,
        })
        .where(eq(schema.invoices.id, invoice.id));
    }

    // Log
    await db.insert(schema.agentLogs).values({
      userId,
      action: "extract",
      inputSummary: `Factura de ${result.issuerName || "desconocido"} — ${(email?.subject || "").slice(0, 60)}`,
      outputSummary: `${result.invoiceNumber || "sin nº"} | ${result.totalAmount || 0}${result.currency}`,
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({
      success: true,
      invoiceId: invoice?.id || null,
      extracted: result,
    });
  } catch (e) {
    await db.insert(schema.agentLogs).values({
      userId,
      action: "extract",
      inputSummary: `invoiceId: ${invoiceId}, emailId: ${emailId}`,
      durationMs: Date.now() - startTime,
      success: false,
      error: e instanceof Error ? e.message : "Unknown",
    });

    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error extrayendo datos" },
      { status: 500 }
    );
  }
}
