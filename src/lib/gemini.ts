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

// ═══════════════════════════════════════════════════════════
// SINERGIA MAIL — CLIENTE GEMINI SINGLETON
// ═══════════════════════════════════════════════════════════

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Modelos: flash para tareas rápidas, pro para tareas complejas
const flashModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
const proModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

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
  maxRetries = 3
): Promise<string> {
  await waitForRateLimit();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        systemInstruction: { role: "model", parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
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
      userMessage
    );
    return parseJsonResponse<CategorizeResult>(text);
  } catch {
    return {
      category: "OTRO",
      priority: "MEDIA",
      confidence: 0,
      reason: "Error en Gemini — categorización por defecto",
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
      userMessage
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
      userMessage
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

// ─── INFORME SEMANAL ───

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
    console.error("[Gemini Chat Error]:", errMsg);
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
