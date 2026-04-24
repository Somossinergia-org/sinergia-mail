/**
 * Public Chat Widget API — Somos Sinergia
 *
 * Endpoint público (sin auth) para el chatbot web de somossinergia.es.
 * Llamadas directas a OpenAI sin tools del swarm (seguridad).
 *
 * POST /api/chat/widget
 *   Body:    { messages: [{ role: 'user'|'assistant', content: string }] }
 *   Returns: { response: string, agentId: 'recepcion' } | { error: string }
 *
 * Rate limit:   20 req/min por IP
 * CORS origin:  https://somossinergia.es
 * Input caps:   ≤20 mensajes por request, ≤1000 chars por mensaje
 */

import { NextRequest, NextResponse } from "next/server";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/chat/widget" });

// ─── Rate limiter por IP ────────────────────────────────────────────────

const ipBuckets = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 20;

function checkIpRate(ip: string): boolean {
  const now = Date.now();
  const bucket = ipBuckets.get(ip) || [];
  const filtered = bucket.filter((t) => t > now - RATE_LIMIT_WINDOW);
  if (filtered.length >= RATE_LIMIT_MAX) {
    ipBuckets.set(ip, filtered);
    return false;
  }
  filtered.push(now);
  ipBuckets.set(ip, filtered);
  return true;
}

// Cleanup buckets stale cada 5 min (evita leak con muchas IPs)
setInterval(() => {
  const now = Date.now();
  ipBuckets.forEach((ts, ip) => {
    const active = ts.filter((t) => t > now - RATE_LIMIT_WINDOW);
    if (!active.length) ipBuckets.delete(ip);
    else ipBuckets.set(ip, active);
  });
}, 300_000);

// ─── CORS ───────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://somossinergia.es",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ─── System prompt ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres la Recepcionista Virtual de Somos Sinergia, empresa de servicios integrales en Orihuela, Alicante.
Profesional, cercana, siempre en espanol. Respuestas cortas (max 3-4 frases). Max 1-2 emojis.
SERVICIOS: 1. Energia (luz/gas, ahorro 40%) 2. Telefonia/Internet (fibra 10Gbps) 3. Seguros 4. IA (10 agentes) 5. Marketing 6. Consultoria Digital 7. Facturacion 8. RGPD
Contacto: 966 741 545 | info@somossinergia.es | WhatsApp 623 445 324 | L-V 9-20
- Precios: "Cada caso es unico, te preparamos estudio gratuito. Dejme tu telefono o email"
- Contratar: "Perfecto, llama al 966 741 545 o deja tus datos"
- Nunca inventes informacion. Capta datos de contacto siempre que sea posible.`;

// ─── POST handler ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (!checkIpRate(ip)) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta en un minuto." },
      { status: 429, headers: CORS_HEADERS },
    );
  }

  try {
    const body = await req.json();
    const { messages } = body as {
      messages?: Array<{ role?: string; content?: string }>;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages requerido" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Limitar longitud conversacional y sanitizar cada mensaje
    const trimmed = messages.slice(-20);
    const cleanMessages: Array<{ role: "user" | "assistant"; content: string }> =
      trimmed.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? "").slice(0, 1000),
      }));

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      log.error("OPENAI_API_KEY missing for widget chat");
      return NextResponse.json(
        { error: "Servicio no disponible temporalmente" },
        { status: 503, headers: CORS_HEADERS },
      );
    }

    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey });
    const model = process.env.WIDGET_CHAT_MODEL || process.env.GPT5_MODEL || "gpt-4o-mini";

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.7,
      max_tokens: 500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...cleanMessages,
      ],
    });

    const response =
      completion.choices[0]?.message?.content?.trim() ||
      "Disculpa, no he podido procesar tu mensaje. Llamanos al 966 741 545.";

    // Log sin contenido de usuario (RGPD: usuarios pueden pegar DNI/telefono/email).
    log.info(
      {
        ip,
        msgCount: cleanMessages.length,
        userMsgLen: cleanMessages[cleanMessages.length - 1]?.content?.length ?? 0,
        responseLen: response.length,
        tokens: completion.usage?.total_tokens,
      },
      "widget chat ok",
    );

    return NextResponse.json(
      { response, agentId: "recepcion" },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    logError(log, err, { ip }, "widget chat error");
    return NextResponse.json(
      { error: "Error procesando tu mensaje. Puedes llamarnos al 966 741 545." },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
