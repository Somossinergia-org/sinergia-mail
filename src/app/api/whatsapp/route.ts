/**
 * WhatsApp Business Cloud API Webhook
 *
 * Receives incoming WhatsApp messages, routes them through the agent swarm,
 * and sends responses back via WhatsApp.
 *
 * Setup:
 *   1. Configure webhook URL: https://yourdomain.com/api/whatsapp
 *   2. Set WHATSAPP_VERIFY_TOKEN in env
 *   3. Subscribe to "messages" webhook field
 */

import { NextRequest, NextResponse } from "next/server";
import { executeSwarm, routeToAgent } from "@/lib/agent/swarm";
import { sendWhatsApp } from "@/lib/agent/channels";
import { db, schema } from "@/db";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ component: "whatsapp-webhook" });

// GET — Webhook verification (Meta requires this)
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "sinergia-whatsapp-2026";

  if (mode === "subscribe" && token === verifyToken) {
    log.info("WhatsApp webhook verified");
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// POST — Incoming messages
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // WhatsApp Cloud API sends notifications in this structure
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages?.[0]) {
      // Status updates, read receipts, etc. — acknowledge silently
      return NextResponse.json({ ok: true });
    }

    const message = value.messages[0];
    const contact = value.contacts?.[0];
    const from = message.from; // Phone number (e.g., "34612345678")
    const userName = contact?.profile?.name || "Usuario";

    // Only handle text messages for now
    if (message.type !== "text" || !message.text?.body) {
      return NextResponse.json({ ok: true });
    }

    const text = message.text.body;
    log.info({ from, text: text.slice(0, 100), user: userName }, "whatsapp message received");

    // Get default user (single-tenant for now)
    const users = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .limit(1);

    if (users.length === 0) {
      await sendWhatsApp(from, "No hay usuarios configurados en el sistema.", "ceo");
      return NextResponse.json({ ok: true });
    }

    const userId = users[0].id;

    // Handle special commands
    if (text.toLowerCase() === "hola" || text.toLowerCase() === "hi" || text === "/start") {
      await sendWhatsApp(
        from,
        `Hola ${userName}! Soy el equipo de agentes IA de Somos Sinergia.\n\nPuedes preguntarme sobre:\n- Emails y comunicaciones\n- Facturas e IVA\n- Agenda y reuniones\n- Clientes y CRM\n- Energia y tarifas\n- Automatizaciones\n- Legal y RGPD\n- Marketing y SEO\n- Web y WordPress\n\nEscribeme lo que necesites!`,
        "ceo",
      );
      return NextResponse.json({ ok: true });
    }

    // Route to agent swarm
    const result = await executeSwarm({
      userId,
      messages: [{ role: "user", content: text }],
      context: `Mensaje recibido via WhatsApp de ${userName} (tel: ${from}). Responde de forma concisa y directa. No uses HTML. No uses mas de 500 caracteres.`,
    });

    // Send response back via WhatsApp
    const reply = result.reply;
    if (reply.length <= 4000) {
      await sendWhatsApp(from, reply, result.agentId);
    } else {
      // Split long messages
      for (let i = 0; i < reply.length; i += 4000) {
        await sendWhatsApp(from, reply.slice(i, i + 4000), result.agentId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(log, err, {}, "whatsapp webhook error");
    return NextResponse.json({ ok: true }); // Always return 200 to Meta
  }
}
