/**
 * API Status Endpoint — Shows which APIs and services are configured
 *
 * GET /api/admin/api-status
 * Returns the connectivity status of all external APIs used by agents.
 * Does NOT expose API keys — only shows configured/not-configured.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

interface ApiStatus {
  name: string;
  configured: boolean;
  envVars: string[];
  usedBy: string[];
  tier: "core" | "channel" | "search" | "ai" | "storage";
  description: string;
  freeQuota?: string;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const apis: ApiStatus[] = [
    // ── Core AI ──
    {
      name: "OpenAI (GPT-4o / GPT-5)",
      configured: !!process.env.OPENAI_API_KEY,
      envVars: ["OPENAI_API_KEY"],
      usedBy: ["Todos los agentes"],
      tier: "core",
      description: "Motor IA principal del swarm de agentes",
      freeQuota: "Pago por uso (~$0.005/1K tokens)",
    },
    {
      name: "Gemini (Fallback)",
      configured: !!process.env.GEMINI_API_KEY,
      envVars: ["GEMINI_API_KEY"],
      usedBy: ["Fallback cuando OpenAI falla"],
      tier: "core",
      description: "IA de respaldo via Google Gemini 2.5 Flash",
      freeQuota: "Gratis hasta 15 RPM",
    },

    // ── Channels ──
    {
      name: "Twilio (SMS + Llamadas)",
      configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      envVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_DEFAULT"],
      usedBy: ["CEO", "CRM", "Fiscal", "Marketing", "Energia"],
      tier: "channel",
      description: "SMS y llamadas telefonicas con voz IA",
      freeQuota: "$15 credito trial",
    },
    {
      name: "WhatsApp Business",
      configured: !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
      envVars: ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_VERIFY_TOKEN"],
      usedBy: ["CEO", "Email", "CRM", "Fiscal", "Marketing", "Automation"],
      tier: "channel",
      description: "Mensajeria WhatsApp Business Cloud API",
      freeQuota: "1000 conversaciones/mes gratis",
    },
    {
      name: "Telegram Bot",
      configured: !!process.env.TELEGRAM_BOT_TOKEN,
      envVars: ["TELEGRAM_BOT_TOKEN"],
      usedBy: ["CEO", "Email", "CRM", "Calendar", "Marketing", "Automation", "Web"],
      tier: "channel",
      description: "Bot de Telegram — mensajes ilimitados gratis",
      freeQuota: "100% gratis, sin limites",
    },
    {
      name: "Resend (Email transaccional)",
      configured: !!process.env.RESEND_API_KEY,
      envVars: ["RESEND_API_KEY"],
      usedBy: ["Email", "Fiscal", "CRM", "Marketing", "Legal", "Automation"],
      tier: "channel",
      description: "Emails transaccionales (notificaciones, alertas)",
      freeQuota: "3,000 emails/mes gratis",
    },

    // ── Voice & AI ──
    {
      name: "ElevenLabs (Voz IA)",
      configured: !!process.env.ELEVENLABS_API_KEY,
      envVars: ["ELEVENLABS_API_KEY"],
      usedBy: ["Todos los agentes (cada uno con voz unica)"],
      tier: "ai",
      description: "Sintesis de voz IA multilingual — 10 voces de agente",
      freeQuota: "10,000 chars/mes gratis",
    },
    {
      name: "Deepgram (Speech-to-Text)",
      configured: !!process.env.DEEPGRAM_API_KEY,
      envVars: ["DEEPGRAM_API_KEY"],
      usedBy: ["Voice input en chat y WhatsApp"],
      tier: "ai",
      description: "Transcripcion de audio a texto (Nova-2)",
      freeQuota: "$200 creditos gratis",
    },
    {
      name: "Stability AI (Imagenes)",
      configured: !!process.env.STABILITY_API_KEY,
      envVars: ["STABILITY_API_KEY"],
      usedBy: ["Marketing", "Web", "CEO"],
      tier: "ai",
      description: "Generacion de imagenes con Stable Diffusion XL",
      freeQuota: "Gratis <$1M revenue, luego ~$0.04/img",
    },
    {
      name: "Google Cloud Vision (OCR)",
      configured: !!process.env.GOOGLE_CLOUD_VISION_KEY,
      envVars: ["GOOGLE_CLOUD_VISION_KEY"],
      usedBy: ["Fiscal", "Energia", "Web"],
      tier: "ai",
      description: "OCR para facturas, documentos escaneados",
      freeQuota: "1,000 unidades/mes gratis",
    },

    // ── Search ──
    {
      name: "Google Custom Search",
      configured: !!(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX),
      envVars: ["GOOGLE_SEARCH_API_KEY", "GOOGLE_SEARCH_CX"],
      usedBy: ["Todos los agentes (busqueda web)"],
      tier: "search",
      description: "Busqueda web via Google — BOE, AEAT, empresas, noticias",
      freeQuota: "100 consultas/dia gratis",
    },

    // ── Storage & Auth ──
    {
      name: "Google OAuth (Gmail/Calendar/Drive/Tasks)",
      configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      usedBy: ["Email", "Calendar", "Fiscal (Drive)", "CRM"],
      tier: "storage",
      description: "Acceso a Gmail multi-cuenta, Calendar, Drive, Tasks",
    },
    {
      name: "PostgreSQL + pgvector",
      configured: !!process.env.DATABASE_URL,
      envVars: ["DATABASE_URL"],
      usedBy: ["Todos — memoria, facturas, emails, contactos"],
      tier: "storage",
      description: "Base de datos principal con busqueda semantica vectorial",
    },
    {
      name: "NextAuth",
      configured: !!process.env.NEXTAUTH_SECRET,
      envVars: ["NEXTAUTH_SECRET", "NEXTAUTH_URL"],
      usedBy: ["Autenticacion"],
      tier: "storage",
      description: "Autenticacion de usuarios",
    },
  ];

  // Summary
  const total = apis.length;
  const connected = apis.filter((a) => a.configured).length;
  const missing = apis.filter((a) => !a.configured);

  return NextResponse.json({
    summary: {
      total,
      connected,
      disconnected: total - connected,
      healthPercent: Math.round((connected / total) * 100),
    },
    apis: apis.map((a) => ({
      name: a.name,
      configured: a.configured,
      tier: a.tier,
      usedBy: a.usedBy,
      description: a.description,
      freeQuota: a.freeQuota,
      missingEnvVars: a.configured ? [] : a.envVars,
    })),
    missingApis: missing.map((a) => ({
      name: a.name,
      envVars: a.envVars,
      impact: a.usedBy,
    })),
    model: process.env.GPT5_MODEL || "gpt-4o",
    timestamp: new Date().toISOString(),
  });
}
