"use client";

import { useState, useEffect, useRef } from "react";
import {
  PieChart,
  Pie,
  Cell,
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

export default function CategoryChart({
  byCategory,
  byMonth,
}: CategoryChartProps) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(400);

  useEffect(() => {
    setMounted(true);
    const measure = () => {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        if (w > 0) setContainerWidth(w);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    // Re-measure after a short delay (tab switch)
    const timer = setTimeout(measure, 100);
    return () => {
      window.removeEventListener("resize", measure);
      clearTimeout(timer);
    };
  }, []);

  const pieData = byCategory
    .filter((c) => c.category)
    .map((c) => ({
      name: c.category!,
      value: c.count,
    }));

  const barData = (byMonth || []).map((m) => ({
    month: m.month || "?",
    total: Math.round(m.totalAmount),
    count: m.count,
  }));

  if (!mounted) return null;

  const pieRadius = Math.min(containerWidth * 0.18, 90);
  const pieInner = Math.max(pieRadius - 40, 20);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Pie chart - Categories */}
      <div className="glass-card p-6" ref={containerRef}>
        <h3 className="text-sm font-semibold mb-4">Emails por Categoría</h3>
        {pieData.length > 0 ? (
          <div style={{ width: "100%", height: 250 }}>
            <PieChart width={containerWidth - 48} height={250}>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={pieInner}
                outerRadius={pieRadius}
                paddingAngle={3}
                dataKey="value"
                isAnimationActive={false}
              >
                {pieData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.8)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: "12px",
                }}
              />
            </PieChart>
          </div>
        ) : (
          <div className="flex items-center justify-center h-[250px] text-[var(--text-secondary)] text-sm">
            Sin datos de categorías
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-2">
          {pieData.map((item, i) => (
            <div key={item.name} className="flex items-center gap-1 text-xs">
              <div
                className="w-2.5 h-2.5 rounded-full"
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
