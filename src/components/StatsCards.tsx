"use client";

import {
  Mail,
  FileText,
  AlertTriangle,
  TrendingUp,
  Clock,
  Euro,
} from "lucide-react";

interface StatsCardsProps {
  totalEmails: number;
  totalInvoices: number;
  highPriority: number;
  totalSpend: number;
  lastSync: string | null;
  unread: number;
}

export default function StatsCards({
  totalEmails,
  totalInvoices,
  highPriority,
  totalSpend,
  lastSync,
  unread,
}: StatsCardsProps) {
  const cards = [
    {
      label: "Emails Totales",
      value: totalEmails,
      icon: <Mail className="w-5 h-5" />,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
    {
      label: "Sin Leer",
      value: unread,
      icon: <AlertTriangle className="w-5 h-5" />,
      color: "text-yellow-400",
      bg: "bg-yellow-400/10",
    },
    {
      label: "Facturas",
      value: totalInvoices,
      icon: <FileText className="w-5 h-5" />,
      color: "text-green-400",
      bg: "bg-green-400/10",
    },
    {
      label: "Prioridad Alta",
      value: highPriority,
      icon: <TrendingUp className="w-5 h-5" />,
      color: "text-red-400",
      bg: "bg-red-400/10",
    },
    {
      label: "Gasto Total",
      value: `${totalSpend.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €`,
      icon: <Euro className="w-5 h-5" />,
      color: "text-purple-400",
      bg: "bg-purple-400/10",
    },
    {
      label: "Última Sync",
      value: lastSync
        ? new Date(lastSync).toLocaleString("es-ES", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Nunca",
      icon: <Clock className="w-5 h-5" />,
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="glass-card p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center ${card.color}`}
            >
              {card.icon}
            </div>
          </div>
          <div className="stat-number text-xl mb-1">
            {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {card.label}
          </div>
        </div>
      ))}
    </div>
  );
}
