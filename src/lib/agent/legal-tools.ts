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
 * Próximo paso (no incluido aquí):
 *   - tabla `contracts` en DB + legal_save_contract / legal_list_contracts / legal_get_contract
 *   - generadores: legal_generate_nda, legal_generate_dpa, legal_generate_service_contract
 *   - compliance: legal_lopdgdd_check, legal_dsr_handler, legal_cookie_audit_wp
 */

import type { ToolHandlerResult } from "./tools";
import type { SuperToolDefinition } from "./super-tools";
import { chatCompletion } from "@/lib/gpt5/client";
import { logger, logError } from "@/lib/logger";

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
];
