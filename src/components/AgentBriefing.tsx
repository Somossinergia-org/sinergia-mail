"use client";

import { useState, useEffect } from "react";
import {
  Bot,
  AlertTriangle,
  Mail,
  FileText,
  Trash2,
  X,
  ChevronRight,
} from "lucide-react";

interface BriefingAlert {
  type: string;
  severity: "high" | "medium" | "low";
  message: string;
  count: number;
}

interface BriefingData {
  greeting: string;
  userName: string;
  alerts: BriefingAlert[];
  stats: {
    totalEmails: number;
    totalInvoices: number;
    totalInvoiced: number;
    cleanableEmails: number;
  };
  urgentEmails: Array<{ id: number; from: string; subject: string; date: string }>;
  unansweredEmails: Array<{ id: number; from: string; subject: string; date: string; category: string }>;
  recentInvoices: Array<{ id: number; issuer: string; amount: number; currency: string; date: string }>;
}

export default function AgentBriefing({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [data, setData] = useState<BriefingData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agent/briefing")
      .then((r) => r.json())
      .then((d) => {
        if (d.greeting) setData(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data || dismissed) return null;
  if (data.alerts.length === 0) return null;

  const highAlerts = data.alerts.filter((a) => a.severity === "high");
  const mediumAlerts = data.alerts.filter((a) => a.severity === "medium");
  const lowAlerts = data.alerts.filter((a) => a.severity === "low");

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "high": return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case "medium": return <FileText className="w-4 h-4 text-amber-400" />;
      case "low": return <Trash2 className="w-4 h-4 text-blue-400" />;
      default: return <Mail className="w-4 h-4 text-gray-400" />;
    }
  };

  const severityBorder = (severity: string) => {
    switch (severity) {
      case "high": return "border-l-red-500";
      case "medium": return "border-l-amber-500";
      case "low": return "border-l-blue-500";
      default: return "border-l-gray-500";
    }
  };

  return (
    <div className="glass-card p-5 animate-fade-in border-sinergia-500/20 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sinergia-500/20 to-purple-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-sinergia-400" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">
              {data.greeting}, {data.userName}
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              {data.stats.totalEmails} emails · {data.stats.totalInvoices} facturas ({data.stats.totalInvoiced.toLocaleString("es-ES", { minimumFractionDigits: 2 })}€)
            </p>
          </div>
        </div>
        <button onClick={() => setDismissed(true)} className="p-1 rounded hover:bg-[var(--bg-card)] transition">
          <X className="w-4 h-4 text-[var(--text-secondary)]" />
        </button>
      </div>

      {/* Alerts */}
      <div className="space-y-2">
        {[...highAlerts, ...mediumAlerts, ...lowAlerts].map((alert, i) => (
          <div key={i}
            className={`flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-card)] border-l-2 ${severityBorder(alert.severity)} cursor-pointer hover:bg-[var(--bg-card)]/80 transition`}
            onClick={() => {
              if (alert.type === "urgent" || alert.type === "unanswered") onNavigate?.("emails");
              else if (alert.type === "invoices_incomplete") onNavigate?.("invoices");
              else if (alert.type === "cleanup") onNavigate?.("agent");
            }}>
            {severityIcon(alert.severity)}
            <span className="text-sm flex-1">{alert.message}</span>
            <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
          </div>
        ))}
      </div>

      {/* Quick actions based on alerts */}
      {(data.urgentEmails.length > 0 || data.unansweredEmails.length > 0) && (
        <div className="mt-4 pt-3 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--text-secondary)] mb-2">Emails pendientes:</p>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {[...data.urgentEmails, ...data.unansweredEmails].slice(0, 5).map((email) => (
              <div key={email.id} className="flex items-center gap-2 text-xs">
                <Mail className="w-3 h-3 text-[var(--text-secondary)] flex-shrink-0" />
                <span className="font-medium truncate max-w-[120px]">{email.from}</span>
                <span className="text-[var(--text-secondary)] truncate flex-1">{email.subject}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
