/**
 * Telegram Bot Webhook — Agents respond via Telegram
 *
 * Each incoming Telegram message is routed to the appropriate agent
 * via the swarm, and the response is sent back through Telegram.
 *
 * Setup: POST https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://yourdomain.com/api/telegram
 */

import { NextRequest, NextResponse } from "next/server";
import { executeSwarm, routeToAgent } from "@/lib/agent/swarm";
import { sendTelegram, sendTelegramVoice } from "@/lib/agent/channels";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ component: "telegram-webhook" });

export async function POST(req: NextRequest) {
  // Verify Telegram secret token (set via setWebhook secret_token param)
  const telegramSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (telegramSecret) {
    const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (headerSecret !== telegramSecret) {
      log.warn("telegram webhook rejected: invalid secret token");
      return NextResponse.json({ ok: false }, { status: 403 });
    }
  }

  try {
    const body = await req.json();
    const message = body.message || body.edited_message;

    if (!message?.text || !message.chat) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(message.chat.id);
    const text = message.text;
    const userName = message.from?.first_name || "Usuario";

    log.info({ chatId, text: text.slice(0, 100), user: userName }, "telegram message received");

    // Find user by telegram chat ID (stored in user settings)
    // For now, use the first user as default (single-tenant)
    const users = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .limit(1);

    if (users.length === 0) {
      await sendTelegram(chatId, "No hay usuarios configurados en el sistema.", "ceo");
      return NextResponse.json({ ok: true });
    }

    const userId = users[0].id;

    // Handle special commands
    if (text === "/start") {
      await sendTelegram(
        chatId,
        `¡Hola ${userName}! 👋 Soy el equipo de agentes IA de Somos Sinergia.\n\nPuedes hablarme de:\n📧 Emails y comunicaciones\n💰 Facturas e IVA\n📅 Agenda y reuniones\n👥 Clientes y CRM\n⚡ Energía y tarifas\n🤖 Automatizaciones\n⚖️ Legal y RGPD\n📢 Marketing y SEO\n🌐 Web y WordPress\n\nEscríbeme lo que necesites y el agente experto te responderá.`,
        "ceo",
      );
      return NextResponse.json({ ok: true });
    }

    if (text === "/agentes") {
      await sendTelegram(
        chatId,
        `🏢 <b>Equipo de Agentes Sinergia</b>\n\n👨‍💼 CEO — Director General\n👩‍💻 Email — Gestora de Email\n💼 Fiscal — Controller Fiscal\n📅 Agenda — Asistente de Agenda\n👥 CRM — Director CRM\n⚡ Energía — Analista Energético\n🤖 Auto — Ingeniero Automatización\n⚖️ Legal — Oficial RGPD\n📢 Mktg — Director Marketing\n🌐 Web — Web Master\n\nCada agente tiene su propia voz y personalidad.`,
        "ceo",
      );
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/voz ")) {
      const voiceText = text.replace("/voz ", "");
      const agentId = routeToAgent(voiceText);
      const result = await executeSwarm({
        userId,
        messages: [{ role: "user", content: voiceText }],
        context: `Mensaje recibido via Telegram de ${userName} (chat: ${chatId}). Responde de forma concisa.`,
      });
      await sendTelegramVoice(chatId, agentId, result.reply);
      return NextResponse.json({ ok: true });
    }

    // Route to the best agent and execute
    const result = await executeSwarm({
      userId,
      messages: [{ role: "user", content: text }],
      context: `Mensaje recibido via Telegram de ${userName} (chat: ${chatId}). Responde de forma concisa y directa. No uses mas de 500 caracteres.`,
    });

    // Send response back via Telegram
    // Split long messages (Telegram max: 4096 chars)
    const reply = result.reply;
    if (reply.length <= 4000) {
      await sendTelegram(chatId, reply, result.agentId);
    } else {
      const chunks: string[] = [];
      for (let i = 0; i < reply.length; i += 4000) {
        chunks.push(reply.slice(i, i + 4000));
      }
      for (const chunk of chunks) {
        await sendTelegram(chatId, chunk, result.agentId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Log con contexto completo para que el fallo no quede oculto.
    // Devolvemos 200 a Telegram (su política de retries es agresiva y nos
    // bombardearía con duplicados si devolvemos 5xx), pero el error queda
    // registrado en logger + opcional alerta vía processError.
    logError(log, err, { route: "/api/telegram" }, "telegram webhook error — handled but logged");
    return NextResponse.json({ ok: true, handled: false, errorLogged: true });
  }
}

// GET for webhook verification
export async function GET() {
  return NextResponse.json({ ok: true, service: "Sinergia Telegram Bot" });
}
