/**
 * GET /api/track/open?msg=<outbound_id>&t=<hmac12>
 *
 * Endpoint PÚBLICO sin auth. Lo invoca el cliente de email del destinatario
 * cuando renderiza el HTML que contiene el `<img src=".../api/track/open?…">`
 * inyectado por outbound.ts:sendEmail.
 *
 * Cualquier persona con el msg id NO puede falsificar aperturas porque
 * verificamos un HMAC corto sobre el id usando TRACKING_SECRET.
 *
 * Side effects (best-effort, no fail si DB caído):
 *   - first_opened_at = now() la primera vez (si era NULL)
 *   - last_opened_at = now() siempre que se invoca
 *   - open_count++
 *
 * Respuesta: GIF transparente 1×1 con cache headers de no-cache (los emails
 * de Gmail/Outlook hacen prefetch del pixel, así que el primer hit normalmente
 * es del proxy del cliente, no del usuario; aceptamos imprecisión).
 */
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";
import { logger, logError } from "@/lib/logger";
import { verifyOpenToken, TRACKING_PIXEL_GIF } from "@/lib/tracking";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = logger.child({ route: "/api/track/open" });

function pixelResponse() {
  return new NextResponse(new Uint8Array(TRACKING_PIXEL_GIF) as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(TRACKING_PIXEL_GIF.length),
      // No-cache: queremos contar cada apertura (con la salvedad de proxies de
      // Gmail/Outlook que sí cachean — aceptable, el primer open es real).
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const rawMsg = sp.get("msg") || "";
  const token = sp.get("t") || "";
  const msgId = parseInt(rawMsg, 10);

  // Inválido: devolver pixel igual (no leak de info al sender) y no tocar DB.
  if (!Number.isFinite(msgId) || msgId <= 0 || !token || !verifyOpenToken(msgId, token)) {
    return pixelResponse();
  }

  // Best-effort: si la DB falla, igualmente devolvemos el pixel.
  try {
    const now = new Date();
    await db
      .update(schema.outboundMessages)
      .set({
        firstOpenedAt: sql`COALESCE(${schema.outboundMessages.firstOpenedAt}, ${now})`,
        lastOpenedAt: now,
        openCount: sql`COALESCE(${schema.outboundMessages.openCount}, 0) + 1`,
      })
      .where(eq(schema.outboundMessages.id, msgId));
  } catch (err) {
    logError(log, err, { msgId }, "track-open update failed");
  }

  return pixelResponse();
}
