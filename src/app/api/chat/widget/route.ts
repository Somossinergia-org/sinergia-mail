import { NextRequest, NextResponse } from "next/server";
import { logger, logError } from "@/lib/logger";


const log = logger.child({ route: "/api/chat/widget" });


const ipBuckets = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 20;


function checkIpRate(ip: string): boolean {
  const now = Date.now();
  const bucket = ipBuckets.get(ip) || [];
  const filtered = bucket.filter((t) => t > now - RATE_LIMIT_WINDOW);
  if (filtered.length >= RATE_LIMIT_MAX) { ipBuckets.set(ip, filtered); return false; }
  filtered.push(now); ipBuckets.set(ip, filtered); return true;
}


setInterval(() => { const now = Date.now(); ipBuckets.forEach((ts, ip) => { const a = ts.filter(t => t > now - RATE_LIMIT_WINDOW); if (!a.length) ipBuckets.delete(ip); else ipBuckets.set(ip, a); }); }, 300_000);


const CORS_HEADERS = { "Access-Control-Allow-Origin": "https://somossinergia.es", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" };


export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS_HEADERS }); }


const SYSTEM_PROMPT = `Eres la Recepcionista Virtual de Somos Sinergia, empresa de servicios integrales en Orihuela, Alicante.
Profesional, cercana, siempre en espanol. Respuestas cortas (max 3-4 frases). Max 1-2 emojis.
SERVICIOS: 1. Energia (luz/gas, ahorro 40%) 2. Telefonia/Internet (fibra 10Gbps) 3. Seguros 4. IA (10 agentes) 5. Marketing 6. Consultoria Digital 7. Facturacion 8. RGPD
Contacto: 966 741 545 | info@somossinergia.es | WhatsApp 623 445 324 | L-V 9-20
- Precios: "Cada caso es unico, te preparamos estudio gratuito. Dejme tu telefono o email"
- Contratar: "Perfecto, llama al 966 741 545 o deja tus datos"
- Nunca inventes. Capta datos de contacto siempre.`;


export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (!checkIpRate(ip)) return NextResponse.json({ error: "Demasiadas solicitudes. Intenta en un minuto." }, { status: 429, headers: CORS_HEADERS });
  try {
    const { messages } = await req.json();
