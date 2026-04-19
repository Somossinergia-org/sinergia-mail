"use client";

import { useState, useEffect } from "react";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  RadialBarChart, RadialBar,
  ResponsiveContainer, Tooltip, XAxis,
} from "recharts";
import {
  AlertTriangle, Mail, FileText, Users, Shield,
  Volume2, VolumeX, Activity, Zap, TrendingUp,
  Clock, Euro, MailOpen,
} from "lucide-react";

// ═══ Types ═══
interface HudDashboardProps {
  totalEmails: number;
  unread: number;
  highPriority: number;
  totalInvoices: number;
  totalSpend: number;
  lastSync: string | null;
  byCategory: Array<{ category: string | null; count: number }>;
  byMonth?: Array<{ month: string | null; totalAmount: number; count: number }>;
  recentEmails: Array<{ id: number; subject: string; from: string; category: string | null; date: string }>;
}

// ═══ Gauge ═══
function Gauge({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const data = [{ value: pct, fill: color }];
  return (
    <div className="relative w-full h-full">
      <ResponsiveContainer>
        <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" data={data} startAngle={210} endAngle={-30} barSize={8}>
          <RadialBar dataKey="value" cornerRadius={10} background={{ fill: "rgba(255,255,255,0.03)" }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-3xl font-black font-mono" style={{ color, filter: `drop-shadow(0 0 12px ${color})` }}>{value}</p>
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

// ═══ Main HUD ═══
export default function HudDashboard(props: HudDashboardProps) {
  const { totalEmails, unread, highPriority, totalInvoices, totalSpend, lastSync, byCategory, byMonth, recentEmails } = props;
  const { playing, speak, stop } = useSpeech();
  const [time, setTime] = useState("");

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);

  const totalAlerts = highPriority + (unread > 20 ? 1 : 0);

  function briefing() {
    const parts = ["Buenos días."];
    if (totalAlerts > 0) parts.push(`Tienes ${totalAlerts} alerta${totalAlerts !== 1 ? "s" : ""} que requiere${totalAlerts !== 1 ? "n" : ""} atención.`);
    else parts.push("No hay alertas. Todo está en orden.");
    if (unread > 0) parts.push(`${unread} email${unread !== 1 ? "s" : ""} sin leer.`);
    if (highPriority > 0) parts.push(`${highPriority} de alta prioridad.`);
    parts.push(`${totalInvoices} factura${totalInvoices !== 1 ? "s" : ""} procesada${totalInvoices !== 1 ? "s" : ""}, gasto total ${totalSpend.toLocaleString("es-ES")} euros.`);
    parts.push("Eso es todo.");
    speak(parts.join(" "));
  }

  // Pie data from categories (top 5)
  const catColors = ["#06b6d4", "#3b82f6", "#f59e0b", "#ef4444", "#22c55e", "#a855f7"];
  const pieData = (byCategory || [])
    .filter(c => c.category && c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((c, i) => ({ name: c.category || "Otro", value: c.count, color: catColors[i % catColors.length] }));

  // Build email-per-day chart from recent emails (last 7 days)
  const emailsByDay: Array<{ day: string; value: number }> = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("es-ES", { weekday: "short" });
    const dayStr = d.toISOString().slice(0, 10);
    const count = recentEmails.filter(e => e.date?.startsWith(dayStr)).length;
    emailsByDay.push({ day: key, value: count });
  }

  // Monthly invoice chart
  const invoicesByMonth = (byMonth || []).slice(-7).map(m => ({
    day: m.month || "",
    value: m.totalAmount || 0,
  }));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* TOP BAR — voice + status + clock */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={playing ? stop : briefing}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${playing ? "bg-red-500/10 border border-red-500/30 text-red-400 animate-pulse" : "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"}`}>
            {playing ? <VolumeX size={14} /> : <Volume2 size={14} />}
            {playing ? "Parar" : "Parte del día"}
          </button>
          <div className="flex items-center gap-1.5">
            <Activity size={12} className="text-cyan-500/40" />
            <span className="text-[10px] text-cyan-500/40 font-mono">{totalAlerts === 0 ? "NOMINAL" : "ALERTA"}</span>
          </div>
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
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-red-400/50">Sistema</p>
              <p className="text-6xl font-black font-mono text-red-400 mt-2" style={{ filter: "drop-shadow(0 0 20px rgba(239,68,68,0.4))" }}>{totalAlerts}</p>
              <p className="text-xs font-bold uppercase tracking-widest text-red-300/60 mt-1">Alertas activas</p>
            </>
          ) : (
            <>
              <Shield size={32} className="text-emerald-400 mx-auto mb-2" style={{ filter: "drop-shadow(0 0 15px rgba(34,197,94,0.4))" }} />
              <p className="text-xl font-black text-emerald-400">NOMINAL</p>
              <p className="text-[10px] text-emerald-500/50 uppercase tracking-widest">Sin alertas</p>
            </>
          )}
        </div>

        {/* 4 Radial gauges */}
        <div className="col-span-6 sm:col-span-3 lg:col-span-2 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-2 h-[140px]">
          <Gauge value={unread} max={Math.max(unread, 50)} color="#06b6d4" label="Sin leer" />
        </div>
        <div className="col-span-6 sm:col-span-3 lg:col-span-2 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-2 h-[140px]">
          <Gauge value={highPriority} max={Math.max(highPriority, 10)} color="#ef4444" label="Urgentes" />
        </div>
        <div className="col-span-6 sm:col-span-3 lg:col-span-2 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-2 h-[140px]">
          <Gauge value={totalInvoices} max={Math.max(totalInvoices, 20)} color="#f59e0b" label="Facturas" />
        </div>
        <div className="col-span-6 sm:col-span-3 lg:col-span-2 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-2 h-[140px]">
          <Gauge value={totalEmails} max={Math.max(totalEmails, 100)} color="#3b82f6" label="Emails" />
        </div>
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-12 gap-3">
        {/* Emails 7d AreaChart */}
        <div className="col-span-12 sm:col-span-4 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">Emails 7d</p>
            <p className="text-sm font-black font-mono text-cyan-400">{emailsByDay.reduce((s, d) => s + d.value, 0)}</p>
          </div>
          <div className="h-20">
            <ResponsiveContainer>
              <AreaChart data={emailsByDay}>
                <defs>
                  <linearGradient id="hud-eg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3}/>
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#334155" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#0a1628", border: "1px solid #1a2d4a", borderRadius: 8, color: "#e2e8f0", fontSize: 11 }} />
                <Area type="monotone" dataKey="value" stroke="#06b6d4" fill="url(#hud-eg)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Facturas por mes BarChart */}
        <div className="col-span-12 sm:col-span-4 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">Facturas / mes</p>
            <p className="text-sm font-black font-mono text-amber-400">
              {totalSpend.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €
            </p>
          </div>
          <div className="h-20">
            <ResponsiveContainer>
              <BarChart data={invoicesByMonth.length > 0 ? invoicesByMonth : [{ day: "—", value: 0 }]}>
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#334155" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0a1628", border: "1px solid #1a2d4a", borderRadius: 8, color: "#e2e8f0", fontSize: 11 }}
                  formatter={(value: number) => [`${value.toLocaleString("es-ES")} €`, "Total"]}
                />
                <Bar dataKey="value" radius={[4,4,0,0]} fill="#f59e0b" fillOpacity={0.6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category PieChart */}
        <div className="col-span-12 sm:col-span-4 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-2">Categorías</p>
          <div className="h-20 flex items-center gap-4">
            <div className="w-20 h-20 flex-shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pieData.length > 0 ? pieData : [{ name: "OK", value: 1, color: "#22c55e" }]}
                    dataKey="value" cx="50%" cy="50%" innerRadius={22} outerRadius={35} paddingAngle={3} strokeWidth={0}>
                    {(pieData.length > 0 ? pieData : [{ color: "#22c55e" }]).map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1 min-w-0">
              {pieData.slice(0, 4).map((d) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-[10px] text-slate-500 truncate">{d.name}: <span className="font-bold text-slate-300">{d.value}</span></span>
                </div>
              ))}
              {pieData.length === 0 && <p className="text-[10px] text-emerald-400">Sin datos</p>}
            </div>
          </div>
        </div>
      </div>

      {/* KPI CARDS ROW */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard icon={<Mail size={14} />} value={totalEmails} label="Emails Totales" color="#3b82f6" />
        <KpiCard icon={<MailOpen size={14} />} value={unread} label="Sin Leer" color="#06b6d4" />
        <KpiCard icon={<FileText size={14} />} value={totalInvoices} label="Facturas" color="#f59e0b" />
        <KpiCard icon={<AlertTriangle size={14} />} value={highPriority} label="Prioridad Alta" color="#ef4444" />
        <KpiCard
          icon={<Euro size={14} />}
          value={`${totalSpend.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
          label="Gasto Total" color="#a855f7"
        />
        <KpiCard
          icon={<Clock size={14} />}
          value={lastSync ? new Date(lastSync).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Nunca"}
          label="Última Sync" color="#22c55e"
        />
      </div>

      {/* ALERTS (high priority) */}
      {highPriority > 0 && (
        <div className="rounded-2xl bg-red-500/[0.03] border border-red-500/15 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-red-400" />
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-red-400/60">Emails urgentes</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {recentEmails
              .filter(e => e.category === "URGENTE" || e.category === "FACTURA")
              .slice(0, 6)
              .map((e) => (
                <div key={e.id} className="flex items-center gap-2.5 rounded-xl bg-[#0a1628] border border-[#1a2d4a] px-3 py-2.5 hover:border-red-500/30 transition-colors group">
                  <StatusDot color={e.category === "URGENTE" ? "#ef4444" : "#f59e0b"} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-300 truncate group-hover:text-white transition-colors">{e.subject}</p>
                    <p className="text-[10px] text-slate-600 truncate">{e.from}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* RECENT EMAILS panel */}
      <div className="rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-cyan-500/50"><Mail size={13} /></span>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Emails recientes</p>
          </div>
          <span className="text-[9px] font-bold text-cyan-500/50 uppercase tracking-wider">{totalEmails} total</span>
        </div>
        {recentEmails.length === 0 ? (
          <p className="text-[10px] text-slate-700 text-center py-3 font-mono">— sin emails —</p>
        ) : (
          <div className="space-y-1">
            {recentEmails.slice(0, 8).map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg bg-[#050a14] border border-[#1a2d4a]/40 px-3 py-2 hover:border-cyan-500/20 transition-colors">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Zap size={10} className="text-cyan-500/30 flex-shrink-0" />
                  <span className="text-[11px] text-slate-300 truncate">{item.subject}</span>
                </div>
                <span className="text-[9px] font-mono text-slate-600 ml-2 flex-shrink-0">{item.from?.split("<")[0]?.trim()?.slice(0, 20)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
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
