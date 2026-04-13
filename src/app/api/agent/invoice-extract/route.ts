import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, isNull } from "drizzle-orm";
import { extractInvoiceData } from "@/lib/gemini";

export const maxDuration = 300;

/** POST /api/agent/invoice-extract — Extract invoice data with Gemini
 *  - { emailId } → extract from email and create/update invoice
 *  - { invoiceId } → re-extract existing invoice
 *  - { batch: true } → process all FACTURA emails without invoice records
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const { emailId, invoiceId, batch } = await req.json().catch(() => ({}));
  const startTime = Date.now();

  // ── Batch mode: process all FACTURA emails without invoices ──
  if (batch) {
    return handleBatchExtraction(userId, startTime);
  }

  if (!emailId && !invoiceId) {
    return NextResponse.json(
      { error: "emailId, invoiceId o batch:true requerido" },
      { status: 400 }
    );
  }

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

    // Build rich context for extraction: subject + from + body + snippet
    const parts: string[] = [];
    if (email?.subject) parts.push(`Asunto: ${email.subject}`);
    if (email?.fromName) parts.push(`De: ${email.fromName} <${email.fromEmail || ""}>`);
    if (invoice?.rawText) {
      parts.push(`Contenido PDF:\n${invoice.rawText}`);
    } else if (email?.body && email.body.length > 0) {
      parts.push(`Cuerpo del email:\n${email.body}`);
    }
    if (email?.snippet) parts.push(`Snippet: ${email.snippet}`);

    const textToProcess = parts.join("\n\n");

    if (!textToProcess || textToProcess.length < 10) {
      return NextResponse.json(
        { error: "No hay texto disponible para extraer datos" },
        { status: 422 }
      );
    }

    const result = await extractInvoiceData(textToProcess);

    if (invoice) {
      // Update existing invoice
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
    } else if (email) {
      // Create NEW invoice from email
      const [newInvoice] = await db.insert(schema.invoices).values({
        emailId: email.id,
        userId,
        invoiceNumber: result.invoiceNumber,
        issuerName: result.issuerName,
        issuerNif: result.issuerNif,
        recipientName: result.recipientName,
        recipientNif: result.recipientNif,
        concept: result.concept,
        amount: result.amount,
        tax: result.tax,
        totalAmount: result.totalAmount,
        currency: result.currency || "EUR",
        invoiceDate: result.invoiceDate ? new Date(result.invoiceDate) : null,
        dueDate: result.dueDate ? new Date(result.dueDate) : null,
        category: result.category,
        processed: true,
        aiResponse: result,
      }).returning({ id: schema.invoices.id });

      invoice = { id: newInvoice.id };
    }

    // Log
    await db.insert(schema.agentLogs).values({
      userId,
      action: "extract",
      inputSummary: `Factura de ${result.issuerName || "desconocido"} — ${(email?.subject || "").slice(0, 60)}`,
      outputSummary: `${result.invoiceNumber || "sin nº"} | ${result.totalAmount || 0}${result.currency || "EUR"}`,
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

/** DELETE /api/agent/invoice-extract — Clear all invoices for re-extraction */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const deleted = await db
    .delete(schema.invoices)
    .where(eq(schema.invoices.userId, session.user.id))
    .returning({ id: schema.invoices.id });

  return NextResponse.json({
    success: true,
    deleted: deleted.length,
  });
}

/** Batch-extract invoices from all FACTURA-categorized emails that don't have an invoice yet */
async function handleBatchExtraction(userId: string, startTime: number) {
  try {
    // Get FACTURA emails
    const facturaEmails = await db.query.emails.findMany({
      where: and(
        eq(schema.emails.userId, userId),
        eq(schema.emails.category, "FACTURA")
      ),
    });

    // Get existing invoice emailIds
    const existingInvoices = await db.query.invoices.findMany({
      where: eq(schema.invoices.userId, userId),
      columns: { emailId: true },
    });
    const processedEmailIds = new Set(
      existingInvoices.map((i) => i.emailId).filter(Boolean)
    );

    // Filter to unprocessed
    const toProcess = facturaEmails.filter(
      (e) => !processedEmailIds.has(e.id)
    );

    if (toProcess.length === 0) {
      return NextResponse.json({
        processed: 0,
        extracted: 0,
        message: "No hay facturas pendientes de extraer",
      });
    }

    let extracted = 0;
    let errors = 0;
    const results: Array<{
      emailId: number;
      subject: string;
      issuer: string;
      total: number;
      currency: string;
    }> = [];

    // Process sequentially to avoid rate limits
    for (const email of toProcess) {
      const batchStart = Date.now();
      try {
        // Build rich context for better extraction
        const parts: string[] = [];
        if (email.subject) parts.push(`Asunto: ${email.subject}`);
        if (email.fromName) parts.push(`De: ${email.fromName} <${email.fromEmail || ""}>`);
        if (email.body && email.body.length > 0) parts.push(`Cuerpo del email:\n${email.body}`);
        if (email.snippet) parts.push(`Snippet: ${email.snippet}`);

        const text = parts.join("\n\n");
        if (!text || text.length < 10) continue;

        const result = await extractInvoiceData(text);

        await db.insert(schema.invoices).values({
          emailId: email.id,
          userId,
          invoiceNumber: result.invoiceNumber,
          issuerName: result.issuerName,
          issuerNif: result.issuerNif,
          recipientName: result.recipientName,
          recipientNif: result.recipientNif,
          concept: result.concept,
          amount: result.amount,
          tax: result.tax,
          totalAmount: result.totalAmount,
          currency: result.currency || "EUR",
          invoiceDate: result.invoiceDate ? new Date(result.invoiceDate) : null,
          dueDate: result.dueDate ? new Date(result.dueDate) : null,
          category: result.category,
          processed: true,
          aiResponse: result,
        });

        await db.insert(schema.agentLogs).values({
          userId,
          action: "extract",
          inputSummary: `${email.fromEmail}: ${(email.subject || "").slice(0, 80)}`,
          outputSummary: `${result.issuerName || "?"} | ${result.totalAmount || 0} ${result.currency || "EUR"}`,
          durationMs: Date.now() - batchStart,
          success: true,
        });

        results.push({
          emailId: email.id,
          subject: email.subject || "(sin asunto)",
          issuer: result.issuerName || "Desconocido",
          total: result.totalAmount || 0,
          currency: result.currency || "EUR",
        });

        extracted++;

        // Small delay between calls
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        errors++;
        await db.insert(schema.agentLogs).values({
          userId,
          action: "extract",
          inputSummary: `${email.fromEmail}: ${(email.subject || "").slice(0, 80)}`,
          durationMs: Date.now() - batchStart,
          success: false,
          error: err instanceof Error ? err.message : "Unknown",
        });
      }
    }

    return NextResponse.json({
      processed: toProcess.length,
      extracted,
      errors,
      durationMs: Date.now() - startTime,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error en extracción batch" },
      { status: 500 }
    );
  }
}
