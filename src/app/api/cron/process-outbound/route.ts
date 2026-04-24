import { NextRequest, NextResponse } from "next/server";
import { processQueue } from "@/lib/outbound";

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

  try {
    const result = await processQueue();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/outbound]", e);
    return NextResponse.json({ error: "Error processing outbound queue" }, { status: 500 });
  }
}
