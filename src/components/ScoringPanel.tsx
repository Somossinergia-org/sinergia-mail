"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  AreaChart, Area,
} from "recharts";
import {
  Activity, TrendingUp, TrendingDown, Users, Flame, Snowflake, Thermometer,
  RefreshCw, Loader2, ChevronRight, Target, AlertTriangle, UserCheck,
  Zap, X,
} from "lucide-react";

// ═══════ TYPES ═══════

interface ScoringContact {
  id: number;
  name: string | null;
  email: string;
  company: string | null;
  category: string | null;
  score: number | null;
  scoreEmail: number | null;
  scoreInvoice: number | null;
  scoreActivity: number | null;
  temperature: string | null;
  totalInvoiced: number | null;
  lastContactedAt: string | null;
}

interface ScoreBreakdown {
  contactId: number;
  contactName: string | null;
  contactEmail: string;
  score: number;
  recency: number;
  frequency: number;
  monetary: number;
  engagement: number;
  velocity: number;
  bonuses: number;
  penalties: number;
  temperature: string;
  signals: string[];
}

interface ContactPrediction {
  contactId: number;
  contactName: string | null;
  likelihoodToRespond: number;
  churnRisk: number;
  readyToClose: number;
  nextBestAction: string;
  reasoning: string;
}

interface TrendPoint {
  date: string;
  score: number;
}

interface ScoringStats {
  total: number;
  hotCount: number;
  warmCount: number;
  coldCount: number;
  avgScore: number;
  distribution: Array<{ range: string; count: number }>;
}

interface ScoringData {
  contacts: ScoringContact[];
  stats: ScoringStats;
}

// ═══════ COMPONENT ═══════

export default function ScoringPanel() {
  const [data, setData] = useState<ScoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [lastRecalculated, setLastRecalculated] = useState<string | null>(null);

  // Detail panel state
  const [selectedContact, setSelectedContact] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<ScoreBreakdown | null>(null);
  const [prediction, setPrediction] = useState<ContactPrediction | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Predictions lists
  const [predictions, setPredictions] = useState<{
    likelyRespond: ContactPrediction[];
    atRisk: ContactPrediction[];
    readyToClose: ContactPrediction[];
  }>({ likelyRespond: [], atRisk: [], readyToClose: [] });
  const [predictionsLoading, setPredictionsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/scoring");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const res = await fetch("/api/scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recalculate" }),
      });
      if (res.ok) {
        const json = await res.json();
        setLastRecalculated(json.recalculatedAt);
        await fetchData();
      }
    } catch {
      // silent
    }
    setRecalculating(false);
  };

  const loadContactDetail = async (contactId: number) => {
    setSelectedContact(contactId);
    setDetailLoading(true);
    setBreakdown(null);
    setPrediction(null);
    setTrend([]);

    try {
      const [breakdownRes, trendRes, predRes] = await Promise.all([
        fetch(`/api/scoring?contactId=${contactId}`),
        fetch(`/api/scoring?contactId=${contactId}&trendDays=90`),
        fetch("/api/scoring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "predict", contactId }),
        }),
      ]);

      if (breakdownRes.ok) {
        const json = await breakdownRes.json();
        setBreakdown(json.breakdown);
      }
      if (trendRes.ok) {
        const json = await trendRes.json();
        setTrend(json.trend);
      }
      if (predRes.ok) {
        const json = await predRes.json();
        setPrediction(json.prediction);
      }
    } catch {
      // silent
    }
    setDetailLoading(false);
  };

  const loadPredictions = async () => {
    if (!data || data.contacts.length === 0) return;
    setPredictionsLoading(true);

    // Get predictions for top 15 contacts
    const topContacts = data.contacts.slice(0, 15);
    const preds: ContactPrediction[] = [];

    for (const c of topContacts) {
      try {
        const res = await fetch("/api/scoring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "predict", contactId: c.id }),
        });
        if (res.ok) {
          const json = await res.json();
          preds.push(json.prediction);
        }
      } catch {
        // skip
      }
    }

    setPredictions({
      likelyRespond: preds.filter((p) => p.likelihoodToRespond >= 60).sort((a, b) => b.likelihoodToRespond - a.likelihoodToRespond).slice(0, 5),
      atRisk: preds.filter((p) => p.churnRisk >= 50).sort((a, b) => b.churnRisk - a.churnRisk).slice(0, 5),
      readyToClose: preds.filter((p) => p.readyToClose >= 50).sort((a, b) => b.readyToClose - a.readyToClose).slice(0, 5),
    });
    setPredictionsLoading(false);
  };

  useEffect(() => {
    if (data && data.contacts.length > 0) {
      loadPredictions();
    }
  }, [data?.contacts.length]);

  const temperatureIcon = (temp: string | null) => {
    if (temp === "hot") return <Flame className="w-4 h-4 text-red-400" />;
    if (temp === "warm") return <Thermometer className="w-4 h-4 text-yellow-400" />;
    return <Snowflake className="w-4 h-4 text-blue-400" />;
  };

  const temperatureColor = (temp: string | null) => {
    if (temp === "hot") return "text-red-400";
    if (temp === "warm") return "text-yellow-400";
    return "text-blue-400";
  };

  const scoreColor = (score: number) => {
    if (score >= 70) return "text-green-400";
    if (score >= 40) return "text-yellow-400";
    return "text-red-400";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center text-gray-500 py-12">
        No se pudieron cargar los datos de scoring
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── TOP BAR ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Score Medio"
          value={data.stats.avgScore.toString()}
          icon={<Activity className="w-5 h-5 text-cyan-400" />}
          accent="cyan"
        />
        <StatCard
          label="Calientes"
          value={data.stats.hotCount.toString()}
          icon={<Flame className="w-5 h-5 text-red-400" />}
          accent="red"
        />
        <StatCard
          label="Templados"
          value={data.stats.warmCount.toString()}
          icon={<Thermometer className="w-5 h-5 text-yellow-400" />}
          accent="yellow"
        />
        <StatCard
          label="Frios"
          value={data.stats.coldCount.toString()}
          icon={<Snowflake className="w-5 h-5 text-blue-400" />}
          accent="blue"
        />
        <div className="bg-[#0a1628] border border-[#1a2d4a] rounded-lg p-3 flex flex-col items-center justify-center">
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="flex items-center gap-2 px-3 py-2 bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-400 hover:bg-cyan-500/30 transition-colors text-sm disabled:opacity-50"
          >
            {recalculating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Recalcular Scores
          </button>
          {lastRecalculated && (
            <span className="text-[10px] text-gray-500 mt-1">
              {new Date(lastRecalculated).toLocaleString("es-ES")}
            </span>
          )}
        </div>
      </div>

      {/* ── MAIN GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Leaderboard */}
        <div className="lg:col-span-1 bg-[#0a1628] border border-[#1a2d4a] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Top 10 Contactos
          </h3>
          <div className="space-y-2">
            {data.contacts.slice(0, 10).map((c, idx) => (
              <button
                key={c.id}
                onClick={() => loadContactDetail(c.id)}
                className={`w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[#1a2d4a]/60 transition-colors text-left ${
                  selectedContact === c.id ? "bg-[#1a2d4a]/80 border border-cyan-500/30" : ""
                }`}
              >
                <span className="text-xs text-gray-500 w-5 text-right">{idx + 1}</span>
                {temperatureIcon(c.temperature)}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{c.name || c.email}</div>
                  <div className="text-[10px] text-gray-500 truncate">{c.company || c.email}</div>
                </div>
                <div className={`text-lg font-bold ${scoreColor(c.score ?? 0)}`}>
                  {c.score ?? 0}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            ))}
          </div>
        </div>

        {/* Score Distribution Chart */}
        <div className="lg:col-span-2 bg-[#0a1628] border border-[#1a2d4a] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Distribucion de Scores
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.stats.distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2d4a" />
              <XAxis dataKey="range" tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0a1628",
                  border: "1px solid #1a2d4a",
                  borderRadius: "8px",
                  color: "#e2e8f0",
                }}
              />
              <Bar dataKey="count" fill="#22d3ee" radius={[4, 4, 0, 0]} name="Contactos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── PREDICTIONS ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PredictionCard
          title="Probable Respuesta"
          icon={<UserCheck className="w-4 h-4 text-green-400" />}
          items={predictions.likelyRespond}
          loading={predictionsLoading}
          metric="likelihoodToRespond"
          color="green"
          emptyText="Sin datos suficientes"
        />
        <PredictionCard
          title="Riesgo de Churn"
          icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
          items={predictions.atRisk}
          loading={predictionsLoading}
          metric="churnRisk"
          color="red"
          emptyText="Sin contactos en riesgo"
        />
        <PredictionCard
          title="Listos para Cerrar"
          icon={<Target className="w-4 h-4 text-cyan-400" />}
          items={predictions.readyToClose}
          loading={predictionsLoading}
          metric="readyToClose"
          color="cyan"
          emptyText="Sin candidatos detectados"
        />
      </div>

      {/* ── CONTACT DETAIL MODAL ── */}
      {selectedContact && (
        <ContactDetailPanel
          breakdown={breakdown}
          prediction={prediction}
          trend={trend}
          loading={detailLoading}
          onClose={() => {
            setSelectedContact(null);
            setBreakdown(null);
            setPrediction(null);
            setTrend([]);
          }}
        />
      )}
    </div>
  );
}

// ═══════ SUB-COMPONENTS ═══════

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="bg-[#0a1628] border border-[#1a2d4a] rounded-lg p-3 flex flex-col items-center">
      <div className="mb-1">{icon}</div>
      <div className={`text-2xl font-bold text-${accent}-400`}>{value}</div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function PredictionCard({
  title,
  icon,
  items,
  loading,
  metric,
  color,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  items: ContactPrediction[];
  loading: boolean;
  metric: keyof ContactPrediction;
  color: string;
  emptyText: string;
}) {
  const colorMap: Record<string, string> = {
    green: "text-green-400",
    red: "text-red-400",
    cyan: "text-cyan-400",
  };
  const bgMap: Record<string, string> = {
    green: "bg-green-500/10",
    red: "bg-red-500/10",
    cyan: "bg-cyan-500/10",
  };

  return (
    <div className="bg-[#0a1628] border border-[#1a2d4a] rounded-lg p-4">
      <h3 className={`text-sm font-semibold ${colorMap[color]} mb-3 flex items-center gap-2`}>
        {icon} {title}
      </h3>
      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center text-gray-500 text-xs py-6">{emptyText}</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.contactId} className={`flex items-center gap-3 p-2 rounded-lg ${bgMap[color]}`}>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{item.contactName || `#${item.contactId}`}</div>
                <div className="text-[10px] text-gray-400 truncate">{item.nextBestAction}</div>
              </div>
              <div className={`text-lg font-bold ${colorMap[color]}`}>
                {item[metric] as number}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactDetailPanel({
  breakdown,
  prediction,
  trend,
  loading,
  onClose,
}: {
  breakdown: ScoreBreakdown | null;
  prediction: ContactPrediction | null;
  trend: TrendPoint[];
  loading: boolean;
  onClose: () => void;
}) {
  if (loading) {
    return (
      <div className="bg-[#0a1628] border border-cyan-500/30 rounded-lg p-6 shadow-lg shadow-cyan-500/5">
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (!breakdown) return null;

  const radarData = [
    { dimension: "Recencia", value: breakdown.recency, fullMark: 25 },
    { dimension: "Frecuencia", value: breakdown.frequency, fullMark: 25 },
    { dimension: "Monetario", value: breakdown.monetary, fullMark: 25 },
    { dimension: "Engagement", value: breakdown.engagement, fullMark: 15 },
    { dimension: "Velocidad", value: breakdown.velocity, fullMark: 10 },
  ];

  const tempColors: Record<string, string> = {
    hot: "text-red-400 border-red-500/30 bg-red-500/10",
    warm: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
    cold: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  };

  return (
    <div className="bg-[#0a1628] border border-cyan-500/30 rounded-lg p-6 shadow-lg shadow-cyan-500/5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`text-3xl font-bold ${
            breakdown.score >= 70 ? "text-green-400" : breakdown.score >= 40 ? "text-yellow-400" : "text-red-400"
          }`}>
            {breakdown.score}
          </div>
          <div>
            <h3 className="text-white font-semibold text-lg">
              {breakdown.contactName || breakdown.contactEmail}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${tempColors[breakdown.temperature] ?? tempColors.cold}`}>
                {breakdown.temperature === "hot" ? "Caliente" : breakdown.temperature === "warm" ? "Templado" : "Frio"}
              </span>
              {breakdown.bonuses > 0 && (
                <span className="text-xs text-green-400">+{breakdown.bonuses} bonus</span>
              )}
              {breakdown.penalties > 0 && (
                <span className="text-xs text-red-400">-{breakdown.penalties} penalizacion</span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Radar Chart */}
        <div className="bg-[#050a14] rounded-lg p-3 border border-[#1a2d4a]">
          <h4 className="text-xs text-cyan-400 font-semibold mb-2">Dimensiones</h4>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#1a2d4a" />
              <PolarAngleAxis dataKey="dimension" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <PolarRadiusAxis tick={false} axisLine={false} />
              <Radar
                name="Score"
                dataKey="value"
                stroke="#22d3ee"
                fill="#22d3ee"
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Trend Chart */}
        <div className="bg-[#050a14] rounded-lg p-3 border border-[#1a2d4a]">
          <h4 className="text-xs text-cyan-400 font-semibold mb-2">Tendencia (90 dias)</h4>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2d4a" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#64748b", fontSize: 9 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0a1628",
                    border: "1px solid #1a2d4a",
                    borderRadius: "8px",
                    color: "#e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#22d3ee"
                  fill="#22d3ee"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-gray-500 text-xs">
              Sin datos de tendencia
            </div>
          )}
        </div>

        {/* Prediction & Signals */}
        <div className="bg-[#050a14] rounded-lg p-3 border border-[#1a2d4a] space-y-3">
          {prediction && (
            <>
              <h4 className="text-xs text-cyan-400 font-semibold">Prediccion IA</h4>
              <div className="space-y-2">
                <MiniGauge label="Probabilidad respuesta" value={prediction.likelihoodToRespond} color="green" />
                <MiniGauge label="Riesgo de churn" value={prediction.churnRisk} color="red" />
                <MiniGauge label="Listo para cerrar" value={prediction.readyToClose} color="cyan" />
              </div>
              <div className="mt-2">
                <div className="text-[10px] text-gray-500 uppercase mb-1">Accion recomendada</div>
                <div className="text-xs text-white bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-2">
                  <Zap className="w-3 h-3 text-cyan-400 inline mr-1" />
                  {prediction.nextBestAction}
                </div>
              </div>
            </>
          )}

          {breakdown.signals.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase mb-1">Senales</div>
              <div className="space-y-1">
                {breakdown.signals.map((sig, idx) => (
                  <div key={idx} className="text-[11px] text-gray-300 flex items-start gap-1">
                    <span className="text-cyan-400 mt-0.5">&#8226;</span>
                    {sig}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniGauge({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, { bar: string; text: string }> = {
    green: { bar: "bg-green-400", text: "text-green-400" },
    red: { bar: "bg-red-400", text: "text-red-400" },
    cyan: { bar: "bg-cyan-400", text: "text-cyan-400" },
  };
  const c = colorMap[color] ?? colorMap.cyan;

  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-[10px] text-gray-400">{label}</span>
        <span className={`text-[10px] font-bold ${c.text}`}>{value}%</span>
      </div>
      <div className="w-full h-1.5 bg-[#1a2d4a] rounded-full overflow-hidden">
        <div
          className={`h-full ${c.bar} rounded-full transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
