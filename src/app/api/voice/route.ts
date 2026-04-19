/**
 * Voice API — Text-to-Speech & Speech-to-Text for Agents
 *
 * POST /api/voice
 *   - action: "tts" — Convert text to speech with agent's voice
 *   - action: "stt" — Transcribe audio to text
 *   - action: "channels" — Get available channels status
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  textToSpeech,
  speechToText,
  getChannelsStatus,
  AGENT_VOICE_PROFILES,
} from "@/lib/agent/channels";
import { db } from "@/db";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ component: "api-voice" });

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "tts": {
        const { agentId, text } = body;
        if (!agentId || !text) {
          return NextResponse.json({ error: "agentId y text requeridos" }, { status: 400 });
        }
        const result = await textToSpeech(agentId, text);
        return NextResponse.json(result);
      }

      case "stt": {
        const { audio, language } = body;
        if (!audio) {
          return NextResponse.json({ error: "audio (base64) requerido" }, { status: 400 });
        }
        const result = await speechToText(audio, language || "es");
        return NextResponse.json(result);
      }

      case "channels": {
        const status = getChannelsStatus();
        const profiles = Object.values(AGENT_VOICE_PROFILES).map((p) => ({
          agentId: p.agentId,
          voiceName: p.voiceName,
          style: p.style,
          hasPhone: !!p.phoneNumber,
        }));
        return NextResponse.json({ ok: true, channels: status, voiceProfiles: profiles });
      }

      default:
        return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
    }
  } catch (err) {
    logError(log, err, {}, "voice API error");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
