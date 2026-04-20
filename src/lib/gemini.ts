import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import {
  SYSTEM_PROMPT_CATEGORIZE,
  SYSTEM_PROMPT_SUMMARIZE,
  SYSTEM_PROMPT_DRAFT,
  SYSTEM_PROMPT_INVOICE,
  SYSTEM_PROMPT_REPORT,
  SYSTEM_PROMPT_CHAT,
  buildPrompt,
} from "./prompts";
import { logger, logError } from "./logger";

const geminiLog = logger.child({ component: "gemini" });

// ═══════════════════════════════════════════════════════════
// SINERGIA MAIL — CLIENTE GEMINI SINGLETON
// ═══════════════════════════════════════════════════════════

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Modelo único: gemini-2.5-flash (gemini-2.0-flash deprecated 404)
const flashModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const proModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ═══════ RATE LIMITING ═══════

interface RateLimitState {
  requests: number[];
  maxPerMinute: number;
}

const rateLimiter: RateLimitState = {
  requests: [],
  maxPerMinute: 60, // Gemini pay-as-you-go: 1000/min, free: 15/min
};

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  rateLimiter.requests = rateLimiter.requests.filter(
    (t) => now - t < 60_000
  );

  if (rateLimiter.requests.length >= rateLimiter.maxPerMinute) {
    const oldestInWindow = rateLimiter.requests[0];
    const waitMs = 60_000 - (now - oldestInWindow) + 100;
    await new Promise((r) => setTimeout(r, waitMs));
  }

  rateLimiter.requests.push(Date.now());
}

// ═══════ RETRY CON BACKOFF EXPONENCIAL ═══════

async function callGemini(
  model: GenerativeModel,
  systemPrompt: string,
  userMessage: string,
  maxRetries = 3,
  jsonMode = false
): Promise<string> {
  await waitForRateLimit();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const genConfig: Record<string, unknown> = {
        temperature: 0.2,
        maxOutputTokens: 2048,
      };
      if (jsonMode) {
        genConfig.responseMimeType = "application/json";
      }

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        systemInstruction: { role: "model", parts: [{ text: systemPrompt }] },
        generationConfig: genConfig,
      });

      const response = result.response;
      return response.text();
    } catch (error: unknown) {
      const isRateLimit =
        error instanceof Error &&
        (error.message.includes("429") ||
          error.message.includes("RESOURCE_EXHAUSTED"));

      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (attempt === maxRetries - 1) {
        throw error;
      }
    }
  }

  throw new Error("Gemini: max retries exceeded");
}

// ═══════ JSON PARSER SEGURO ═══════

function parseJsonResponse<T>(text: string): T {
  // Limpiar markdown code blocks si Gemini los añade
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // Buscar el JSON en el texto
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Gemini response");
  }

  return JSON.parse(jsonMatch[0]) as T;
}

// ═══════════════════════════════════════════════════════════
// FUNCIONES PÚBLICAS DEL AGENTE
// ═══════════════════════════════════════════════════════════

// ─── CATEGORIZACIÓN ───

export type EmailCategory =
  | "FACTURA"
  | "CLIENTE"
  | "PROVEEDOR"
  | "MARKETING"
  | "NOTIFICACION"
  | "LEGAL"
  | "RRHH"
  | "SPAM"
  | "PERSONAL"
  | "OTRO";

export type EmailPriority = "ALTA" | "MEDIA" | "BAJA";

export interface CategorizeResult {
  category: EmailCategory;
  priority: EmailPriority;
  confidence: number;
  reason: string;
}

export async function categorizeEmail(
  fromName: string,
  fromEmail: string,
  subject: string,
  snippet: string,
  body?: string
): Promise<CategorizeResult> {
  const truncatedBody = body ? body.slice(0, 2000) : "";

  const userMessage = `De: ${fromName} <${fromEmail}>
Asunto: ${subject}
Extracto: ${snippet}
${truncatedBody ? `Cuerpo (primeros 2000 chars): ${truncatedBody}` : ""}`;

  try {
    const text = await callGemini(
      flashModel,
      SYSTEM_PROMPT_CATEGORIZE,
      userMessage,
      3,
      true // JSON mode
    );
    const parsed = parseJsonResponse<CategorizeResult>(text);
    // Validate required fields
    if (!parsed.category || !parsed.priority) {
      throw new Error(`Invalid response: ${text.slice(0, 200)}`);
    }
    return parsed;
  } catch (err) {
    logError(geminiLog, err, { op: "categorize" }, "categorize failed");
    return {
      category: "OTRO",
      priority: "MEDIA",
      confidence: 0,
      reason: `Error: ${err instanceof Error ? err.message : "unknown"}`.slice(0, 200),
    };
  }
}

// ─── RESUMEN ───

export interface SummarizeResult {
  summary: string;
  keyPoints: string[];
  sentiment: "positivo" | "neutro" | "negativo";
  actionRequired: boolean;
  actionDescription: string | null;
}

export async function summarizeEmail(
  subject: string,
  from: string,
  body: string
): Promise<SummarizeResult> {
  const userMessage = `De: ${from}
Asunto: ${subject}
Cuerpo: ${body.slice(0, 4000)}`;

  try {
    const text = await callGemini(
      flashModel,
      SYSTEM_PROMPT_SUMMARIZE,
      userMessage,
      3,
      true
    );
    return parseJsonResponse<SummarizeResult>(text);
  } catch {
    return {
      summary: "No se pudo generar resumen",
      keyPoints: [],
      sentiment: "neutro",
      actionRequired: false,
      actionDescription: null,
    };
  }
}

// ─── BORRADOR DE RESPUESTA ───

export interface DraftResult {
  subject: string;
  body: string;
  signoff: string;
}

export async function generateDraft(
  originalEmail: { from: string; subject: string; body: string; category?: string },
  tone: string = "profesional",
  instructions: string = ""
): Promise<DraftResult> {
  const systemPrompt = buildPrompt(SYSTEM_PROMPT_DRAFT, {
    tone,
    instructions: instructions || "ninguna instrucción adicional",
  });

  const userMessage = `Email original:
De: ${originalEmail.from}
Asunto: ${originalEmail.subject}
Categoría: ${originalEmail.category || "desconocida"}
Cuerpo: ${originalEmail.body.slice(0, 3000)}`;

  try {
    const text = await callGemini(proModel, systemPrompt, userMessage);
    return parseJsonResponse<DraftResult>(text);
  } catch {
    return {
      subject: `Re: ${originalEmail.subject}`,
      body: "No se pudo generar el borrador automáticamente.",
      signoff: "Un saludo",
    };
  }
}

// ─── EXTRACCIÓN DE FACTURA ───

export interface InvoiceExtractResult {
  invoiceNumber: string | null;
  issuerName: string | null;
  issuerNif: string | null;
  recipientName: string | null;
  recipientNif: string | null;
  concept: string | null;
  amount: number | null;
  tax: number | null;
  totalAmount: number | null;
  currency: string;
  invoiceDate: string | null;
  dueDate: string | null;
  category: string | null;
  lineItems: Array<{ description: string; amount: number }>;
}

export async function extractInvoiceData(
  emailBody: string,
  pdfText?: string
): Promise<InvoiceExtractResult> {
  const content = pdfText || emailBody;
  const userMessage = `Texto de la factura:\n${content.slice(0, 8000)}`;

  try {
    const text = await callGemini(
      flashModel,
      SYSTEM_PROMPT_INVOICE,
      userMessage,
      3,
      true
    );
    return parseJsonResponse<InvoiceExtractResult>(text);
  } catch {
    return {
      invoiceNumber: null,
      issuerName: null,
      issuerNif: null,
      recipientName: null,
      recipientNif: null,
      concept: null,
      amount: null,
      tax: null,
      totalAmount: null,
      currency: "EUR",
      invoiceDate: null,
      dueDate: null,
      category: "OTROS",
      lineItems: [],
    };
  }
}

// ─── EXTRACCIÓN DE FACTURA DESDE PDF BUFFER ───

export async function extractInvoiceFromPdf(
  pdfBuffer: Buffer
): Promise<InvoiceExtractResult & { rawText: string }> {
  // Importación dinámica para evitar problemas de bundling
  const pdfParse = (await import("pdf-parse")).default;
  const pdfData = await pdfParse(pdfBuffer);
  const rawText = pdfData.text.slice(0, 8000);

  const result = await extractInvoiceData("", rawText);
  return { ...result, rawText };
}

// ─── VISIÓN: EXTRACCIÓN DESDE IMAGEN ───

export interface PhotoInvoiceResult {
  issuerName: string | null;
  issuerNif: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // YYYY-MM-DD
  dueDate: string | null;
  subtotal: number | null;
  tax: number | null;
  totalAmount: number | null;
  currency: string;
  category: string | null;
  concept: string | null;
  confidence: number; // 0-100
}

export interface PhotoClientResult {
  name: string | null;
  nif: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  company: string | null;
  confidence: number;
}

export interface PhotoSearchResult {
  text: string;
  entities: {
    issuers: string[];
    invoiceNumbers: string[];
    nifs: string[];
    amounts: number[];
    dates: string[];
  };
}

const VISION_PROMPTS = {
  invoice: `Eres un experto extractor de datos fiscales españoles desde imágenes de facturas.

Extrae los siguientes campos de la imagen (puede ser foto de papel, captura de PDF, ticket o factura electrónica):

- issuerName: nombre comercial del emisor (quien factura)
- issuerNif: CIF/NIF español del emisor (formato A12345678 / B12345678 / 12345678X)
- invoiceNumber: número de factura
- invoiceDate: fecha de emisión (YYYY-MM-DD)
- dueDate: fecha de vencimiento si aparece (YYYY-MM-DD), null si no
- subtotal: base imponible (sin IVA)
- tax: importe del IVA
- totalAmount: importe total con IVA
- currency: divisa (EUR por defecto en España)
- category: una de [ELECTRICIDAD, GAS, AGUA, TELECOMUNICACIONES, COMBUSTIBLE, SUSCRIPCION_TECH, OFICINA, ALIMENTACION, RESTAURACION, ALOJAMIENTO, TRANSPORTE, PROFESIONAL, MATERIAL, OTROS]
- concept: descripción breve del servicio/producto (max 120 chars)
- confidence: 0-100 según claridad de la imagen y certeza de los datos

Si un campo no se ve claramente, devuelve null. Si la imagen NO es una factura, devuelve confidence: 0 y todos los campos null.

Responde SOLO con JSON válido, sin markdown.`,

  client: `Eres un extractor de datos de contacto desde imágenes (tarjetas de visita, facturas previas, sellos de empresa).

Extrae estos campos:
- name: nombre completo persona / razón social
- nif: NIF/CIF/DNI español si aparece
- email: correo
- phone: teléfono (formato internacional si está completo)
- address: dirección postal
- company: empresa si name es persona
- confidence: 0-100

Devuelve null en cada campo no detectado. SOLO JSON válido, sin markdown.`,

  search: `Eres un OCR semántico para imágenes de documentos comerciales.

Analiza la imagen y devuelve:
- text: texto OCR completo (max 2000 chars, limpia espacios redundantes)
- entities.issuers: array de nombres de empresas/emisores que aparezcan
- entities.invoiceNumbers: array de números que parezcan ser de factura
- entities.nifs: array de NIFs/CIFs detectados
- entities.amounts: array de importes numéricos detectados (sin €)
- entities.dates: array de fechas en formato YYYY-MM-DD

SOLO JSON válido sin markdown.`,
} as const;

/**
 * Extract structured data from an image using Gemini Vision.
 * @param imageBuffer JPEG/PNG buffer
 * @param mode 'invoice' | 'client' | 'search'
 */
export async function extractFromImage<T = unknown>(
  imageBuffer: Buffer,
  mode: keyof typeof VISION_PROMPTS,
  mimeType: string = "image/jpeg",
): Promise<T> {
  await waitForRateLimit();

  const visionModel = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt = VISION_PROMPTS[mode];
  const imagePart = {
    inlineData: {
      data: imageBuffer.toString("base64"),
      mimeType,
    },
  };

  const result = await visionModel.generateContent([prompt, imagePart]);
  const text = result.response.text();
  return parseJsonResponse<T>(text);
}

// ─── INFORME SEMANAL ───
// NOTE: This generateWeeklyReport() generates an AI-powered weekly email digest
// from email statistics via Gemini. Not to be confused with
// generateWeeklyStatusReport() in src/lib/agent/self-improve.ts, which generates
// a plain-text agent performance/improvement report from DB data.

export interface WeeklyReportResult {
  report: string; // Markdown
  highlights: string[];
}

export async function generateWeeklyReport(
  stats: {
    totalEmails: number;
    byCategory: Array<{ category: string; count: number }>;
    byPriority: Array<{ priority: string; count: number }>;
    topSenders: Array<{ name: string; email: string; count: number }>;
    pendingInvoices: number;
    totalInvoiced: number;
    unanswered: number;
  }
): Promise<WeeklyReportResult> {
  const userMessage = `Estadísticas de la última semana:

Emails totales: ${stats.totalEmails}
Por categoría: ${JSON.stringify(stats.byCategory)}
Por prioridad: ${JSON.stringify(stats.byPriority)}
Top remitentes: ${JSON.stringify(stats.topSenders)}
Facturas pendientes de procesar: ${stats.pendingInvoices}
Total facturado: ${stats.totalInvoiced}€
Emails sin responder: ${stats.unanswered}`;

  try {
    const text = await callGemini(
      proModel,
      SYSTEM_PROMPT_REPORT,
      userMessage
    );
    return {
      report: text,
      highlights: [],
    };
  } catch {
    return {
      report: "No se pudo generar el informe semanal.",
      highlights: [],
    };
  }
}

// ─── CHAT CONVERSACIONAL ───

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export async function chat(
  messages: ChatMessage[],
  context: string = ""
): Promise<string> {
  const contextPrefix = context
    ? `[Contexto del usuario: ${context}]\n\n`
    : "";

  // Construir historial para Gemini
  const lastMessage = messages[messages.length - 1];
  const historyMessages = messages.slice(0, -1);

  const chatSession = proModel.startChat({
    history: historyMessages.map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    })),
    systemInstruction: {
      role: "model",
      parts: [{ text: SYSTEM_PROMPT_CHAT }],
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  });

  try {
    const result = await chatSession.sendMessage(
      contextPrefix + lastMessage.content
    );
    return result.response.text();
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logError(geminiLog, error, { op: "chat" }, "chat failed");
    return `[Error del agente]: ${errMsg}`;
  }
}

// ─── AUTO-RESPUESTA (compatibilidad con api/drafts) ───

export async function generateAutoResponse(
  fromName: string,
  subject: string,
  body: string,
  category: EmailCategory
): Promise<string | null> {
  const autoRespondCategories: EmailCategory[] = [
    "CLIENTE",
    "PROVEEDOR",
    "FACTURA",
  ];
  if (!autoRespondCategories.includes(category)) return null;

  const result = await generateDraft(
    {
      from: fromName,
      subject,
      body,
      category,
    },
    "profesional"
  );

  return result.body || null;
}

// ─── BATCH CATEGORIZACIÓN ───

export async function categorizeEmailBatch(
  emails: Array<{
    id: string;
    fromName: string;
    fromEmail: string;
    subject: string;
    snippet: string;
    body: string;
  }>
): Promise<Map<string, CategorizeResult>> {
  const results = new Map<string, CategorizeResult>();

  // Procesar en chunks de 5 con pausa entre chunks
  const chunks: typeof emails[] = [];
  for (let i = 0; i < emails.length; i += 5) {
    chunks.push(emails.slice(i, i + 5));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (email) => {
      const result = await categorizeEmail(
        email.fromName,
        email.fromEmail,
        email.subject,
        email.snippet,
        email.body
      );
      results.set(email.id, result);
    });
    await Promise.all(promises);
    // Pausa entre chunks para rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  return results;
}
