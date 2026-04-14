import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, isNull, or, sql } from "drizzle-orm";
import { extractInvoiceFromPdf } from "@/lib/gemini";
import { getGmailClient, readEmail, downloadAttachment } from "@/lib/gmail";
import { logger, logError } from "@/lib/logger";
import { invoiceNormalizedFields } from "@/lib/text/normalize";

const log = logger.child({ route: "/api/agent/invoice-pdf-extract" });

export const maxDuration = 300;

/**
 * POST /api/agent/invoice-pdf-extract
 * Download PDF attachments from Gmail for FACTURA emails and extract invoice data.
 * Targets invoices that have null totalAmount but their email has PDF attachments.
 *
 * Body: { invoiceId?: number } — process a single invoice, or omit for batch mode
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const { invoiceId } = await req.json().catch(() => ({}));
  const startTime = Date.now();

  try {
    // Find invoices with null amounts that have emails with attachments
    let invoicesToProcess;

    if (invoiceId) {
      invoicesToProcess = await db.query.invoices.findMany({
        where: and(
          eq(schema.invoices.id, invoiceId),
          eq(schema.invoices.userId, userId)
        ),
      });
    } else {
      // Batch: all invoices with null/zero totalAmount
      invoicesToProcess = await db.query.invoices.findMany({
        where: and(
          eq(schema.invoices.userId, userId),
          or(
            isNull(schema.invoices.totalAmount),
            sql`${schema.invoices.totalAmount} = 0`
          )
        ),
      });
    }

    if (invoicesToProcess.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: "No hay facturas pendientes de extracción PDF",
      });
    }

    let extracted = 0;
    let skipped = 0;
    let errors = 0;
    const results: Array<{
      invoiceId: number;
      emailId: number | null;
      issuer: string;
      total: number | null;
      currency: string;
      pdfFilename: string;
      status: string;
    }> = [];

    for (const invoice of invoicesToProcess) {
      const opStart = Date.now();

      if (!invoice.emailId) {
        skipped++;
        results.push({
          invoiceId: invoice.id,
          emailId: null,
          issuer: invoice.issuerName || "?",
          total: null,
          currency: "EUR",
          pdfFilename: "",
          status: "skipped_no_email",
        });
        continue;
      }

      // Get the associated email
      const email = await db.query.emails.findFirst({
        where: eq(schema.emails.id, invoice.emailId),
      });

      if (!email || !email.hasAttachments) {
        skipped++;
        results.push({
          invoiceId: invoice.id,
          emailId: invoice.emailId,
          issuer: invoice.issuerName || "?",
          total: null,
          currency: "EUR",
          pdfFilename: "",
          status: email ? "skipped_no_attachments" : "skipped_email_not_found",
        });
        continue;
      }

      try {
        // Read the full email to get attachment details
        const fullEmail = await readEmail(userId, email.gmailId);

        // Find PDF attachments
        const pdfAttachments = fullEmail.attachments.filter(
          (a) =>
            a.filename.toLowerCase().endsWith(".pdf") && a.attachmentId
        );

        if (pdfAttachments.length === 0) {
          skipped++;
          results.push({
            invoiceId: invoice.id,
            emailId: invoice.emailId,
            issuer: invoice.issuerName || "?",
            total: null,
            currency: "EUR",
            pdfFilename: "",
            status: "skipped_no_pdf_attachments",
          });
          continue;
        }

        // For emails with multiple PDFs (like AXPO with 13), try extracting from each
        // and use the one with the best data (highest total, most fields)
        let bestResult: Awaited<ReturnType<typeof extractInvoiceFromPdf>> | null = null;
        let bestPdfFilename = "";
        let totalFromAllPdfs = 0;
        const allPdfResults: Array<{
          filename: string;
          total: number | null;
          issuer: string | null;
          invoiceNumber: string | null;
        }> = [];

        // If there are many PDFs (like AXPO), process all and sum totals
        const isMultiInvoiceEmail = pdfAttachments.length > 2;

        for (const pdfAtt of pdfAttachments) {
          try {
            const pdfBuffer = await downloadAttachment(
              userId,
              email.gmailId,
              pdfAtt.attachmentId
            );

            const pdfResult = await extractInvoiceFromPdf(pdfBuffer);

            allPdfResults.push({
              filename: pdfAtt.filename,
              total: pdfResult.totalAmount,
              issuer: pdfResult.issuerName,
              invoiceNumber: pdfResult.invoiceNumber,
            });

            if (pdfResult.totalAmount) {
              totalFromAllPdfs += pdfResult.totalAmount;
            }

            // For single-invoice emails: pick the best result
            if (!isMultiInvoiceEmail) {
              if (
                !bestResult ||
                (pdfResult.totalAmount && (!bestResult.totalAmount || pdfResult.totalAmount > bestResult.totalAmount))
              ) {
                bestResult = pdfResult;
                bestPdfFilename = pdfAtt.filename;
              }
            } else {
              // For multi-invoice: use the first one as template for metadata
              if (!bestResult) {
                bestResult = pdfResult;
                bestPdfFilename = pdfAtt.filename;
              }
            }

            // Rate limit between PDF downloads
            await new Promise((r) => setTimeout(r, 300));
          } catch (pdfErr) {
            logError(log, pdfErr, { filename: pdfAtt.filename }, "pdf extract failed");
            allPdfResults.push({
              filename: pdfAtt.filename,
              total: null,
              issuer: null,
              invoiceNumber: null,
            });
          }
        }

        if (!bestResult) {
          skipped++;
          results.push({
            invoiceId: invoice.id,
            emailId: invoice.emailId,
            issuer: invoice.issuerName || "?",
            total: null,
            currency: "EUR",
            pdfFilename: pdfAttachments.map((a) => a.filename).join(", "),
            status: "failed_all_pdf_extraction",
          });
          continue;
        }

        // For multi-invoice emails, use summed total
        const finalTotal = isMultiInvoiceEmail ? totalFromAllPdfs : bestResult.totalAmount;
        const finalAmount = isMultiInvoiceEmail
          ? (totalFromAllPdfs / (1 + 0.21)) // Approximate base for multi
          : bestResult.amount;
        const finalTax = isMultiInvoiceEmail
          ? totalFromAllPdfs - (totalFromAllPdfs / (1 + 0.21))
          : bestResult.tax;

        // Update the invoice
        const finalIssuer = bestResult.issuerName || invoice.issuerName;
        const finalNif = bestResult.issuerNif || invoice.issuerNif;
        const norm = invoiceNormalizedFields(finalIssuer, finalNif);
        await db
          .update(schema.invoices)
          .set({
            invoiceNumber: bestResult.invoiceNumber || invoice.invoiceNumber,
            issuerName: finalIssuer,
            issuerNif: finalNif,
            issuerNormalized: norm.issuerNormalized,
            nifNormalized: norm.nifNormalized,
            recipientName: bestResult.recipientName || invoice.recipientName,
            recipientNif: bestResult.recipientNif || invoice.recipientNif,
            concept: bestResult.concept || invoice.concept,
            amount: finalAmount || bestResult.amount,
            tax: finalTax || bestResult.tax,
            totalAmount: finalTotal || bestResult.totalAmount,
            currency: bestResult.currency || invoice.currency || "EUR",
            invoiceDate: bestResult.invoiceDate
              ? new Date(bestResult.invoiceDate)
              : invoice.invoiceDate,
            dueDate: bestResult.dueDate
              ? new Date(bestResult.dueDate)
              : invoice.dueDate,
            category: bestResult.category || invoice.category,
            pdfFilename: bestPdfFilename || invoice.pdfFilename,
            pdfGmailAttachmentId:
              pdfAttachments[0]?.attachmentId || invoice.pdfGmailAttachmentId,
            rawText: bestResult.rawText,
            processed: true,
            aiResponse: {
              ...bestResult,
              allPdfResults: isMultiInvoiceEmail ? allPdfResults : undefined,
              totalFromAllPdfs: isMultiInvoiceEmail ? totalFromAllPdfs : undefined,
            },
          })
          .where(eq(schema.invoices.id, invoice.id));

        extracted++;
        results.push({
          invoiceId: invoice.id,
          emailId: invoice.emailId,
          issuer: bestResult.issuerName || invoice.issuerName || "?",
          total: finalTotal || bestResult.totalAmount,
          currency: bestResult.currency || "EUR",
          pdfFilename: bestPdfFilename,
          status: "extracted",
        });

        // Log success
        await db.insert(schema.agentLogs).values({
          userId,
          action: "pdf-extract",
          inputSummary: `PDF: ${bestPdfFilename} (${pdfAttachments.length} adjuntos)`,
          outputSummary: `${bestResult.issuerName || "?"} | ${finalTotal || 0} ${bestResult.currency || "EUR"}`,
          durationMs: Date.now() - opStart,
          success: true,
        });

        // Rate limit between emails
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        errors++;
        results.push({
          invoiceId: invoice.id,
          emailId: invoice.emailId,
          issuer: invoice.issuerName || "?",
          total: null,
          currency: "EUR",
          pdfFilename: "",
          status: `error: ${err instanceof Error ? err.message : "unknown"}`,
        });

        await db.insert(schema.agentLogs).values({
          userId,
          action: "pdf-extract",
          inputSummary: `Invoice ${invoice.id} / Email ${invoice.emailId}`,
          durationMs: Date.now() - opStart,
          success: false,
          error: err instanceof Error ? err.message : "Unknown",
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: invoicesToProcess.length,
      extracted,
      skipped,
      errors,
      durationMs: Date.now() - startTime,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error en extracción PDF" },
      { status: 500 }
    );
  }
}
