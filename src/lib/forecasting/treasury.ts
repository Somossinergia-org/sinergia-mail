import { db, schema } from "@/db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

// ═══════ TYPES ═══════

export interface MonthlyProjection {
  month: string; // YYYY-MM
  label: string; // "Enero 2026"
  income: number;
  expenses: number;
  net: number;
  confidence: {
    optimistic: { income: number; expenses: number; net: number };
    expected: { income: number; expenses: number; net: number };
    pessimistic: { income: number; expenses: number; net: number };
  };
  isProjected: boolean;
}

export interface ForecastResult {
  projections: MonthlyProjection[];
  recurringExpenses: RecurringExpense[];
  unusualExpenses: { issuerName: string; amount: number; date: string; reason: string }[];
  trend: "improving" | "declining" | "stable";
  summary: string;
}

export interface CashFlowData {
  date: string;
  income: number;
  expenses: number;
  cumulative: number;
}

export interface RecurringExpense {
  issuerName: string;
  averageAmount: number;
  frequency: "monthly" | "quarterly" | "annual";
  lastDate: string;
  nextExpectedDate: string;
  occurrences: number;
  confidence: number; // 0-100
}

export interface SeasonalData {
  month: number; // 1-12
  label: string;
  avgIncome: number;
  avgExpenses: number;
  avgNet: number;
  intensity: number; // 0-1 relative spending intensity
}

export interface RunwayResult {
  monthsRemaining: number;
  currentBalance: number;
  avgMonthlyBurn: number;
  avgMonthlyIncome: number;
  netBurn: number;
  runwayDate: string | null; // date when cash runs out, or null if self-sustaining
  status: "critical" | "warning" | "healthy";
}

// ═══════ HELPERS ═══════

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}

// Simple linear regression: returns [slope, intercept]
function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: points[0].y };

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// Weighted moving average (more recent values get higher weight)
function weightedMovingAverage(values: number[], windowSize: number = 3): number {
  if (values.length === 0) return 0;
  const window = values.slice(-windowSize);
  let weightSum = 0;
  let valSum = 0;
  for (let i = 0; i < window.length; i++) {
    const weight = i + 1; // More recent = higher weight
    valSum += window[i] * weight;
    weightSum += weight;
  }
  return valSum / weightSum;
}

// ═══════ DATA FETCHING ═══════

async function getHistoricalData(userId: string, monthsBack: number = 12) {
  const now = new Date();
  const startDate = addMonths(now, -monthsBack);

  // Received invoices (expenses)
  const expenses = await db
    .select()
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.userId, userId),
        gte(schema.invoices.invoiceDate, startDate)
      )
    )
    .orderBy(desc(schema.invoices.invoiceDate));

  // Issued invoices (income)
  const income = await db
    .select()
    .from(schema.issuedInvoices)
    .where(
      and(
        eq(schema.issuedInvoices.userId, userId),
        gte(schema.issuedInvoices.issueDate, startDate)
      )
    )
    .orderBy(desc(schema.issuedInvoices.issueDate));

  return { expenses, income };
}

function groupByMonth<T>(
  items: T[],
  getDate: (item: T) => Date | null,
  getAmount: (item: T) => number
): Map<string, number> {
  const grouped = new Map<string, number>();
  for (const item of items) {
    const date = getDate(item);
    if (!date) continue;
    const key = formatMonth(date.getFullYear(), date.getMonth() + 1);
    grouped.set(key, (grouped.get(key) ?? 0) + getAmount(item));
  }
  return grouped;
}

// ═══════ FORECASTING ENGINE ═══════

export async function getForecast(userId: string, months: number = 6): Promise<ForecastResult> {
  const { expenses, income } = await getHistoricalData(userId, 18);
  const now = new Date();

  // Group historical data by month
  const monthlyExpenses = groupByMonth(
    expenses,
    (inv) => inv.invoiceDate,
    (inv) => inv.totalAmount ?? inv.amount ?? 0
  );
  const monthlyIncome = groupByMonth(
    income,
    (inv) => inv.issueDate,
    (inv) => inv.total ?? 0
  );

  // Build historical months list
  const historicalMonths: string[] = [];
  for (let i = 17; i >= 0; i--) {
    const d = addMonths(now, -i);
    historicalMonths.push(formatMonth(d.getFullYear(), d.getMonth() + 1));
  }

  // Prepare regression data
  const incomePoints: { x: number; y: number }[] = [];
  const expensePoints: { x: number; y: number }[] = [];

  historicalMonths.forEach((m, idx) => {
    const inc = monthlyIncome.get(m) ?? 0;
    const exp = monthlyExpenses.get(m) ?? 0;
    if (inc > 0 || exp > 0) {
      incomePoints.push({ x: idx, y: inc });
      expensePoints.push({ x: idx, y: exp });
    }
  });

  const incomeRegression = linearRegression(incomePoints);
  const expenseRegression = linearRegression(expensePoints);

  // Recent averages for WMA
  const recentIncomeVals = historicalMonths.slice(-6).map((m) => monthlyIncome.get(m) ?? 0);
  const recentExpenseVals = historicalMonths.slice(-6).map((m) => monthlyExpenses.get(m) ?? 0);

  // Seasonal factors: for each calendar month, calculate average ratio vs global average
  const seasonalFactors = calculateSeasonalFactors(monthlyIncome, monthlyExpenses, historicalMonths);

  // Get recurring expenses
  const recurringExpenses = await detectRecurringExpenses(userId);

  // Build projections
  const projections: MonthlyProjection[] = [];

  // Add last 3 historical months
  for (let i = 2; i >= 0; i--) {
    const d = addMonths(now, -i);
    const key = formatMonth(d.getFullYear(), d.getMonth() + 1);
    const inc = monthlyIncome.get(key) ?? 0;
    const exp = monthlyExpenses.get(key) ?? 0;
    projections.push({
      month: key,
      label: formatMonthLabel(d.getFullYear(), d.getMonth() + 1),
      income: Math.round(inc * 100) / 100,
      expenses: Math.round(exp * 100) / 100,
      net: Math.round((inc - exp) * 100) / 100,
      confidence: {
        optimistic: { income: inc, expenses: exp, net: inc - exp },
        expected: { income: inc, expenses: exp, net: inc - exp },
        pessimistic: { income: inc, expenses: exp, net: inc - exp },
      },
      isProjected: false,
    });
  }

  // Project future months
  for (let i = 1; i <= months; i++) {
    const d = addMonths(now, i);
    const key = formatMonth(d.getFullYear(), d.getMonth() + 1);
    const baseIdx = historicalMonths.length + i;
    const calMonth = d.getMonth() + 1;

    // Blend regression prediction with WMA
    const regressionIncome = Math.max(0, incomeRegression.slope * baseIdx + incomeRegression.intercept);
    const regressionExpense = Math.max(0, expenseRegression.slope * baseIdx + expenseRegression.intercept);
    const wmaIncome = weightedMovingAverage(recentIncomeVals);
    const wmaExpense = weightedMovingAverage(recentExpenseVals);

    // 60% WMA + 40% regression, adjusted by seasonal factor
    const seasonIncome = seasonalFactors.get(calMonth)?.incomeRatio ?? 1;
    const seasonExpense = seasonalFactors.get(calMonth)?.expenseRatio ?? 1;

    const expectedIncome = Math.max(0, (wmaIncome * 0.6 + regressionIncome * 0.4) * seasonIncome);
    const expectedExpense = Math.max(0, (wmaExpense * 0.6 + regressionExpense * 0.4) * seasonExpense);

    // Confidence intervals: +/- 20% for optimistic/pessimistic, widening with distance
    const spreadFactor = 1 + (i - 1) * 0.05; // spreads 5% per month
    const optimisticIncome = expectedIncome * (1 + 0.2 * spreadFactor);
    const pessimisticIncome = expectedIncome * (1 - 0.2 * spreadFactor);
    const optimisticExpense = expectedExpense * (1 - 0.15 * spreadFactor);
    const pessimisticExpense = expectedExpense * (1 + 0.2 * spreadFactor);

    projections.push({
      month: key,
      label: formatMonthLabel(d.getFullYear(), d.getMonth() + 1),
      income: Math.round(expectedIncome * 100) / 100,
      expenses: Math.round(expectedExpense * 100) / 100,
      net: Math.round((expectedIncome - expectedExpense) * 100) / 100,
      confidence: {
        optimistic: {
          income: Math.round(optimisticIncome * 100) / 100,
          expenses: Math.round(optimisticExpense * 100) / 100,
          net: Math.round((optimisticIncome - optimisticExpense) * 100) / 100,
        },
        expected: {
          income: Math.round(expectedIncome * 100) / 100,
          expenses: Math.round(expectedExpense * 100) / 100,
          net: Math.round((expectedIncome - expectedExpense) * 100) / 100,
        },
        pessimistic: {
          income: Math.round(pessimisticIncome * 100) / 100,
          expenses: Math.round(pessimisticExpense * 100) / 100,
          net: Math.round((pessimisticIncome - pessimisticExpense) * 100) / 100,
        },
      },
      isProjected: true,
    });
  }

  // Detect unusual upcoming expenses
  const avgExpensePerInvoice =
    expenses.length > 0
      ? expenses.reduce((sum, inv) => sum + (inv.totalAmount ?? inv.amount ?? 0), 0) / expenses.length
      : 0;
  const stdDev = Math.sqrt(
    expenses.reduce((sum, inv) => {
      const diff = (inv.totalAmount ?? inv.amount ?? 0) - avgExpensePerInvoice;
      return sum + diff * diff;
    }, 0) / Math.max(1, expenses.length)
  );

  const unusualExpenses = expenses
    .filter((inv) => {
      const amount = inv.totalAmount ?? inv.amount ?? 0;
      return amount > avgExpensePerInvoice + 2 * stdDev && inv.invoiceDate;
    })
    .slice(0, 5)
    .map((inv) => ({
      issuerName: inv.issuerName ?? "Desconocido",
      amount: inv.totalAmount ?? inv.amount ?? 0,
      date: inv.invoiceDate?.toISOString().split("T")[0] ?? "",
      reason: `Importe ${Math.round(((inv.totalAmount ?? inv.amount ?? 0) / Math.max(1, avgExpensePerInvoice)) * 100)}% sobre la media`,
    }));

  // Determine trend
  const lastThreeNets = projections
    .filter((p) => !p.isProjected)
    .slice(-3)
    .map((p) => p.net);
  let trend: "improving" | "declining" | "stable" = "stable";
  if (lastThreeNets.length >= 2) {
    const first = lastThreeNets[0];
    const last = lastThreeNets[lastThreeNets.length - 1];
    if (last > first * 1.1) trend = "improving";
    else if (last < first * 0.9) trend = "declining";
  }

  // Generate summary
  const futureProjections = projections.filter((p) => p.isProjected);
  const avgFutureNet =
    futureProjections.length > 0
      ? futureProjections.reduce((s, p) => s + p.net, 0) / futureProjections.length
      : 0;

  let summary = "";
  if (trend === "improving") {
    summary = `La tendencia financiera es positiva. Se proyecta un flujo neto medio de ${avgFutureNet.toFixed(0)}EUR/mes en los proximos ${months} meses.`;
  } else if (trend === "declining") {
    summary = `Atencion: la tendencia financiera es descendente. Se proyecta un flujo neto medio de ${avgFutureNet.toFixed(0)}EUR/mes. Revisa gastos recurrentes.`;
  } else {
    summary = `La situacion financiera se mantiene estable con un flujo neto medio proyectado de ${avgFutureNet.toFixed(0)}EUR/mes.`;
  }

  if (recurringExpenses.length > 0) {
    const totalRecurring = recurringExpenses.reduce((s, r) => s + r.averageAmount, 0);
    summary += ` Se han detectado ${recurringExpenses.length} gastos recurrentes por un total de ${totalRecurring.toFixed(0)}EUR/periodo.`;
  }

  return {
    projections,
    recurringExpenses,
    unusualExpenses,
    trend,
    summary,
  };
}

export async function getCashFlow(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CashFlowData[]> {
  const expenses = await db
    .select()
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.userId, userId),
        gte(schema.invoices.invoiceDate, startDate),
        lte(schema.invoices.invoiceDate, endDate)
      )
    )
    .orderBy(schema.invoices.invoiceDate);

  const income = await db
    .select()
    .from(schema.issuedInvoices)
    .where(
      and(
        eq(schema.issuedInvoices.userId, userId),
        gte(schema.issuedInvoices.issueDate, startDate),
        lte(schema.issuedInvoices.issueDate, endDate)
      )
    )
    .orderBy(schema.issuedInvoices.issueDate);

  // Group by day
  const dailyMap = new Map<string, { income: number; expenses: number }>();

  for (const inv of income) {
    const key = inv.issueDate.toISOString().split("T")[0];
    const entry = dailyMap.get(key) ?? { income: 0, expenses: 0 };
    entry.income += inv.total ?? 0;
    dailyMap.set(key, entry);
  }

  for (const inv of expenses) {
    if (!inv.invoiceDate) continue;
    const key = inv.invoiceDate.toISOString().split("T")[0];
    const entry = dailyMap.get(key) ?? { income: 0, expenses: 0 };
    entry.expenses += inv.totalAmount ?? inv.amount ?? 0;
    dailyMap.set(key, entry);
  }

  // Sort by date and compute cumulative
  const sortedKeys = Array.from(dailyMap.keys()).sort();
  let cumulative = 0;
  const result: CashFlowData[] = [];

  for (const key of sortedKeys) {
    const entry = dailyMap.get(key)!;
    cumulative += entry.income - entry.expenses;
    result.push({
      date: key,
      income: Math.round(entry.income * 100) / 100,
      expenses: Math.round(entry.expenses * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
    });
  }

  return result;
}

export async function detectRecurringExpenses(userId: string): Promise<RecurringExpense[]> {
  // Get all expenses grouped by issuer
  const expenses = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.userId, userId))
    .orderBy(desc(schema.invoices.invoiceDate));

  // Group by normalized issuer name
  type InvoiceRow = (typeof expenses)[number];
  const byIssuer = new Map<string, InvoiceRow[]>();
  for (const inv of expenses) {
    const key = (inv.issuerNormalized ?? inv.issuerName ?? "unknown").toLowerCase().trim();
    if (!byIssuer.has(key)) byIssuer.set(key, []);
    byIssuer.get(key)!.push(inv);
  }

  const recurring: RecurringExpense[] = [];

  const issuerEntries = Array.from(byIssuer.entries());
  for (const [key, invoices] of issuerEntries) {
    if (invoices.length < 2) continue;

    // Sort by date
    const sorted: InvoiceRow[] = invoices
      .filter((inv: InvoiceRow) => inv.invoiceDate)
      .sort((a: InvoiceRow, b: InvoiceRow) => (a.invoiceDate!.getTime() - b.invoiceDate!.getTime()));

    if (sorted.length < 2) continue;

    // Calculate intervals between consecutive invoices
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysBetween(sorted[i].invoiceDate!, sorted[i - 1].invoiceDate!));
    }

    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const stdDevInterval = Math.sqrt(
      intervals.reduce((s, v) => s + (v - avgInterval) * (v - avgInterval), 0) / intervals.length
    );

    // Determine frequency and confidence
    let frequency: "monthly" | "quarterly" | "annual";
    let confidence = 0;
    const coeffOfVariation = avgInterval > 0 ? stdDevInterval / avgInterval : 999;

    if (avgInterval >= 20 && avgInterval <= 40) {
      frequency = "monthly";
      confidence = Math.max(0, Math.min(100, Math.round((1 - coeffOfVariation) * 100)));
    } else if (avgInterval >= 75 && avgInterval <= 110) {
      frequency = "quarterly";
      confidence = Math.max(0, Math.min(100, Math.round((1 - coeffOfVariation) * 100)));
    } else if (avgInterval >= 330 && avgInterval <= 400) {
      frequency = "annual";
      confidence = Math.max(0, Math.min(100, Math.round((1 - coeffOfVariation) * 100)));
    } else {
      continue; // Not a recognizable recurring pattern
    }

    // Only include if confidence is reasonable
    if (confidence < 30) continue;

    const avgAmount =
      sorted.reduce((s: number, inv: InvoiceRow) => s + (inv.totalAmount ?? inv.amount ?? 0), 0) / sorted.length;
    const lastDate = sorted[sorted.length - 1].invoiceDate!;
    const nextExpected = new Date(lastDate.getTime() + avgInterval * 24 * 60 * 60 * 1000);

    recurring.push({
      issuerName: invoices[0].issuerName ?? key,
      averageAmount: Math.round(avgAmount * 100) / 100,
      frequency,
      lastDate: lastDate.toISOString().split("T")[0],
      nextExpectedDate: nextExpected.toISOString().split("T")[0],
      occurrences: sorted.length,
      confidence,
    });
  }

  return recurring.sort((a, b) => b.averageAmount - a.averageAmount);
}

export async function getSeasonalPattern(userId: string): Promise<SeasonalData[]> {
  const { expenses, income } = await getHistoricalData(userId, 24);

  // Aggregate by calendar month
  const monthData = new Map<number, { incomes: number[]; expenses: number[] }>();
  for (let m = 1; m <= 12; m++) {
    monthData.set(m, { incomes: [], expenses: [] });
  }

  for (const inv of income) {
    if (!inv.issueDate) continue;
    const m = inv.issueDate.getMonth() + 1;
    monthData.get(m)!.incomes.push(inv.total ?? 0);
  }

  for (const inv of expenses) {
    if (!inv.invoiceDate) continue;
    const m = inv.invoiceDate.getMonth() + 1;
    monthData.get(m)!.expenses.push(inv.totalAmount ?? inv.amount ?? 0);
  }

  const result: SeasonalData[] = [];
  let maxExpense = 0;

  for (let m = 1; m <= 12; m++) {
    const data = monthData.get(m)!;
    const avgIncome =
      data.incomes.length > 0
        ? data.incomes.reduce((s, v) => s + v, 0) / data.incomes.length
        : 0;
    const avgExpenses =
      data.expenses.length > 0
        ? data.expenses.reduce((s, v) => s + v, 0) / data.expenses.length
        : 0;
    if (avgExpenses > maxExpense) maxExpense = avgExpenses;
    result.push({
      month: m,
      label: MONTH_NAMES[m - 1],
      avgIncome: Math.round(avgIncome * 100) / 100,
      avgExpenses: Math.round(avgExpenses * 100) / 100,
      avgNet: Math.round((avgIncome - avgExpenses) * 100) / 100,
      intensity: 0, // computed below
    });
  }

  // Normalize intensity
  if (maxExpense > 0) {
    for (const r of result) {
      r.intensity = Math.round((r.avgExpenses / maxExpense) * 100) / 100;
    }
  }

  return result;
}

export async function getRunway(
  userId: string,
  currentBalance: number
): Promise<RunwayResult> {
  const { expenses, income } = await getHistoricalData(userId, 6);

  // Calculate monthly averages over last 6 months
  const now = new Date();
  const sixMonthsAgo = addMonths(now, -6);

  let totalIncome = 0;
  let totalExpenses = 0;
  let monthsWithData = 0;

  for (let i = 0; i < 6; i++) {
    const d = addMonths(now, -i);
    const key = formatMonth(d.getFullYear(), d.getMonth() + 1);

    const monthIncome = income
      .filter((inv) => inv.issueDate && formatMonth(inv.issueDate.getFullYear(), inv.issueDate.getMonth() + 1) === key)
      .reduce((s, inv) => s + (inv.total ?? 0), 0);

    const monthExpenses = expenses
      .filter((inv) => inv.invoiceDate && formatMonth(inv.invoiceDate.getFullYear(), inv.invoiceDate.getMonth() + 1) === key)
      .reduce((s, inv) => s + (inv.totalAmount ?? inv.amount ?? 0), 0);

    if (monthIncome > 0 || monthExpenses > 0) monthsWithData++;
    totalIncome += monthIncome;
    totalExpenses += monthExpenses;
  }

  const divisor = Math.max(1, monthsWithData);
  const avgMonthlyIncome = totalIncome / divisor;
  const avgMonthlyBurn = totalExpenses / divisor;
  const netBurn = avgMonthlyBurn - avgMonthlyIncome;

  let monthsRemaining: number;
  let runwayDate: string | null = null;

  if (netBurn <= 0) {
    // Self-sustaining or profitable
    monthsRemaining = 999;
    runwayDate = null;
  } else {
    monthsRemaining = Math.max(0, Math.floor(currentBalance / netBurn));
    const endDate = addMonths(now, monthsRemaining);
    runwayDate = endDate.toISOString().split("T")[0];
  }

  let status: "critical" | "warning" | "healthy";
  if (monthsRemaining < 3) status = "critical";
  else if (monthsRemaining <= 6) status = "warning";
  else status = "healthy";

  return {
    monthsRemaining: Math.min(monthsRemaining, 999),
    currentBalance,
    avgMonthlyBurn: Math.round(avgMonthlyBurn * 100) / 100,
    avgMonthlyIncome: Math.round(avgMonthlyIncome * 100) / 100,
    netBurn: Math.round(netBurn * 100) / 100,
    runwayDate,
    status,
  };
}

// ═══════ INTERNAL HELPERS ═══════

function calculateSeasonalFactors(
  monthlyIncome: Map<string, number>,
  monthlyExpenses: Map<string, number>,
  historicalMonths: string[]
): Map<number, { incomeRatio: number; expenseRatio: number }> {
  const globalAvgIncome =
    Array.from(monthlyIncome.values()).reduce((s, v) => s + v, 0) /
    Math.max(1, monthlyIncome.size);
  const globalAvgExpense =
    Array.from(monthlyExpenses.values()).reduce((s, v) => s + v, 0) /
    Math.max(1, monthlyExpenses.size);

  const calendarMonthIncome = new Map<number, number[]>();
  const calendarMonthExpense = new Map<number, number[]>();

  for (const m of historicalMonths) {
    const calMonth = parseInt(m.split("-")[1]);
    const inc = monthlyIncome.get(m) ?? 0;
    const exp = monthlyExpenses.get(m) ?? 0;

    if (!calendarMonthIncome.has(calMonth)) calendarMonthIncome.set(calMonth, []);
    if (!calendarMonthExpense.has(calMonth)) calendarMonthExpense.set(calMonth, []);
    calendarMonthIncome.get(calMonth)!.push(inc);
    calendarMonthExpense.get(calMonth)!.push(exp);
  }

  const factors = new Map<number, { incomeRatio: number; expenseRatio: number }>();

  for (let m = 1; m <= 12; m++) {
    const incVals = calendarMonthIncome.get(m) ?? [];
    const expVals = calendarMonthExpense.get(m) ?? [];

    const avgInc = incVals.length > 0 ? incVals.reduce((s, v) => s + v, 0) / incVals.length : 0;
    const avgExp = expVals.length > 0 ? expVals.reduce((s, v) => s + v, 0) / expVals.length : 0;

    factors.set(m, {
      incomeRatio: globalAvgIncome > 0 ? avgInc / globalAvgIncome : 1,
      expenseRatio: globalAvgExpense > 0 ? avgExp / globalAvgExpense : 1,
    });
  }

  return factors;
}
