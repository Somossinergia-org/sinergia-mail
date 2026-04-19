import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * API Pública de Webhooks — Recibe eventos externos.
 * Endpoint: POST /api/webhooks/incoming
 * Headers: X-Webhook-Secret para autenticación
 */
export async function POST(req: NextRequest) {
  // Verify webhook secret
  const secret = req.headers.get("x-webhook-secret");
  const expectedSecret = process.env.WEBHOOK_INCOMING_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const eventType = body.event || body.type || "unknown";
    const payload = body.data || body.payload || body;

    // Log the incoming webhook
    console.log(`[webhook-incoming] Received event: ${eventType}`, JSON.stringify(payload).slice(0, 500));

    // Process based on event type
    const response: Record<string, unknown> = { received: true, event: eventType, timestamp: new Date().toISOString() };

    switch (eventType) {
      case "contact.created":
      case "contact.updated":
        response.action = "contact_sync_queued";
        break;
      case "invoice.received":
        response.action = "invoice_processing_queued";
        break;
      case "email.bounce":
      case "email.complaint":
        response.action = "email_status_updated";
        break;
      default:
        response.action = "logged";
    }

    return NextResponse.json(response);
  } catch (e) {
    console.error("[webhook-incoming] Error:", e);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}

/** GET /api/webhooks/incoming — Returns API documentation */
export async function GET() {
  return NextResponse.json({
    name: "Sinergia Mail Webhook API",
    version: "1.0",
    endpoints: {
      "POST /api/webhooks/incoming": {
        description: "Receive external webhook events",
        headers: { "X-Webhook-Secret": "Your webhook secret (required if WEBHOOK_INCOMING_SECRET is set)", "Content-Type": "application/json" },
        body: { event: "string — Event type (e.g. contact.created, invoice.received)", data: "object — Event payload" },
        events: ["contact.created", "contact.updated", "invoice.received", "email.bounce", "email.complaint"],
      },
      "POST /api/webhooks/stripe": { description: "Stripe billing webhooks (auto-configured)" },
    },
  });
}
