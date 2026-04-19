/**
 * Stripe Billing Provider — portado de Ten21 stripe-provider.ts
 * Raw fetch (sin SDK) para máxima portabilidad.
 * Checkout sessions, billing portal, webhook verification.
 */

import { createHmac, timingSafeEqual } from "crypto";

const STRIPE_API = "https://api.stripe.com/v1";

function stripeHeaders() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY no configurada");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" };
}

function encode(params: Record<string, string>) {
  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

// ═══ Checkout ═══
export async function createCheckoutSession(data: {
  userId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
}) {
  const params: Record<string, string> = {
    "mode": "subscription",
    "line_items[0][price]": data.priceId,
    "line_items[0][quantity]": "1",
    "success_url": data.successUrl,
    "cancel_url": data.cancelUrl,
    "client_reference_id": data.userId,
    "metadata[userId]": data.userId,
  };
  if (data.trialDays) params["subscription_data[trial_period_days]"] = String(data.trialDays);

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST", headers: stripeHeaders(), body: encode(params),
  });
  if (!res.ok) throw new Error(`Stripe checkout error: ${res.status}`);
  return res.json();
}

// ═══ Billing Portal ═══
export async function createBillingPortalSession(customerId: string, returnUrl: string) {
  const res = await fetch(`${STRIPE_API}/billing_portal/sessions`, {
    method: "POST", headers: stripeHeaders(),
    body: encode({ customer: customerId, return_url: returnUrl }),
  });
  if (!res.ok) throw new Error(`Stripe portal error: ${res.status}`);
  return res.json();
}

// ═══ Webhook Verification ═══
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return false;

  const parts = signature.split(",").reduce((acc, part) => {
    const [key, val] = part.split("=");
    if (key === "t") acc.timestamp = val;
    if (key === "v1") acc.signatures.push(val);
    return acc;
  }, { timestamp: "", signatures: [] as string[] });

  if (!parts.timestamp || parts.signatures.length === 0) return false;

  // Timing-safe comparison
  const expectedSig = createHmac("sha256", secret)
    .update(`${parts.timestamp}.${payload}`)
    .digest("hex");

  return parts.signatures.some((sig) => {
    try {
      return timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
    } catch { return false; }
  });
}

// ═══ Webhook Event Handler ═══
export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

export async function handleWebhookEvent(event: StripeEvent): Promise<{ handled: boolean; action?: string }> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = (session.metadata as Record<string, string>)?.userId || session.client_reference_id;
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;
      // TODO: guardar en DB — subscription activa
      console.log(`[stripe] Checkout completado: user=${userId}, customer=${customerId}, sub=${subscriptionId}`);
      return { handled: true, action: "subscription_created" };
    }
    case "customer.subscription.updated": {
      const sub = event.data.object;
      console.log(`[stripe] Suscripción actualizada: ${sub.id}, status=${sub.status}`);
      return { handled: true, action: "subscription_updated" };
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      console.log(`[stripe] Suscripción cancelada: ${sub.id}`);
      return { handled: true, action: "subscription_cancelled" };
    }
    case "invoice.paid": {
      console.log(`[stripe] Factura pagada: ${event.data.object.id}`);
      return { handled: true, action: "invoice_paid" };
    }
    case "invoice.payment_failed": {
      console.log(`[stripe] Pago fallido: ${event.data.object.id}`);
      return { handled: true, action: "payment_failed" };
    }
    default:
      return { handled: false };
  }
}

// ═══ Plans ═══
export const PLANS = [
  { id: "free", name: "Gratis", price: 0, features: ["1 cuenta email", "100 emails/sync", "Agente básico"], priceId: null },
  { id: "pro", name: "Pro", price: 9.99, features: ["5 cuentas email", "Emails ilimitados", "Agente completo", "Facturas", "Calendar + Drive"], priceId: process.env.STRIPE_PRO_PRICE_ID },
  { id: "business", name: "Business", price: 29.99, features: ["Cuentas ilimitadas", "CRM completo", "WhatsApp", "Secuencias drip", "API + Webhooks"], priceId: process.env.STRIPE_BUSINESS_PRICE_ID },
] as const;
