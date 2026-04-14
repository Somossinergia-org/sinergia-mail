import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractInvoiceFromPdf } from "@/lib/gemini";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/agent/pdf-extract" });

export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/agent/pdf-extract
 *
 * Multipart with `file` (PDF). Extracts invoice fields via pdf-parse +
 * Gemini. Returns the same shape as photo-extract for FloatingAgent reuse.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id") || "unknown";

  const rl = rateLimit(userId, "gemini");
  if (!rl.success) return rateLimitResponse(rl, requestId);

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file requerido" }, { status: 400 });
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: `Esperaba PDF, recibí ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "PDF demasiado grande" }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    log.info({ userId, sizeKb: Math.round(buffer.length / 1024) }, "pdf extract start");

    const data = await extractInvoiceFromPdf(buffer);
    log.info({ userId, total: data.totalAmount, issuer: data.issuerName }, "pdf extract done");

    return NextResponse.json({
      ok: true,
      mode: "pdf",
      data: {
        issuerName: data.issuerName,
        issuerNif: data.issuerNif,
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate,
        subtotal: data.amount,
        tax: data.tax,
        totalAmount: data.totalAmount,
        currency: data.currency,
        category: data.category,
        concept: data.concept,
        confidence: 100, // PDF text is more reliable than image OCR
      },
    });
  } catch (e) {
    logError(log, e, { userId }, "pdf-extract failed");
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Error procesando PDF" },
      { status: 500 },
    );
  }
}
