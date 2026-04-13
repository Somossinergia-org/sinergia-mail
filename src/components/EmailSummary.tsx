"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Minus,
} from "lucide-react";

interface EmailSummaryProps {
  emailId: number;
  compact?: boolean;
}

interface SummaryData {
  summary: string;
  keyPoints: string[];
  sentiment: "positivo" | "neutro" | "negativo";
  actionRequired: boolean;
  actionDescription: string | null;
  cached?: boolean;
}

const SENTIMENT_ICONS = {
  positivo: { icon: ThumbsUp, color: "text-green-400", bg: "bg-green-400/10" },
  neutro: { icon: Minus, color: "text-gray-400", bg: "bg-gray-400/10" },
  negativo: { icon: ThumbsDown, color: "text-red-400", bg: "bg-red-400/10" },
};

export default function EmailSummary({ emailId, compact }: EmailSummaryProps) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSummarize = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      });
      if (!res.ok) throw new Error("Error al resumir");
      const result = await res.json();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  if (!data && !loading) {
    return (
      <button
        onClick={handleSummarize}
        className="flex items-center gap-1.5 text-xs text-sinergia-400 hover:text-sinergia-300 transition"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Resumir con IA
      </button>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Resumiendo...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-red-400 flex items-center gap-1">
        <AlertCircle className="w-3.5 h-3.5" />
        {error}
      </div>
    );
  }

  if (!data) return null;

  const sentiment = SENTIMENT_ICONS[data.sentiment] || SENTIMENT_ICONS.neutro;
  const SentimentIcon = sentiment.icon;

  if (compact) {
    return (
      <div className="text-xs text-[var(--text-secondary)] flex items-start gap-2 mt-1">
        <Sparkles className="w-3 h-3 text-sinergia-400 flex-shrink-0 mt-0.5" />
        <span>{data.summary}</span>
      </div>
    );
  }

  return (
    <div className="mt-3 p-3 rounded-xl bg-sinergia-600/5 border border-sinergia-500/10 space-y-2">
      {/* Summary */}
      <div className="flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-sinergia-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm leading-relaxed">{data.summary}</p>
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${sentiment.bg} ${sentiment.color}`}
        >
          <SentimentIcon className="w-3 h-3" />
          {data.sentiment}
        </span>

        {data.cached && (
          <span className="text-[10px] text-[var(--text-secondary)]">
            (cache)
          </span>
        )}
      </div>

      {/* Key points */}
      {data.keyPoints.length > 0 && (
        <div className="text-xs text-[var(--text-secondary)]">
          {data.keyPoints.map((point, i) => (
            <span key={i}>
              {i > 0 && " · "}
              {point}
            </span>
          ))}
        </div>
      )}

      {/* Action required */}
      {data.actionRequired && data.actionDescription && (
        <div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-400/5 px-2.5 py-1.5 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Requiere acción: {data.actionDescription}</span>
        </div>
      )}
    </div>
  );
}
