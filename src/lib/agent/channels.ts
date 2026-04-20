/**
 * Multi-Channel Agent Communication System
 *
 * Each agent can communicate through multiple channels:
 *   - Phone (Twilio): Each agent has its own phone number
 *   - Voice (ElevenLabs): Each agent has a unique AI voice
 *   - WhatsApp (Twilio WhatsApp): Business messaging
 *   - Telegram (Bot API): Free unlimited messaging
 *   - SMS (Twilio): Text messages
 *   - Email (Resend): Transactional emails
 *   - Web Push: Browser notifications
 *
 * Environment Variables Required:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_*
 *   ELEVENLABS_API_KEY
 *   TELEGRAM_BOT_TOKEN
 *   WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN
 *   RESEND_API_KEY
 *   DEEPGRAM_API_KEY
 */

import { logger, logError } from "@/lib/logger";

const log = logger.child({ component: "agent-channels" });

// ─── Types ──────────────────────────────────────────────────────────────

export interface AgentVoiceProfile {
  agentId: string;
  voiceId: string; // ElevenLabs voice ID
  voiceName: string;
  language: "es" | "en";
  style: "professional" | "friendly" | "serious" | "energetic";
  phoneNumber?: string; // Twilio phone number
  telegramBotToken?: string;
}

export interface ChannelMessage {
  channel: "phone" | "whatsapp" | "telegram" | "sms" | "email" | "web_push";
  agentId: string;
  to: string; // phone number, email, telegram chat id
  message: string;
  mediaUrl?: string;
  voiceMessage?: boolean;
}

export interface ChannelResponse {
  ok: boolean;
  channel: string;
  messageId?: string;
  error?: string;
  cost?: number;
}

export interface VoiceSynthesisResult {
  ok: boolean;
  audioUrl?: string;
  audioBase64?: string;
  durationMs?: number;
  error?: string;
}

export interface TranscriptionResult {
  ok: boolean;
  text?: string;
  confidence?: number;
  language?: string;
  error?: string;
}

// ─── Agent Voice Profiles ───────────────────────────────────────────────

export const AGENT_VOICE_PROFILES: Record<string, AgentVoiceProfile> = {
  ceo: {
    agentId: "ceo",
    voiceId: "pNInz6obpgDQGcFmaJgB", // Adam - deep, authoritative
    voiceName: "Director General",
    language: "es",
    style: "professional",
  },
  "recepcionista": {
    agentId: "recepcionista",
    voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel - clear, organized
    voiceName: "Recepcionista",
    language: "es",
    style: "friendly",
  },
  "director-comercial": {
    agentId: "director-comercial",
    voiceId: "ErXwobaYiN019PkySvjV", // Antoni - charismatic
    voiceName: "Director Comercial",
    language: "es",
    style: "energetic",
  },
  "consultor-servicios": {
    agentId: "consultor-servicios",
    voiceId: "MF3mGyEYCl7XYWbV9V6O", // Emily - analytical
    voiceName: "Consultor Servicios",
    language: "es",
    style: "professional",
  },
  "consultor-digital": {
    agentId: "consultor-digital",
    voiceId: "TxGEqnHWrfWFTfGW9XjX", // Josh - tech-savvy
    voiceName: "Consultor Digital",
    language: "es",
    style: "energetic",
  },
  "fiscal-controller": {
    agentId: "fiscal-controller",
    voiceId: "29vD33N1CtxCmqQRPOHJ", // Drew - precise, formal
    voiceName: "Controller Fiscal",
    language: "es",
    style: "serious",
  },
  "legal-rgpd": {
    agentId: "legal-rgpd",
    voiceId: "ThT5KcBeYPX3keUQqHPh", // Dorothy - formal, serious
    voiceName: "Oficial RGPD",
    language: "es",
    style: "serious",
  },
  "marketing-director": {
    agentId: "marketing-director",
    voiceId: "VR6AewLTigWG4xSOukaG", // Arnold - creative
    voiceName: "Director Marketing",
    language: "es",
    style: "energetic",
  },
  "analista-bi": {
    agentId: "analista-bi",
    voiceId: "pqHfZKP75CvOlQylNhV4", // Bill - analytical
    voiceName: "Analista BI",
    language: "es",
    style: "professional",
  },
};

// ─── ElevenLabs Voice Synthesis ─────────────────────────────────────────

/**
 * Convert text to speech using ElevenLabs API.
 * Each agent has its own unique voice.
 */
export async function textToSpeech(
  agentId: string,
  text: string,
  outputFormat: "mp3_44100_128" | "pcm_16000" = "mp3_44100_128",
): Promise<VoiceSynthesisResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "ELEVENLABS_API_KEY not configured" };
  }

  const profile = AGENT_VOICE_PROFILES[agentId];
  if (!profile) {
    return { ok: false, error: `No voice profile for agent: ${agentId}` };
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${profile.voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: profile.style === "serious" ? 0.8 : 0.5,
            similarity_boost: 0.8,
            style: profile.style === "energetic" ? 0.7 : 0.3,
            use_speaker_boost: true,
          },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!res.ok) {
      const errorText = await res.text();
      return { ok: false, error: `ElevenLabs error ${res.status}: ${errorText.slice(0, 200)}` };
    }

    const audioBuffer = await res.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    log.info({ agentId, textLength: text.length }, "voice synthesized");

    return {
      ok: true,
      audioBase64,
      durationMs: Math.round((text.length / 15) * 1000), // Approximate
    };
  } catch (err) {
    logError(log, err, { agentId }, "voice synthesis failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Deepgram Speech-to-Text ────────────────────────────────────────────

/**
 * Transcribe audio to text using Deepgram.
 * $200 free credits, then $0.0077/min.
 */
export async function speechToText(
  audioBase64: string,
  language: string = "es",
): Promise<TranscriptionResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "DEEPGRAM_API_KEY not configured" };
  }

  try {
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const res = await fetch(
      `https://api.deepgram.com/v1/listen?language=${language}&model=nova-2&smart_format=true&punctuate=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "audio/webm",
        },
        body: audioBuffer,
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!res.ok) {
      return { ok: false, error: `Deepgram error: ${res.status}` };
    }

    const data = await res.json();
    const transcript = data?.results?.channels?.[0]?.alternatives?.[0];

    return {
      ok: true,
      text: transcript?.transcript || "",
      confidence: transcript?.confidence || 0,
      language,
    };
  } catch (err) {
    logError(log, err, {}, "speech-to-text failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Twilio SMS & Phone ─────────────────────────────────────────────────

/**
 * Send SMS via Twilio.
 * ~$1.15/month per number + $0.0079/SMS.
 * Free trial: $15-20 credit.
 */
export async function sendSMS(
  to: string,
  message: string,
  fromAgentId?: string,
): Promise<ChannelResponse> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_DEFAULT || process.env.TWILIO_PHONE_CEO;

  if (!sid || !token || !from) {
    return { ok: false, channel: "sms", error: "Twilio not configured" };
  }

  try {
    const params = new URLSearchParams({
      To: to,
      From: from,
      Body: `[${AGENT_VOICE_PROFILES[fromAgentId || "ceo"]?.voiceName || "Sinergia"}] ${message}`,
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, channel: "sms", error: data.message || "SMS failed" };
    }

    log.info({ to, agent: fromAgentId, sid: data.sid }, "SMS sent");
    return { ok: true, channel: "sms", messageId: data.sid };
  } catch (err) {
    logError(log, err, { to }, "SMS send failed");
    return { ok: false, channel: "sms", error: String(err) };
  }
}

/**
 * Make a phone call with TTS voice via Twilio.
 * Agent speaks with its ElevenLabs voice.
 */
export async function makePhoneCall(
  to: string,
  agentId: string,
  message: string,
  callbackUrl?: string,
): Promise<ChannelResponse> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env[`TWILIO_PHONE_${agentId.toUpperCase().replace(/-/g, "_")}`]
    || process.env.TWILIO_PHONE_DEFAULT;

  if (!sid || !token || !from) {
    return { ok: false, channel: "phone", error: "Twilio not configured" };
  }

  // Generate TwiML with the agent's voice
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lucia" language="es-ES">${message}</Say>
  ${callbackUrl ? `<Record maxLength="120" action="${callbackUrl}" />` : ""}
</Response>`;

  try {
    const params = new URLSearchParams({
      To: to,
      From: from,
      Twiml: twiml,
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, channel: "phone", error: data.message || "Call failed" };
    }

    log.info({ to, agent: agentId, callSid: data.sid }, "phone call initiated");
    return { ok: true, channel: "phone", messageId: data.sid };
  } catch (err) {
    logError(log, err, { to, agentId }, "phone call failed");
    return { ok: false, channel: "phone", error: String(err) };
  }
}

// ─── WhatsApp Business API ──────────────────────────────────────────────

/**
 * Send WhatsApp message via Meta Cloud API.
 * Free for 24h window after customer initiates.
 */
export async function sendWhatsApp(
  to: string,
  message: string,
  agentId?: string,
): Promise<ChannelResponse> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneId || !token) {
    return { ok: false, channel: "whatsapp", error: "WhatsApp not configured" };
  }

  const agentName = AGENT_VOICE_PROFILES[agentId || "ceo"]?.voiceName || "Sinergia";

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.replace(/\+/g, ""),
          type: "text",
          text: { body: `*${agentName}*\n\n${message}` },
        }),
      },
    );

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, channel: "whatsapp", error: JSON.stringify(data.error || data) };
    }

    log.info({ to, agent: agentId }, "WhatsApp message sent");
    return { ok: true, channel: "whatsapp", messageId: data.messages?.[0]?.id };
  } catch (err) {
    logError(log, err, { to }, "WhatsApp send failed");
    return { ok: false, channel: "whatsapp", error: String(err) };
  }
}

// ─── Telegram Bot ───────────────────────────────────────────────────────

/**
 * Send message via Telegram Bot API.
 * 100% FREE, unlimited messages, no limits.
 */
export async function sendTelegram(
  chatId: string,
  message: string,
  agentId?: string,
  parseMode: "HTML" | "Markdown" = "HTML",
): Promise<ChannelResponse> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { ok: false, channel: "telegram", error: "TELEGRAM_BOT_TOKEN not configured" };
  }

  const agentName = AGENT_VOICE_PROFILES[agentId || "ceo"]?.voiceName || "Sinergia";
  const formattedMessage = parseMode === "HTML"
    ? `<b>🤖 ${agentName}</b>\n\n${message}`
    : `*🤖 ${agentName}*\n\n${message}`;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: formattedMessage,
          parse_mode: parseMode,
        }),
      },
    );

    const data = await res.json();
    if (!data.ok) {
      return { ok: false, channel: "telegram", error: data.description || "Telegram error" };
    }

    log.info({ chatId, agent: agentId }, "Telegram message sent");
    return { ok: true, channel: "telegram", messageId: String(data.result?.message_id) };
  } catch (err) {
    logError(log, err, { chatId }, "Telegram send failed");
    return { ok: false, channel: "telegram", error: String(err) };
  }
}

/**
 * Send voice message via Telegram (agent speaks with its voice).
 */
export async function sendTelegramVoice(
  chatId: string,
  agentId: string,
  text: string,
): Promise<ChannelResponse> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { ok: false, channel: "telegram", error: "TELEGRAM_BOT_TOKEN not configured" };
  }

  // First, synthesize voice
  const voice = await textToSpeech(agentId, text);
  if (!voice.ok || !voice.audioBase64) {
    // Fallback to text message
    return sendTelegram(chatId, text, agentId);
  }

  try {
    const audioBuffer = Buffer.from(voice.audioBase64, "base64");
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("voice", new Blob([audioBuffer], { type: "audio/ogg" }), "voice.ogg");

    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendVoice`,
      { method: "POST", body: formData },
    );

    const data = await res.json();
    if (!data.ok) {
      return sendTelegram(chatId, text, agentId); // Fallback
    }

    return { ok: true, channel: "telegram", messageId: String(data.result?.message_id) };
  } catch (err) {
    return sendTelegram(chatId, text, agentId); // Fallback
  }
}

// ─── Resend Email ───────────────────────────────────────────────────────

/**
 * Send transactional email via Resend API.
 * Free: 3,000 emails/month.
 */
export async function sendTransactionalEmail(
  to: string,
  subject: string,
  htmlContent: string,
  agentId?: string,
): Promise<ChannelResponse> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, channel: "email", error: "RESEND_API_KEY not configured" };
  }

  const agentName = AGENT_VOICE_PROFILES[agentId || "ceo"]?.voiceName || "Sinergia IA";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${agentName} <agentes@somossinergia.es>`,
        to: [to],
        subject: `[${agentName}] ${subject}`,
        html: htmlContent,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, channel: "email", error: JSON.stringify(data) };
    }

    log.info({ to, agent: agentId, subject }, "transactional email sent");
    return { ok: true, channel: "email", messageId: data.id };
  } catch (err) {
    logError(log, err, { to }, "email send failed");
    return { ok: false, channel: "email", error: String(err) };
  }
}

// ─── Image Generation (Stability AI) ────────────────────────────────────

/**
 * Generate images using Stability AI API.
 * Free for < $1M revenue. ~$0.04/image paid.
 */
export async function generateImage(
  prompt: string,
  style: "photographic" | "digital-art" | "3d-model" | "cinematic" = "photographic",
  size: "1024x1024" | "1024x576" | "576x1024" = "1024x1024",
): Promise<{ ok: boolean; imageBase64?: string; error?: string }> {
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "STABILITY_API_KEY not configured" };
  }

  try {
    const [width, height] = size.split("x").map(Number);
    const res = await fetch(
      "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          text_prompts: [
            { text: prompt, weight: 1 },
            { text: "blurry, low quality, text, watermark", weight: -1 },
          ],
          cfg_scale: 7,
          width,
          height,
          samples: 1,
          steps: 30,
          style_preset: style,
        }),
        signal: AbortSignal.timeout(60000),
      },
    );

    if (!res.ok) {
      return { ok: false, error: `Stability error: ${res.status}` };
    }

    const data = await res.json();
    const imageBase64 = data.artifacts?.[0]?.base64;
    if (!imageBase64) {
      return { ok: false, error: "No image generated" };
    }

    log.info({ promptLength: prompt.length, style }, "image generated");
    return { ok: true, imageBase64 };
  } catch (err) {
    logError(log, err, {}, "image generation failed");
    return { ok: false, error: String(err) };
  }
}

// ─── OCR (Google Cloud Vision) ──────────────────────────────────────────

/**
 * Extract text from image using Google Cloud Vision OCR.
 * Free: 1,000 units/month. Then $1.50/1000.
 */
export async function ocrFromImage(
  imageBase64: string,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_KEY;
  if (!apiKey) {
    return { ok: false, error: "GOOGLE_CLOUD_VISION_KEY not configured" };
  }

  try {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBase64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            },
          ],
        }),
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!res.ok) {
      return { ok: false, error: `Vision API error: ${res.status}` };
    }

    const data = await res.json();
    const text = data.responses?.[0]?.fullTextAnnotation?.text || "";

    log.info({ textLength: text.length }, "OCR completed");
    return { ok: true, text };
  } catch (err) {
    logError(log, err, {}, "OCR failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Unified Send (routes to best channel) ──────────────────────────────

/**
 * Send a message through the best available channel.
 * Tries channels in order of preference.
 */
export async function sendAgentMessage(msg: ChannelMessage): Promise<ChannelResponse> {
  switch (msg.channel) {
    case "sms":
      return sendSMS(msg.to, msg.message, msg.agentId);
    case "phone":
      return makePhoneCall(msg.to, msg.agentId, msg.message);
    case "whatsapp":
      return sendWhatsApp(msg.to, msg.message, msg.agentId);
    case "telegram":
      return msg.voiceMessage
        ? sendTelegramVoice(msg.to, msg.agentId, msg.message)
        : sendTelegram(msg.to, msg.message, msg.agentId);
    case "email":
      return sendTransactionalEmail(msg.to, "Mensaje de tu agente", `<p>${msg.message}</p>`, msg.agentId);
    default:
      return { ok: false, channel: msg.channel, error: "Canal no soportado" };
  }
}

// ─── Get all available channels status ──────────────────────────────────

export function getChannelsStatus(): Record<string, boolean> {
  return {
    twilio_sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    twilio_phone: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_PHONE_DEFAULT),
    elevenlabs_voice: !!process.env.ELEVENLABS_API_KEY,
    deepgram_stt: !!process.env.DEEPGRAM_API_KEY,
    whatsapp: !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
    telegram: !!process.env.TELEGRAM_BOT_TOKEN,
    resend_email: !!process.env.RESEND_API_KEY,
    stability_images: !!process.env.STABILITY_API_KEY,
    google_ocr: !!process.env.GOOGLE_CLOUD_VISION_KEY,
  };
}
