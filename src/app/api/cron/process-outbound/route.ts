import { NextRequest, NextResponse } from "next/server";
import { processQueue } from "@/lib/outbound";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/cron/process-outbound" });

// Vercel function timeout (Hobby max 60s, Pro max 300s).
export const maxDuration = 60;

/**
 * Cron: procesa cola de mensajes outbound (email, WhatsApp, push)
 * Se ejecuta cada 5 minutos vía Vercel Cron
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const result = await processQueue();
    log.info({ durationMs: Date.now() - started, ...result }, "outbound queue processed");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logError(log, e, { durationMs: Date.now() - started }, "process-outbound failed");
    return NextResponse.json(
      { error: "Error processing outbound queue", detail: e instanceof Error ? e.message.slice(0, 200) : String(e) },
      { status: 500 },
    );
  }
}
