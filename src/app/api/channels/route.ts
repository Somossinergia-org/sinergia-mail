/**
 * Channels API — Send messages through any channel
 *
 * POST /api/channels
 *   - Send SMS, WhatsApp, Telegram, Email, or make phone calls
 *   - Each message is sent from the specified agent's identity
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  sendAgentMessage,
  getChannelsStatus,
  generateImage,
  ocrFromImage,
  type ChannelMessage,
} from "@/lib/agent/channels";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ component: "api-channels" });

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "send": {
        const msg: ChannelMessage = {
          channel: body.channel,
          agentId: body.agentId || "ceo",
          to: body.to,
          message: body.message,
          voiceMessage: body.voiceMessage || false,
        };

        if (!msg.to || !msg.message || !msg.channel) {
          return NextResponse.json({ error: "channel, to, y message requeridos" }, { status: 400 });
        }

        const result = await sendAgentMessage(msg);
        return NextResponse.json(result);
      }

      case "status": {
        const channels = getChannelsStatus();
        return NextResponse.json({ ok: true, channels });
      }

      case "generate_image": {
        const { prompt, style, size } = body;
        if (!prompt) {
          return NextResponse.json({ error: "prompt requerido" }, { status: 400 });
        }
        const result = await generateImage(prompt, style, size);
        return NextResponse.json(result);
      }

      case "ocr": {
        const { image } = body;
        if (!image) {
          return NextResponse.json({ error: "image (base64) requerido" }, { status: 400 });
        }
        const result = await ocrFromImage(image);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
    }
  } catch (err) {
    logError(log, err, {}, "channels API error");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
