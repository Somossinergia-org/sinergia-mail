"use client";

import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
];

interface CategoryChartProps {
  byCategory: Array<{ category: string | null; count: number }>;
  byMonth?: Array<{ month: string | null; totalAmount: number; count: number }>;
}

/** Pure SVG donut chart — bypasses recharts Pie rendering issues */
function DonutChart({
  data,
  size = 220,
  innerRadius = 55,
  outerRadius = 95,
}: {
  data: Array<{ name: string; value: number }>;
  size?: number;
  innerRadius?: number;
  outerRadius?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  let cumAngle = -Math.PI / 2; // start at top

  const sectors = data.map((d, i) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const gap = 0.03; // gap between sectors
    const startAngle = cumAngle + gap / 2;
    const endAngle = cumAngle + angle - gap / 2;
    cumAngle += angle;

    const x1o = cx + outerRadius * Math.cos(startAngle);
    const y1o = cy + outerRadius * Math.sin(startAngle);
    const x2o = cx + outerRadius * Math.cos(endAngle);
    const y2o = cy + outerRadius * Math.sin(endAngle);
    const x1i = cx + innerRadius * Math.cos(endAngle);
    const y1i = cy + innerRadius * Math.sin(endAngle);
    const x2i = cx + innerRadius * Math.cos(startAngle);
    const y2i = cy + innerRadius * Math.sin(startAngle);

    const largeArc = angle - gap > Math.PI ? 1 : 0;

    const path = [
      `M ${x1o} ${y1o}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2o} ${y2o}`,
      `L ${x1i} ${y1i}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x2i} ${y2i}`,
      `Z`,
    ].join(" ");

    return (
      <path
        key={d.name}
        d={path}
        fill={COLORS[i % COLORS.length]}
        opacity={0.9}
      >
        <title>{`${d.name}: ${d.value}`}</title>
      </path>
    );
  });

  // Center text
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", margin: "0 auto" }}>
      {sectors}
      <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--text-primary)" fontSize="22" fontWeight="bold">
        {total}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--text-secondary)" fontSize="11">
        emails
      </text>
    </svg>
  );
}

export default function CategoryChart({
  byCategory,
  byMonth,
}: CategoryChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const pieData = byCategory
    .filter((c) => c.category)
    .map((c) => ({
      name: c.category!,
      value: Number(c.count) || 0,
    }));

  const barData = (byMonth || []).map((m) => ({
    month: m.month || "?",
    total: Math.round(m.totalAmount),
    count: m.count,
  }));

  if (!mounted) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Donut chart - Categories */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold mb-4">Emails por Categoría</h3>
        {pieData.length > 0 ? (
          <div className="flex justify-center py-2">
            <DonutChart data={pieData} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-[220px] text-[var(--text-secondary)] text-sm">
            Sin datos de categorías
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-4 justify-center">
          {pieData.map((item, i) => (
            <div key={item.name} className="flex items-center gap-1.5 text-xs">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="text-[var(--text-secondary)]">
                {item.name} ({item.value})
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bar chart - Monthly spend */}
      {barData.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold mb-4">Gasto Mensual (€)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
              />
              <XAxis
                dataKey="month"
                tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              />
              <YAxis
                tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.8)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [`${value.toLocaleString("es-ES")} €`, "Total"]}
              />
              <Bar dataKey="total" fill="#338dff" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
