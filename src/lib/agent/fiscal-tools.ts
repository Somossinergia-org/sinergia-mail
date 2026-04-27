/**
 * Fiscal Tools — Modelos AEAT España
 *
 * Tools especializadas para el agente fiscal:
 *   - fiscal_calculate_modelo_303: liquidación trimestral IVA (Q1-Q4)
 *   - fiscal_calculate_modelo_130: pago fraccionado IRPF autónomos
 *   - fiscal_calculate_modelo_390: resumen anual IVA
 *
 * Las tools agregan datos de las tablas `invoices` (gastos) e `issued_invoices`
 * (ingresos) en el periodo, calculan bases imponibles y cuotas por tipo de IVA,
 * y devuelven un objeto con TODAS las casillas necesarias para rellenar el
 * borrador del modelo en la sede de la AEAT.
 *
 * NO presentan automáticamente — solo calculan y resumen.
 */

import type { ToolHandlerResult } from "./tools";
import type { SuperToolDefinition } from "./super-tools";
import { db, schema } from "@/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { logger, logError } from "@/lib/logger";
import {
  getCommissionForecast,
  getCommissionForecastForCompany,
} from "@/lib/fiscal/commission-forecast";

const log = logger.child({ component: "fiscal-tools" });

// ─── Helpers ──────────────────────────────────────────────────────────────

const VAT_RATES_ES = [4, 5, 10, 21]; // tipos de IVA vigentes en España

function classifyByVatRate(amount: number | null, tax: number | null): number {
  if (!amount || !tax || amount === 0) return 21; // default
  const rate = (tax / amount) * 100;
  // Snap to closest standard rate
  let best = 21, bestDiff = Infinity;
  for (const r of VAT_RATES_ES) {
    const d = Math.abs(rate - r);
    if (d < bestDiff) { bestDiff = d; best = r; }
  }
  // Tolerancia: si > 2 puntos de diferencia, devolver el calculado redondeado
  return bestDiff > 2 ? Math.round(rate) : best;
}

interface QuarterRange {
  startDate: Date;
  endDate: Date;
}

function getQuarterRange(year: number, quarter: number): QuarterRange {
  if (quarter < 1 || quarter > 4) throw new Error("quarter debe ser 1-4");
  const startMonth = (quarter - 1) * 3;
  const startDate = new Date(year, startMonth, 1);
  const endDate = new Date(year, startMonth + 3, 1); // exclusive
  return { startDate, endDate };
}

function fmtEur(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Tool: fiscal_calculate_modelo_303 ────────────────────────────────────

export async function fiscalCalculateModelo303Handler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const year = Number(args.year);
  const quarter = Number(args.quarter);
  if (!year || year < 2020 || year > 2099) return { ok: false, error: "year obligatorio (2020-2099)" };
  if (!quarter || quarter < 1 || quarter > 4) return { ok: false, error: "quarter obligatorio (1-4)" };

  try {
    const { startDate, endDate } = getQuarterRange(year, quarter);

    // ── IVA REPERCUTIDO (issued invoices, ingresos) ──
    const issued = await db.query.issuedInvoices.findMany({
      where: and(
        eq(schema.issuedInvoices.userId, userId),
        gte(schema.issuedInvoices.issueDate, startDate),
        lte(schema.issuedInvoices.issueDate, new Date(endDate.getTime() - 1)),
      ),
      columns: {
        id: true, number: true, clientName: true, clientNif: true,
        issueDate: true, subtotal: true, tax: true, total: true, status: true,
      },
    });

    const repercutidoByRate: Record<number, { base: number; cuota: number; count: number }> = {};
    for (const inv of issued) {
      if (inv.status === "draft" || inv.status === "cancelled") continue;
      const rate = classifyByVatRate(inv.subtotal, inv.tax);
      if (!repercutidoByRate[rate]) repercutidoByRate[rate] = { base: 0, cuota: 0, count: 0 };
      repercutidoByRate[rate].base += inv.subtotal || 0;
      repercutidoByRate[rate].cuota += inv.tax || 0;
      repercutidoByRate[rate].count += 1;
    }

    // ── IVA SOPORTADO (received invoices, gastos deducibles) ──
    const received = await db.query.invoices.findMany({
      where: and(
        eq(schema.invoices.userId, userId),
        gte(schema.invoices.invoiceDate, startDate),
        lte(schema.invoices.invoiceDate, new Date(endDate.getTime() - 1)),
      ),
      columns: {
        id: true, invoiceNumber: true, issuerName: true, issuerNif: true,
        invoiceDate: true, amount: true, tax: true, totalAmount: true, category: true,
      },
    });

    const soportadoByRate: Record<number, { base: number; cuota: number; count: number }> = {};
    for (const inv of received) {
      const rate = classifyByVatRate(inv.amount, inv.tax);
      if (!soportadoByRate[rate]) soportadoByRate[rate] = { base: 0, cuota: 0, count: 0 };
      soportadoByRate[rate].base += inv.amount || 0;
      soportadoByRate[rate].cuota += inv.tax || 0;
      soportadoByRate[rate].count += 1;
    }

    // ── Totales y casillas AEAT Modelo 303 ──
    const totalRepercutidoBase = Object.values(repercutidoByRate).reduce((s, r) => s + r.base, 0);
    const totalRepercutidoCuota = Object.values(repercutidoByRate).reduce((s, r) => s + r.cuota, 0);
    const totalSoportadoBase = Object.values(soportadoByRate).reduce((s, r) => s + r.base, 0);
    const totalSoportadoCuota = Object.values(soportadoByRate).reduce((s, r) => s + r.cuota, 0);

    // Resultado liquidación: cuota repercutida - cuota soportada deducible
    const resultadoLiquidacion = totalRepercutidoCuota - totalSoportadoCuota;
    const resultadoIngresarODevolver = resultadoLiquidacion > 0 ? "INGRESAR" : resultadoLiquidacion < 0 ? "DEVOLVER/COMPENSAR" : "CERO";

    log.info({ userId, year, quarter, issued: issued.length, received: received.length, resultado: resultadoLiquidacion }, "modelo 303 calculated");

    return {
      ok: true,
      modelo: "303",
      periodo: `${year} Q${quarter}`,
      fechaInicio: startDate.toISOString().slice(0, 10),
      fechaFin: new Date(endDate.getTime() - 86400000).toISOString().slice(0, 10),

      // Régimen general — IVA repercutido (devengado)
      ivaRepercutido: {
        porTipo: Object.entries(repercutidoByRate).map(([rate, v]) => ({
          tipo: `${rate}%`,
          baseImponible: Number(v.base.toFixed(2)),
          cuota: Number(v.cuota.toFixed(2)),
          numFacturas: v.count,
        })),
        totalBase: Number(totalRepercutidoBase.toFixed(2)),
        totalCuota: Number(totalRepercutidoCuota.toFixed(2)),
        casillaAEAT: "01-09 (régimen general)",
        casillaTotal: "27 (total cuotas devengadas)",
      },

      // IVA soportado deducible
      ivaSoportado: {
        porTipo: Object.entries(soportadoByRate).map(([rate, v]) => ({
          tipo: `${rate}%`,
          baseImponible: Number(v.base.toFixed(2)),
          cuota: Number(v.cuota.toFixed(2)),
          numFacturas: v.count,
        })),
        totalBase: Number(totalSoportadoBase.toFixed(2)),
        totalCuota: Number(totalSoportadoCuota.toFixed(2)),
        casillaAEAT: "28-36 (operaciones interiores corrientes)",
        casillaTotal: "45 (total a deducir)",
      },

      // Liquidación
      liquidacion: {
        cuotaDevengada: Number(totalRepercutidoCuota.toFixed(2)),
        cuotaDeducible: Number(totalSoportadoCuota.toFixed(2)),
        diferencia: Number(resultadoLiquidacion.toFixed(2)),
        resultado: resultadoIngresarODevolver,
        casillaAEAT: "64 (resultado régimen general) → 71 (resultado liquidación)",
      },

      resumen: `Periodo ${year} Q${quarter}: ${issued.length} facturas emitidas (${fmtEur(totalRepercutidoCuota)}€ IVA repercutido) y ${received.length} facturas recibidas (${fmtEur(totalSoportadoCuota)}€ IVA soportado). Resultado: ${fmtEur(Math.abs(resultadoLiquidacion))}€ a ${resultadoIngresarODevolver}.`,

      proximosPasos: [
        `Acceder a sede.agenciatributaria.gob.es → Modelo 303 → ejercicio ${year}, periodo ${quarter}T`,
        "Rellenar las casillas con los valores de este informe",
        "Revisar prorrata, regularización inversiones (si aplica) y compensación de cuotas anteriores",
        "Plazo presentación: 1-20 del mes siguiente al fin del trimestre (Q1: hasta 20 abril, Q2: 20 julio, Q3: 20 octubre, Q4: 30 enero)",
        "Si domiciliación bancaria: presentar antes del 15 del mes",
      ],

      meta: { issuedCount: issued.length, receivedCount: received.length },
    };
  } catch (err) {
    logError(log, err, { userId, year, quarter }, "fiscal_calculate_modelo_303 failed");
    return { ok: false, error: String(err), detail: err instanceof Error ? err.message.slice(0, 300) : undefined };
  }
}

// ─── Tool: fiscal_calculate_modelo_130 ────────────────────────────────────
// Pago fraccionado IRPF para autónomos (estimación directa)

export async function fiscalCalculateModelo130Handler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const year = Number(args.year);
  const quarter = Number(args.quarter);
  if (!year || !quarter || quarter < 1 || quarter > 4) {
    return { ok: false, error: "year y quarter (1-4) obligatorios" };
  }

  try {
    const { startDate, endDate } = getQuarterRange(year, quarter);

    // Ingresos del periodo (acumulado desde 1-enero hasta fin trimestre)
    const yearStart = new Date(year, 0, 1);
    const issued = await db.query.issuedInvoices.findMany({
      where: and(
        eq(schema.issuedInvoices.userId, userId),
        gte(schema.issuedInvoices.issueDate, yearStart),
        lte(schema.issuedInvoices.issueDate, new Date(endDate.getTime() - 1)),
      ),
      columns: { subtotal: true, status: true },
    });
    const received = await db.query.invoices.findMany({
      where: and(
        eq(schema.invoices.userId, userId),
        gte(schema.invoices.invoiceDate, yearStart),
        lte(schema.invoices.invoiceDate, new Date(endDate.getTime() - 1)),
      ),
      columns: { amount: true },
    });

    const ingresosAcumulados = issued.filter(i => i.status !== "draft" && i.status !== "cancelled").reduce((s, i) => s + (i.subtotal || 0), 0);
    const gastosAcumulados = received.reduce((s, i) => s + (i.amount || 0), 0);
    const rendimientoNeto = ingresosAcumulados - gastosAcumulados;

    // Modelo 130: 20% del rendimiento neto acumulado
    const pagoFraccionadoCalculado = rendimientoNeto > 0 ? rendimientoNeto * 0.20 : 0;

    return {
      ok: true,
      modelo: "130",
      periodo: `${year} Q${quarter}`,
      tipoEstimacion: "Estimación directa simplificada",
      acumulado: {
        desde: yearStart.toISOString().slice(0, 10),
        hasta: new Date(endDate.getTime() - 86400000).toISOString().slice(0, 10),
        ingresosBrutos: Number(ingresosAcumulados.toFixed(2)),
        gastosDeducibles: Number(gastosAcumulados.toFixed(2)),
        rendimientoNeto: Number(rendimientoNeto.toFixed(2)),
      },
      pagoFraccionado: {
        porcentaje: "20%",
        importeCalculado: Number(pagoFraccionadoCalculado.toFixed(2)),
        casillaAEAT: "casilla 03 (rendimiento neto) × 20% = casilla 04 (pago fraccionado)",
      },
      resumen: `Q${quarter}/${year}: rendimiento neto acumulado ${fmtEur(rendimientoNeto)}€. Pago fraccionado IRPF (20%) = ${fmtEur(pagoFraccionadoCalculado)}€${rendimientoNeto <= 0 ? " (sin obligación si rendimiento ≤ 0)" : ""}.`,
      proximosPasos: [
        `Acceder a sede.agenciatributaria.gob.es → Modelo 130 → ejercicio ${year} ${quarter}T`,
        "Restar pagos fraccionados de trimestres anteriores y retenciones soportadas (si aplica)",
        "Plazo presentación: 1-20 del mes siguiente al trimestre (Q1: 20 abril, Q2: 20 julio, Q3: 20 octubre, Q4: 30 enero)",
      ],
      meta: { issuedCount: issued.length, receivedCount: received.length },
    };
  } catch (err) {
    logError(log, err, { userId, year, quarter }, "fiscal_calculate_modelo_130 failed");
    return { ok: false, error: String(err), detail: err instanceof Error ? err.message.slice(0, 300) : undefined };
  }
}

// ─── Tool: fiscal_calculate_modelo_390 ────────────────────────────────────
// Resumen anual IVA (acumulado de los 4 trimestres del año)

export async function fiscalCalculateModelo390Handler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const year = Number(args.year);
  if (!year || year < 2020 || year > 2099) return { ok: false, error: "year obligatorio (2020-2099)" };

  try {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);

    const issued = await db.query.issuedInvoices.findMany({
      where: and(
        eq(schema.issuedInvoices.userId, userId),
        gte(schema.issuedInvoices.issueDate, yearStart),
        lte(schema.issuedInvoices.issueDate, new Date(yearEnd.getTime() - 1)),
      ),
      columns: { id: true, subtotal: true, tax: true, status: true, issueDate: true },
    });
    const received = await db.query.invoices.findMany({
      where: and(
        eq(schema.invoices.userId, userId),
        gte(schema.invoices.invoiceDate, yearStart),
        lte(schema.invoices.invoiceDate, new Date(yearEnd.getTime() - 1)),
      ),
      columns: { id: true, amount: true, tax: true, invoiceDate: true },
    });

    // Agregar por trimestre
    const porTrimestre: Record<number, { repercutido: number; soportado: number; netos: number }> = { 1: { repercutido: 0, soportado: 0, netos: 0 }, 2: { repercutido: 0, soportado: 0, netos: 0 }, 3: { repercutido: 0, soportado: 0, netos: 0 }, 4: { repercutido: 0, soportado: 0, netos: 0 } };
    for (const inv of issued) {
      if (inv.status === "draft" || inv.status === "cancelled" || !inv.issueDate) continue;
      const q = Math.floor(inv.issueDate.getMonth() / 3) + 1 as 1 | 2 | 3 | 4;
      porTrimestre[q].repercutido += inv.tax || 0;
      porTrimestre[q].netos += inv.subtotal || 0;
    }
    for (const inv of received) {
      if (!inv.invoiceDate) continue;
      const q = Math.floor(inv.invoiceDate.getMonth() / 3) + 1 as 1 | 2 | 3 | 4;
      porTrimestre[q].soportado += inv.tax || 0;
    }

    const totalRepercutido = Object.values(porTrimestre).reduce((s, t) => s + t.repercutido, 0);
    const totalSoportado = Object.values(porTrimestre).reduce((s, t) => s + t.soportado, 0);
    const totalNetos = Object.values(porTrimestre).reduce((s, t) => s + t.netos, 0);

    return {
      ok: true,
      modelo: "390",
      ejercicio: year,
      tipo: "Resumen anual IVA",
      desglosePorTrimestre: Object.entries(porTrimestre).map(([q, v]) => ({
        trimestre: `${q}T`,
        repercutido: Number(v.repercutido.toFixed(2)),
        soportado: Number(v.soportado.toFixed(2)),
        diferencia: Number((v.repercutido - v.soportado).toFixed(2)),
        baseNeta: Number(v.netos.toFixed(2)),
      })),
      totales: {
        ivaRepercutidoAnual: Number(totalRepercutido.toFixed(2)),
        ivaSoportadoAnual: Number(totalSoportado.toFixed(2)),
        diferenciaAnual: Number((totalRepercutido - totalSoportado).toFixed(2)),
        baseTotalAnual: Number(totalNetos.toFixed(2)),
      },
      resumen: `Ejercicio ${year}: facturado ${fmtEur(totalNetos)}€ (${fmtEur(totalRepercutido)}€ IVA repercutido), soportado ${fmtEur(totalSoportado)}€ IVA. Diferencia anual: ${fmtEur(totalRepercutido - totalSoportado)}€.`,
      proximosPasos: [
        `Acceder a sede.agenciatributaria.gob.es → Modelo 390 → ejercicio ${year}`,
        "Rellenar con los datos consolidados de los 4 trimestres",
        "Conciliar con los Modelos 303 trimestrales presentados",
        "Plazo presentación: del 1 al 30 de enero del año siguiente",
        "Es informativo (no liquida) — sirve para AEAT cruzar con tu actividad",
      ],
      meta: { issuedCount: issued.length, receivedCount: received.length },
    };
  } catch (err) {
    logError(log, err, { userId, year }, "fiscal_calculate_modelo_390 failed");
    return { ok: false, error: String(err), detail: err instanceof Error ? err.message.slice(0, 300) : undefined };
  }
}

// ─── Tool: fiscal_commission_forecast ─────────────────────────────────────
//   Previsión global de comisiones esperadas a partir de servicios contratados.
export async function fiscalCommissionForecastHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (!userId) return { ok: false, error: "userId requerido" };

  const months = typeof args.months === "number" && args.months > 0 ? args.months : 12;
  const category = typeof args.category === "string" ? args.category : undefined;
  const payerCompanyId = typeof args.payer_company_id === "number" ? args.payer_company_id : undefined;
  // Default: contracted+offered (activados + tramitados). Permite override para
  // ver sólo "ACTIVADOS" (status=["contracted"]) o incluir prospecting.
  const statuses = Array.isArray(args.statuses) && (args.statuses as unknown[]).every((s) => typeof s === "string")
    ? (args.statuses as string[])
    : undefined;
  const fromDate = new Date();
  const toDate = new Date(fromDate.getTime() + months * 30 * 24 * 60 * 60 * 1000);

  try {
    const result = await getCommissionForecast({ userId, fromDate, toDate, category, payerCompanyId, statuses });
    return { ok: true, ...(result as unknown as Record<string, unknown>) };
  } catch (err) {
    logError(log, err, { userId }, "fiscal_commission_forecast failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Tool: bi_commission_margin ───────────────────────────────────────────
//   Margen real vs esperado por vertical / provider.
export async function biCommissionMarginHandler(
  userId: string,
  _args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (!userId) return { ok: false, error: "userId requerido" };

  try {
    const forecast = await getCommissionForecast({ userId });
    return {
      ok: true,
      esperado: {
        totalSinIvaEur: forecast.totals.totalSinIvaEur,
        totalConIvaEur: forecast.totals.totalConIvaEur,
      },
      real: {
        nota: "Pendiente: vincular issued_invoices con services para calcular real. Por ahora solo esperado.",
      },
      desglose_provider: forecast.byProvider,
      desglose_vertical: forecast.byCategory,
    } as unknown as ToolHandlerResult;
  } catch (err) {
    logError(log, err, { userId }, "bi_commission_margin failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Tool: crm_commission_forecast_company ────────────────────────────────
//   Cuánto te genera al año una empresa concreta (cartera value por cliente).
export async function crmCommissionForecastCompanyHandler(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  if (!userId) return { ok: false, error: "userId requerido" };
  const companyId = typeof args.company_id === "number" ? args.company_id : Number(args.company_id);
  if (!companyId || !Number.isFinite(companyId)) {
    return { ok: false, error: "company_id requerido (number)" };
  }

  try {
    const result = await getCommissionForecastForCompany(userId, companyId);
    return { ok: true, ...(result as unknown as Record<string, unknown>) };
  } catch (err) {
    logError(log, err, { userId, companyId }, "crm_commission_forecast_company failed");
    return { ok: false, error: String(err) };
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────

export const FISCAL_TOOLS: SuperToolDefinition[] = [
  {
    name: "fiscal_calculate_modelo_303",
    openaiTool: {
      type: "function",
      function: {
        name: "fiscal_calculate_modelo_303",
        description:
          "Calcula la liquidación trimestral de IVA (Modelo 303 AEAT). Agrega facturas emitidas (issued_invoices) e invoices recibidas en el trimestre, las clasifica por tipo de IVA (4%/10%/21%) y devuelve TODAS las casillas necesarias para rellenar el borrador del modelo. Devuelve también el resultado a INGRESAR / DEVOLVER + próximos pasos. Plazo presentación: 1-20 del mes siguiente.",
        parameters: {
          type: "object",
          properties: {
            year: { type: "number", description: "Ejercicio fiscal (ej: 2026)" },
            quarter: { type: "number", description: "Trimestre 1, 2, 3 o 4" },
          },
          required: ["year", "quarter"],
        },
      },
    },
    handler: fiscalCalculateModelo303Handler,
  },
  {
    name: "fiscal_calculate_modelo_130",
    openaiTool: {
      type: "function",
      function: {
        name: "fiscal_calculate_modelo_130",
        description:
          "Calcula el pago fraccionado de IRPF para autónomos (Modelo 130, estimación directa simplificada). Agrega ingresos y gastos ACUMULADOS desde 1 enero del año hasta el fin del trimestre, calcula rendimiento neto y aplica el 20%. Devuelve el importe a pagar + próximos pasos AEAT.",
        parameters: {
          type: "object",
          properties: {
            year: { type: "number" },
            quarter: { type: "number", description: "1-4" },
          },
          required: ["year", "quarter"],
        },
      },
    },
    handler: fiscalCalculateModelo130Handler,
  },
  {
    name: "fiscal_calculate_modelo_390",
    openaiTool: {
      type: "function",
      function: {
        name: "fiscal_calculate_modelo_390",
        description:
          "Calcula el resumen anual de IVA (Modelo 390 AEAT, declaración informativa anual). Consolida los 4 trimestres del año con desglose por trimestre + totales anuales. Plazo presentación: 1-30 enero año siguiente. NO liquida — solo informa, debe coincidir con los Modelos 303 ya presentados.",
        parameters: {
          type: "object",
          properties: {
            year: { type: "number", description: "Ejercicio fiscal a resumir" },
          },
          required: ["year"],
        },
      },
    },
    handler: fiscalCalculateModelo390Handler,
  },
  {
    name: "fiscal_commission_forecast",
    openaiTool: {
      type: "function",
      function: {
        name: "fiscal_commission_forecast",
        description:
          "Previsión de ingresos por comisiones. Cruza services (status contracted=ACTIVADO + offered=TRAMITADO por defecto) × commission_rates vigentes × commission_payouts. Devuelve totales sin IVA / con IVA / IVA repercutido para los próximos N meses (default 12), con desglose por provider, broker pagador y vertical. Útil para Modelo 303 futuro y tesorería.",
        parameters: {
          type: "object",
          properties: {
            months: { type: "number", description: "Horizonte en meses (default 12)" },
            category: { type: "string", description: "Filtrar por vertical: energia | telecomunicaciones | seguros | ..." },
            payer_company_id: { type: "number", description: "Filtrar por broker pagador (id de companies)" },
            statuses: {
              type: "array",
              items: { type: "string" },
              description: 'Estados de service a incluir. Default: ["contracted","offered"]. Para sólo activados: ["contracted"]. Para incluir prospección: ["contracted","offered","prospecting"]',
            },
          },
        },
      },
    },
    handler: fiscalCommissionForecastHandler,
  },
  {
    name: "bi_commission_margin",
    openaiTool: {
      type: "function",
      function: {
        name: "bi_commission_margin",
        description:
          "Análisis de margen de comisiones. Calcula esperado por vertical y provider a partir de servicios activos. (Real-vs-esperado pendiente de mapping factura↔servicio en fase futura).",
        parameters: { type: "object", properties: {} },
      },
    },
    handler: biCommissionMarginHandler,
  },
  {
    name: "crm_commission_forecast_company",
    openaiTool: {
      type: "function",
      function: {
        name: "crm_commission_forecast_company",
        description:
          "Cuánto genera una empresa al año en comisiones recurrentes — útil para priorizar cartera. Devuelve breakdown servicio a servicio.",
        parameters: {
          type: "object",
          properties: {
            company_id: { type: "number", description: "ID de la empresa en companies" },
          },
          required: ["company_id"],
        },
      },
    },
    handler: crmCommissionForecastCompanyHandler,
  },
];
