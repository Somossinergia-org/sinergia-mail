/**
 * Legal & RGPD Tools — Análisis de contratos para Sinergia
 *
 * Conjunto de tools para el agente legal-rgpd. Usa GPT-4o vía gpt5/client.ts
 * para extracción estructurada de información legal de contratos en castellano.
 *
 * Tools (Paso 1 — análisis sin persistencia):
 *   - legal_analyze_contract  → estructura completa + riskScore + redFlags
 *   - legal_check_clauses     → verificar cláusulas concretas presentes/ausentes
 *   - legal_compare_contracts → diff entre dos versiones con impacto evaluado
 *
 * Tools (Paso 2 — persistencia):
 *   - legal_save_contract           → analiza + guarda en tabla contracts
 *   - legal_list_contracts          → lista con filtros (empresa, estado, vencimiento)
 *   - legal_get_contract            → ficha completa por id
 *   - legal_update_contract_status  → cambia estado (workflow draft→signed→active→...)
 *
 * Próximo paso (no incluido aquí):
 *   - generadores: legal_generate_nda, legal_generate_dpa, legal_generate_service_contract
 *   - compliance: legal_lopdgdd_check, legal_dsr_handler, legal_cookie_audit_wp
 */

import type { ToolHandlerResult } from "./tools";
import type { SuperToolDefinition } from "./super-tools";
import { chatCompletion } from "@/lib/gpt5/client";
import { logger, logError } from "@/lib/logger";
import { db, schema } from "@/db";
import { eq, and, desc, lte, gte, ilike } from "drizzle-orm";

const log = logger.child({ component: "legal-tools" });

// ─── Helpers ──────────────────────────────────────────────────────────────

function stripJsonFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

// ─── Tool: legal_analyze_contract ─────────────────────────────────────────

const ANALYSIS_PROMPT = `Eres analista legal experto en contratos españoles (Código Civil, Código de Comercio, Estatuto de los Trabajadores, RGPD UE 2016/679, LOPDGDD 3/2018, LSSI-CE 34/2002).

Analiza el contrato y devuelve EXCLUSIVAMENTE un JSON con esta estructura:

{
  "type": "cliente" | "proveedor" | "nda" | "laboral" | "arrendamiento" | "dpa_rgpd" | "servicios" | "compraventa" | "licencia" | "otro",
  "parties": [{"name": "string", "role": "string (ej: prestador, cliente, arrendador)", "id": "NIF/CIF si aparece"}],
  "subject": "objeto del contrato en una frase",
  "term": {"startDate": "YYYY-MM-DD si aparece", "endDate": "YYYY-MM-DD si aparece", "duration": "ej: 12 meses, indefinido"},
  "autoRenewal": {"present": true/false, "noticeRequired": "ej: 30 dias antes", "renewalPeriod": "ej: anual"},
  "value": {"amount": number_si_aparece, "currency": "EUR", "paymentTerms": "ej: mensual, 30 dias fecha factura"},
  "jurisdiction": "juzgados de X / arbitraje / mediacion",
  "applicableLaw": "espanol u otro",
  "terminationClauses": ["clausula 1", "clausula 2"],
  "penalties": ["penalizacion 1"],
  "confidentiality": {"present": true/false, "duration": "ej: 5 anos"},
  "dataProtection": {"present": true/false, "isDPA": true/false, "complianceLevel": "completo" | "parcial" | "ausente"},
  "missingClauses": ["clausulas estandar que faltan"],
  "redFlags": [
    {"severity": "critico" | "alto" | "medio" | "bajo", "issue": "descripcion", "clause": "referencia opcional", "recommendation": "que hacer"}
  ],
  "summary": "3-5 frases en castellano resumiendo el contrato",
  "riskScore": 0_a_100,
  "readyToSign": true/false,
  "actionItems": ["cambio o aclaracion a pedir antes de firmar"]
}

REGLAS DE EVALUACIÓN:
- riskScore: 0-20 estándar limpio, 20-40 menor, 40-60 medio (revisar), 60-80 alto (renegociar), 80-100 crítico (NO firmar).
- readyToSign = true SOLO si riskScore < 30 y no hay ningún redFlag "critico" o "alto".
- redFlags típicos: cláusulas abusivas; jurisdicción desfavorable; penalizaciones desproporcionadas; ausencia de cláusula RGPD si trata datos personales; auto-renovación sin preaviso razonable; transferencias internacionales sin garantías; cesión unilateral sin consentimiento; limitación de responsabilidad excesiva; obligaciones unilaterales.
- Si el texto NO parece un contrato, devuelve {"error": "El texto no parece ser un contrato", "type": "no_contrato"}.
- Si falta info, OMITE el campo. NO inventes.
- Castellano. Tono conservador. Sin formato comercial.
- Devuelve SOLO el JSON, sin texto adicional ni markdown.`;

export async function legalAnalyzeContractHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const text = (args.text as string)?.trim();
  if (!text || text.length < 200) {
    return { ok: false, error: "Texto vacío o demasiado corto (mínimo 200 caracteres)" };
  }
  if (text.length > 100000) {
    return { ok: false, error: "Texto demasiado largo (máximo 100.000 caracteres). Resume o trocea." };
  }

  try {
    const result = await chatCompletion({
      messages: [{ role: "user", content: text }],
      systemPrompt: ANALYSIS_PROMPT,
      temperature: 0.2,
      maxTokens: 3500,
      userId,
    });

    const raw = result.message.content || "{}";
    const jsonStr = stripJsonFences(raw);
    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(jsonStr);
    } catch {
      log.warn({ rawPreview: raw.slice(0, 300), userId }, "legal_analyze_contract: invalid JSON from model");
      return {
        ok: false,
        error: "El modelo devolvió un JSON inválido. Intenta de nuevo o reduce el tamaño del texto.",
        rawResponse: raw.slice(0, 1000),
      };
    }

    log.info({ userId, type: analysis.type, riskScore: analysis.riskScore, tokens: result.usage.totalTokens }, "contract analyzed");
    return {
      ok: true,
      analysis,
      meta: { tokensUsed: result.usage.totalTokens, durationMs: result.durationMs, model: result.model },
    };
  } catch (err) {
    logError(log, err, { userId, textLen: text.length }, "legal_analyze_contract failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Tool: legal_check_clauses ────────────────────────────────────────────

const CLAUSES_PROMPT = `Eres revisor legal. Dado el texto de un contrato y una lista de cláusulas requeridas, devuelve EXCLUSIVAMENTE un JSON:

{
  "clauses": [
    {
      "name": "nombre de la clausula",
      "present": true/false,
      "completeness": "completo" | "parcial" | "ausente",
      "extract": "texto literal relevante (max 250 chars) si present=true",
      "location": "parrafo o seccion aproximada",
      "notes": "observaciones (ej: 'falta especificar plazo', 'redaccion ambigua')"
    }
  ],
  "missingCritical": ["nombres de clausulas criticas ausentes"],
  "summary": "una frase resumen del estado de las clausulas pedidas"
}

Devuelve SOLO el JSON, sin markdown.`;

export async function legalCheckClausesHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const text = (args.text as string)?.trim();
  const requiredClauses = args.required_clauses as string[];

  if (!text || text.length < 100) return { ok: false, error: "Texto del contrato vacío o muy corto" };
  if (!Array.isArray(requiredClauses) || requiredClauses.length === 0) {
    return { ok: false, error: "required_clauses debe ser un array no vacío de nombres de cláusulas" };
  }
  if (requiredClauses.length > 30) {
    return { ok: false, error: "Demasiadas cláusulas (máx 30 por llamada)" };
  }

  try {
    const result = await chatCompletion({
      messages: [{
        role: "user",
        content: `CONTRATO:\n\n${text}\n\nCLÁUSULAS A VERIFICAR:\n${requiredClauses.map((c) => `- ${c}`).join("\n")}`,
      }],
      systemPrompt: CLAUSES_PROMPT,
      temperature: 0.2,
      maxTokens: 2500,
      userId,
    });

    const raw = result.message.content || "{}";
    const jsonStr = stripJsonFences(raw);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return { ok: false, error: "JSON inválido del modelo", rawResponse: raw.slice(0, 800) };
    }

    return {
      ok: true,
      ...parsed,
      meta: { tokensUsed: result.usage.totalTokens, durationMs: result.durationMs },
    };
  } catch (err) {
    logError(log, err, { userId }, "legal_check_clauses failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Tool: legal_compare_contracts ────────────────────────────────────────

const COMPARE_PROMPT = `Eres revisor legal experto. Recibes dos versiones de un contrato (ORIGINAL y REVISADO) y devuelves EXCLUSIVAMENTE un JSON con las diferencias materiales (no cambios de redacción cosmética):

{
  "changes": [
    {
      "type": "added" | "removed" | "modified",
      "section": "nombre o referencia de la seccion",
      "before": "texto original (max 350 chars) si type=removed o modified",
      "after": "texto nuevo (max 350 chars) si type=added o modified",
      "impact": "favorable" | "desfavorable" | "neutro",
      "explanation": "por que es favorable/desfavorable, con argumento legal"
    }
  ],
  "overallImpact": "favorable" | "desfavorable" | "neutro" | "mixto",
  "criticalChanges": ["lista de cambios criticos que requieren rechazo o renegociacion"],
  "summary": "3-5 frases resumiendo el impacto global"
}

CRITERIOS DE IMPACTO (evalúa SIEMPRE desde la perspectiva del usuario que pide el análisis, no del contraparte):
- DESFAVORABLE: penalizaciones aumentadas, plazos reducidos para nosotros, jurisdicción cambiada en contra, garantías reducidas, RGPD debilitada, responsabilidad ampliada, cláusulas de exclusividad nuevas, derechos de cesión unilateral añadidos.
- FAVORABLE: lo opuesto.
- NEUTRO: cambios de redacción sin impacto material, correcciones tipográficas, actualizaciones de fechas/precios consensuadas.

Devuelve SOLO el JSON.`;

export async function legalCompareContractsHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const original = (args.original as string)?.trim();
  const revised = (args.revised as string)?.trim();

  if (!original || !revised) return { ok: false, error: "Ambos textos (original, revised) son requeridos" };
  if (original.length + revised.length > 80000) {
    return { ok: false, error: "Textos combinados muy largos (máx 80k). Compara por secciones." };
  }

  try {
    const result = await chatCompletion({
      messages: [{
        role: "user",
        content: `=== ORIGINAL ===\n\n${original}\n\n=== REVISADO ===\n\n${revised}`,
      }],
      systemPrompt: COMPARE_PROMPT,
      temperature: 0.2,
      maxTokens: 3500,
      userId,
    });

    const raw = result.message.content || "{}";
    const jsonStr = stripJsonFences(raw);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return { ok: false, error: "JSON inválido del modelo", rawResponse: raw.slice(0, 800) };
    }

    log.info({ userId, overallImpact: parsed.overallImpact, tokens: result.usage.totalTokens }, "contracts compared");
    return {
      ok: true,
      ...parsed,
      meta: { tokensUsed: result.usage.totalTokens, durationMs: result.durationMs },
    };
  } catch (err) {
    logError(log, err, { userId }, "legal_compare_contracts failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Tool: legal_save_contract ────────────────────────────────────────────

interface AnalysisShape {
  type?: string;
  parties?: Array<{ name: string; role?: string; id?: string }>;
  subject?: string;
  term?: { startDate?: string; endDate?: string; duration?: string };
  autoRenewal?: { present?: boolean; noticeRequired?: string; renewalPeriod?: string };
  value?: { amount?: number; currency?: string; paymentTerms?: string };
  jurisdiction?: string;
  applicableLaw?: string;
  missingClauses?: string[];
  redFlags?: Array<{ severity: string; issue: string; clause?: string; recommendation?: string }>;
  summary?: string;
  riskScore?: number;
  readyToSign?: boolean;
}

function parseDate(d: string | undefined | null): Date | null {
  if (!d) return null;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function parseNoticeDays(notice: string | undefined): number | null {
  if (!notice) return null;
  const m = notice.match(/(\d+)\s*d[ií]as/i) || notice.match(/(\d+)\s*days/i);
  return m ? parseInt(m[1], 10) : null;
}

export async function legalSaveContractHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const text = (args.text as string)?.trim();
  const title = (args.title as string)?.trim();
  if (!text || text.length < 100) return { ok: false, error: "Texto del contrato vacío o muy corto" };
  if (!title) return { ok: false, error: "title es obligatorio (ej: 'Contrato gestión energética COMERCIAL VALENCIANA SA')" };

  const companyId = args.company_id ? Number(args.company_id) : null;
  const contactId = args.contact_id ? Number(args.contact_id) : null;
  const status = (args.status as string) || "draft";
  const type = args.type as string | undefined;
  const reference = args.reference as string | undefined;
  const skipAnalysis = args.skip_analysis === true;

  if (companyId !== null) {
    const company = await db.query.companies.findFirst({ where: eq(schema.companies.id, companyId) });
    if (!company || company.userId !== userId) {
      return { ok: false, error: `Empresa ${companyId} no encontrada o no pertenece al usuario` };
    }
  }

  let analysis: AnalysisShape | null = null;
  let analyzedAt: Date | null = null;
  if (!skipAnalysis) {
    const analysisResult = await legalAnalyzeContractHandler(userId, { text });
    if (!analysisResult.ok) {
      log.warn({ userId, err: analysisResult.error }, "save_contract: análisis falló, guardando sin análisis");
    } else {
      analysis = (analysisResult as unknown as { analysis: AnalysisShape }).analysis;
      analyzedAt = new Date();
    }
  }

  try {
    const inserted = await db.insert(schema.contracts).values({
      userId,
      companyId,
      contactId,
      title,
      type: type ?? analysis?.type ?? null,
      reference: reference ?? null,
      originalText: text,
      originalFilename: (args.original_filename as string) ?? null,
      originalUrl: (args.original_url as string) ?? null,
      parties: analysis?.parties ?? null,
      startDate: parseDate(analysis?.term?.startDate),
      endDate: parseDate(analysis?.term?.endDate),
      duration: analysis?.term?.duration ?? null,
      autoRenewal: analysis?.autoRenewal?.present ?? null,
      noticeDays: parseNoticeDays(analysis?.autoRenewal?.noticeRequired),
      value: analysis?.value?.amount ?? null,
      currency: analysis?.value?.currency ?? "EUR",
      paymentTerms: analysis?.value?.paymentTerms ?? null,
      jurisdiction: analysis?.jurisdiction ?? null,
      applicableLaw: analysis?.applicableLaw ?? "espanol",
      analysis: analysis as Record<string, unknown> | null,
      riskScore: analysis?.riskScore ?? null,
      readyToSign: analysis?.readyToSign ?? null,
      redFlags: analysis?.redFlags ?? null,
      missingClauses: analysis?.missingClauses ?? null,
      summary: analysis?.summary ?? null,
      analyzedBy: analysis ? "legal-rgpd" : null,
      analyzedAt,
      status,
      createdBy: "legal-rgpd",
    }).returning({ id: schema.contracts.id });

    const id = inserted[0]?.id;
    log.info({ userId, contractId: id, riskScore: analysis?.riskScore, status }, "contract saved");
    return {
      ok: true,
      id,
      status,
      analyzed: analysis !== null,
      riskScore: analysis?.riskScore ?? null,
      readyToSign: analysis?.readyToSign ?? null,
      redFlagsCount: analysis?.redFlags?.length ?? 0,
      summary: analysis?.summary ?? null,
    };
  } catch (err) {
    logError(log, err, { userId, title }, "legal_save_contract failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Tool: legal_list_contracts ───────────────────────────────────────────

export async function legalListContractsHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const companyId = args.company_id ? Number(args.company_id) : null;
  const status = args.status as string | undefined;
  const type = args.type as string | undefined;
  const expiringWithinDays = args.expiring_within_days ? Number(args.expiring_within_days) : null;
  const search = (args.search as string)?.trim();
  const limit = Math.min(Number(args.limit) || 20, 100);

  try {
    const conds = [eq(schema.contracts.userId, userId)];
    if (companyId !== null) conds.push(eq(schema.contracts.companyId, companyId));
    if (status) conds.push(eq(schema.contracts.status, status));
    if (type) conds.push(eq(schema.contracts.type, type));
    if (expiringWithinDays !== null) {
      const horizon = new Date(Date.now() + expiringWithinDays * 86400_000);
      conds.push(lte(schema.contracts.endDate, horizon));
      conds.push(gte(schema.contracts.endDate, new Date()));
    }
    if (search) {
      conds.push(ilike(schema.contracts.title, `%${search}%`));
    }

    const rows = await db.query.contracts.findMany({
      where: and(...conds),
      orderBy: [desc(schema.contracts.updatedAt)],
      limit,
      columns: {
        id: true, title: true, type: true, status: true, companyId: true,
        startDate: true, endDate: true, value: true, currency: true,
        riskScore: true, readyToSign: true, signedDate: true,
        analyzedAt: true, updatedAt: true,
      },
    });

    return { ok: true, contracts: rows, count: rows.length };
  } catch (err) {
    logError(log, err, { userId }, "legal_list_contracts failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Tool: legal_get_contract ─────────────────────────────────────────────

export async function legalGetContractHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const id = Number(args.id);
  if (!id || isNaN(id)) return { ok: false, error: "id numérico requerido" };

  try {
    const contract = await db.query.contracts.findFirst({
      where: and(eq(schema.contracts.id, id), eq(schema.contracts.userId, userId)),
    });

    if (!contract) return { ok: false, error: `Contrato ${id} no encontrado` };
    return { ok: true, contract };
  } catch (err) {
    logError(log, err, { userId, id }, "legal_get_contract failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Tool: legal_update_contract_status ───────────────────────────────────

const VALID_STATUSES = ["draft", "under_review", "approved", "signed", "active", "expired", "cancelled"];

export async function legalUpdateContractStatusHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const id = Number(args.id);
  const newStatus = args.status as string;
  const notes = args.notes as string | undefined;
  const signedDate = args.signed_date as string | undefined;

  if (!id || isNaN(id)) return { ok: false, error: "id numérico requerido" };
  if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
    return { ok: false, error: `status inválido. Debe ser uno de: ${VALID_STATUSES.join(", ")}` };
  }

  try {
    const existing = await db.query.contracts.findFirst({
      where: and(eq(schema.contracts.id, id), eq(schema.contracts.userId, userId)),
      columns: { id: true, status: true, title: true, notes: true },
    });
    if (!existing) return { ok: false, error: `Contrato ${id} no encontrado` };

    const updates: Partial<typeof schema.contracts.$inferInsert> = {
      status: newStatus,
      updatedAt: new Date(),
    };
    if (newStatus === "signed") {
      updates.signedDate = signedDate ? (parseDate(signedDate) ?? new Date()) : new Date();
    }
    if (notes) {
      const audit = `[${new Date().toISOString().slice(0, 10)}] ${existing.status} → ${newStatus}: ${notes}`;
      updates.notes = existing.notes ? `${existing.notes}\n${audit}` : audit;
    }

    await db.update(schema.contracts).set(updates).where(eq(schema.contracts.id, id));

    log.info({ userId, id, from: existing.status, to: newStatus }, "contract status updated");
    return {
      ok: true,
      id,
      title: existing.title,
      previousStatus: existing.status,
      newStatus,
      signedDate: updates.signedDate ?? null,
    };
  } catch (err) {
    logError(log, err, { userId, id }, "legal_update_contract_status failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────

export const LEGAL_TOOLS: SuperToolDefinition[] = [
  {
    name: "legal_analyze_contract",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_analyze_contract",
        description:
          "Analiza un contrato (texto completo en castellano) y devuelve análisis legal estructurado: tipo de contrato, partes, plazo, valor, jurisdicción, cláusulas presentes/ausentes, red flags con severidad, riskScore 0-100 y readyToSign true/false. Soporta contratos de cliente, proveedor, NDA, laboral, arrendamiento, DPA RGPD, servicios, compraventa, licencia. Usar SIEMPRE antes de recomendar firmar un contrato.",
        parameters: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Texto completo del contrato (mínimo 200 caracteres, máximo 100.000). Si tienes un PDF/imagen, primero usa ocr_scan_document para extraer el texto.",
            },
          },
          required: ["text"],
        },
      },
    },
    handler: legalAnalyzeContractHandler,
  },
  {
    name: "legal_check_clauses",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_check_clauses",
        description:
          "Verifica si un contrato contiene cláusulas concretas. Devuelve por cada cláusula: presente/ausente, ubicación aproximada, extracto literal, completitud (completo/parcial/ausente) y notas. Más rápido y barato que legal_analyze_contract cuando solo necesitas comprobar puntos específicos. Ejemplos de cláusulas: 'protección de datos', 'jurisdicción', 'penalización por mora', 'fuerza mayor', 'confidencialidad', 'subrogación'.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Texto del contrato" },
            required_clauses: {
              type: "array",
              items: { type: "string" },
              description: "Lista de cláusulas a verificar (máx 30)",
            },
          },
          required: ["text", "required_clauses"],
        },
      },
    },
    handler: legalCheckClausesHandler,
  },
  {
    name: "legal_compare_contracts",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_compare_contracts",
        description:
          "Compara dos versiones de un contrato (original vs revisado por la otra parte) y devuelve cambios materiales con impacto evaluado: favorable, desfavorable o neutro. Útil cuando recibes un contrato modificado y necesitas entender qué cambió y si conviene aceptarlo. Ignora cambios cosméticos.",
        parameters: {
          type: "object",
          properties: {
            original: { type: "string", description: "Texto del contrato original" },
            revised: { type: "string", description: "Texto del contrato revisado por la otra parte" },
          },
          required: ["original", "revised"],
        },
      },
    },
    handler: legalCompareContractsHandler,
  },
  {
    name: "legal_save_contract",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_save_contract",
        description:
          "Guarda un contrato en la base de datos. Por defecto ANALIZA el contrato primero (usando el mismo análisis que legal_analyze_contract) y persiste todo: texto original, partes, plazo, valor, jurisdicción, riskScore, redFlags, missingClauses, summary. Vincula opcionalmente a una empresa del CRM (companyId) o contacto. Usa esto cuando el usuario diga 'guarda este contrato', 'archiva este contrato', 'añade este contrato al sistema', o cuando un contrato ya analizado deba quedar registrado para seguimiento.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Texto completo del contrato (mín 100 chars)" },
            title: { type: "string", description: "Título descriptivo del contrato (ej: 'Contrato gestión energética COMERCIAL VALENCIANA SA')" },
            company_id: { type: "number", description: "ID de empresa CRM a vincular (opcional)" },
            contact_id: { type: "number", description: "ID de contacto CRM a vincular (opcional)" },
            type: { type: "string", description: "Tipo de contrato (cliente, proveedor, nda, laboral, arrendamiento, dpa_rgpd, servicios, compraventa, licencia, otro). Si no se indica, se infiere del análisis." },
            reference: { type: "string", description: "Referencia externa (ej: número interno)" },
            status: { type: "string", description: "Estado inicial: draft (default), under_review, approved, signed, active" },
            original_filename: { type: "string", description: "Nombre del archivo origen si aplica" },
            original_url: { type: "string", description: "URL en Drive/storage si aplica" },
            skip_analysis: { type: "boolean", description: "Si true, NO analiza el contrato (sólo lo guarda crudo). Default false." },
          },
          required: ["text", "title"],
        },
      },
    },
    handler: legalSaveContractHandler,
  },
  {
    name: "legal_list_contracts",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_list_contracts",
        description:
          "Lista contratos guardados con filtros opcionales por empresa, estado, tipo, vencimiento próximo, o búsqueda por título. Útil para responder 'qué contratos tengo con X empresa', 'contratos que vencen este mes', 'contratos pendientes de firma', 'borradores de NDAs'. Devuelve lista resumida (sin texto completo).",
        parameters: {
          type: "object",
          properties: {
            company_id: { type: "number", description: "Filtrar por empresa" },
            status: { type: "string", description: "Filtrar por estado: draft, under_review, approved, signed, active, expired, cancelled" },
            type: { type: "string", description: "Filtrar por tipo: cliente, proveedor, nda, dpa_rgpd, etc" },
            expiring_within_days: { type: "number", description: "Solo contratos cuya endDate venza dentro de N días" },
            search: { type: "string", description: "Búsqueda por título (ILIKE)" },
            limit: { type: "number", description: "Máx resultados (default 20, máx 100)" },
          },
        },
      },
    },
    handler: legalListContractsHandler,
  },
  {
    name: "legal_get_contract",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_get_contract",
        description:
          "Devuelve la ficha completa de un contrato por id, incluyendo texto original y análisis legal completo. Usar cuando el usuario diga 'enséñame el contrato N', 'detalles del contrato N', o necesites el texto íntegro para re-analizar/comparar.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "number", description: "ID del contrato" },
          },
          required: ["id"],
        },
      },
    },
    handler: legalGetContractHandler,
  },
  {
    name: "legal_update_contract_status",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_update_contract_status",
        description:
          "Cambia el estado de un contrato y opcionalmente añade nota de auditoría. Workflow esperado: draft → under_review → approved → signed → active → expired/cancelled. Si el nuevo estado es 'signed', registra automáticamente la fecha de firma (si no se pasa explícita). Usar cuando el usuario confirme acciones del workflow ('contrato X firmado', 'archivar contrato Y', 'aprobar contrato Z').",
        parameters: {
          type: "object",
          properties: {
            id: { type: "number", description: "ID del contrato" },
            status: { type: "string", description: "Nuevo estado: draft, under_review, approved, signed, active, expired, cancelled" },
            notes: { type: "string", description: "Nota de auditoría (se anexa al campo notes con timestamp)" },
            signed_date: { type: "string", description: "Fecha de firma YYYY-MM-DD (solo si status=signed; default hoy)" },
          },
          required: ["id", "status"],
        },
      },
    },
    handler: legalUpdateContractStatusHandler,
  },
];
