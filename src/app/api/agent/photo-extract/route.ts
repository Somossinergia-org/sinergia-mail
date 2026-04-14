import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  extractFromImage,
  type PhotoInvoiceResult,
  type PhotoClientResult,
  type PhotoSearchResult,
} from "@/lib/gemini";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/agent/photo-extract" });

export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB safety net (client should compress to <500KB)
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * POST /api/agent/photo-extract
 *
 * Multipart/form-data:
 *   - file: the image (JPEG/PNG/WebP)
 *   - mode: 'invoice' | 'client' | 'search'
 *
 * Returns the parsed JSON for the requested mode.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id") || "unknown";

  // Vision is more expensive than chat — same gemini bucket
  const rl = rateLimit(userId, "gemini");
  if (!rl.success) return rateLimitResponse(rl, requestId);

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const mode = (form.get("mode") as string) || "invoice";

    if (!file) return NextResponse.json({ error: "file requerido" }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Tipo no soportado: ${file.type}. Usa JPEG/PNG/WebP` },
        { status: 400 },
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `Imagen demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB > 8 MB)` },
        { status: 413 },
      );
    }
    if (!["invoice", "client", "search"].includes(mode)) {
      return NextResponse.json({ error: "mode inválido" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    log.info({ userId, mode, sizeKb: Math.round(buffer.length / 1024), mimeType: file.type }, "vision extract start");

    const data =
      mode === "invoice"
        ? await extractFromImage<PhotoInvoiceResult>(buffer, "invoice", file.type)
        : mode === "client"
          ? await extractFromImage<PhotoClientResult>(buffer, "client", file.type)
          : await extractFromImage<PhotoSearchResult>(buffer, "search", file.type);

    log.info({ userId, mode, confidence: (data as { confidence?: number }).confidence }, "vision extract done");

    return NextResponse.json({ ok: true, mode, data });
  } catch (e) {
    logError(log, e, { userId }, "vision extract failed");
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Error procesando imagen" },
      { status: 500 },
    );
  }
}
