"use client";

import { useState, useEffect } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  RadialBarChart, RadialBar,
  ResponsiveContainer, Tooltip, XAxis,
} from "recharts";
import {
  AlertTriangle, Building2, Users, Shield, Flame,
  Volume2, VolumeX, Activity, TrendingUp, Target,
  Clock, Euro, Briefcase, Zap, RefreshCw, Package,
} from "lucide-react";

// ═══ Types (match /api/crm/executive response) ═══

interface ExecutiveKPIs {
  totalCompanies: number;
  totalOpportunities: number;
  totalActiveOpportunities: number;
  totalPipelineValueEur: number;
  totalServicesContracted: number;
  totalServicesOffered: number;
  hotOpportunities: number;
  staleOpportunities: number;
  crossSellCandidates: number;
  renewalsUpcoming: number;
  tasksOverdue: number;
  followupsOverdue: number;
  alertsNew: number;
  alertsUrgent: number;
}

interface PipelineMetrics {
  byStatus: { status: string; count: number; totalValue: number }[];
  byTemperature: { temperature: string; count: number }[];
  totalActive: number;
  closingSoon: number;
  hotValue: number;
  wonValue: number;
  lostCount: number;
}

interface VerticalBreakdown {
  vertical: string;
  label: string;
  contracted: number;
  offered: number;
  prospecting: number;
  cancelled: number;
  total: number;
  currentSpendEur: number;
  estimatedSavingsEur: number;
}

interface VerticalMetrics {
  byVertical: VerticalBreakdown[];
  topVertical: string | null;
  worstCovered: string | null;
  totalCurrentSpend: number;
  totalEstimatedSavings: number;
}

interface OperationalMetrics {
  tasks: { total: number; overdue: number; dueToday: number; upcoming: number };
  notifications: { totalNew: number; totalUrgent: number; totalWarning: number; totalActive: number };
  recentActivityCount: number;
  staleOpportunitiesCount: number;
  expiringServicesCount: number;
  crossSellCount: number;
}

interface EnergyMetrics {
  totalSupplyPoints: number;
  totalBillsParsed: number;
  totalBilledEur: number;
  avgMonthlyEur: number;
  totalEstimatedSavings: number;
}

interface ExecutiveSummary {
  generatedAt: string;
  kpis: ExecutiveKPIs;
  pipeline: PipelineMetrics;
  verticals: VerticalMetrics;
  operational: OperationalMetrics;
  energy: EnergyMetrics;
  recentActivitySummary: string[];
}

// ═══ Gauge (reused) ═══
function Gauge({ value, max, color, label, suffix }: { value: number | string; max: number; color: string; label: string; suffix?: string }) {
  const numVal = typeof value === "number" ? value : 0;
  const pct = max > 0 ? Math.min((numVal / max) * 100, 100) : 0;
  const data = [{ value: pct, fill: color }];
  return (
    <div className="relative w-full h-full">
      <ResponsiveContainer>
        <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" data={data} startAngle={210} endAngle={-30} barSize={8}>
          <RadialBar dataKey="value" cornerRadius={10} background={{ fill: "rgba(255,255,255,0.03)" }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-2xl font-black font-mono" style={{ color, filter: `drop-shadow(0 0 12px ${color})` }}>
          {typeof value === "string" ? value : numVal.toLocaleString("es-ES")}{suffix || ""}
        </p>
        <p className="text-[9px] uppercase tracking-[0.15em] text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ═══ ScanLine ═══
function ScanLine() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
      <div className="absolute w-full h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent animate-[scan_4s_linear_infinite]" />
    </div>
  );
}

// ═══ StatusDot ═══
function StatusDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full rounded-full opacity-40 animate-ping" style={{ backgroundColor: color }} />
      <span className="relative inline-flex h-full w-full rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
}

// ═══ Voice briefing ═══
function useSpeech() {
  const [playing, setPlaying] = useState(false);
  function speak(text: string) {
    if (playing || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES"; u.rate = 0.95;
    const v = speechSynthesis.getVoices().find((v) => v.lang.startsWith("es"));
    if (v) u.voice = v;
    u.onstart = () => setPlaying(true);
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    speechSynthesis.speak(u);
  }
  function stop() { speechSynthesis.cancel(); setPlaying(false); }
  return { playing, speak, stop };
}

// ═══ Pipeline stage labels & colors ═══
const STAGE_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  contactado: "Contactado",
  interesado: "Interesado",
  visita_programada: "Visita prog.",
  visitado: "Visitado",
  oferta_enviada: "Oferta env.",
  negociacion: "Negociaci\u00f3n",
  contrato_firmado: "Contrato",
  cliente_activo: "Cliente",
  perdido: "Perdido",
};

const STAGE_COLORS: Record<string, string> = {
  pendiente: "#64748b",
  contactado: "#06b6d4",
  interesado: "#3b82f6",
  visita_programada: "#8b5cf6",
  visitado: "#a855f7",
  oferta_enviada: "#f59e0b",
  negociacion: "#f97316",
  contrato_firmado: "#22c55e",
  cliente_activo: "#10b981",
  perdido: "#ef4444",
};

const TEMP_COLORS: Record<string, string> = {
  caliente: "#ef4444",
  tibio: "#f59e0b",
  frio: "#3b82f6",
};

// ═══ Main HUD (CRM) ═══
export default function HudDashboard() {
  const { playing, speak, stop } = useSpeech();
  const [time, setTime] = useState("");
  const [data, setData] = useState<ExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Clock
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);

  // Empty fallback so dashboard always renders (even if API fails)
  const EMPTY_SUMMARY: ExecutiveSummary = {
    generatedAt: new Date().toISOString(),
    kpis: { totalCompanies: 0, totalOpportunities: 0, totalActiveOpportunities: 0, totalPipelineValueEur: 0, totalServicesContracted: 0, totalServicesOffered: 0, hotOpportunities: 0, staleOpportunities: 0, crossSellCandidates: 0, renewalsUpcoming: 0, tasksOverdue: 0, followupsOverdue: 0, alertsNew: 0, alertsUrgent: 0 },
    pipeline: { byStatus: [], byTemperature: [], totalActive: 0, closingSoon: 0, hotValue: 0, wonValue: 0, lostCount: 0 },
    verticals: { byVertical: [], topVertical: null, worstCovered: null, totalCurrentSpend: 0, totalEstimatedSavings: 0 },
    operational: { tasks: { total: 0, overdue: 0, dueToday: 0, upcoming: 0 }, notifications: { totalNew: 0, totalUrgent: 0, totalWarning: 0, totalActive: 0 }, recentActivityCount: 0, staleOpportunitiesCount: 0, expiringServicesCount: 0, crossSellCount: 0 },
    energy: { totalSupplyPoints: 0, totalBillsParsed: 0, totalBilledEur: 0, avgMonthlyEur: 0, totalEstimatedSavings: 0 },
    recentActivitySummary: [],
  };

  // Fetch executive summary con AbortController para evitar memory leak
  // si el componente se desmonta antes de que llegue la respuesta.
  const fetchData = async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/crm/executive", { signal });
      if (!res.ok) {
        if (signal?.aborted) return;
        console.warn("[HudDashboard] API returned", res.status, "— using empty fallback");
        setData(EMPTY_SUMMARY);
        return;
      }
      const json = await res.json();
      if (signal?.aborted) return;
      setData(json.summary ?? EMPTY_SUMMARY);
    } catch (err) {
      // AbortError es esperado al desmontar — ignorar.
      if ((err as { name?: string })?.name === "AbortError") return;
      console.warn("[HudDashboard] fetch failed:", err);
      setData(EMPTY_SUMMARY);
    } finally {
      // Solo apagar loading si seguimos montados (signal no abortado)
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const ac = new AbortController();
    fetchData(ac.signal);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kpis = data?.kpis;
  const pipeline = data?.pipeline;
  const verticals = data?.verticals;
  const ops = data?.operational;
  const energy = data?.energy;

  const totalAlerts = (kpis?.alertsUrgent || 0) + (kpis?.tasksOverdue || 0) + (kpis?.staleOpportunities || 0);

  function briefing() {
    if (!kpis || !pipeline) return;
    const parts = ["Buenos d\u00edas. Resumen de negocio:"];
    parts.push(`${kpis.totalCompanies} empresa${kpis.totalCompanies !== 1 ? "s" : ""} en cartera.`);
    parts.push(`${kpis.totalActiveOpportunities} oportunidades activas por valor de ${kpis.totalPipelineValueEur.toLocaleString("es-ES")} euros.`);
    if (kpis.hotOpportunities > 0) parts.push(`${kpis.hotOpportunities} oportunidades calientes.`);
    if (pipeline.closingSoon > 0) parts.push(`${pipeline.closingSoon} cierran en menos de 30 d\u00edas.`);
    if (kpis.tasksOverdue > 0) parts.push(`Atenci\u00f3n: ${kpis.tasksOverdue} tareas vencidas.`);
    if (kpis.staleOpportunities > 0) parts.push(`${kpis.staleOpportunities} oportunidades estancadas.`);
    if (kpis.crossSellCandidates > 0) parts.push(`${kpis.crossSellCandidates} candidatos a venta cruzada.`);
    parts.push("Eso es todo.");
    speak(parts.join(" "));
  }

  // Pipeline chart data (exclude terminal states for the funnel)
  const pipelineChartData = (pipeline?.byStatus || [])
    .filter(s => s.status !== "perdido" && s.status !== "cliente_activo")
    .map(s => ({
      name: STAGE_LABELS[s.status] || s.status,
      count: s.count,
      value: s.totalValue,
      fill: STAGE_COLORS[s.status] || "#64748b",
    }));

  // Temperature pie
  const tempData = (pipeline?.byTemperature || [])
    .filter(t => t.count > 0)
    .map(t => ({
      name: t.temperature.charAt(0).toUpperCase() + t.temperature.slice(1),
      value: t.count,
      color: TEMP_COLORS[t.temperature] || "#64748b",
    }));

  // Verticals chart
  const verticalData = (verticals?.byVertical || [])
    .filter(v => v.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const verticalColors = ["#06b6d4", "#3b82f6", "#f59e0b", "#ef4444", "#22c55e", "#a855f7", "#f97316", "#ec4899"];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3">
        <RefreshCw size={20} className="animate-spin text-cyan-400" />
        <span className="text-sm text-slate-400">Cargando panel ejecutivo...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertTriangle size={24} className="text-red-400" />
        <span className="text-sm text-red-400">{error}</span>
        <button onClick={() => fetchData()} className="text-xs text-cyan-400 hover:underline">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* TOP BAR — voice + status + clock */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={playing ? stop : briefing}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${playing ? "bg-red-500/10 border border-red-500/30 text-red-400 animate-pulse" : "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"}`}>
            {playing ? <VolumeX size={14} /> : <Volume2 size={14} />}
            {playing ? "Parar" : "Parte del d\u00eda"}
          </button>
          <div className="flex items-center gap-1.5">
            <Activity size={12} className={totalAlerts === 0 ? "text-emerald-500/60" : "text-red-500/60"} />
            <span className={`text-[10px] font-mono ${totalAlerts === 0 ? "text-emerald-500/60" : "text-red-500/60"}`}>
              {totalAlerts === 0 ? "NOMINAL" : `${totalAlerts} ALERTA${totalAlerts !== 1 ? "S" : ""}`}
            </span>
          </div>
          <button onClick={fetchData} className="text-slate-600 hover:text-cyan-400 transition-colors" title="Actualizar">
            <RefreshCw size={13} />
          </button>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black font-mono text-cyan-400/80 tracking-wider" style={{ filter: "drop-shadow(0 0 8px rgba(6,182,212,0.3))" }}>{time}</p>
          <p className="text-[10px] text-slate-600 font-mono">{new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
      </div>

      {/* STATUS BANNER + GAUGES */}
      <div className="grid grid-cols-12 gap-3">
        {/* Status banner */}
        <div className={`col-span-12 lg:col-span-4 rounded-2xl border p-6 text-center relative overflow-hidden ${totalAlerts > 0 ? "bg-red-500/5 border-red-500/20" : "bg-emerald-500/5 border-emerald-500/20"}`}>
          <ScanLine />
          {totalAlerts > 0 ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-red-400/50">Negocio</p>
              <p className="text-6xl font-black font-mono text-red-400 mt-2" style={{ filter: "drop-shadow(0 0 20px rgba(239,68,68,0.4))" }}>{totalAlerts}</p>
              <p className="text-xs font-bold uppercase tracking-widest text-red-300/60 mt-1">Requieren atenci&oacute;n</p>
            </>
          ) : (
            <>
              <Shield size={32} className="text-emerald-400 mx-auto mb-2" style={{ filter: "drop-shadow(0 0 15px rgba(34,197,94,0.4))" }} />
              <p className="text-xl font-black text-emerald-400">NOMINAL</p>
              <p className="text-[10px] text-emerald-500/50 uppercase tracking-widest">Todo bajo control</p>
            </>
          )}
        </div>

        {/* 4 Radial gauges — CRM KPIs */}
        <div className="col-span-6 sm:col-span-3 lg:col-span-2 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-2 h-[140px]">
          <Gauge value={kpis?.totalCompanies || 0} max={Math.max(kpis?.totalCompanies || 1, 50)} color="#3b82f6" label="Empresas" />
        </div>
        <div className="col-span-6 sm:col-span-3 lg:col-span-2 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-2 h-[140px]">
          <Gauge value={kpis?.totalActiveOpportunities || 0} max={Math.max(kpis?.totalActiveOpportunities || 1, 30)} color="#06b6d4" label="Oportunidades" />
        </div>
        <div className="col-span-6 sm:col-span-3 lg:col-span-2 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-2 h-[140px]">
          <Gauge value={kpis?.hotOpportunities || 0} max={Math.max(kpis?.hotOpportunities || 1, 15)} color="#ef4444" label="Calientes" />
        </div>
        <div className="col-span-6 sm:col-span-3 lg:col-span-2 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-2 h-[140px]">
          <Gauge value={kpis?.totalServicesContracted || 0} max={Math.max(kpis?.totalServicesContracted || 1, 20)} color="#22c55e" label="Contratados" />
        </div>
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-12 gap-3">
        {/* Pipeline funnel */}
        <div className="col-span-12 sm:col-span-5 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">Pipeline comercial</p>
            <p className="text-sm font-black font-mono text-cyan-400">
              {(kpis?.totalPipelineValueEur || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 })} &euro;
            </p>
          </div>
          <div className="h-24">
            {pipelineChartData.length > 0 ? (
              <ResponsiveContainer>
                <BarChart data={pipelineChartData} layout="horizontal">
                  <XAxis dataKey="name" tick={{ fontSize: 8, fill: "#334155" }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" height={30} />
                  <Tooltip
                    contentStyle={{ background: "#0a1628", border: "1px solid #1a2d4a", borderRadius: 8, color: "#e2e8f0", fontSize: 11 }}
                    formatter={(value: number, name: string) => [name === "value" ? `${value.toLocaleString("es-ES")} \u20ac` : value, name === "value" ? "Valor" : "Ops"]}
                  />
                  <Bar dataKey="count" radius={[4,4,0,0]}>
                    {pipelineChartData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.7} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-[10px] text-slate-600">Sin oportunidades activas</div>
            )}
          </div>
        </div>

        {/* Temperature distribution */}
        <div className="col-span-6 sm:col-span-3 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-2">Temperatura</p>
          <div className="h-24 flex items-center gap-3">
            <div className="w-20 h-20 flex-shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={tempData.length > 0 ? tempData : [{ name: "Sin datos", value: 1, color: "#1a2d4a" }]}
                    dataKey="value" cx="50%" cy="50%" innerRadius={22} outerRadius={35} paddingAngle={3} strokeWidth={0}>
                    {(tempData.length > 0 ? tempData : [{ color: "#1a2d4a" }]).map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 min-w-0">
              {tempData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-[10px] text-slate-500">{d.name}: <span className="font-bold text-slate-300">{d.value}</span></span>
                </div>
              ))}
              {tempData.length === 0 && <p className="text-[10px] text-slate-600">Sin datos</p>}
            </div>
          </div>
        </div>

        {/* Verticals pie */}
        <div className="col-span-6 sm:col-span-4 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-2">Servicios por vertical</p>
          <div className="h-24 flex items-center gap-3">
            <div className="w-20 h-20 flex-shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={verticalData.length > 0 ? verticalData.map((v, i) => ({ name: v.label, value: v.total, color: verticalColors[i % verticalColors.length] })) : [{ name: "Sin datos", value: 1, color: "#1a2d4a" }]}
                    dataKey="value" cx="50%" cy="50%" innerRadius={22} outerRadius={35} paddingAngle={2} strokeWidth={0}>
                    {(verticalData.length > 0 ? verticalData : [{}]).map((_, i) => (
                      <Cell key={i} fill={verticalData.length > 0 ? verticalColors[i % verticalColors.length] : "#1a2d4a"} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1 min-w-0">
              {verticalData.slice(0, 5).map((v, i) => (
                <div key={v.vertical} className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: verticalColors[i % verticalColors.length] }} />
                  <span className="text-[10px] text-slate-500 truncate">{v.label}: <span className="font-bold text-slate-300">{v.contracted}c {v.offered}o</span></span>
                </div>
              ))}
              {verticalData.length === 0 && <p className="text-[10px] text-slate-600">Sin servicios</p>}
            </div>
          </div>
        </div>
      </div>

      {/* KPI CARDS ROW */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard icon={<Building2 size={14} />} value={kpis?.totalCompanies || 0} label="Empresas" color="#3b82f6" />
        <KpiCard icon={<Target size={14} />} value={kpis?.totalActiveOpportunities || 0} label="Ops Activas" color="#06b6d4" />
        <KpiCard icon={<Flame size={14} />} value={kpis?.hotOpportunities || 0} label="Calientes" color="#ef4444" />
        <KpiCard
          icon={<Euro size={14} />}
          value={`${(kpis?.totalPipelineValueEur || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 })} \u20ac`}
          label="Valor Pipeline" color="#a855f7"
        />
        <KpiCard icon={<Package size={14} />} value={kpis?.totalServicesContracted || 0} label="Contratados" color="#22c55e" />
        <KpiCard icon={<TrendingUp size={14} />} value={kpis?.crossSellCandidates || 0} label="Cross-sell" color="#f59e0b" />
      </div>

      {/* OPERATIONAL ALERTS */}
      {totalAlerts > 0 && (
        <div className="rounded-2xl bg-red-500/[0.03] border border-red-500/15 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-red-400" />
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-red-400/60">Requieren atenci&oacute;n</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {(kpis?.tasksOverdue || 0) > 0 && (
              <AlertCard icon={<Clock size={12} />} color="#ef4444" title={`${kpis!.tasksOverdue} tareas vencidas`} subtitle="Revisa tu lista de tareas" />
            )}
            {(kpis?.staleOpportunities || 0) > 0 && (
              <AlertCard icon={<AlertTriangle size={12} />} color="#f59e0b" title={`${kpis!.staleOpportunities} ops estancadas`} subtitle="Sin actividad reciente" />
            )}
            {(kpis?.alertsUrgent || 0) > 0 && (
              <AlertCard icon={<Zap size={12} />} color="#ef4444" title={`${kpis!.alertsUrgent} alertas urgentes`} subtitle="Notificaciones pendientes" />
            )}
            {(kpis?.renewalsUpcoming || 0) > 0 && (
              <AlertCard icon={<RefreshCw size={12} />} color="#f97316" title={`${kpis!.renewalsUpcoming} renovaciones pr\u00f3ximas`} subtitle="Servicios por expirar" />
            )}
            {(kpis?.followupsOverdue || 0) > 0 && (
              <AlertCard icon={<Users size={12} />} color="#f59e0b" title={`${kpis!.followupsOverdue} seguimientos vencidos`} subtitle="Contactos sin seguimiento" />
            )}
            {(pipeline?.closingSoon || 0) > 0 && (
              <AlertCard icon={<Target size={12} />} color="#22c55e" title={`${pipeline!.closingSoon} cierres pr\u00f3ximos`} subtitle="Menos de 30 d\u00edas" />
            )}
          </div>
        </div>
      )}

      {/* RECENT ACTIVITY */}
      <div className="rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-cyan-500/50"><Activity size={13} /></span>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Actividad reciente</p>
          </div>
          <span className="text-[9px] font-bold text-cyan-500/50 uppercase tracking-wider">
            {ops?.recentActivityCount || 0} acciones
          </span>
        </div>
        {(data?.recentActivitySummary || []).length === 0 ? (
          <p className="text-[10px] text-slate-700 text-center py-3 font-mono">&mdash; sin actividad reciente &mdash;</p>
        ) : (
          <div className="space-y-1">
            {data!.recentActivitySummary.slice(0, 8).map((item, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-[#050a14] border border-[#1a2d4a]/40 px-3 py-2 hover:border-cyan-500/20 transition-colors">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Zap size={10} className="text-cyan-500/30 flex-shrink-0" />
                  <span className="text-[11px] text-slate-300 truncate">{item}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ENERGY SUMMARY (mini) */}
      {(energy?.totalSupplyPoints || 0) > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={<Zap size={14} />} value={energy!.totalSupplyPoints} label="Puntos Suministro" color="#f59e0b" />
          <KpiCard icon={<Briefcase size={14} />} value={energy!.totalBillsParsed} label="Facturas Energ\u00eda" color="#06b6d4" />
          <KpiCard
            icon={<Euro size={14} />}
            value={`${energy!.avgMonthlyEur.toLocaleString("es-ES", { maximumFractionDigits: 0 })} \u20ac`}
            label="Media Mensual" color="#a855f7"
          />
          <KpiCard
            icon={<TrendingUp size={14} />}
            value={`${energy!.totalEstimatedSavings.toLocaleString("es-ES", { maximumFractionDigits: 0 })} \u20ac`}
            label="Ahorro Estimado" color="#22c55e"
          />
        </div>
      )}
    </div>
  );
}

// ═══ KPI Card ═══
function KpiCard({ icon, value, label, color }: { icon: React.ReactNode; value: number | string; label: string; color: string }) {
  return (
    <div className="rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4 hover:border-[#1e3a5f] transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, color }}>
          {icon}
        </div>
      </div>
      <p className="text-lg font-black font-mono truncate" style={{ color, filter: `drop-shadow(0 0 8px ${color}40)` }}>
        {typeof value === "number" ? value.toLocaleString("es-ES") : value}
      </p>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

// ═══ Alert Card ═══
function AlertCard({ icon, color, title, subtitle }: { icon: React.ReactNode; color: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-[#0a1628] border border-[#1a2d4a] px-3 py-2.5 hover:border-red-500/30 transition-colors group">
      <StatusDot color={color} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-300 truncate group-hover:text-white transition-colors">{title}</p>
        <p className="text-[10px] text-slate-600 truncate">{subtitle}</p>
      </div>
      <div style={{ color }} className="flex-shrink-0 opacity-50">{icon}</div>
    </div>
  );
}
