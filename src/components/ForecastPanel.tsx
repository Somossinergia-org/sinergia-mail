"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, DollarSign, Calendar, RefreshCw,
  Loader2, AlertCircle, CheckCircle, Clock, Banknote, ArrowUpRight,
  ArrowDownRight, Activity, Gauge, Brain,
} from "lucide-react";

// ═══════ TYPES ═══════

interface MonthlyProjection {
  month: string;
  label: string;
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

interface RecurringExpense {
  issuerName: string;
  averageAmount: number;
  frequency: "monthly" | "quarterly" | "annual";
  lastDate: string;
  nextExpectedDate: string;
  occurrences: number;
  confidence: number;
}

interface ForecastResult {
  projections: MonthlyProjection[];
  recurringExpenses: RecurringExpense[];
  unusualExpenses: Array<{ issuerName: string; amount: number; date: string; reason: string }>;
  trend: "improving" | "declining" | "stable";
  summary: string;
}

interface SeasonalData {
  month: number;
  label: string;
  avgIncome: number;
  avgExpenses: number;
  avgNet: number;
  intensity: number;
}

interface RunwayResult {
  monthsRemaining: number;
  currentBalance: number;
  avgMonthlyBurn: number;
  avgMonthlyIncome: number;
  netBurn: number;
  runwayDate: string | null;
  status: "critical" | "warning" | "healthy";
}

// ═══════ COMPONENT ═══════

export default function ForecastPanel() {
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [seasonal, setSeasonal] = useState<SeasonalData[]>([]);
  const [runway, setRunway] = useState<RunwayResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [runwayLoading, setRunwayLoading] = useState(false);
  const [balance, setBalance] = useState<string>("");
  const [balanceInput, setBalanceInput] = useState<string>("");

  const fetchForecast = useCallback(async () => {
    setLoading(true);
    try {
      const [forecastRes, seasonalRes] = await Promise.all([
        fetch("/api/forecasting"),
        fetch("/api/forecasting?type=seasonal"),
      ]);
      if (forecastRes.ok) {
        const json = await forecastRes.json();
        setForecast(json.forecast);
      }
      if (seasonalRes.ok) {
        const json = await seasonalRes.json();
        setSeasonal(json.seasonal);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  const calculateRunway = async () => {
    const numBalance = parseFloat(balanceInput);
    if (isNaN(numBalance) || numBalance < 0) return;
    setRunwayLoading(true);
    setBalance(balanceInput);
    try {
      const res = await fetch(`/api/forecasting?type=runway&balance=${numBalance}`);
      if (res.ok) {
        const json = await res.json();
        setRunway(json.runway);
      }
    } catch {
      // silent
    }
    setRunwayLoading(false);
  };

  const trendIcon = (trend: string) => {
    if (trend === "improving") return <TrendingUp className="w-5 h-5 text-green-400" />;
    if (trend === "declining") return <TrendingDown className="w-5 h-5 text-red-400" />;
    return <Minus className="w-5 h-5 text-gray-400" />;
  };

  const trendLabel = (trend: string) => {
    if (trend === "improving") return "Mejorando";
    if (trend === "declining") return "Descendente";
    return "Estable";
  };

  const trendColor = (trend: string) => {
    if (trend === "improving") return "text-green-400";
    if (trend === "declining") return "text-red-400";
    return "text-gray-400";
  };

  const frequencyLabel = (freq: string) => {
    if (freq === "monthly") return "Mensual";
    if (freq === "quarterly") return "Trimestral";
    return "Anual";
  };

  const formatEur = (val: number) => {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(val);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (!forecast) {
    return (
      <div className="text-center text-gray-500 py-12">
        No se pudieron cargar los datos de forecast
      </div>
    );
  }

  // Prepare chart data
  const chartData = forecast.projections.map((p) => ({
    name: p.label.replace(/\s\d{4}$/, "").slice(0, 3),
    month: p.month,
    fullLabel: p.label,
    income: p.income,
    expenses: p.expenses,
    net: p.net,
    isProjected: p.isProjected,
    optimisticNet: p.confidence.optimistic.net,
    pessimisticNet: p.confidence.pessimistic.net,
  }));

  // Next 3 projected months
  const nextThreeMonths = forecast.projections.filter((p) => p.isProjected).slice(0, 3);

  return (
    <div className="space-y-6">
      {/* ── TREND HEADER ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {trendIcon(forecast.trend)}
          <div>
            <span className={`text-sm font-semibold ${trendColor(forecast.trend)}`}>
              Tendencia: {trendLabel(forecast.trend)}
            </span>
          </div>
        </div>
        <button
          onClick={fetchForecast}
          className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-400 hover:bg-cyan-500/30 transition-colors text-xs"
        >
          <RefreshCw className="w-3 h-3" />
          Actualizar
        </button>
      </div>

      {/* ── CASH FLOW CHART ── */}
      <div className="bg-[#0a1628] border border-[#1a2d4a] rounded-lg p-4">
        <h3 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4" /> Flujo de Caja — Historico + Proyeccion
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2d4a" />
            <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0a1628",
                border: "1px solid #1a2d4a",
                borderRadius: "8px",
                color: "#e2e8f0",
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [formatEur(value), name === "income" ? "Ingresos" : name === "expenses" ? "Gastos" : "Neto"]}
              labelFormatter={(label) => {
                const item = chartData.find((d) => d.name === label);
                return item ? `${item.fullLabel}${item.isProjected ? " (Proyeccion)" : ""}` : label;
              }}
            />
            <Area
              type="monotone"
              dataKey="income"
              stroke="#22c55e"
              fill="url(#incomeGrad)"
              strokeWidth={2}
              strokeDasharray={undefined}
              name="Ingresos"
            />
            <Area
              type="monotone"
              dataKey="expenses"
              stroke="#ef4444"
              fill="url(#expenseGrad)"
              strokeWidth={2}
              name="Gastos"
            />
            <Area
              type="monotone"
              dataKey="net"
              stroke="#22d3ee"
              fill="none"
              strokeWidth={2}
              strokeDasharray="5 5"
              name="Neto"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── MONTHLY PROJECTION CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {nextThreeMonths.map((proj) => (
          <div key={proj.month} className="bg-[#0a1628] border border-[#1a2d4a] rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">{proj.label}</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-gray-400">Ingresos</span>
                </div>
                <span className="text-sm font-semibold text-green-400">{formatEur(proj.income)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowDownRight className="w-4 h-4 text-red-400" />
                  <span className="text-xs text-gray-400">Gastos</span>
                </div>
                <span className="text-sm font-semibold text-red-400">{formatEur(proj.expenses)}</span>
              </div>
              <div className="h-px bg-[#1a2d4a]" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Neto</span>
                <span className={`text-lg font-bold ${proj.net >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {formatEur(proj.net)}
                </span>
              </div>
              {/* Confidence range */}
              <div className="text-[10px] text-gray-500">
                Rango: {formatEur(proj.confidence.pessimistic.net)} — {formatEur(proj.confidence.optimistic.net)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── RECURRING + RUNWAY ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recurring Expenses */}
        <div className="bg-[#0a1628] border border-[#1a2d4a] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Gastos Recurrentes Detectados
          </h3>
          {forecast.recurringExpenses.length === 0 ? (
            <div className="text-center text-gray-500 text-xs py-8">
              No se han detectado gastos recurrentes
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {forecast.recurringExpenses.map((exp, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 bg-[#050a14] rounded-lg border border-[#1a2d4a]">
                  <Banknote className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{exp.issuerName}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-500">{frequencyLabel(exp.frequency)}</span>
                      <span className="text-[10px] text-gray-600">|</span>
                      <span className="text-[10px] text-gray-500">{exp.occurrences} veces</span>
                      <span className="text-[10px] text-gray-600">|</span>
                      <span className="text-[10px] text-gray-500">Prox: {exp.nextExpectedDate}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-semibold text-red-400">{formatEur(exp.averageAmount)}</div>
                    <div className="text-[10px] text-gray-500">{exp.confidence}% conf.</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Runway Meter */}
        <div className="bg-[#0a1628] border border-[#1a2d4a] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center gap-2">
            <Gauge className="w-4 h-4" /> Runway
          </h3>

          {/* Balance input */}
          <div className="flex gap-2 mb-4">
            <input
              type="number"
              placeholder="Saldo actual en EUR"
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
              className="flex-1 px-3 py-2 bg-[#050a14] border border-[#1a2d4a] rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
            />
            <button
              onClick={calculateRunway}
              disabled={runwayLoading || !balanceInput}
              className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-400 hover:bg-cyan-500/30 transition-colors text-sm disabled:opacity-50"
            >
              {runwayLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Calcular"}
            </button>
          </div>

          {runway ? (
            <div className="space-y-4">
              {/* Runway gauge */}
              <div className="flex items-center justify-center">
                <div className="relative w-40 h-40">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#1a2d4a" strokeWidth="8" />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke={runway.status === "critical" ? "#ef4444" : runway.status === "warning" ? "#eab308" : "#22c55e"}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${Math.min(runway.monthsRemaining / 12, 1) * 264} 264`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-3xl font-bold ${
                      runway.status === "critical" ? "text-red-400" : runway.status === "warning" ? "text-yellow-400" : "text-green-400"
                    }`}>
                      {runway.monthsRemaining >= 999 ? "+" : runway.monthsRemaining}
                    </span>
                    <span className="text-[10px] text-gray-500 uppercase">
                      {runway.monthsRemaining >= 999 ? "Sostenible" : "meses"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-[#050a14] rounded-lg p-2 border border-[#1a2d4a]">
                  <div className="text-xs text-gray-500">Ingreso Medio/Mes</div>
                  <div className="text-sm font-semibold text-green-400">{formatEur(runway.avgMonthlyIncome)}</div>
                </div>
                <div className="bg-[#050a14] rounded-lg p-2 border border-[#1a2d4a]">
                  <div className="text-xs text-gray-500">Gasto Medio/Mes</div>
                  <div className="text-sm font-semibold text-red-400">{formatEur(runway.avgMonthlyBurn)}</div>
                </div>
                <div className="bg-[#050a14] rounded-lg p-2 border border-[#1a2d4a]">
                  <div className="text-xs text-gray-500">Burn Neto/Mes</div>
                  <div className={`text-sm font-semibold ${runway.netBurn <= 0 ? "text-green-400" : "text-red-400"}`}>
                    {formatEur(runway.netBurn)}
                  </div>
                </div>
                <div className="bg-[#050a14] rounded-lg p-2 border border-[#1a2d4a]">
                  <div className="text-xs text-gray-500">Saldo</div>
                  <div className="text-sm font-semibold text-white">{formatEur(runway.currentBalance)}</div>
                </div>
              </div>

              {runway.runwayDate && (
                <div className={`text-center text-xs p-2 rounded-lg border ${
                  runway.status === "critical"
                    ? "text-red-400 border-red-500/30 bg-red-500/10"
                    : runway.status === "warning"
                    ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                    : "text-green-400 border-green-500/30 bg-green-500/10"
                }`}>
                  {runway.status === "critical"
                    ? `ALERTA: El saldo se agota aproximadamente el ${runway.runwayDate}`
                    : runway.status === "warning"
                    ? `El saldo podria agotarse el ${runway.runwayDate}. Revisa gastos.`
                    : `Runway saludable hasta ${runway.runwayDate}.`}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-500 text-xs py-8">
              Introduce tu saldo bancario actual para calcular el runway
            </div>
          )}
        </div>
      </div>

      {/* ── SEASONAL HEATMAP ── */}
      <div className="bg-[#0a1628] border border-[#1a2d4a] rounded-lg p-4">
        <h3 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Patron Estacional
        </h3>
        {seasonal.length > 0 ? (
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
            {seasonal.map((s) => {
              const intensity = s.intensity;
              const bg =
                intensity >= 0.8
                  ? "bg-red-500/30 border-red-500/40"
                  : intensity >= 0.6
                  ? "bg-orange-500/25 border-orange-500/30"
                  : intensity >= 0.4
                  ? "bg-yellow-500/20 border-yellow-500/25"
                  : intensity >= 0.2
                  ? "bg-green-500/15 border-green-500/20"
                  : "bg-[#050a14] border-[#1a2d4a]";
              return (
                <div key={s.month} className={`rounded-lg p-2 border text-center ${bg}`}>
                  <div className="text-[10px] text-gray-400 font-semibold">{s.label.slice(0, 3)}</div>
                  <div className="text-xs text-white font-bold mt-1">
                    {s.avgExpenses > 0 ? formatEur(s.avgExpenses) : "-"}
                  </div>
                  <div className="text-[9px] text-gray-500 mt-0.5">
                    {s.avgIncome > 0 ? `+${formatEur(s.avgIncome)}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-gray-500 text-xs py-6">Sin datos estacionales</div>
        )}
      </div>

      {/* ── AI INSIGHTS ── */}
      <div className="bg-[#0a1628] border border-cyan-500/20 rounded-lg p-4 shadow-lg shadow-cyan-500/5">
        <h3 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center gap-2">
          <Brain className="w-4 h-4" /> Analisis IA
        </h3>
        <p className="text-sm text-gray-300 leading-relaxed">{forecast.summary}</p>

        {forecast.unusualExpenses.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-yellow-400 font-semibold mb-2 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Gastos Inusuales Detectados
            </div>
            <div className="space-y-1">
              {forecast.unusualExpenses.map((exp, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs bg-yellow-500/5 border border-yellow-500/10 rounded-lg px-3 py-1.5">
                  <div>
                    <span className="text-white">{exp.issuerName}</span>
                    <span className="text-gray-500 ml-2">{exp.date}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-yellow-400 font-semibold">{formatEur(exp.amount)}</span>
                    <span className="text-gray-500 ml-2 text-[10px]">{exp.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
