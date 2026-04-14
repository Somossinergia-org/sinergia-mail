import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { extractFromImage, type PhotoInvoiceResult } from "@/lib/gemini";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/invoices/from-photo" });

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * POST /api/invoices/from-photo
 *
 * Multipart form-data with `file`. Extracts invoice data from a photo via
 * Gemini Vision and creates a row in the `invoices` table.
 *
 * Use case: receipt of paper invoice / scan that didn't come via email.
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
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: `Tipo no soportado: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Imagen demasiado grande" }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await extractFromImage<PhotoInvoiceResult>(buffer, "invoice", file.type);

    if (data.confidence < 30 || (!data.totalAmount && !data.issuerName)) {
      return NextResponse.json(
        {
          error: "No se pudo extraer información suficiente. Intenta con una foto más clara o nítida.",
          extracted: data,
        },
        { status: 422 },
      );
    }

    const [inserted] = await db
      .insert(schema.invoices)
      .values({
        userId,
        invoiceNumber: data.invoiceNumber,
        issuerName: data.issuerName,
        issuerNif: data.issuerNif,
        recipientName: null,
        recipientNif: null,
        concept: data.concept,
        amount: data.subtotal,
        tax: data.tax,
        totalAmount: data.totalAmount,
        currency: data.currency || "EUR",
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        category: data.category,
        processed: true,
        aiResponse: data as unknown as Record<string, unknown>,
      })
      .returning();

    log.info(
      { userId, invoiceId: inserted.id, issuer: data.issuerName, total: data.totalAmount, confidence: data.confidence },
      "invoice created from photo",
    );

    return NextResponse.json({ ok: true, invoice: inserted, confidence: data.confidence });
  } catch (e) {
    logError(log, e, { userId }, "from-photo failed");
    return NextResponse.json({ error: "Error procesando la imagen" }, { status: 500 });
  }
}
