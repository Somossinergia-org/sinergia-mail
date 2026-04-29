"use client";

import { useState, useEffect } from "react";
import { BarChart3, TrendingUp, Mail, Eye, MousePointer, RefreshCw } from "lucide-react";
import { BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";

interface CampaignStats {
  totalSequences: number;
  activeEnrollments: number;
  totalSent: number;
  delivered: number;
  opened: number;
  replied: number;
}

export default function CampaignPanel() {
  const [stats, setStats] = useState<CampaignStats>({ totalSequences: 0, activeEnrollments: 0, totalSent: 0, delivered: 0, opened: 0, replied: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [seqRes, outRes] = await Promise.all([
          fetch("/api/sequences"),
          fetch("/api/outbound"),
        ]);
        const seqData = seqRes.ok ? await seqRes.json() : { sequences: [] };
        const outData = outRes.ok ? await outRes.json() : { messages: [] };

        const sequences = seqData.sequences || [];
        const messages = outData.messages || [];
        const sent = messages.filter((m: any) => m.status === "SENT").length;
        const failed = messages.filter((m: any) => m.status === "FAILED").length;
        // Aperturas reales desde el pixel tracking (commit 2026-04-29).
        // firstOpenedAt != null = al menos una apertura registrada.
        const opened = messages.filter((m: any) => m.firstOpenedAt).length;

        setStats({
          totalSequences: sequences.length,
          activeEnrollments: sequences.reduce((acc: number, s: any) => acc + (s.enrollments?.length || 0), 0),
          totalSent: messages.length,
          delivered: sent,
          opened,
          replied: 0, // Requires reply detection — not yet implemented
        });
      } catch { /* */ }
      finally { setLoading(false); }
    };
    fetchStats();
  }, []);

  const funnelData = [
    { name: "Enviados", value: stats.totalSent, color: "#06b6d4" },
    { name: "Entregados", value: stats.delivered, color: "#3b82f6" },
    { name: "Abiertos", value: stats.opened, color: "#f59e0b" },
    { name: "Respondidos", value: stats.replied, color: "#22c55e" },
  ];

  // TODO: Replace with real outbound analytics API data when tracking is implemented
  const weekData = [
    { day: "Lun", sent: 0, opened: 0 },
    { day: "Mar", sent: 0, opened: 0 },
    { day: "Mié", sent: 0, opened: 0 },
    { day: "Jue", sent: 0, opened: 0 },
    { day: "Vie", sent: 0, opened: 0 },
    { day: "Sáb", sent: 0, opened: 0 },
    { day: "Dom", sent: 0, opened: 0 },
  ];

  // TODO: Replace with real channel distribution from outbound messages
  const channelData = [
    { name: "Email", value: stats.totalSent || 1, color: "#06b6d4" },
    { name: "WhatsApp", value: 0, color: "#22c55e" },
    { name: "Push", value: 0, color: "#a855f7" },
  ];

  const openRate = stats.delivered > 0 ? ((stats.opened / stats.delivered) * 100).toFixed(1) : "0";
  const replyRate = stats.opened > 0 ? ((stats.replied / stats.opened) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 size={14} className="text-cyan-400" />
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Dashboard Campañas</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 gap-3">{[1,2,3,4].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
      ) : (
        <>
          {/* KPI row.
              Tasa apertura/respuesta requieren tracking pixel + reply detection
              que aún no están implementados. Mostramos "—" en vez de un 0 que
              parecería un dato real. Ver TODO en weekData/channelData. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Secuencias", value: stats.totalSequences, color: "#06b6d4", isReal: true },
              { label: "Enrollments", value: stats.activeEnrollments, color: "#3b82f6", isReal: true },
              { label: "Tasa apertura", value: stats.delivered > 0 ? `${openRate}%` : "—", color: "#f59e0b", isReal: true },
              { label: "Tasa respuesta", value: stats.opened > 0 ? `${replyRate}%` : "—", color: "#22c55e", isReal: false },
            ].map(kpi => (
              <div key={kpi.label} className="rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4 relative" title={!kpi.isReal ? "Requiere pixel tracking — pendiente de implementar" : undefined}>
                <p className="text-2xl font-black font-mono" style={{ color: kpi.color, filter: `drop-shadow(0 0 8px ${kpi.color}40)` }}>{kpi.value}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1 flex items-center gap-1">
                  {kpi.label}
                  {!kpi.isReal && <span className="text-[8px] text-amber-500/70" aria-label="Pendiente de tracking">⚠</span>}
                </p>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-12 gap-3">
            {/* Funnel */}
            <div className="col-span-12 sm:col-span-4 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-3">Funnel de conversión</p>
              <div className="space-y-2">
                {funnelData.map((item, i) => {
                  const maxVal = Math.max(...funnelData.map(d => d.value), 1);
                  const pct = (item.value / maxVal) * 100;
                  return (
                    <div key={item.name}>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-slate-400">{item.name}</span>
                        <span className="font-mono font-bold" style={{ color: item.color }}>{item.value}</span>
                      </div>
                      <div className="w-full h-2 bg-[#050a14] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: item.color, opacity: 0.7 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Weekly activity */}
            <div className="col-span-12 sm:col-span-4 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-2">Actividad semanal</p>
              <div className="h-28">
                <ResponsiveContainer>
                  <BarChart data={weekData}>
                    <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#334155" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "#0a1628", border: "1px solid #1a2d4a", borderRadius: 8, color: "#e2e8f0", fontSize: 11 }} />
                    <Bar dataKey="sent" fill="#06b6d4" fillOpacity={0.5} radius={[3,3,0,0]} />
                    <Bar dataKey="opened" fill="#f59e0b" fillOpacity={0.5} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Channel distribution */}
            <div className="col-span-12 sm:col-span-4 rounded-2xl bg-[#0a1628] border border-[#1a2d4a] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-2">Por canal</p>
              <div className="h-28 flex items-center gap-4">
                <div className="w-24 h-24 flex-shrink-0">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={channelData} dataKey="value" cx="50%" cy="50%" innerRadius={26} outerRadius={40} paddingAngle={3} strokeWidth={0}>
                        {channelData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5">
                  {channelData.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-[10px] text-slate-400">{d.name}</span>
                      <span className="text-[10px] font-bold text-slate-300">{d.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
