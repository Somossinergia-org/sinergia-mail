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
 * Tools (Paso 3 — generadores plantillas, voz David, derecho español):
 *   - legal_generate_nda              → acuerdo de confidencialidad uni/bilateral
 *   - legal_generate_dpa              → DPA RGPD art. 28 (encargado del tratamiento)
 *   - legal_generate_service_contract → contrato de prestación de servicios B2B
 *   - legal_generate_supplier_contract → contrato de suministro/proveedor
 *
 * Tools (Paso 4 — compliance):
 *   - legal_lopdgdd_check  → checklist cumplimiento LOPDGDD 3/2018
 *   - legal_cookie_audit_wp → audita banner cookies en WP (scripts pre-consent)
 *
 * Próximo paso (no incluido aquí, requiere tabla nueva dsr_requests):
 *   - legal_dsr_create / legal_dsr_list / legal_dsr_resolve (gestión derechos titular)
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

// ─── Generadores de plantillas (Paso 3) ──────────────────────────────────

interface PartyArg {
  name: string;
  id?: string;        // NIF/CIF
  address?: string;
  representative?: string;
  role?: string;
}

function fmtParty(p: PartyArg, defaultRole = ""): string {
  const role = p.role || defaultRole;
  const id = p.id ? `, con ${p.id.startsWith("B") || p.id.startsWith("A") ? "CIF" : "NIF"} ${p.id}` : "";
  const addr = p.address ? `, domicilio en ${p.address}` : "";
  const rep = p.representative ? `, representad${role.toLowerCase().includes("empresa") || p.id?.match(/^[ABC]/) ? "a" : "o"} por ${p.representative}` : "";
  return `${p.name.toUpperCase()}${id}${addr}${rep}${role ? ` (en adelante, ${role.toUpperCase()})` : ""}`;
}

async function generateLegalTextHandler(
  userId: string,
  systemPrompt: string,
  userInput: string,
  toolName: string,
): Promise<ToolHandlerResult> {
  try {
    const result = await chatCompletion({
      messages: [{ role: "user", content: userInput }],
      systemPrompt,
      temperature: 0.3,
      maxTokens: 4000,
      userId,
    });
    const draft = (result.message.content || "").trim();
    if (draft.length < 200) {
      return { ok: false, error: "Generación incompleta o vacía" };
    }
    log.info({ userId, toolName, len: draft.length, tokens: result.usage.totalTokens }, "legal draft generated");
    return {
      ok: true,
      draft,
      meta: { tokensUsed: result.usage.totalTokens, durationMs: result.durationMs, model: result.model },
    };
  } catch (err) {
    logError(log, err, { userId, toolName }, "legal draft generation failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Tool: legal_generate_nda ─────────────────────────────────────────────

const NDA_PROMPT = `Eres redactor legal especializado en acuerdos de confidencialidad bajo derecho español (Código Civil, Código de Comercio, LO 1/2019 secretos empresariales).

Genera un Acuerdo de Confidencialidad (NDA) completo, formal y listo para firmar, en castellano. Estructura obligatoria:
- Encabezado (lugar, fecha)
- COMPARECEN
- EXPONEN (objeto del NDA)
- ESTIPULACIONES numeradas: Información Confidencial (definición y exclusiones), Obligaciones de la Parte Receptora, Plazo de Confidencialidad, Devolución/Destrucción al Finalizar, Penalización por Incumplimiento (si aplica), Excepciones (orden judicial), Ley Aplicable y Jurisdicción
- Cierre con líneas de firma

NORMAS:
- Terminología jurídica precisa española.
- Sin tono comercial. Conservador, equilibrado.
- Si type=unilateral: solo la PARTE RECEPTORA tiene obligaciones. Si bilateral: ambas partes.
- Plazo confidencialidad por defecto: 3 años post-finalización.
- Jurisdicción por defecto: juzgados y tribunales de Madrid.
- Devuelve SOLO el texto del contrato, sin explicaciones ni markdown.`;

export async function legalGenerateNdaHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const type = (args.type as string) || "bilateral";
  const discloser = args.discloser_party as PartyArg | undefined;
  const recipient = args.recipient_party as PartyArg | undefined;
  const purpose = args.purpose as string;
  if (!discloser?.name || !recipient?.name || !purpose) {
    return { ok: false, error: "discloser_party.name, recipient_party.name y purpose son obligatorios" };
  }
  const durationYears = Number(args.duration_years) || 3;
  const jurisdiction = (args.jurisdiction as string) || "Orihuela";
  const includePenalty = args.include_penalty !== false;
  const today = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

  const userInput = `Genera un NDA con estos datos:
- Tipo: ${type}
- Lugar/fecha: ${jurisdiction}, ${today}
- ${type === "unilateral" ? "PARTE REVELADORA" : "PRIMERA PARTE"}: ${fmtParty(discloser, type === "unilateral" ? "EL REVELADOR" : "PARTE A")}
- ${type === "unilateral" ? "PARTE RECEPTORA" : "SEGUNDA PARTE"}: ${fmtParty(recipient, type === "unilateral" ? "EL RECEPTOR" : "PARTE B")}
- Objeto del NDA (información a proteger): ${purpose}
- Plazo de confidencialidad: ${durationYears} años desde finalización
- Penalización por incumplimiento: ${includePenalty ? "SÍ — establecer indemnización por daños y perjuicios proporcional al daño" : "NO — solo indemnización por daños probados"}
- Jurisdicción: juzgados y tribunales de ${jurisdiction}`;

  return generateLegalTextHandler(userId, NDA_PROMPT, userInput, "legal_generate_nda");
}

// ─── Tool: legal_generate_dpa ─────────────────────────────────────────────

const DPA_PROMPT = `Eres redactor legal experto en RGPD UE 2016/679 y LOPDGDD 3/2018.

Genera un ACUERDO DE ENCARGO DE TRATAMIENTO DE DATOS (DPA, art. 28 RGPD) completo, formal y conforme a los requisitos mínimos del art. 28.3, en castellano. Estructura obligatoria:
- Encabezado (lugar, fecha)
- REUNIDOS / COMPARECEN
- EXPONEN
- CLÁUSULAS:
  1. Objeto del encargo (tratamiento por cuenta del Responsable)
  2. Identificación de la información tratada (categorías de datos, categorías de interesados)
  3. Duración del encargo
  4. Naturaleza y finalidad del tratamiento
  5. Obligaciones del Encargado del Tratamiento (lista completa según art. 28.3 RGPD: confidencialidad, medidas de seguridad art. 32, subcontratación, derechos de los interesados, asistencia al Responsable, supresión/devolución de datos, auditorías)
  6. Subencargados (autorizados o no)
  7. Transferencias internacionales (si aplica)
  8. Comunicación de violaciones de seguridad (art. 33)
  9. Devolución o supresión de datos al finalizar
  10. Responsabilidad e indemnización
  11. Ley aplicable y jurisdicción
- Anexos (Anexo I: descripción del tratamiento, Anexo II: medidas de seguridad)
- Cierre y firma

NORMAS:
- Cita literalmente artículos cuando sea relevante (art. 28, 32, 33 RGPD).
- Tono formal jurídico, sin marketing.
- Devuelve SOLO el texto, sin explicaciones.`;

export async function legalGenerateDpaHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const responsible = args.responsible_party as PartyArg | undefined;
  const processor = args.processor_party as PartyArg | undefined;
  const purpose = args.purpose as string;
  const dataCategories = args.data_categories as string[] | undefined;
  const subjectCategories = args.subject_categories as string[] | undefined;
  if (!responsible?.name || !processor?.name || !purpose || !dataCategories || !subjectCategories) {
    return { ok: false, error: "responsible_party.name, processor_party.name, purpose, data_categories[], subject_categories[] son obligatorios" };
  }
  const duration = (args.duration as string) || "Indefinida, vinculada al contrato principal";
  const subprocessorsAllowed = args.subprocessors_allowed !== false;
  const internationalTransfers = args.international_transfers === true;
  const jurisdiction = (args.jurisdiction as string) || "Orihuela";
  const today = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

  const userInput = `Genera un DPA (RGPD art. 28) con estos datos:
- Lugar/fecha: ${jurisdiction}, ${today}
- RESPONSABLE DEL TRATAMIENTO: ${fmtParty(responsible, "EL RESPONSABLE")}
- ENCARGADO DEL TRATAMIENTO: ${fmtParty(processor, "EL ENCARGADO")}
- Finalidad del tratamiento: ${purpose}
- Categorías de datos personales tratados: ${dataCategories.join(", ")}
- Categorías de interesados: ${subjectCategories.join(", ")}
- Duración: ${duration}
- Subencargados: ${subprocessorsAllowed ? "AUTORIZADOS con notificación previa al Responsable y derecho de oposición (10 días)" : "NO AUTORIZADOS sin consentimiento expreso por escrito"}
- Transferencias internacionales: ${internationalTransfers ? "PERMITIDAS solo a países con decisión de adecuación o con garantías adecuadas (cláusulas contractuales tipo)" : "NO PERMITIDAS — datos solo dentro del EEE"}
- Jurisdicción: juzgados y tribunales de ${jurisdiction}`;

  return generateLegalTextHandler(userId, DPA_PROMPT, userInput, "legal_generate_dpa");
}

// ─── Tool: legal_generate_service_contract ────────────────────────────────

const SERVICE_CONTRACT_PROMPT = `Eres redactor legal especializado en contratos mercantiles de prestación de servicios bajo derecho español (Código Civil arts. 1583+, Código de Comercio).

Genera un CONTRATO DE PRESTACIÓN DE SERVICIOS B2B completo y equilibrado, en castellano. Estructura:
- Encabezado (lugar, fecha)
- COMPARECEN
- EXPONEN
- ESTIPULACIONES numeradas:
  1. Objeto (descripción servicios)
  2. Duración y prórroga
  3. Precio y forma de pago
  4. Obligaciones del Prestador
  5. Obligaciones del Cliente
  6. Confidencialidad
  7. Protección de datos (referencia a DPA si trata datos personales)
  8. Propiedad intelectual (si aplica)
  9. Limitación de responsabilidad
  10. Causas de resolución
  11. Penalización por incumplimiento (proporcional)
  12. Notificaciones
  13. Ley aplicable y jurisdicción
- Cierre y firma

NORMAS:
- Equilibrio de obligaciones — NO favorezcas desproporcionadamente al Prestador.
- Cláusulas estándar (sin abuso): penalización máxima 50% importe pendiente, jurisdicción razonable, RGPD presente.
- Tono formal mercantil. Sin marketing.
- Devuelve SOLO el texto.`;

export async function legalGenerateServiceContractHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const provider = args.service_provider as PartyArg | undefined;
  const client = args.client as PartyArg | undefined;
  const description = args.service_description as string;
  if (!provider?.name || !client?.name || !description) {
    return { ok: false, error: "service_provider.name, client.name y service_description son obligatorios" };
  }
  const price = Number(args.price);
  const currency = (args.currency as string) || "EUR";
  const paymentTerms = (args.payment_terms as string) || "Domiciliación bancaria a 30 días fecha factura";
  const durationMonths = Number(args.duration_months) || 12;
  const autoRenewal = args.auto_renewal !== false;
  const jurisdiction = (args.jurisdiction as string) || "Orihuela";
  const treatsPersonalData = args.treats_personal_data === true;
  const today = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

  const userInput = `Genera un CONTRATO DE PRESTACIÓN DE SERVICIOS:
- Lugar/fecha: ${jurisdiction}, ${today}
- PRESTADOR DE SERVICIOS: ${fmtParty(provider, "EL PRESTADOR")}
- CLIENTE: ${fmtParty(client, "EL CLIENTE")}
- Descripción del servicio: ${description}
- Precio: ${price ? `${price} ${currency}` : "(a definir en anexo)"}
- Forma de pago: ${paymentTerms}
- Duración inicial: ${durationMonths} meses
- Renovación automática: ${autoRenewal ? `SÍ por períodos anuales con preaviso de 30 días` : "NO — el contrato finaliza al término del plazo inicial"}
- Trata datos personales: ${treatsPersonalData ? "SÍ — incluir cláusula RGPD detallada o referencia a DPA anexo" : "NO o mínimamente — incluir cláusula básica RGPD"}
- Jurisdicción: juzgados y tribunales de ${jurisdiction}`;

  return generateLegalTextHandler(userId, SERVICE_CONTRACT_PROMPT, userInput, "legal_generate_service_contract");
}

// ─── Tool: legal_generate_supplier_contract ───────────────────────────────

const SUPPLIER_CONTRACT_PROMPT = `Eres redactor legal especializado en contratos mercantiles de suministro bajo derecho español (Código de Comercio).

Genera un CONTRATO DE SUMINISTRO completo, equilibrado y favorable al COMPRADOR (cliente Sinergia). Estructura:
- Encabezado (lugar, fecha)
- COMPARECEN
- EXPONEN
- ESTIPULACIONES numeradas:
  1. Objeto (productos/servicios suministrados)
  2. Duración y entregas
  3. Condiciones económicas (precio, revisión, descuentos por volumen)
  4. Plazos y forma de entrega
  5. Calidad y garantías (mínimo legal aplicable)
  6. Recepción y aceptación de mercancías
  7. Obligaciones del Proveedor
  8. Obligaciones del Comprador
  9. Penalización por retraso o defecto
  10. Confidencialidad
  11. Resolución por incumplimiento
  12. Cesión (no permitida sin consentimiento)
  13. Fuerza mayor
  14. Notificaciones
  15. Ley aplicable y jurisdicción
- Cierre y firma

NORMAS:
- Favorable al Comprador: garantía mínima 24 meses, penalización por retraso del Proveedor, derecho de rechazo si no cumple calidad.
- Tono formal mercantil.
- Devuelve SOLO el texto.`;

export async function legalGenerateSupplierContractHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const supplier = args.supplier as PartyArg | undefined;
  const buyer = args.buyer as PartyArg | undefined;
  const description = args.product_description as string;
  if (!supplier?.name || !buyer?.name || !description) {
    return { ok: false, error: "supplier.name, buyer.name y product_description son obligatorios" };
  }
  const priceTerms = (args.price_terms as string) || "Precio según pedido + IVA, revisión anual con IPC";
  const deliveryTerms = (args.delivery_terms as string) || "Entrega en domicilio del Comprador, plazo máx 15 días desde pedido";
  const warrantyMonths = Number(args.warranty_months) || 24;
  const jurisdiction = (args.jurisdiction as string) || "Orihuela";
  const today = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

  const userInput = `Genera un CONTRATO DE SUMINISTRO:
- Lugar/fecha: ${jurisdiction}, ${today}
- PROVEEDOR: ${fmtParty(supplier, "EL PROVEEDOR")}
- COMPRADOR: ${fmtParty(buyer, "EL COMPRADOR")}
- Descripción del producto/servicio suministrado: ${description}
- Condiciones económicas: ${priceTerms}
- Plazos y forma de entrega: ${deliveryTerms}
- Garantía: ${warrantyMonths} meses desde la entrega
- Jurisdicción: juzgados y tribunales de ${jurisdiction}`;

  return generateLegalTextHandler(userId, SUPPLIER_CONTRACT_PROMPT, userInput, "legal_generate_supplier_contract");
}

// ─── Tool: legal_lopdgdd_check (Paso 4 — compliance) ──────────────────────

const LOPDGDD_PROMPT = `Eres auditor de cumplimiento RGPD/LOPDGDD experto en organizaciones españolas.

Dado el perfil de una organización, devuelve EXCLUSIVAMENTE un JSON con un checklist completo de cumplimiento LOPDGDD 3/2018 + RGPD UE 2016/679:

{
  "organization": "nombre",
  "complianceScore": 0-100,
  "criticalGaps": ["lista de incumplimientos críticos que pueden generar multa AEPD"],
  "checks": [
    {
      "category": "Bases legítimas | Información a interesados | Derechos | DPO | Registro tratamientos | Medidas seguridad | Brechas | Subencargados | Transferencias internacionales | Cookies | Videovigilancia | Menores | Otros",
      "item": "qué se verifica",
      "status": "cumple" | "no_cumple" | "no_aplica" | "requiere_revision",
      "evidence": "qué hay que demostrar",
      "gap": "qué falta si status=no_cumple",
      "regulatory": "art. RGPD o LOPDGDD aplicable",
      "actionRequired": "acción concreta si no cumple",
      "priority": "critica" | "alta" | "media" | "baja"
    }
  ],
  "recommendedActions": [
    {
      "title": "acción",
      "description": "detalle",
      "priority": "critica" | "alta" | "media" | "baja",
      "estimatedEffort": "horas o días",
      "regulatory": "ref legal"
    }
  ],
  "summary": "3-5 frases resumen del estado de cumplimiento"
}

CRITERIOS:
- complianceScore: 100 = todo cumple, 0 = riesgo máximo de multa.
- criticalGaps: incluye solo lo que la AEPD multaría con sanción grave (p.ej. ausencia de DPO si obligado, sin registro de actividades, brecha sin notificar, cookies sin consentimiento).
- Adapta el checklist al perfil: si no trata datos sensibles, omite ítems específicos. Si es <50 empleados y no es perfilado a gran escala, DPO no es obligatorio.
- Castellano. Sin tono comercial. Conservador.
- Devuelve SOLO el JSON, sin markdown.`;

export async function legalLopdgddCheckHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const org = args.organization as Record<string, unknown> | undefined;
  if (!org || !org.name) {
    return { ok: false, error: "organization.name es obligatorio" };
  }
  const profile = {
    name: org.name,
    sector: org.sector || "no especificado",
    employees_count: org.employees_count || "no especificado",
    has_dpo: org.has_dpo ?? false,
    treats_minors: org.treats_minors ?? false,
    treats_health_data: org.treats_health_data ?? false,
    treats_special_categories: org.treats_special_categories ?? false,
    has_video_surveillance: org.has_video_surveillance ?? false,
    has_website_tracking: org.has_website_tracking ?? false,
    has_cookies_banner: org.has_cookies_banner ?? false,
    has_processing_register: org.has_processing_register ?? false,
    has_security_measures_doc: org.has_security_measures_doc ?? false,
    countries_outside_eea: org.countries_outside_eea || [],
    uses_subprocessors: org.uses_subprocessors ?? false,
    notes: args.notes || "",
  };

  try {
    const result = await chatCompletion({
      messages: [{ role: "user", content: `Perfil de la organización:\n${JSON.stringify(profile, null, 2)}` }],
      systemPrompt: LOPDGDD_PROMPT,
      temperature: 0.2,
      maxTokens: 4000,
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
    log.info({ userId, score: parsed.complianceScore, criticalGaps: (parsed.criticalGaps as unknown[])?.length }, "lopdgdd check completed");
    return { ok: true, ...parsed, meta: { tokensUsed: result.usage.totalTokens, durationMs: result.durationMs } };
  } catch (err) {
    logError(log, err, { userId }, "legal_lopdgdd_check failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Tool: legal_cookie_audit_wp (Paso 4 — compliance) ───────────────────

interface CookieAuditFinding {
  category: "consent_banner" | "tracking_script" | "third_party_cookie" | "consent_mechanism" | "compliance";
  severity: "critico" | "alto" | "medio" | "bajo" | "info";
  finding: string;
  evidence?: string;
  recommendation: string;
}

const TRACKING_PATTERNS: Array<{ name: string; pattern: RegExp; consentRequired: boolean }> = [
  { name: "Google Analytics 4 (gtag)", pattern: /gtag\s*\(|googletagmanager\.com\/gtag/i, consentRequired: true },
  { name: "Google Tag Manager", pattern: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i, consentRequired: true },
  { name: "Google Analytics Universal", pattern: /google-analytics\.com\/analytics\.js|ga\(\s*['"]create['"]/i, consentRequired: true },
  { name: "Facebook Pixel", pattern: /connect\.facebook\.net\/[^"']+\/fbevents\.js|fbq\s*\(/i, consentRequired: true },
  { name: "Hotjar", pattern: /static\.hotjar\.com|hj\s*\(/i, consentRequired: true },
  { name: "Intercom", pattern: /widget\.intercom\.io|intercomSettings/i, consentRequired: true },
  { name: "LinkedIn Insight", pattern: /snap\.licdn\.com\/li\.lms-analytics/i, consentRequired: true },
  { name: "TikTok Pixel", pattern: /analytics\.tiktok\.com\/i18n\/pixel/i, consentRequired: true },
];

const CONSENT_BANNER_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "CookieYes (GDPR Cookie Consent)", pattern: /cookieyes|cli-bar|cookie-law-info/i },
  { name: "Complianz", pattern: /complianz|cmplz_/i },
  { name: "Real Cookie Banner (devowl)", pattern: /devowl|real-cookie-banner/i },
  { name: "OneTrust", pattern: /onetrust|optanon/i },
  { name: "Cookiebot", pattern: /cookiebot|consent\.cookiebot/i },
  { name: "Iubenda", pattern: /iubenda|cs\.iubenda/i },
  { name: "Borlabs Cookie", pattern: /borlabs/i },
];

export async function legalCookieAuditWpHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const url = (args.url as string)?.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: "url válida (http/https) es obligatoria" };
  }

  try {
    const t0 = Date.now();
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "SinergiaBot/1.0 (Legal Audit)" },
      redirect: "follow",
    });
    const fetchMs = Date.now() - t0;
    const html = await res.text();
    const setCookieHeader = res.headers.get("set-cookie") || "";

    const findings: CookieAuditFinding[] = [];

    // 1. Detectar banner de consentimiento
    const detectedBanners = CONSENT_BANNER_PATTERNS.filter((b) => b.pattern.test(html));
    if (detectedBanners.length === 0) {
      findings.push({
        category: "consent_banner",
        severity: "critico",
        finding: "No se detecta ningún plugin/banner de consentimiento de cookies estándar",
        recommendation: "Instalar y activar un banner conforme RGPD+LSSI (CookieYes, Complianz, Real Cookie Banner, OneTrust)",
      });
    } else {
      findings.push({
        category: "consent_banner",
        severity: "info",
        finding: `Banner detectado: ${detectedBanners.map((b) => b.name).join(", ")}`,
        recommendation: "Verificar que el banner está activo en runtime (no solo cargado), bloquea scripts antes del consentimiento, y permite rechazo igual de fácil que aceptación",
      });
    }

    // 2. Detectar scripts de tracking que requieren consentimiento
    const detectedTracking = TRACKING_PATTERNS.filter((t) => t.pattern.test(html));
    if (detectedTracking.length > 0 && detectedBanners.length === 0) {
      findings.push({
        category: "tracking_script",
        severity: "critico",
        finding: `${detectedTracking.length} scripts de tracking detectados SIN banner de consentimiento: ${detectedTracking.map((t) => t.name).join(", ")}`,
        recommendation: "Bloquear scripts hasta que el usuario consienta. Multa AEPD por LSSI art. 22.2 puede llegar a 30.000€",
      });
    } else if (detectedTracking.length > 0) {
      findings.push({
        category: "tracking_script",
        severity: "medio",
        finding: `${detectedTracking.length} scripts de tracking presentes: ${detectedTracking.map((t) => t.name).join(", ")}`,
        recommendation: "Verificar que el banner BLOQUEA estos scripts antes del consentimiento (no solo informa)",
      });
    }

    // 3. Cookies en headers de respuesta
    const cookiesInResponse = setCookieHeader ? setCookieHeader.split(/,(?=[^;]+=)/g) : [];
    const trackingCookiesInResponse = cookiesInResponse.filter((c) =>
      /(_ga|_gid|_fbp|_hjid|li_at|_uetsid|_pin_|_tt_|optimizely)/i.test(c),
    );
    if (trackingCookiesInResponse.length > 0) {
      findings.push({
        category: "third_party_cookie",
        severity: "alto",
        finding: `Cookies de tracking instaladas en la primera visita SIN consentimiento: ${trackingCookiesInResponse.length}`,
        evidence: trackingCookiesInResponse.slice(0, 3).map((c) => c.split(";")[0]).join(", "),
        recommendation: "Estas cookies deben instalarse SOLO tras consentimiento del usuario. Configurar el banner para bloquearlas",
      });
    }

    // 4. Política de cookies
    const hasCookiePolicy = /pol[ií]tica\s*(de\s*)?cookies|cookie\s*policy|gestionar\s*cookies/i.test(html);
    if (!hasCookiePolicy) {
      findings.push({
        category: "compliance",
        severity: "alto",
        finding: "No se detecta enlace visible a 'Política de cookies' o 'Gestionar cookies'",
        recommendation: "Añadir enlace permanente en footer a Política de cookies completa y mecanismo para revocar consentimiento en cualquier momento",
      });
    }

    // 5. Política de privacidad
    const hasPrivacyPolicy = /pol[ií]tica\s*(de\s*)?privacidad|privacy\s*policy/i.test(html);
    if (!hasPrivacyPolicy) {
      findings.push({
        category: "compliance",
        severity: "critico",
        finding: "No se detecta enlace a 'Política de privacidad'",
        recommendation: "Obligatorio por RGPD art. 13. Añadir enlace en footer y formularios",
      });
    }

    const criticalCount = findings.filter((f) => f.severity === "critico").length;
    const highCount = findings.filter((f) => f.severity === "alto").length;
    const score = Math.max(0, 100 - criticalCount * 30 - highCount * 15 - findings.filter((f) => f.severity === "medio").length * 5);

    log.info({ userId, url, score, criticalCount, fetchMs }, "cookie audit done");

    return {
      ok: true,
      url,
      finalUrl: res.url,
      statusCode: res.status,
      fetchMs,
      complianceScore: score,
      findings,
      summary: {
        bannersDetected: detectedBanners.map((b) => b.name),
        trackingScriptsDetected: detectedTracking.map((t) => t.name),
        criticalIssues: criticalCount,
        highIssues: highCount,
      },
    };
  } catch (err) {
    logError(log, err, { userId, url }, "legal_cookie_audit_wp failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Tool: legal_generate_consent (Paso 5 — RGPD consent form) ───────────

const CONSENT_PROMPT = `Eres redactor experto en formularios de consentimiento RGPD/LOPDGDD para webs y campañas.

Genera un texto de consentimiento informado conforme arts. 6.1.a, 7 y 13 RGPD + LOPDGDD 3/2018, en castellano. Estructura obligatoria:
1. Identificación del Responsable del Tratamiento (con datos de contacto y, si aplica, DPO)
2. Finalidades concretas del tratamiento (lista clara, sin ambigüedades)
3. Base legal (consentimiento art. 6.1.a)
4. Categorías de datos solicitadas
5. Destinatarios o categorías (si hay cesiones a terceros)
6. Plazo de conservación
7. Derechos del interesado (acceso, rectificación, supresión, oposición, portabilidad, limitación, retirar consentimiento, reclamar ante AEPD)
8. Casillas de consentimiento INDEPENDIENTES y NO premarcadas (una por finalidad)
9. Texto del checkbox y enlace a política de privacidad

NORMAS DURAS:
- Lenguaje claro, breve, no jurídico denso (RGPD art. 12: información transparente).
- NUNCA casillas premarcadas (sentencia TJUE Planet49 C-673/17).
- Consentimiento granular: una casilla por finalidad si son finalidades distintas.
- Formato: HTML con <label>+<input type="checkbox"> para consentimientos + texto explicativo arriba.
- Devuelve SOLO el HTML completo + un comentario inicial con resumen del consentimiento.`;

export async function legalGenerateConsentHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const responsible = args.responsible_party as PartyArg | undefined;
  const purposes = args.purposes as string[] | undefined;
  const dataCategories = args.data_categories as string[] | undefined;
  if (!responsible?.name || !purposes?.length || !dataCategories?.length) {
    return { ok: false, error: "responsible_party.name, purposes[] y data_categories[] son obligatorios" };
  }
  const retentionPeriod = (args.retention_period as string) || "Mientras no retire su consentimiento o sea necesario para la finalidad. Máximo 5 años desde la última interacción";
  const recipients = (args.recipients as string[]) || [];
  const dpoEmail = args.dpo_email as string | undefined;
  const privacyPolicyUrl = (args.privacy_policy_url as string) || "/politica-de-privacidad";

  const userInput = `Genera el formulario de consentimiento HTML con estos datos:
- Responsable: ${fmtParty(responsible, "Responsable del Tratamiento")}
- DPO/Contacto privacidad: ${dpoEmail || `Mediante correo a ${responsible.name}`}
- Finalidades (una casilla independiente por cada una): ${purposes.map((p, i) => `\n  ${i + 1}. ${p}`).join("")}
- Categorías de datos solicitados: ${dataCategories.join(", ")}
- Cesiones a terceros: ${recipients.length ? recipients.join(", ") : "Ninguna prevista"}
- Plazo conservación: ${retentionPeriod}
- URL política de privacidad: ${privacyPolicyUrl}`;

  return generateLegalTextHandler(userId, CONSENT_PROMPT, userInput, "legal_generate_consent");
}

// ─── Tool: legal_new_client_onboarding (Paso 5 — orquestador) ────────────

const ONBOARDING_RIGHT_TYPES = ["service_contract", "dpa", "nda"] as const;

interface OnboardingPackage {
  serviceContract?: string;
  dpa?: string;
  nda?: string;
  consent?: string;
  warnings: string[];
  contractIds: number[];
  meta: { totalTokens: number; durationMs: number };
}

export async function legalNewClientOnboardingHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const sinergiaParty = args.sinergia_party as PartyArg | undefined;
  const clientParty = args.client_party as PartyArg | undefined;
  if (!sinergiaParty?.name || !clientParty?.name) {
    return { ok: false, error: "sinergia_party (BUEN FIN DE MES SL) y client_party (datos del cliente) son obligatorios" };
  }
  const serviceDescription = args.service_description as string;
  if (!serviceDescription) {
    return { ok: false, error: "service_description es obligatoria" };
  }
  const includeNda = args.include_nda === true;
  const includeDpa = args.include_dpa !== false; // default true (cualquier servicio toca datos)
  const includeConsent = args.include_consent === true;
  const treatsPersonalData = args.treats_personal_data !== false;
  const monthlyPrice = Number(args.monthly_price) || undefined;
  const durationMonths = Number(args.duration_months) || 12;
  const region = (args.applicable_region as string) || "comunidad_valenciana";
  const jurisdiction = (args.jurisdiction as string) || "Orihuela";
  const saveAsContracts = args.save_as_contracts === true;
  const companyId = args.company_id ? Number(args.company_id) : null;

  const result: OnboardingPackage = {
    warnings: [],
    contractIds: [],
    meta: { totalTokens: 0, durationMs: 0 },
  };
  const t0 = Date.now();

  // 1. Service contract (siempre)
  const sc = await legalGenerateServiceContractHandler(userId, {
    service_provider: sinergiaParty,
    client: clientParty,
    service_description: serviceDescription,
    price: monthlyPrice,
    duration_months: durationMonths,
    auto_renewal: true,
    treats_personal_data: treatsPersonalData,
    jurisdiction,
    applicable_region: region,
  });
  if (sc.ok) {
    result.serviceContract = (sc as unknown as { draft: string }).draft;
    result.meta.totalTokens += ((sc as unknown as { meta?: { tokensUsed: number } }).meta?.tokensUsed) || 0;
  } else {
    result.warnings.push(`Service contract failed: ${(sc as { error?: string }).error}`);
  }

  // 2. DPA (recomendado si trata datos)
  if (includeDpa && treatsPersonalData) {
    const dpa = await legalGenerateDpaHandler(userId, {
      responsible_party: clientParty,
      processor_party: sinergiaParty,
      purpose: `Tratamiento de datos personales necesario para la prestación de los servicios: ${serviceDescription}`,
      data_categories: ["identificativos", "contacto", "comerciales"],
      subject_categories: ["clientes del cliente", "empleados del cliente"],
      duration: "Vinculada al contrato principal de servicios",
      subprocessors_allowed: true,
      international_transfers: false,
      jurisdiction,
    });
    if (dpa.ok) {
      result.dpa = (dpa as unknown as { draft: string }).draft;
      result.meta.totalTokens += ((dpa as unknown as { meta?: { tokensUsed: number } }).meta?.tokensUsed) || 0;
    } else {
      result.warnings.push(`DPA failed: ${(dpa as { error?: string }).error}`);
    }
  }

  // 3. NDA (opcional)
  if (includeNda) {
    const nda = await legalGenerateNdaHandler(userId, {
      type: "bilateral",
      discloser_party: sinergiaParty,
      recipient_party: clientParty,
      purpose: `Información intercambiada en el marco de la negociación y prestación de servicios: ${serviceDescription}`,
      duration_years: 3,
      jurisdiction,
      include_penalty: true,
    });
    if (nda.ok) {
      result.nda = (nda as unknown as { draft: string }).draft;
      result.meta.totalTokens += ((nda as unknown as { meta?: { tokensUsed: number } }).meta?.tokensUsed) || 0;
    } else {
      result.warnings.push(`NDA failed: ${(nda as { error?: string }).error}`);
    }
  }

  // 4. Consent form (opcional)
  if (includeConsent) {
    const consent = await legalGenerateConsentHandler(userId, {
      responsible_party: sinergiaParty,
      purposes: [
        "Gestión de la relación contractual con el cliente",
        "Envío de comunicaciones comerciales sobre servicios análogos (LSSI art. 21.2)",
      ],
      data_categories: ["identificativos", "contacto", "comerciales"],
      privacy_policy_url: "https://somossinergia.es/politica-de-privacidad",
    });
    if (consent.ok) {
      result.consent = (consent as unknown as { draft: string }).draft;
      result.meta.totalTokens += ((consent as unknown as { meta?: { tokensUsed: number } }).meta?.tokensUsed) || 0;
    } else {
      result.warnings.push(`Consent failed: ${(consent as { error?: string }).error}`);
    }
  }

  // 5. Persistir como drafts en tabla contracts (opcional)
  if (saveAsContracts) {
    const docs: Array<{ title: string; text: string; type: string }> = [];
    if (result.serviceContract) docs.push({ title: `Contrato servicios — ${clientParty.name}`, text: result.serviceContract, type: "servicios" });
    if (result.dpa) docs.push({ title: `DPA RGPD — ${clientParty.name}`, text: result.dpa, type: "dpa_rgpd" });
    if (result.nda) docs.push({ title: `NDA bilateral — ${clientParty.name}`, text: result.nda, type: "nda" });
    for (const doc of docs) {
      const saved = await legalSaveContractHandler(userId, {
        text: doc.text,
        title: doc.title,
        type: doc.type,
        status: "draft",
        company_id: companyId,
        skip_analysis: true, // no re-analizar lo que acabamos de generar
      });
      if (saved.ok) result.contractIds.push((saved as unknown as { id: number }).id);
    }
  }

  result.meta.durationMs = Date.now() - t0;
  log.info({ userId, client: clientParty.name, includeNda, includeDpa, contractIdsCount: result.contractIds.length }, "client onboarding generated");

  return {
    ok: true,
    package: result,
    summary: `Paquete onboarding generado para ${clientParty.name}: ${[
      result.serviceContract && "contrato servicios",
      result.dpa && "DPA RGPD",
      result.nda && "NDA",
      result.consent && "consent form",
    ].filter(Boolean).join(", ")}. ${result.contractIds.length ? `Guardados ${result.contractIds.length} drafts (ids: ${result.contractIds.join(", ")})` : "No persistidos (set save_as_contracts=true para guardar)"}.`,
  };
}

// ─── Tools DSR (Paso 5 — Data Subject Rights) ───────────────────────────

const DSR_RIGHT_TYPES = ["acceso", "rectificacion", "supresion", "portabilidad", "oposicion", "limitacion", "decisiones_automatizadas"];
const DSR_STATUSES = ["received", "identity_verification", "in_progress", "completed", "rejected", "extended"];

export async function legalDsrCreateHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const requesterName = (args.requester_name as string)?.trim();
  const requesterEmail = (args.requester_email as string)?.trim();
  const rightType = args.right_type as string;
  const description = (args.description as string)?.trim();
  if (!requesterName || !requesterEmail) return { ok: false, error: "requester_name y requester_email obligatorios" };
  if (!rightType || !DSR_RIGHT_TYPES.includes(rightType)) {
    return { ok: false, error: `right_type inválido. Debe ser uno de: ${DSR_RIGHT_TYPES.join(", ")}` };
  }
  if (!description || description.length < 10) return { ok: false, error: "description debe tener al menos 10 caracteres" };

  const channel = (args.channel as string) || "email";
  const requesterId = args.requester_id as string | undefined;
  const companyId = args.company_id ? Number(args.company_id) : null;
  const receivedAt = args.received_at ? (parseDate(args.received_at as string) ?? new Date()) : new Date();
  const deadlineAt = new Date(receivedAt.getTime() + 30 * 86400_000); // 1 mes legal RGPD

  try {
    const inserted = await db.insert(schema.dsrRequests).values({
      userId,
      companyId,
      requesterName,
      requesterEmail,
      requesterId: requesterId ?? null,
      requesterPhone: (args.requester_phone as string) ?? null,
      rightType,
      description,
      channel,
      status: "received",
      receivedAt,
      deadlineAt,
      assignedTo: "legal-rgpd",
      createdBy: "legal-rgpd",
    }).returning({ id: schema.dsrRequests.id });
    const id = inserted[0]?.id;
    log.info({ userId, dsrId: id, rightType, deadlineAt }, "DSR created");
    return {
      ok: true,
      id,
      rightType,
      receivedAt,
      deadlineAt,
      daysToDeadline: 30,
      nextSteps: [
        "1. Verificar identidad del solicitante (DNI/NIE)",
        "2. Confirmar recepción al solicitante en 24-48h",
        "3. Localizar todos los datos del solicitante en sistemas",
        rightType === "acceso" ? "4. Preparar copia estructurada de datos (formato accesible)"
          : rightType === "supresion" ? "4. Verificar excepciones (obligación legal, interés público)"
          : rightType === "portabilidad" ? "4. Preparar export en formato estructurado (JSON/CSV)"
          : "4. Procesar la solicitud según naturaleza del derecho",
        "5. Marcar status=completed o rejected con motivación",
      ],
    };
  } catch (err) {
    logError(log, err, { userId }, "legal_dsr_create failed");
    return { ok: false, error: String(err) };
  }
}

export async function legalDsrListHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const status = args.status as string | undefined;
  const rightType = args.right_type as string | undefined;
  const overdueOnly = args.overdue_only === true;
  const dueWithinDays = args.due_within_days ? Number(args.due_within_days) : null;
  const limit = Math.min(Number(args.limit) || 50, 200);

  try {
    const conds = [eq(schema.dsrRequests.userId, userId)];
    if (status) conds.push(eq(schema.dsrRequests.status, status));
    if (rightType) conds.push(eq(schema.dsrRequests.rightType, rightType));
    if (overdueOnly) {
      conds.push(lte(schema.dsrRequests.deadlineAt, new Date()));
    } else if (dueWithinDays !== null) {
      conds.push(lte(schema.dsrRequests.deadlineAt, new Date(Date.now() + dueWithinDays * 86400_000)));
    }
    const rows = await db.query.dsrRequests.findMany({
      where: and(...conds),
      orderBy: [desc(schema.dsrRequests.deadlineAt)],
      limit,
      columns: {
        id: true, requesterName: true, requesterEmail: true, rightType: true,
        status: true, receivedAt: true, deadlineAt: true, extendedDeadlineAt: true,
        responseAt: true, assignedTo: true,
      },
    });
    const now = Date.now();
    const enriched = rows.map((r) => ({
      ...r,
      daysToDeadline: r.deadlineAt ? Math.ceil((r.deadlineAt.getTime() - now) / 86400_000) : null,
      overdue: r.deadlineAt ? r.deadlineAt.getTime() < now && r.status !== "completed" && r.status !== "rejected" : false,
    }));
    return { ok: true, requests: enriched, count: enriched.length };
  } catch (err) {
    logError(log, err, { userId }, "legal_dsr_list failed");
    return { ok: false, error: String(err) };
  }
}

export async function legalDsrUpdateStatusHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const id = Number(args.id);
  const newStatus = args.status as string;
  if (!id || isNaN(id)) return { ok: false, error: "id obligatorio" };
  if (!newStatus || !DSR_STATUSES.includes(newStatus)) {
    return { ok: false, error: `status inválido: ${DSR_STATUSES.join(", ")}` };
  }
  try {
    const existing = await db.query.dsrRequests.findFirst({
      where: and(eq(schema.dsrRequests.id, id), eq(schema.dsrRequests.userId, userId)),
      columns: { id: true, status: true, notes: true, deadlineAt: true },
    });
    if (!existing) return { ok: false, error: `DSR ${id} no encontrado` };

    const updates: Partial<typeof schema.dsrRequests.$inferInsert> = {
      status: newStatus,
      updatedAt: new Date(),
    };
    if (newStatus === "completed" || newStatus === "rejected") {
      updates.responseAt = new Date();
      if (args.response_summary) updates.responseSummary = args.response_summary as string;
      if (args.evidence_url) updates.evidenceUrl = args.evidence_url as string;
      if (newStatus === "rejected" && args.rejection_reason) updates.rejectionReason = args.rejection_reason as string;
    }
    if (newStatus === "extended") {
      // Ampliación legal a 3 meses (RGPD art. 12.3)
      updates.extendedDeadlineAt = new Date(existing.deadlineAt.getTime() + 60 * 86400_000);
    }
    if (args.notes) {
      const audit = `[${new Date().toISOString().slice(0, 10)}] ${existing.status} → ${newStatus}: ${args.notes}`;
      updates.notes = existing.notes ? `${existing.notes}\n${audit}` : audit;
    }
    await db.update(schema.dsrRequests).set(updates).where(eq(schema.dsrRequests.id, id));
    log.info({ userId, id, from: existing.status, to: newStatus }, "DSR status updated");
    return { ok: true, id, previousStatus: existing.status, newStatus, extendedDeadline: updates.extendedDeadlineAt ?? null };
  } catch (err) {
    logError(log, err, { userId, id }, "legal_dsr_update_status failed");
    return { ok: false, error: String(err) };
  }
}

export async function legalDsrCheckDeadlinesHandler(
  userId: string,
  _args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  try {
    const all = await db.query.dsrRequests.findMany({
      where: and(
        eq(schema.dsrRequests.userId, userId),
      ),
      orderBy: [desc(schema.dsrRequests.deadlineAt)],
      limit: 200,
      columns: { id: true, requesterName: true, rightType: true, status: true, deadlineAt: true, extendedDeadlineAt: true, responseAt: true },
    });
    const now = Date.now();
    const open = all.filter((r) => r.status !== "completed" && r.status !== "rejected");
    const overdue = open.filter((r) => (r.extendedDeadlineAt ?? r.deadlineAt).getTime() < now);
    const dueWeek = open.filter((r) => {
      const dl = (r.extendedDeadlineAt ?? r.deadlineAt).getTime();
      return dl >= now && dl < now + 7 * 86400_000;
    });
    return {
      ok: true,
      summary: {
        total: all.length,
        open: open.length,
        overdue: overdue.length,
        dueWithin7Days: dueWeek.length,
      },
      overdue: overdue.map((r) => ({ ...r, daysOverdue: Math.ceil((now - (r.extendedDeadlineAt ?? r.deadlineAt).getTime()) / 86400_000) })),
      dueWithin7Days: dueWeek.map((r) => ({ ...r, daysToDeadline: Math.ceil(((r.extendedDeadlineAt ?? r.deadlineAt).getTime() - now) / 86400_000) })),
      alert: overdue.length > 0 ? `🔴 ${overdue.length} DSR(s) FUERA DE PLAZO LEGAL` : dueWeek.length > 0 ? `🟡 ${dueWeek.length} DSR(s) vencen esta semana` : "🟢 Todos los DSR dentro de plazo",
    };
  } catch (err) {
    logError(log, err, { userId }, "legal_dsr_check_deadlines failed");
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
  // ── Paso 3 — Generadores de plantillas ──
  {
    name: "legal_generate_nda",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_generate_nda",
        description:
          "Genera un acuerdo de confidencialidad (NDA) listo para firmar, en castellano, conforme a derecho español. Soporta unilateral (solo una parte revela) o bilateral (ambas). El draft devuelto se puede pasar luego a legal_save_contract o legal_analyze_contract.",
        parameters: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["unilateral", "bilateral"], description: "Default bilateral" },
            discloser_party: {
              type: "object",
              properties: { name: { type: "string" }, id: { type: "string", description: "NIF/CIF" }, address: { type: "string" }, representative: { type: "string" } },
              required: ["name"],
            },
            recipient_party: {
              type: "object",
              properties: { name: { type: "string" }, id: { type: "string" }, address: { type: "string" }, representative: { type: "string" } },
              required: ["name"],
            },
            purpose: { type: "string", description: "Objeto del NDA: qué información se va a proteger (ej. 'datos comerciales y técnicos del proyecto X')" },
            duration_years: { type: "number", description: "Plazo de confidencialidad post-finalización (default 3)" },
            jurisdiction: { type: "string", description: "Ciudad de los juzgados (default Madrid)" },
            include_penalty: { type: "boolean", description: "Incluir cláusula de penalización (default true)" },
          },
          required: ["discloser_party", "recipient_party", "purpose"],
        },
      },
    },
    handler: legalGenerateNdaHandler,
  },
  {
    name: "legal_generate_dpa",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_generate_dpa",
        description:
          "Genera un Acuerdo de Encargo de Tratamiento (DPA) conforme al art. 28 RGPD UE 2016/679. Necesario cuando un proveedor trata datos personales por cuenta de Sinergia (ej. SaaS, hosting, mailing, BPO). Devuelve texto completo con todas las cláusulas obligatorias del art. 28.3.",
        parameters: {
          type: "object",
          properties: {
            responsible_party: {
              type: "object",
              properties: { name: { type: "string" }, id: { type: "string" }, address: { type: "string" }, representative: { type: "string" } },
              required: ["name"],
            },
            processor_party: {
              type: "object",
              properties: { name: { type: "string" }, id: { type: "string" }, address: { type: "string" }, representative: { type: "string" } },
              required: ["name"],
            },
            purpose: { type: "string", description: "Finalidad del tratamiento (ej. 'gestión de envíos email marketing')" },
            data_categories: { type: "array", items: { type: "string" }, description: "Ej: ['identificativos', 'contacto', 'comerciales']" },
            subject_categories: { type: "array", items: { type: "string" }, description: "Ej: ['clientes', 'leads', 'empleados']" },
            duration: { type: "string", description: "Duración (default 'indefinida vinculada al contrato principal')" },
            subprocessors_allowed: { type: "boolean", description: "Default true" },
            international_transfers: { type: "boolean", description: "Default false" },
            jurisdiction: { type: "string", description: "Default Madrid" },
          },
          required: ["responsible_party", "processor_party", "purpose", "data_categories", "subject_categories"],
        },
      },
    },
    handler: legalGenerateDpaHandler,
  },
  {
    name: "legal_generate_service_contract",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_generate_service_contract",
        description:
          "Genera un contrato de prestación de servicios B2B equilibrado en castellano. Estructura completa con 13 estipulaciones estándar del derecho mercantil español. Incluye cláusula RGPD si treats_personal_data=true.",
        parameters: {
          type: "object",
          properties: {
            service_provider: {
              type: "object",
              properties: { name: { type: "string" }, id: { type: "string" }, address: { type: "string" }, representative: { type: "string" } },
              required: ["name"],
            },
            client: {
              type: "object",
              properties: { name: { type: "string" }, id: { type: "string" }, address: { type: "string" }, representative: { type: "string" } },
              required: ["name"],
            },
            service_description: { type: "string", description: "Descripción concreta del servicio (1-3 frases)" },
            price: { type: "number", description: "Precio mensual o por proyecto" },
            currency: { type: "string", description: "Default EUR" },
            payment_terms: { type: "string", description: "Default 'Domiciliación bancaria a 30 días fecha factura'" },
            duration_months: { type: "number", description: "Default 12" },
            auto_renewal: { type: "boolean", description: "Default true" },
            jurisdiction: { type: "string", description: "Default Madrid" },
            treats_personal_data: { type: "boolean", description: "Si true, incluye cláusula RGPD detallada o referencia a DPA anexo. Default false" },
          },
          required: ["service_provider", "client", "service_description"],
        },
      },
    },
    handler: legalGenerateServiceContractHandler,
  },
  {
    name: "legal_generate_supplier_contract",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_generate_supplier_contract",
        description:
          "Genera un contrato de suministro/proveedor favorable al COMPRADOR (Sinergia o cliente Sinergia), en castellano. Incluye 15 estipulaciones estándar: garantía mínima 24 meses, penalización por retraso del proveedor, derecho de rechazo si calidad insuficiente.",
        parameters: {
          type: "object",
          properties: {
            supplier: {
              type: "object",
              properties: { name: { type: "string" }, id: { type: "string" }, address: { type: "string" }, representative: { type: "string" } },
              required: ["name"],
            },
            buyer: {
              type: "object",
              properties: { name: { type: "string" }, id: { type: "string" }, address: { type: "string" }, representative: { type: "string" } },
              required: ["name"],
            },
            product_description: { type: "string", description: "Producto o servicio suministrado" },
            price_terms: { type: "string", description: "Default 'Precio según pedido + IVA, revisión anual con IPC'" },
            delivery_terms: { type: "string", description: "Default 'Entrega en domicilio del Comprador, plazo máx 15 días desde pedido'" },
            warranty_months: { type: "number", description: "Default 24" },
            jurisdiction: { type: "string", description: "Default Madrid" },
          },
          required: ["supplier", "buyer", "product_description"],
        },
      },
    },
    handler: legalGenerateSupplierContractHandler,
  },
  // ── Paso 4 — Compliance ──
  {
    name: "legal_lopdgdd_check",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_lopdgdd_check",
        description:
          "Auditoría de cumplimiento RGPD/LOPDGDD para una organización. Devuelve checklist por categorías (bases legítimas, derechos, DPO, registro tratamientos, medidas seguridad, brechas, transferencias, cookies, videovigilancia, menores) con status, gap, prioridad y acción requerida. Incluye complianceScore 0-100 y criticalGaps que pueden generar multa AEPD. Usar para auditar Sinergia o un cliente.",
        parameters: {
          type: "object",
          properties: {
            organization: {
              type: "object",
              properties: {
                name: { type: "string" },
                sector: { type: "string", description: "ej: energía, salud, e-commerce, RRHH" },
                employees_count: { type: "number" },
                has_dpo: { type: "boolean" },
                treats_minors: { type: "boolean" },
                treats_health_data: { type: "boolean" },
                treats_special_categories: { type: "boolean", description: "Datos especiales art. 9 RGPD (salud, biometría, religión, política, etc.)" },
                has_video_surveillance: { type: "boolean" },
                has_website_tracking: { type: "boolean" },
                has_cookies_banner: { type: "boolean" },
                has_processing_register: { type: "boolean", description: "Registro de actividades art. 30 RGPD" },
                has_security_measures_doc: { type: "boolean" },
                countries_outside_eea: { type: "array", items: { type: "string" }, description: "Países fuera del EEE a los que se transfieren datos" },
                uses_subprocessors: { type: "boolean" },
              },
              required: ["name"],
            },
            notes: { type: "string", description: "Contexto adicional libre" },
          },
          required: ["organization"],
        },
      },
    },
    handler: legalLopdgddCheckHandler,
  },
  {
    name: "legal_cookie_audit_wp",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_cookie_audit_wp",
        description:
          "Audita una página web (típicamente WP) para verificar cumplimiento de cookies y tracking según RGPD+LSSI art. 22.2. Hace fetch de la URL y detecta: presencia de banner de consentimiento estándar (CookieYes, Complianz, Real Cookie Banner, OneTrust, Cookiebot, Iubenda, Borlabs), scripts de tracking (GA4, GTM, Facebook Pixel, Hotjar, LinkedIn Insight, TikTok), cookies tracking instaladas en primera visita sin consentimiento, enlaces a política de cookies y privacidad. Devuelve complianceScore 0-100 + findings por severidad.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL completa a auditar (https://...)" },
          },
          required: ["url"],
        },
      },
    },
    handler: legalCookieAuditWpHandler,
  },
  // ── Paso 5 — Consent + Onboarding orchestrator ──
  {
    name: "legal_generate_consent",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_generate_consent",
        description:
          "Genera un formulario de consentimiento RGPD/LOPDGDD en HTML (con casillas no premarcadas, granulares por finalidad). Conforme art. 6.1.a, 7, 12, 13 RGPD + sentencia TJUE Planet49. Útil para webs, landing pages, formularios de contacto, suscripción a newsletter.",
        parameters: {
          type: "object",
          properties: {
            responsible_party: {
              type: "object",
              properties: { name: { type: "string" }, id: { type: "string" }, address: { type: "string" } },
              required: ["name"],
            },
            purposes: { type: "array", items: { type: "string" }, description: "Una finalidad por elemento (cada una será una casilla independiente)" },
            data_categories: { type: "array", items: { type: "string" }, description: "Ej: ['identificativos','contacto','comerciales']" },
            recipients: { type: "array", items: { type: "string" }, description: "Cesionarios o categorías. Vacío si no hay cesiones" },
            retention_period: { type: "string", description: "Plazo de conservación. Default: hasta retirar consentimiento o 5 años" },
            dpo_email: { type: "string", description: "Email de contacto privacidad/DPO" },
            privacy_policy_url: { type: "string", description: "URL política privacidad. Default /politica-de-privacidad" },
          },
          required: ["responsible_party", "purposes", "data_categories"],
        },
      },
    },
    handler: legalGenerateConsentHandler,
  },
  {
    name: "legal_new_client_onboarding",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_new_client_onboarding",
        description:
          "ORQUESTADOR: genera el paquete legal completo para un cliente nuevo en una sola llamada. Por defecto produce: contrato de servicios + DPA RGPD. Opcionalmente: NDA bilateral + formulario de consentimiento. Si save_as_contracts=true, persiste todos como drafts en tabla contracts vinculados a company_id. USAR ESTA TOOL cuando el usuario diga 'preparar paquete para nuevo cliente X' o 'onboarding legal de Y'.",
        parameters: {
          type: "object",
          properties: {
            sinergia_party: {
              type: "object",
              properties: { name: { type: "string" }, id: { type: "string" }, address: { type: "string" }, representative: { type: "string" } },
              required: ["name"],
              description: "Datos de la entidad Sinergia (BUEN FIN DE MES SL B10730505, Plaza Cubero 3 Orihuela, rep. David Miquel Jordá NIF 48573959)",
            },
            client_party: {
              type: "object",
              properties: { name: { type: "string" }, id: { type: "string" }, address: { type: "string" }, representative: { type: "string" } },
              required: ["name"],
            },
            service_description: { type: "string", description: "Qué servicios va a recibir el cliente" },
            monthly_price: { type: "number", description: "Precio mensual EUR (opcional)" },
            duration_months: { type: "number", description: "Duración inicial. Default 12" },
            include_nda: { type: "boolean", description: "Incluir NDA bilateral. Default false" },
            include_dpa: { type: "boolean", description: "Incluir DPA RGPD art. 28. Default true (cualquier servicio toca datos)" },
            include_consent: { type: "boolean", description: "Incluir formulario consentimiento HTML. Default false" },
            treats_personal_data: { type: "boolean", description: "Si trata datos personales del cliente. Default true" },
            applicable_region: { type: "string", enum: ["espana_general", "comunidad_valenciana"], description: "Región legal aplicable. Default comunidad_valenciana" },
            jurisdiction: { type: "string", description: "Ciudad de los juzgados. Default Orihuela" },
            company_id: { type: "number", description: "ID empresa CRM si saveContracts=true" },
            save_as_contracts: { type: "boolean", description: "Persistir todos como drafts en tabla contracts. Default false" },
          },
          required: ["sinergia_party", "client_party", "service_description"],
        },
      },
    },
    handler: legalNewClientOnboardingHandler,
  },
  // ── Paso 5 — DSR (RGPD derechos del titular) ──
  {
    name: "legal_dsr_create",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_dsr_create",
        description:
          "Registra una solicitud de derecho del titular RGPD (acceso, rectificación, supresión, portabilidad, oposición, limitación, decisiones automatizadas). Asigna deadline legal de 1 mes desde recepción. Devuelve next_steps con el workflow obligatorio. Usar SIEMPRE que llegue una solicitud por email/web/correo de un ciudadano ejerciendo sus derechos RGPD.",
        parameters: {
          type: "object",
          properties: {
            requester_name: { type: "string" },
            requester_email: { type: "string" },
            requester_id: { type: "string", description: "NIF/NIE para verificación identidad" },
            requester_phone: { type: "string" },
            right_type: { type: "string", enum: ["acceso", "rectificacion", "supresion", "portabilidad", "oposicion", "limitacion", "decisiones_automatizadas"] },
            description: { type: "string", description: "Detalle de la solicitud (mín. 10 chars)" },
            channel: { type: "string", enum: ["email", "web_form", "postal", "telefono", "presencial"], description: "Canal de recepción. Default email" },
            received_at: { type: "string", description: "Fecha recepción YYYY-MM-DD. Default hoy" },
            company_id: { type: "number", description: "Si la solicitud está vinculada a una empresa CRM" },
          },
          required: ["requester_name", "requester_email", "right_type", "description"],
        },
      },
    },
    handler: legalDsrCreateHandler,
  },
  {
    name: "legal_dsr_list",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_dsr_list",
        description: "Lista solicitudes DSR con filtros: estado, tipo de derecho, vencidas, próximas a vencer. Cada item incluye daysToDeadline y flag overdue. Por defecto devuelve todos los DSR.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["received", "identity_verification", "in_progress", "completed", "rejected", "extended"] },
            right_type: { type: "string" },
            overdue_only: { type: "boolean", description: "Solo DSRs fuera de plazo no completados" },
            due_within_days: { type: "number", description: "DSRs cuyo plazo vence en N días" },
            limit: { type: "number", description: "Default 50, max 200" },
          },
        },
      },
    },
    handler: legalDsrListHandler,
  },
  {
    name: "legal_dsr_update_status",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_dsr_update_status",
        description:
          "Cambia estado de un DSR. Si status=completed o rejected registra responseAt y permite responseSummary, evidenceUrl y rejectionReason. Si status=extended, amplía deadline 60 días más (RGPD art. 12.3 — solo casos complejos, máx 3 meses totales).",
        parameters: {
          type: "object",
          properties: {
            id: { type: "number" },
            status: { type: "string", enum: ["received", "identity_verification", "in_progress", "completed", "rejected", "extended"] },
            response_summary: { type: "string", description: "Solo si status=completed o rejected" },
            evidence_url: { type: "string", description: "URL al documento de respuesta o copia de datos enviada" },
            rejection_reason: { type: "string", description: "Solo si status=rejected. Motivar legalmente" },
            notes: { type: "string", description: "Nota auditoría con timestamp" },
          },
          required: ["id", "status"],
        },
      },
    },
    handler: legalDsrUpdateStatusHandler,
  },
  {
    name: "legal_dsr_check_deadlines",
    openaiTool: {
      type: "function",
      function: {
        name: "legal_dsr_check_deadlines",
        description: "Health-check de DSRs: cuántos vencidos (riesgo multa AEPD), cuántos vencen esta semana, total abiertos. Usar como brief diario/semanal o cuando el usuario pregunte 'cómo van las solicitudes RGPD'.",
        parameters: { type: "object", properties: {} },
      },
    },
    handler: legalDsrCheckDeadlinesHandler,
  },
];
