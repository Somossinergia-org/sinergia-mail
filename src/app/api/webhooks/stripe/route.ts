import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, handleWebhookEvent, type StripeEvent } from "@/lib/stripe";
import { db } from "@/db";
import { billingEvents } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature") || "";

  // Verify signature
  if (!verifyWebhookSignature(body, signature)) {
    console.error("[stripe-webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event: StripeEvent = JSON.parse(body);

  // Idempotency: check if event already processed
  const existing = await db.select().from(billingEvents).where(eq(billingEvents.stripeEventId, event.id)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Store event
  await db.insert(billingEvents).values({
    stripeEventId: event.id,
    eventType: event.type,
    payload: event.data.object,
  });

  // Process
  const result = await handleWebhookEvent(event);

  // Mark as processed
  await db.update(billingEvents).set({ processed: true }).where(eq(billingEvents.stripeEventId, event.id));

  return NextResponse.json({ received: true, ...result });
}
